#!/usr/bin/env python
"""
export_gold.py — Standalone Gold SQL dump export script.

Invoke via:
  uv run pipeline-export-gold          (registered entrypoint)
  uv run python scripts/export_gold.py  (direct)

Re-exports the current DB state as ``gold_omop_tenant.sql.gz`` without re-running
Synthea generation, migrations, or ETL. Useful when:

- You only need to refresh the dump artifact after a hotfix.
- CI needs to snapshot the current state without a full pipeline run.

Prerequisite: the DB must already be populated (run ``pipeline-full`` or
``pipeline-etl`` first).
"""
from __future__ import annotations

import sys
from pathlib import Path

# Ensure the data-pipeline root is importable when invoked directly.
PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(PIPELINE_ROOT))

from main import export_gold_dump, write_run_metadata  # noqa: E402
import time  # noqa: E402


def main() -> None:
    print("[export-gold] Starting standalone Gold dump export...")
    start = time.time()
    export_gold_dump()
    elapsed = time.time() - start
    write_run_metadata(elapsed_seconds=elapsed, status="export-only")
    print(f"[export-gold] Done in {elapsed:.1f}s")


if __name__ == "__main__":
    main()
