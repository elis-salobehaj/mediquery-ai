"""
Centralized OMOP concept mapping helpers for ETL transformations.

All concept IDs here correspond to entries in ``REQUIRED_CONCEPTS`` so they
are guaranteed to be present in ``omop_vocab.concept`` after vocabulary loading.

Design goals:
- Single source of truth for every source-code → concept_id mapping.
- Polars expression builders keep ``load_omop.py`` free of inline magic numbers.
- ``log_concept_zero_rates()`` provides per-table coverage diagnostics.
- ``build_source_to_concept_map_df()`` produces an OMOP-standard traceability
  table that is loaded into {tenant_schema}.source_to_concept_map.
"""
from __future__ import annotations

import polars as pl

# ---------------------------------------------------------------------------
# Mapping dictionaries — single source of truth for all ETL concept lookups
# ---------------------------------------------------------------------------

#: Maps Synthea encounter class (lowercase) → OMOP visit_concept_id
VISIT_CONCEPT_MAP: dict[str, int] = {
    "ambulatory": 9202,
    "outpatient": 9202,
    "wellness": 9202,
    "emergency": 9203,
    "urgentcare": 9203,
    "inpatient": 9201,
}

#: Maps Synthea GENDER code → OMOP gender_concept_id
GENDER_CONCEPT_MAP: dict[str, int] = {
    "M": 8507,
    "F": 8532,
}

#: Maps Synthea RACE value (lowercase) → OMOP race_concept_id
RACE_CONCEPT_MAP: dict[str, int] = {
    "white": 8527,
    "black": 8516,
    "asian": 8515,
    "native": 8657,
}

#: Maps Synthea ETHNICITY value (lowercase) → OMOP ethnicity_concept_id
ETHNICITY_CONCEPT_MAP: dict[str, int] = {
    "hispanic": 38003563,
    "nonhispanic": 38003564,
}


# ---------------------------------------------------------------------------
# Internal helper
# ---------------------------------------------------------------------------

def _build_mapping_expr(col_name: str, mapping: dict[str, int]) -> pl.Expr:
    """Build a chained ``when/then/otherwise`` expression from a mapping dict.

    Produces the equivalent of::

        CASE WHEN col = k1 THEN v1
             WHEN col = k2 THEN v2
             ...
             ELSE 0
        END

    This is universally compatible across all Polars 1.x releases.
    """
    items = list(mapping.items())
    if not items:
        return pl.lit(0).cast(pl.Int64)

    key0, val0 = items[0]
    expr = pl.when(pl.col(col_name) == key0).then(pl.lit(val0))
    for key, val in items[1:]:
        expr = expr.when(pl.col(col_name) == key).then(pl.lit(val))
    return expr.otherwise(pl.lit(0)).cast(pl.Int64)


# ---------------------------------------------------------------------------
# Polars expression builders
# ---------------------------------------------------------------------------

def visit_concept_expr() -> pl.Expr:
    """Map ``ENCOUNTERCLASS`` column → ``visit_concept_id``."""
    items = list(VISIT_CONCEPT_MAP.items())
    key0, val0 = items[0]
    expr = pl.when(pl.col("ENCOUNTERCLASS") == key0).then(pl.lit(val0))
    for key, val in items[1:]:
        expr = expr.when(pl.col("ENCOUNTERCLASS") == key).then(pl.lit(val))
    return expr.otherwise(pl.lit(0)).cast(pl.Int64).alias("visit_concept_id")


def gender_concept_expr() -> pl.Expr:
    """Map ``GENDER`` column → ``gender_concept_id``."""
    return _build_mapping_expr("GENDER", GENDER_CONCEPT_MAP).alias("gender_concept_id")


def race_concept_expr() -> pl.Expr:
    """Map ``RACE`` column → ``race_concept_id``."""
    return _build_mapping_expr("RACE", RACE_CONCEPT_MAP).alias("race_concept_id")


def ethnicity_concept_expr() -> pl.Expr:
    """Map ``ETHNICITY`` column → ``ethnicity_concept_id``."""
    return _build_mapping_expr("ETHNICITY", ETHNICITY_CONCEPT_MAP).alias(
        "ethnicity_concept_id"
    )


