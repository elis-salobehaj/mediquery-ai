from __future__ import annotations

import gzip
import json
import shutil
import subprocess
import sys
import time
import os
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import psycopg

from config import settings
from load_omop import main as run_omop_etl
from vocabulary.qa_checks import QaGateFailure, QaGateSummary, run_all_gates


PIPELINE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_ROOT.parent
GOLD_DUMP_SQL_PATH = PIPELINE_ROOT / "gold_omop_tenant.sql"
GOLD_DUMP_PATH = PIPELINE_ROOT / "gold_omop_tenant.sql.gz"
RUN_METADATA_PATH = PIPELINE_ROOT / "pipeline_run_metadata.json"
QA_RESULTS_PATH = PIPELINE_ROOT / "pipeline_qa_results.json"


def run_command(command: list[str], cwd: Path | None = None) -> None:
    print(f"[pipeline] Running: {' '.join(command)}")
    subprocess.run(command, cwd=cwd, check=True)


def ensure_postgres_container() -> None:
    if settings.pipeline_db_host not in {"localhost", "127.0.0.1"}:
        print(
            "[pipeline] PIPELINE_DB_HOST is not localhost; skipping docker compose postgres bootstrap"
        )
        return

    dsn = settings.database_url.replace("postgresql+psycopg", "postgresql")
    try:
        with psycopg.connect(dsn, connect_timeout=3) as conn:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
        print("[pipeline] Existing local DB is reachable; skipping container bootstrap")
        return
    except Exception:
        pass

    compose_file = PIPELINE_ROOT / "docker-compose.yml"
    if not compose_file.exists():
        raise RuntimeError(
            f"Pipeline compose file not found: {compose_file}"
        )

    run_command(
        ["docker", "compose", "-f", str(compose_file), "up", "-d", "transient-db"],
        cwd=PIPELINE_ROOT,
    )
    print("[pipeline] Transient pipeline DB container started.")


def wait_for_database(timeout_seconds: int = 120) -> None:
    print(
        "[pipeline] Waiting for DB "
        f"{settings.pipeline_db_host}:{settings.pipeline_db_port}/{settings.omop_db_name}..."
    )

    dsn = settings.database_url.replace("postgresql+psycopg", "postgresql")
    deadline = time.time() + timeout_seconds
    last_error = "unknown"

    while time.time() < deadline:
        try:
            with psycopg.connect(dsn, connect_timeout=5) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
            print("[pipeline] DB connection ready")
            return
        except Exception as err:
            last_error = str(err)
            time.sleep(2)

    raise RuntimeError(f"Database did not become ready in time: {last_error}")


def run_synthea_generation() -> None:
    run_command(
        [
            "bash",
            "generate_synthea.sh",
            str(settings.synthea_population_size),
            str(settings.synthea_seed),
        ],
        cwd=PIPELINE_ROOT,
    )


