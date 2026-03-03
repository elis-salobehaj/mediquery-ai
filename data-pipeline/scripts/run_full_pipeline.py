#!/usr/bin/env python
"""
run_full_pipeline.py — Full Bronze → Silver → Gold orchestration script.

Invoke via:
  uv run pipeline-full          (recommended — registered entrypoint)
  uv run python scripts/run_full_pipeline.py  (direct)

This script runs every pipeline phase in the authoritative deterministic order:

  1. Validate config/profile
  2. Ensure PostgreSQL container
  3. Wait for DB readiness
  4. Generate Bronze Synthea CSVs
  5. Apply Silver schema migrations (Alembic)
  6. Run profile-aware ETL + vocabulary loading
  7. Export Gold SQL dump
  8. Write run metadata JSON artifact

All steps are idempotent; repeated runs produce stable artifacts given the same
SYNTHEA_POPULATION_SIZE and SYNTHEA_SEED values.
"""
from __future__ import annotations

import sys
import time
from pathlib import Path

# Ensure the data-pipeline root is importable when invoked directly.
PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from config import settings  # noqa: E402 — must come after path setup
from main import (  # noqa: E402
    ensure_postgres_container,
    export_gold_dump,
    run_alembic_upgrade,
    run_omop_etl,
    run_synthea_generation,
    validate_profile_settings,
    wait_for_database,
    write_run_metadata,
)


def main() -> None:
    run_start = time.time()

    print("=" * 70)
    print("Mediquery Data Pipeline — Full Run")
    print(f"  profile            : {settings.pipeline_profile}")
    print(f"  tenant_schema      : {settings.active_tenant_schema}")
    print(f"  vocab_schema       : {settings.vocab_schema}")
    print(f"  synthea_population : {settings.synthea_population_size}")
    print(f"  synthea_seed       : {settings.synthea_seed}")
    print(f"  fail_on_vocab_gap  : {settings.fail_on_vocab_gap}")
    print("=" * 70)

    # Phase 1 — Config validation
    print("\n[1/7] Validating pipeline configuration...")
    validate_profile_settings()

    # Phase 2 — DB bootstrap
    print("\n[2/7] Ensuring PostgreSQL container is up...")
    ensure_postgres_container()

    print("\n[3/7] Waiting for database readiness...")
    wait_for_database()

    # Phase 3 — Synthea Bronze
    print("\n[4/7] Generating Synthea Bronze CSVs...")
    run_synthea_generation()

    # Phase 4 — Silver migrations
    print("\n[5/7] Applying Silver schema migrations...")
    run_alembic_upgrade()

    # Phase 5 — ETL
    print("\n[6/7] Running ETL (vocabulary + fact tables)...")
    run_omop_etl()

    # Phase 6 — Gold export
    print("\n[7/7] Exporting Gold SQL dump...")
    export_gold_dump()

    elapsed = time.time() - run_start
    print(f"\n{'=' * 70}")
    print(f"Pipeline complete in {elapsed:.1f}s")
    print(f"{'=' * 70}")

    # Write metadata artifact
    write_run_metadata(elapsed_seconds=elapsed, status="success")


if __name__ == "__main__":
    main()