# ---------------------------------------------------------------------------
# Mapping integrity utilities
# ---------------------------------------------------------------------------

def log_concept_zero_rates(label: str, df: pl.DataFrame, concept_col: str) -> None:
    """Log the proportion of rows where ``concept_col == 0`` (unmapped events).

    Rates above 5 % are flagged with a warning marker so pipeline operators
    can see at a glance which tables have poor concept coverage.

    Args:
        label:       Human-readable table/domain label for the log line.
        df:          The OMOP fact DataFrame before DB insertion.
        concept_col: Name of the concept_id column to inspect.
    """
    total = df.height
    if total == 0:
        print(f"  ✓ {label}: no rows (skipped zero-rate check)")
        return

    zero_count = df.filter(pl.col(concept_col) == 0).height
    rate = zero_count / total * 100
    marker = "  ⚠️ " if rate > 5.0 else "  ✓"
    print(
        f"{marker} {label} [{concept_col}]: "
        f"concept_id=0 rate = {rate:.1f}% ({zero_count}/{total})"
    )


def log_all_concept_zero_rates(
    tables: dict[str, tuple[pl.DataFrame, str]],
) -> dict[str, float]:
    """Run ``log_concept_zero_rates`` for multiple tables and return rate dict.

    Args:
        tables: Mapping of ``label → (DataFrame, concept_col_name)``.

    Returns:
        Dict of ``label → zero_rate_pct`` for downstream QA gates.
    """
    rates: dict[str, float] = {}
    print("\n[mapping integrity] Concept coverage rates:")
    for label, (df, concept_col) in tables.items():
        if df.height == 0:
            print(f"  ✓ {label}: no rows")
            rates[label] = 0.0
            continue
        zero_count = df.filter(pl.col(concept_col) == 0).height
        rate = zero_count / df.height * 100
        marker = "  ⚠️ " if rate > 5.0 else "  ✓"
        print(
            f"{marker} {label} [{concept_col}]: "
            f"concept_id=0 rate = {rate:.1f}% ({zero_count}/{df.height})"
        )
        rates[label] = rate
    return rates


# ---------------------------------------------------------------------------
# source_to_concept_map builder
# ---------------------------------------------------------------------------

def build_source_to_concept_map_df(
    code_map: pl.DataFrame,
    source_vocabulary_id: str = "SNOMED",
) -> pl.DataFrame:
    """Build an OMOP-standard ``source_to_concept_map`` DataFrame.

    Produces a traceability record for every (source_code, concept_id) pair
    used during ETL. This table is loaded into
    ``{tenant_schema}.source_to_concept_map`` to provide deterministic
    auditability of which source codes mapped to which standard concepts.

    Args:
        code_map: DataFrame with columns ``code`` (source code) and
                  ``concept_id`` (resolved OMOP concept ID ≥ 1000 from
                  synthetic vocabulary).
        source_vocabulary_id: Vocabulary label (≤ 20 chars) for source codes.

    Returns:
        DataFrame ready for ``COPY`` into ``source_to_concept_map``.
    """
    # Exclude code_map rows where concept_id=0 (no mapping — nothing to trace)
    mapped = code_map.filter(pl.col("concept_id") > 0)

    return mapped.select(
        [
            pl.col("code").cast(pl.Utf8).str.slice(0, 50).alias("source_code"),
            pl.lit(0).alias("source_concept_id"),
            pl.lit(source_vocabulary_id[:20]).alias("source_vocabulary_id"),
            pl.lit(None).cast(pl.Utf8).alias("source_code_description"),
            pl.col("concept_id").alias("target_concept_id"),
            pl.lit(source_vocabulary_id[:20]).alias("target_vocabulary_id"),
            pl.lit("1970-01-01").alias("valid_start_date"),
            pl.lit("2099-12-31").alias("valid_end_date"),
            pl.lit(None).cast(pl.Utf8).alias("invalid_reason"),
        ]
    )