def run_alembic_upgrade() -> None:
    command = [sys.executable, "-m", "alembic", "upgrade", "head"]
    print(f"[pipeline] Running: {' '.join(command)}")
    result = subprocess.run(
        command,
        cwd=PIPELINE_ROOT,
        capture_output=True,
        text=True,
    )
    if result.stdout:
        print(result.stdout, end="")
    if result.stderr:
        print(result.stderr, end="", file=sys.stderr)

    if result.returncode == 0:
        return

    error_text = f"{result.stdout}\n{result.stderr}".lower()
    migration_db_permission_denied = "permission denied for database" in error_text
    migration_permission_denied = (
        "permission denied for schema" in error_text
        or migration_db_permission_denied
        or "permission denied for table alembic_version" in error_text
    )
    if not migration_permission_denied:
        raise subprocess.CalledProcessError(result.returncode, command)

    print(
        "[pipeline] Alembic failed due to migration metadata/schema permissions; "
        "checking whether target OMOP schemas already exist"
    )

    dsn = settings.database_url.replace("postgresql+psycopg", "postgresql")
    with psycopg.connect(dsn, connect_timeout=10) as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    to_regclass(%s) IS NOT NULL AS tenant_person_exists,
                    to_regclass(%s) IS NOT NULL AS vocab_concept_exists
                """,
                (
                    f"{settings.active_tenant_schema}.person",
                    f"{settings.vocab_schema}.concept",
                ),
            )
            tenant_person_exists, vocab_concept_exists = cur.fetchone()

    if not (tenant_person_exists and vocab_concept_exists):
        raise RuntimeError(
            "Alembic failed and required schemas/tables are missing; "
            "grant schema privileges or use a DB user with migration permissions"
        )

    print(
        "[pipeline] Existing OMOP schemas detected; continuing without Alembic version table write"
    )


def find_postgres_container_by_port(port: int) -> str | None:
    try:
        result = subprocess.run(
            ["docker", "ps", "--format", "{{.Names}} {{.Ports}}"],
            capture_output=True,
            text=True,
            check=True,
        )
    except Exception:
        return None

    expected_fragment = f":{port}->5432"
    for line in result.stdout.splitlines():
        if expected_fragment in line:
            return line.split(" ", 1)[0].strip()
    return None


def export_gold_dump() -> None:
    print(f"[pipeline] Exporting gold dump -> {GOLD_DUMP_PATH}")
    tenant_schema = settings.active_tenant_schema
    vocab_schema = settings.vocab_schema

    def _write_compressed_dump(sql_dump_text: str) -> None:
        tmp_gz_path = GOLD_DUMP_PATH.with_suffix(".sql.gz.tmp")
        with gzip.open(tmp_gz_path, "wt", encoding="utf-8") as gz_file:
            gz_file.write(sql_dump_text)
        tmp_gz_path.replace(GOLD_DUMP_PATH)
        # Keep the artifact compact for GitHub limits and CI transfer costs.
        if GOLD_DUMP_SQL_PATH.exists():
            GOLD_DUMP_SQL_PATH.unlink()

    pg_dump_path = shutil.which("pg_dump")
    if pg_dump_path:
        env = dict(**os.environ, PGPASSWORD=settings.omop_etl_password)
        result = subprocess.run(
            [
                pg_dump_path,
                "-h",
                settings.pipeline_db_host,
                "-p",
                str(settings.pipeline_db_port),
                "-U",
                settings.omop_etl_user,
                "-d",
                settings.omop_db_name,
                "--no-owner",
                "--no-privileges",
                "--schema",
                tenant_schema,
                "--schema",
                vocab_schema,
            ],
            capture_output=True,
            text=True,
            env=env,
            check=True,
        )
        _write_compressed_dump(result.stdout)
        print("[pipeline] Gold dump export complete (host pg_dump, gzip)")
        return

    container_name = find_postgres_container_by_port(settings.pipeline_db_port)
    if not container_name:
        raise RuntimeError(
            "Unable to export gold dump: pg_dump is not available on host and no "
            f"postgres container is mapped to port {settings.pipeline_db_port}"
        )

    result = subprocess.run(
        [
            "docker",
            "exec",
            "-e",
            f"PGPASSWORD={settings.omop_etl_password}",
            container_name,
            "pg_dump",
            "-U",
            settings.omop_etl_user,
            "-d",
            settings.omop_db_name,
            "--no-owner",
            "--no-privileges",
            "--schema",
            tenant_schema,
            "--schema",
            vocab_schema,
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    _write_compressed_dump(result.stdout)
    print(f"[pipeline] Gold dump export complete (docker exec: {container_name}, gzip)")


def write_qa_results(summary: QaGateSummary) -> None:
    """Write QA gate results to ``pipeline_qa_results.json``.

    The file is overwritten on every run.  CI should archive the artifact if
    a history of gate runs is required for audit purposes.
    """
    QA_RESULTS_PATH.write_text(
        json.dumps(summary.to_dict(), indent=2, default=str),
        encoding="utf-8",
    )
    print(f"[pipeline] QA results written -> {QA_RESULTS_PATH}")


def run_qa_gates_postload(qa_summary_ref: list[QaGateSummary]) -> None:
    """Open a DB connection and run all post-load QA gates.

    The ``qa_summary_ref`` list is mutated in place so the caller can access
    the summary regardless of whether a ``QaGateFailure`` is raised.
    """
    dsn = settings.database_url.replace("postgresql+psycopg", "postgresql")
    with psycopg.connect(dsn) as conn:
        try:
            summary = run_all_gates(
                conn,
                tenant_schema=settings.active_tenant_schema,
                vocab_schema=settings.vocab_schema,
                profile=settings.pipeline_profile,
            )
            qa_summary_ref.append(summary)
            write_qa_results(summary)
        except QaGateFailure as exc:
            qa_summary_ref.append(exc.summary)
            write_qa_results(exc.summary)
            raise


def write_run_metadata(elapsed_seconds: float, status: str = "success", qa_summary: QaGateSummary | None = None) -> None:
    """Write a JSON metadata artifact after each pipeline run.

    Produces ``data-pipeline/pipeline_run_metadata.json`` with:
    - run_id, profile, population, seed, status
    - started_at (approximated from elapsed), finished_at
    - gold_dump_path and its byte size (if present)

    The file is overwritten on every run to always reflect the latest state.
    Historical runs are not retained here — CI should archive the artifact if
    auditability over time is required.
    """
    finished_at = datetime.now(timezone.utc)
    started_at_ts = finished_at.timestamp() - elapsed_seconds
    started_at = datetime.fromtimestamp(started_at_ts, tz=timezone.utc)

    gold_size_bytes: int | None = None
    if GOLD_DUMP_PATH.exists():
        gold_size_bytes = GOLD_DUMP_PATH.stat().st_size

    metadata = {
        "run_id": str(uuid4()),
        "profile": settings.pipeline_profile,
        "synthea_population_size": settings.synthea_population_size,
        "synthea_seed": settings.synthea_seed,
        "tenant_schema": settings.active_tenant_schema,
        "vocab_schema": settings.vocab_schema,
        "status": status,
        "started_at": started_at.isoformat(),
        "finished_at": finished_at.isoformat(),
        "elapsed_seconds": round(elapsed_seconds, 2),
        "gold_dump_path": str(GOLD_DUMP_PATH),
        "gold_dump_size_bytes": gold_size_bytes,
        "qa_gates_total": qa_summary.total if qa_summary else None,
        "qa_gates_passed": qa_summary.passed if qa_summary else None,
        "qa_gates_failed": qa_summary.failed if qa_summary else None,
        "qa_gates_all_passed": qa_summary.all_passed if qa_summary else None,
    }

    RUN_METADATA_PATH.write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )
    print(f"[pipeline] Run metadata written -> {RUN_METADATA_PATH}")


def run_etl_only() -> None:
    validate_profile_settings()
    run_omop_etl()


def validate_profile_settings() -> None:
    if settings.pipeline_profile == "athena_permitted" and not settings.athena_profile_enabled:
        raise RuntimeError(
            "PIPELINE_PROFILE=athena_permitted requires ATHENA_PROFILE_ENABLED=true; "
            "athena profile is a placeholder and disabled by default"
        )


def main() -> None:
    run_start = time.time()
    print(
        "Running data pipeline with "
        f"profile={settings.pipeline_profile}, "
        f"tenant_schema={settings.active_tenant_schema}, "
        f"vocab_schema={settings.vocab_schema}, "
        f"fail_on_vocab_gap={settings.fail_on_vocab_gap}"
    )
    validate_profile_settings()

    ensure_postgres_container()
    wait_for_database()
    run_synthea_generation()
    run_alembic_upgrade()
    run_omop_etl()

    # Phase 4: run blocking QA gates before Gold export
    qa_summary_holder: list[QaGateSummary] = []
    try:
        run_qa_gates_postload(qa_summary_holder)
    except QaGateFailure:
        elapsed = time.time() - run_start
        qa_summary = qa_summary_holder[0] if qa_summary_holder else None
        write_run_metadata(elapsed_seconds=elapsed, status="qa_failed", qa_summary=qa_summary)
        raise

    qa_summary = qa_summary_holder[0] if qa_summary_holder else None
    export_gold_dump()

    elapsed = time.time() - run_start
    print("[pipeline] Complete: bronze + silver + gold generated successfully")
    write_run_metadata(elapsed_seconds=elapsed, status="success", qa_summary=qa_summary)


if __name__ == "__main__":
    main()
