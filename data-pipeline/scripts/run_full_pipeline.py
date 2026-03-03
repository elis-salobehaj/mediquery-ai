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
  7. Run post-load QA gates (blocking — stops export on gate failure)
  8. Export Gold SQL dump + write metadata artifacts

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
    run_qa_gates_postload,
    run_synthea_generation,
    validate_profile_settings,
    wait_for_database,
    write_run_metadata,
)
from vocabulary.qa_checks import QaGateFailure, QaGateSummary


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
    print("\n[1/8] Validating pipeline configuration...")
    validate_profile_settings()

    # Phase 2 — DB bootstrap
    print("\n[2/8] Ensuring PostgreSQL container is up...")
    ensure_postgres_container()

    print("\n[3/8] Waiting for database readiness...")
    wait_for_database()

    # Phase 3 — Synthea Bronze
    print("\n[4/8] Generating Synthea Bronze CSVs...")
    run_synthea_generation()

    # Phase 4 — Silver migrations
    print("\n[5/8] Applying Silver schema migrations...")
    run_alembic_upgrade()

    # Phase 5 — ETL
    print("\n[6/8] Running ETL (vocabulary + fact tables)...")
    run_omop_etl()

    # Phase 6 — QA Gates (blocking)
    print("\n[7/8] Running post-load QA gates...")
    qa_summary_holder: list[QaGateSummary] = []
    try:
        run_qa_gates_postload(qa_summary_holder)
    except QaGateFailure as exc:
        elapsed = time.time() - run_start
        qa_summary = qa_summary_holder[0] if qa_summary_holder else exc.summary
        write_run_metadata(elapsed_seconds=elapsed, status="qa_failed", qa_summary=qa_summary)
        print(f"\n[pipeline] ❌ QA gates failed — Gold export aborted. See pipeline_qa_results.json for details.")
        raise SystemExit(1) from exc

    qa_summary = qa_summary_holder[0] if qa_summary_holder else None

    # Phase 7 — Gold export
    print("\n[8/8] Exporting Gold SQL dump...")
    export_gold_dump()

    elapsed = time.time() - run_start
    print(f"\n{'=' * 70}")
    print(f"Pipeline complete in {elapsed:.1f}s")
    print(f"{'=' * 70}")

    # Write metadata artifacts
    write_run_metadata(elapsed_seconds=elapsed, status="success", qa_summary=qa_summary)


if __name__ == "__main__":
    main()
