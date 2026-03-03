"""Phase 4 QA Gates — blocking post-load quality checks.

All gates run *after* the Silver DB load completes and *before* the Gold dump
is exported.  Any failing gate (``QaCheckResult.passed == False``) causes
``run_all_gates()`` to raise ``QaGateFailure`` when
``settings.fail_on_vocab_gap == True``.

Gate categories (in execution order):
  1. schema_integrity       — schemas / tables exist and are non-empty
  2. vocabulary_integrity   — concept coverage, required IDs, support tables
  3. fact_vocab_joinability — SQL-level join-coverage checks (post-load)
  4. temporal_sanity        — plausible date ranges, null-rate limits
  5. sql_smoke_tests        — canonical benchmark SQL executes without error

Usage::

    import psycopg
    from vocabulary.qa_checks import run_all_gates

    with psycopg.connect(dsn) as conn:
        results = run_all_gates(conn, tenant_schema, vocab_schema, profile)
"""
from __future__ import annotations

import json
import textwrap
from dataclasses import asdict, dataclass, field
from datetime import date
from typing import Literal

import psycopg

from config import settings
from vocabulary.required_concepts import required_concept_ids


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------


@dataclass
class QaCheckResult:
    """Result for a single QA gate check."""

    check_name: str
    category: str  # schema_integrity | vocabulary_integrity | fact_vocab_joinability | temporal_sanity | sql_smoke_test
    passed: bool
    observed_value: str | None = None
    threshold: str | None = None
    details: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class QaGateSummary:
    """Aggregate summary of a full gate run."""

    total: int = 0
    passed: int = 0
    failed: int = 0
    results: list[QaCheckResult] = field(default_factory=list)

    @property
    def all_passed(self) -> bool:
        return self.failed == 0

    def to_dict(self) -> dict:
        return {
            "total": self.total,
            "passed": self.passed,
            "failed": self.failed,
            "all_passed": self.all_passed,
            "results": [r.to_dict() for r in self.results],
        }


