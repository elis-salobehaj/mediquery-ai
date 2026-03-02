from __future__ import annotations

import shutil
import subprocess
import sys
import time
import os
from pathlib import Path

import psycopg

from config import settings
from load_omop import main as run_omop_etl


PIPELINE_ROOT = Path(__file__).resolve().parent
REPO_ROOT = PIPELINE_ROOT.parent
GOLD_DUMP_PATH = PIPELINE_ROOT / "gold_omop_tenant.sql"


def run_command(command: list[str], cwd: Path | None = None) -> None:
    print(f"[pipeline] Running: {' '.join(command)}")
    subprocess.run(command, cwd=cwd, check=True)


def ensure_postgres_container() -> None:
    if settings.pipeline_db_host not in {"localhost", "127.0.0.1"}:
        print(
            "[pipeline] PIPELINE_DB_HOST is not localhost; skipping docker compose postgres bootstrap"
        )
        return

    compose_file = REPO_ROOT / "docker-compose.yml"
    if not compose_file.exists():
        print("[pipeline] Root docker-compose.yml not found; skipping postgres bootstrap")
        return

    run_command(
        ["docker", "compose", "-f", str(compose_file), "up", "-d", "postgres"],
        cwd=REPO_ROOT,
    )


def wait_for_database(timeout_seconds: int = 120) -> None:
    print(
        "[pipeline] Waiting for DB "
        f"{settings.pipeline_db_host}:{settings.pipeline_db_port}/{settings.pipeline_db_name}..."
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
    if "permission denied for schema public" not in error_text:
        raise subprocess.CalledProcessError(result.returncode, command)

    print(
        "[pipeline] Alembic could not write version table in public schema; "
        "checking whether target schemas already exist"
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

    pg_dump_path = shutil.which("pg_dump")
    if pg_dump_path:
        env = dict(**os.environ, PGPASSWORD=settings.pipeline_db_password)
        result = subprocess.run(
            [
                pg_dump_path,
                "-h",
                settings.pipeline_db_host,
                "-p",
                str(settings.pipeline_db_port),
                "-U",
                settings.pipeline_db_user,
                "-d",
                settings.pipeline_db_name,
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
        GOLD_DUMP_PATH.write_text(result.stdout, encoding="utf-8")
        print("[pipeline] Gold dump export complete (host pg_dump)")
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
            f"PGPASSWORD={settings.pipeline_db_password}",
            container_name,
            "pg_dump",
            "-U",
            settings.pipeline_db_user,
            "-d",
            settings.pipeline_db_name,
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
    GOLD_DUMP_PATH.write_text(result.stdout, encoding="utf-8")
    print(f"[pipeline] Gold dump export complete (docker exec: {container_name})")


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
    export_gold_dump()

    print("[pipeline] Complete: bronze + silver + gold generated successfully")


if __name__ == "__main__":
    main()
