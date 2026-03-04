"""
pytest conftest for the data-pipeline unit tests.

Sets required environment variables at import-time so that pydantic-settings
can instantiate ``Settings`` when pipeline modules are first imported.  All
values here are safe, local-only defaults — they are never used for real DB
connections during unit tests.
"""
import os

# Set required fields before any pipeline module (and therefore pydantic-settings)
# is imported.  pydantic-settings reads os.environ at instantiation time.
os.environ.setdefault("PIPELINE_DB_HOST", "localhost")
os.environ.setdefault("PIPELINE_DB_PORT", "5432")
os.environ.setdefault("OMOP_DB_NAME", "test_db")
os.environ.setdefault("OMOP_ETL_USER", "test_user")
os.environ.setdefault("OMOP_ETL_PASSWORD", "test_password")

import sys
from pathlib import Path

# Ensure the data-pipeline root is on sys.path so imports resolve correctly
# regardless of where pytest is invoked from.
_PIPELINE_ROOT = Path(__file__).resolve().parent.parent
if str(_PIPELINE_ROOT) not in sys.path:
    sys.path.insert(0, str(_PIPELINE_ROOT))