class QaGateFailure(RuntimeError):
    """Raised when one or more blocking QA gates fail.

    The ``summary`` attribute carries the full gate run report for downstream
    JSON serialisation.
    """

    def __init__(self, summary: QaGateSummary) -> None:
        failed_names = [r.check_name for r in summary.results if not r.passed]
        super().__init__(
            f"QA gate(s) failed — pipeline halted before Gold export. "
            f"Failed checks ({summary.failed}): {failed_names}"
        )
        self.summary = summary


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _scalar(conn: psycopg.Connection, sql: str, params: tuple = ()) -> object:
    """Execute a scalar SQL query and return the single value, or None."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        row = cur.fetchone()
        return row[0] if row else None


def _query_rows(
    conn: psycopg.Connection, sql: str, params: tuple = ()
) -> list[tuple]:
    """Execute SQL and return all result rows."""
    with conn.cursor() as cur:
        cur.execute(sql, params)
        return cur.fetchall()


def _ok(name: str, category: str, observed: str, details: str = "") -> QaCheckResult:
    return QaCheckResult(
        check_name=name,
        category=category,
        passed=True,
        observed_value=observed,
        details=details,
    )


def _fail(
    name: str, category: str, observed: str, threshold: str, details: str = ""
) -> QaCheckResult:
    return QaCheckResult(
        check_name=name,
        category=category,
        passed=False,
        observed_value=observed,
        threshold=threshold,
        details=details,
    )


# ---------------------------------------------------------------------------
# Category 1: Schema Integrity
# ---------------------------------------------------------------------------

_REQUIRED_TENANT_TABLES = [
    "person",
    "visit_occurrence",
    "condition_occurrence",
    "drug_exposure",
    "procedure_occurrence",
    "measurement",
    "observation",
    "condition_era",
    "drug_era",
    "source_to_concept_map",
    "concept",
]

_REQUIRED_VOCAB_TABLES = [
    "concept",
    "vocabulary",
    "domain",
    "relationship",
    "concept_relationship",
    "concept_synonym",
]

_CORE_FACT_TABLES = [
    "person",
    "visit_occurrence",
    "condition_occurrence",
    "drug_exposure",
    "procedure_occurrence",
    "measurement",
    "observation",
]


def _check_schema_integrity(
    conn: psycopg.Connection, tenant: str, vocab: str
) -> list[QaCheckResult]:
    results: list[QaCheckResult] = []
    cat = "schema_integrity"

    # --- schemas exist --------------------------------------------------
    for schema_name in (tenant, vocab):
        exists = _scalar(
            conn,
            "SELECT EXISTS(SELECT 1 FROM information_schema.schemata WHERE schema_name = %s)",
            (schema_name,),
        )
        if exists:
            results.append(_ok(f"schema_exists:{schema_name}", cat, "exists"))
        else:
            results.append(
                _fail(
                    f"schema_exists:{schema_name}",
                    cat,
                    "missing",
                    "exists",
                    f"Schema {schema_name!r} not found in information_schema",
                )
            )

    # --- required tenant tables exist and are non-empty -----------------
    for table in _REQUIRED_TENANT_TABLES:
        exists = _scalar(
            conn,
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s)",
            (tenant, table),
        )
        if not exists:
            results.append(
                _fail(
                    f"tenant_table_exists:{table}",
                    cat,
                    "missing",
                    "exists",
                    f"{tenant}.{table} not found in information_schema",
                )
            )
            continue
        results.append(_ok(f"tenant_table_exists:{table}", cat, "exists"))

        if table in _CORE_FACT_TABLES:
            count = _scalar(conn, f"SELECT COUNT(*) FROM {tenant}.{table}")
            count_int = int(count or 0)
            if count_int > 0:
                results.append(
                    _ok(f"tenant_table_nonempty:{table}", cat, str(count_int))
                )
            else:
                results.append(
                    _fail(
                        f"tenant_table_nonempty:{table}",
                        cat,
                        "0",
                        ">0",
                        f"{tenant}.{table} is empty after ETL load",
                    )
                )

    # --- required vocab tables exist ------------------------------------
    for table in _REQUIRED_VOCAB_TABLES:
        exists = _scalar(
            conn,
            "SELECT EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema = %s AND table_name = %s)",
            (vocab, table),
        )
        if exists:
            results.append(_ok(f"vocab_table_exists:{table}", cat, "exists"))
        else:
            results.append(
                _fail(
                    f"vocab_table_exists:{table}",
                    cat,
                    "missing",
                    "exists",
                    f"{vocab}.{table} not found",
                )
            )

    return results


# ---------------------------------------------------------------------------
# Category 2: Vocabulary Integrity
# ---------------------------------------------------------------------------

# Minimum row thresholds by profile
_VOCAB_MIN_ROWS_BY_PROFILE: dict[str, dict[str, int]] = {
    "synthetic_open": {
        "concept": 15,       # required_concepts + synthetic codes
        "vocabulary": 4,     # at minimum: Visit, Gender, Race, Ethnicity
        "domain": 6,         # Visit, Gender, Race, Ethnicity, Condition, Drug, ...
        "relationship": 2,   # Maps to + Mapped from
        "concept_relationship": 10,
        "concept_synonym": 10,
    },
    "athena_permitted": {
        "concept": 200,
        "vocabulary": 10,
        "domain": 10,
        "relationship": 5,
        "concept_relationship": 200,
        "concept_synonym": 100,
    },
}
_TENANT_CONCEPT_MIN_ROWS_BY_PROFILE: dict[str, int] = {
    "synthetic_open": 10,
    "athena_permitted": 100,
}


def _check_vocabulary_integrity(
    conn: psycopg.Connection,
    tenant: str,
    vocab: str,
    profile: str,
) -> list[QaCheckResult]:
    results: list[QaCheckResult] = []
    cat = "vocabulary_integrity"
    min_rows_profile = _VOCAB_MIN_ROWS_BY_PROFILE.get(
        profile,
        _VOCAB_MIN_ROWS_BY_PROFILE["synthetic_open"],
    )
    tenant_concept_min_rows = _TENANT_CONCEPT_MIN_ROWS_BY_PROFILE.get(profile, 10)

    # --- omop_vocab.concept row count -----------------------------------
    concept_count = int(_scalar(conn, f"SELECT COUNT(*) FROM {vocab}.concept") or 0)
    min_rows = min_rows_profile["concept"]
    if concept_count >= min_rows:
        results.append(
            _ok(
                "vocab_concept_nonempty",
                cat,
                str(concept_count),
                f">={min_rows}",
            )
        )
    else:
        results.append(
            _fail(
                "vocab_concept_nonempty",
                cat,
                str(concept_count),
                f">={min_rows}",
                f"{vocab}.concept has {concept_count} rows, minimum is {min_rows}",
            )
        )

    # --- required concept IDs present -----------------------------------
    req_ids = sorted(required_concept_ids())
    if req_ids:
        placeholders = ", ".join(["%s"] * len(req_ids))
        found_rows = _query_rows(
            conn,
            f"SELECT concept_id FROM {vocab}.concept WHERE concept_id IN ({placeholders})",
            tuple(req_ids),
        )
        found_set = {int(row[0]) for row in found_rows}
        missing = sorted(set(req_ids) - found_set)

        if not missing:
            results.append(
                _ok(
                    "required_concept_ids_present",
                    cat,
                    f"all {len(req_ids)} present",
                    f"all {len(req_ids)} required IDs",
                )
            )
        else:
            results.append(
                _fail(
                    "required_concept_ids_present",
                    cat,
                    f"{len(found_set)}/{len(req_ids)} present",
                    f"all {len(req_ids)} required IDs",
                    f"Missing concept_ids: {missing}",
                )
            )

    # --- vocab support tables non-empty (synthetic_open checks) ---------
    support_tables = ["vocabulary", "domain", "relationship", "concept_relationship", "concept_synonym"]
    for tbl in support_tables:
        count = int(_scalar(conn, f"SELECT COUNT(*) FROM {vocab}.{tbl}") or 0)
        min_tbl = min_rows_profile.get(tbl, 1)
        check_name = f"vocab_{tbl}_nonempty"
        if count >= min_tbl:
            results.append(_ok(check_name, cat, str(count), f">={min_tbl}"))
        else:
            results.append(
                _fail(
                    check_name,
                    cat,
                    str(count),
                    f">={min_tbl}",
                    f"{vocab}.{tbl} has {count} rows, minimum is {min_tbl} for {profile} profile",
                )
            )

    # --- tenant concept table synchronized ------------------------------
    tenant_concept_count = int(
        _scalar(conn, f"SELECT COUNT(*) FROM {tenant}.concept") or 0
    )
    if tenant_concept_count >= tenant_concept_min_rows:
        results.append(
            _ok(
                "tenant_concept_nonempty",
                cat,
                str(tenant_concept_count),
                f">={tenant_concept_min_rows}",
            )
        )
    else:
        results.append(
            _fail(
                "tenant_concept_nonempty",
                cat,
                str(tenant_concept_count),
                f">={tenant_concept_min_rows}",
                f"{tenant}.concept has {tenant_concept_count} rows; should be synchronised from {vocab}.concept",
            )
        )

    # --- no duplicate concept_ids in vocab.concept ----------------------
    dupe_count = int(
        _scalar(
            conn,
            f"SELECT COUNT(*) FROM (SELECT concept_id FROM {vocab}.concept GROUP BY concept_id HAVING COUNT(*) > 1) dupes",
        )
        or 0
    )
    if dupe_count == 0:
        results.append(_ok("concept_id_unique", cat, "0 duplicates"))
    else:
        results.append(
            _fail(
                "concept_id_unique",
                cat,
                f"{dupe_count} duplicated concept_ids",
                "0 duplicates",
                f"{vocab}.concept has {dupe_count} duplicate concept_id values",
            )
        )

    return results


# ---------------------------------------------------------------------------
# Category 3: Fact-Vocab Joinability (post-load SQL checks)
# ---------------------------------------------------------------------------

# Minimum join-coverage thresholds: fraction of non-zero concept_ids that must
# resolve in omop_vocab.concept.
_JOIN_COVERAGE_THRESHOLDS: dict[str, float] = {
    "synthetic_open": 0.95,
    "athena_permitted": 0.99,
}

_VISIT_REQUIRED_CONCEPT_IDS = {9201, 9202, 9203}

_JOINABILITY_CHECKS: list[tuple[str, str, str, str]] = [
    # (label, schema_prefix, table, concept_col)
    ("visit_occurrence.visit_concept_id", "{tenant}", "visit_occurrence", "visit_concept_id"),
    ("condition_occurrence.condition_concept_id", "{tenant}", "condition_occurrence", "condition_concept_id"),
    ("drug_exposure.drug_concept_id", "{tenant}", "drug_exposure", "drug_concept_id"),
    ("procedure_occurrence.procedure_concept_id", "{tenant}", "procedure_occurrence", "procedure_concept_id"),
    ("measurement.measurement_concept_id", "{tenant}", "measurement", "measurement_concept_id"),
    ("observation.observation_concept_id", "{tenant}", "observation", "observation_concept_id"),
]


def _check_fact_vocab_joinability(
    conn: psycopg.Connection,
    tenant: str,
    vocab: str,
    profile: str,
) -> list[QaCheckResult]:
    results: list[QaCheckResult] = []
    cat = "fact_vocab_joinability"
    threshold_pct = _JOIN_COVERAGE_THRESHOLDS.get(profile, 0.95)

    for label, _schema_prefix, table, concept_col in _JOINABILITY_CHECKS:
        fq_table = f"{tenant}.{table}"
        # Count non-zero concept_ids in the fact table
        total_nonzero = int(
            _scalar(
                conn,
                f"SELECT COUNT(*) FROM {fq_table} WHERE {concept_col} > 0",
            )
            or 0
        )

        if total_nonzero == 0:
            # All zeros — joinability is technically 100% but there's no vocab
            # coverage to measure. Treat as OK (zero-rate is a separate check).
            results.append(
                _ok(
                    f"join_coverage:{label}",
                    cat,
                    "0 non-zero concept_ids (no joinability test needed)",
                    f">={threshold_pct:.0%}",
                )
            )
            continue

        joinable = int(
            _scalar(
                conn,
                f"""
                SELECT COUNT(*)
                FROM {fq_table} f
                JOIN {vocab}.concept c ON f.{concept_col} = c.concept_id
                WHERE f.{concept_col} > 0
                """,
            )
            or 0
        )

        coverage = joinable / total_nonzero
        check_name = f"join_coverage:{label}"

        if coverage >= threshold_pct:
            results.append(
                _ok(
                    check_name,
                    cat,
                    f"{joinable}/{total_nonzero} ({coverage:.1%})",
                    f">={threshold_pct:.0%}",
                )
            )
        else:
            results.append(
                _fail(
                    check_name,
                    cat,
                    f"{joinable}/{total_nonzero} ({coverage:.1%})",
                    f">={threshold_pct:.0%}",
                    f"{fq_table}.{concept_col} has {total_nonzero - joinable} unresolvable concept_ids "
                    f"(coverage {coverage:.1%} < threshold {threshold_pct:.0%})",
                )
            )

    # --- visit required concept IDs 100% present in vocab ---------------
    req_visit = sorted(_VISIT_REQUIRED_CONCEPT_IDS)
    placeholders = ", ".join(["%s"] * len(req_visit))
    found_visit_rows = _query_rows(
        conn,
        f"SELECT concept_id FROM {vocab}.concept WHERE concept_id IN ({placeholders})",
        tuple(req_visit),
    )
    found_visit = {int(r[0]) for r in found_visit_rows}
    missing_visit = sorted(_VISIT_REQUIRED_CONCEPT_IDS - found_visit)
    if not missing_visit:
        results.append(
            _ok(
                "visit_required_concept_ids_in_vocab",
                cat,
                f"all 3 visit concept IDs present ({req_visit})",
                "100% (all 3)",
            )
        )
    else:
        results.append(
            _fail(
                "visit_required_concept_ids_in_vocab",
                cat,
                f"{len(found_visit)}/3 present",
                "100% (all 3)",
                f"Missing visit concept_ids from {vocab}.concept: {missing_visit}",
            )
        )

    return results


# ---------------------------------------------------------------------------
# Category 4: Temporal / Data Sanity
# ---------------------------------------------------------------------------

_VISIT_DATE_NULL_RATE_LIMIT = 0.05  # max 5% null start dates
_VISIT_START_MIN_YEAR = 1900
_VISIT_START_MAX_DATE = date.today()


def _check_temporal_sanity(
    conn: psycopg.Connection, tenant: str
) -> list[QaCheckResult]:
    results: list[QaCheckResult] = []
    cat = "temporal_sanity"

    # --- visit_start_date range -----------------------------------------
    date_stats = _query_rows(
        conn,
        f"""
        SELECT
            MIN(visit_start_date)::text,
            MAX(visit_start_date)::text,
            COUNT(*) AS total,
            COUNT(*) FILTER (WHERE visit_start_date IS NULL) AS null_cnt
        FROM {tenant}.visit_occurrence
        """,
    )
    if date_stats:
        min_date_str, max_date_str, total, null_cnt = date_stats[0]
        total_int = int(total or 0)
        null_int = int(null_cnt or 0)

        # min date plausibility
        if min_date_str:
            min_year = int(min_date_str[:4])
            if min_year >= _VISIT_START_MIN_YEAR:
                results.append(
                    _ok(
                        "visit_start_date_min_plausible",
                        cat,
                        f"min={min_date_str}",
                        f"year>={_VISIT_START_MIN_YEAR}",
                    )
                )
            else:
                results.append(
                    _fail(
                        "visit_start_date_min_plausible",
                        cat,
                        f"min={min_date_str}",
                        f"year>={_VISIT_START_MIN_YEAR}",
                        f"Implausible minimum visit_start_date: {min_date_str}",
                    )
                )
        else:
            results.append(
                _fail(
                    "visit_start_date_min_plausible",
                    cat,
                    "NULL",
                    f"year>={_VISIT_START_MIN_YEAR}",
                    "visit_occurrence has no rows with a non-null visit_start_date",
                )
            )

        # max date plausibility
        if max_date_str:
            max_year = int(max_date_str[:4])
            current_year = _VISIT_START_MAX_DATE.year
            if max_year <= current_year + 1:  # allow 1-year lookahead for scheduled visits
                results.append(
                    _ok(
                        "visit_start_date_max_plausible",
                        cat,
                        f"max={max_date_str}",
                        f"<={current_year + 1}",
                    )
                )
            else:
                results.append(
                    _fail(
                        "visit_start_date_max_plausible",
                        cat,
                        f"max={max_date_str}",
                        f"<={current_year + 1}",
                        f"visit_start_date max {max_date_str} is too far in the future",
                    )
                )

        # null rate
        if total_int > 0:
            null_rate = null_int / total_int
            if null_rate <= _VISIT_DATE_NULL_RATE_LIMIT:
                results.append(
                    _ok(
                        "visit_start_date_null_rate",
                        cat,
                        f"{null_rate:.2%} null ({null_int}/{total_int})",
                        f"<={_VISIT_DATE_NULL_RATE_LIMIT:.0%}",
                    )
                )
            else:
                results.append(
                    _fail(
                        "visit_start_date_null_rate",
                        cat,
                        f"{null_rate:.2%} null ({null_int}/{total_int})",
                        f"<={_VISIT_DATE_NULL_RATE_LIMIT:.0%}",
                        f"visit_start_date null rate {null_rate:.2%} exceeds limit {_VISIT_DATE_NULL_RATE_LIMIT:.0%}",
                    )
                )

    # --- person/visit count consistency ---------------------------------
    person_count = int(_scalar(conn, f"SELECT COUNT(*) FROM {tenant}.person") or 0)
    visit_count = int(_scalar(conn, f"SELECT COUNT(*) FROM {tenant}.visit_occurrence") or 0)
    if person_count > 0 and visit_count >= person_count:
        results.append(
            _ok(
                "visit_count_gte_person_count",
                cat,
                f"visits={visit_count}, persons={person_count}",
                "visits >= persons",
            )
        )
    elif person_count == 0:
        results.append(
            _fail(
                "visit_count_gte_person_count",
                cat,
                "person table is empty",
                "persons > 0",
                "person table is empty; ETL may have failed",
            )
        )
    else:
        # visits < persons is unusual but not necessarily wrong (some patients may
        # have 0 recorded encounters); emit a warning-class pass with details.
        results.append(
            _ok(
                "visit_count_gte_person_count",
                cat,
                f"visits={visit_count} < persons={person_count} (unusual but permitted)",
                "visits >= persons (recommended)",
                "Some patients have no recorded visits — verify Synthea generation was successful",
            )
        )

    # --- birth year range sanity ----------------------------------------
    birth_stats = _query_rows(
        conn,
        f"SELECT MIN(year_of_birth), MAX(year_of_birth) FROM {tenant}.person",
    )
    if birth_stats:
        min_yob, max_yob = birth_stats[0]
        if min_yob and max_yob:
            min_yob, max_yob = int(min_yob), int(max_yob)
            current_year = _VISIT_START_MAX_DATE.year
            plausible = 1900 <= min_yob <= current_year and 1900 <= max_yob <= current_year
            if plausible:
                results.append(
                    _ok(
                        "birth_year_range_plausible",
                        cat,
                        f"min_yob={min_yob}, max_yob={max_yob}",
                        f"1900..{current_year}",
                    )
                )
            else:
                results.append(
                    _fail(
                        "birth_year_range_plausible",
                        cat,
                        f"min_yob={min_yob}, max_yob={max_yob}",
                        f"1900..{current_year}",
                        f"year_of_birth range [{min_yob}, {max_yob}] is implausible",
                    )
                )

    return results


# ---------------------------------------------------------------------------
# Category 5: SQL Smoke Tests
# ---------------------------------------------------------------------------

_SMOKE_TESTS: list[tuple[str, str]] = [
    (
        "smoke:visit_type_distribution",
        textwrap.dedent("""\
            SELECT c.concept_name, COUNT(*) AS visit_count
            FROM {tenant}.visit_occurrence vo
            JOIN {vocab}.concept c ON vo.visit_concept_id = c.concept_id
            GROUP BY c.concept_name
            ORDER BY visit_count DESC
            LIMIT 5
        """),
    ),
    (
        "smoke:top_conditions_with_concept_join",
        textwrap.dedent("""\
            SELECT c.concept_name, COUNT(*) AS frequency
            FROM {tenant}.condition_occurrence co
            JOIN {vocab}.concept c ON co.condition_concept_id = c.concept_id
            GROUP BY c.concept_name
            ORDER BY frequency DESC
            LIMIT 5
        """),
    ),
    (
        "smoke:patient_gender_demographics",
        textwrap.dedent("""\
            SELECT c.concept_name AS gender, COUNT(*) AS patient_count
            FROM {tenant}.person p
            JOIN {vocab}.concept c ON p.gender_concept_id = c.concept_id
            GROUP BY c.concept_name
            ORDER BY patient_count DESC
        """),
    ),
    (
        "smoke:drug_exposure_with_concept_join",
        textwrap.dedent("""\
            SELECT c.concept_name AS medication, COUNT(*) AS prescription_count
            FROM {tenant}.drug_exposure de
            JOIN {vocab}.concept c ON de.drug_concept_id = c.concept_id
            GROUP BY c.concept_name
            ORDER BY prescription_count DESC
            LIMIT 5
        """),
    ),
    (
        "smoke:condition_era_using_concept_join",
        textwrap.dedent("""\
            SELECT c.concept_name AS condition,
                   AVG(ce.condition_era_end_date - ce.condition_era_start_date) AS avg_era_days
            FROM {tenant}.condition_era ce
            JOIN {vocab}.concept c ON ce.condition_concept_id = c.concept_id
            GROUP BY c.concept_name
            ORDER BY avg_era_days DESC
            LIMIT 5
        """),
    ),
]


def _check_sql_smoke_tests(
    conn: psycopg.Connection, tenant: str, vocab: str
) -> list[QaCheckResult]:
    results: list[QaCheckResult] = []
    cat = "sql_smoke_test"

    for check_name, sql_template in _SMOKE_TESTS:
        sql = sql_template.format(tenant=tenant, vocab=vocab)
        try:
            rows = _query_rows(conn, sql)
            results.append(
                _ok(
                    check_name,
                    cat,
                    f"{len(rows)} rows returned",
                    "executes without error",
                )
            )
        except Exception as exc:
            results.append(
                _fail(
                    check_name,
                    cat,
                    f"ERROR: {exc}",
                    "executes without error",
                    f"SQL smoke test raised exception: {exc}",
                )
            )

    return results


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def run_all_gates(
    conn: psycopg.Connection,
    tenant_schema: str | None = None,
    vocab_schema: str | None = None,
    profile: str | None = None,
) -> QaGateSummary:
    """Run all QA gates against the loaded Silver database.

    Parameters
    ----------
    conn:
        An open psycopg3 connection.  The function does NOT close it.
    tenant_schema:
        Schema containing OMOP fact tables.  Defaults to ``settings.active_tenant_schema``.
    vocab_schema:
        Schema containing OMOP vocabulary tables.  Defaults to ``settings.vocab_schema``.
    profile:
        Pipeline profile (``synthetic_open`` | ``athena_permitted``).
        Defaults to ``settings.pipeline_profile``.

    Returns
    -------
    QaGateSummary
        Aggregate result.  Individual results are in ``summary.results``.

    Raises
    ------
    QaGateFailure
        If any gate fails and ``settings.fail_on_vocab_gap == True``.
    """
    tenant = tenant_schema or settings.active_tenant_schema
    vocab = vocab_schema or settings.vocab_schema
    _profile = profile or settings.pipeline_profile

    print(f"\n[qa_gates] Running all QA gates (tenant={tenant}, vocab={vocab}, profile={_profile})...")

    all_results: list[QaCheckResult] = []

    print("[qa_gates] Category 1/5: schema_integrity")
    all_results.extend(_check_schema_integrity(conn, tenant, vocab))

    print("[qa_gates] Category 2/5: vocabulary_integrity")
    all_results.extend(_check_vocabulary_integrity(conn, tenant, vocab, _profile))

    print("[qa_gates] Category 3/5: fact_vocab_joinability")
    all_results.extend(_check_fact_vocab_joinability(conn, tenant, vocab, _profile))

    print("[qa_gates] Category 4/5: temporal_sanity")
    all_results.extend(_check_temporal_sanity(conn, tenant))

    print("[qa_gates] Category 5/5: sql_smoke_tests")
    all_results.extend(_check_sql_smoke_tests(conn, tenant, vocab))

    # Build summary
    passed_count = sum(1 for r in all_results if r.passed)
    failed_count = len(all_results) - passed_count

    summary = QaGateSummary(
        total=len(all_results),
        passed=passed_count,
        failed=failed_count,
        results=all_results,
    )

    # Print per-check results
    print(f"\n[qa_gates] Results ({passed_count} passed, {failed_count} failed):")
    for result in all_results:
        status_icon = "✅" if result.passed else "❌"
        line = f"  {status_icon}  [{result.category}] {result.check_name}"
        if result.observed_value:
            line += f" = {result.observed_value}"
        if not result.passed and result.threshold:
            line += f"  (threshold: {result.threshold})"
        print(line)
        if not result.passed and result.details:
            print(f"       Detail: {result.details}")

    if summary.all_passed:
        print("\n[qa_gates] ✅ All gates passed — safe to proceed with Gold export.")
    else:
        print(f"\n[qa_gates] ❌ {failed_count} gate(s) FAILED.")
        if settings.fail_on_vocab_gap:
            raise QaGateFailure(summary)
        else:
            print("[qa_gates] fail_on_vocab_gap=false — continuing despite failures.")

    return summary
