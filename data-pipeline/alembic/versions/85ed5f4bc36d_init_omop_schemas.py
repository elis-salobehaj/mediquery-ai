"""init_omop_schemas

Revision ID: 85ed5f4bc36d
Revises: 
Create Date: 2026-03-01 14:23:23.731930

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import os
import sys
from pathlib import Path

# Add project root to path so we can import config
sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
from config import settings


# revision identifiers, used by Alembic.
revision: str = '85ed5f4bc36d'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    ddl_path = Path(__file__).resolve().parent.parent.parent / 'omop_ddl' / 'OMOPCDM_postgresql_5.4_ddl.sql'
    with open(ddl_path, 'r') as f:
        ddl_sql = f.read()

    # Apply to both vocab and tenant schemas
    schemas = [settings.vocab_schema] + settings.tenant_schemas
    for schema in schemas:
        op.execute(f"CREATE SCHEMA IF NOT EXISTS {schema};")
        schema_sql = ddl_sql.replace('@cdmDatabaseSchema', schema)
        # SQLAlchemy and Alembic execute block SQL. Sometimes multi-statements fail if not text()
        op.execute(sa.text(schema_sql))


def downgrade() -> None:
    schemas = [settings.vocab_schema] + settings.tenant_schemas
    for schema in schemas:
        op.execute(f"DROP SCHEMA IF EXISTS {schema} CASCADE;")
