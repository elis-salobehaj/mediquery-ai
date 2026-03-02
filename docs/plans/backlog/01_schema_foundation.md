---
title: "Plan 1: Multi-Tenant Schema Foundation"
status: planning
priority: high
estimated_hours: 20-30
dependencies: []
created: 2026-02-11
related_files:
  - backend/config.py
  - backend/domain/models.py
  - backend/services/database.py
  - backend/alembic/versions/
  - infra/mysql/init.sql.gz
tags:
  - multi-tenancy
  - mysql
  - database-isolation
---

## Alignment Update (2026-02-27)

This plan remains backlog, but execution should align with the active benchmark contract in [docs/plans/active/automated_benchmarking_evaluation_pipeline.md](../active/automated_benchmarking_evaluation_pipeline.md).

### Required integration points before implementation sign-off

- Tenant-aware benchmark execution (`tenant_demo`, `tenant_test`, etc.)
- Environment-scoped corpus overlays for schema variants
- Schema drift reporting for tenant-specific table deltas
- Regression thresholds evaluated per-tenant and aggregate

## Goal

**Smallest possible change** to establish database-per-tenant multi-tenancy in MySQL for KPI data, so the LangGraph agent queries tenant-isolated data. PostgreSQL continues to serve app data (users, chat, tokens). MySQL 8.4 is already AWS Aurora-compatible. This is the only data-pipeline plan that modifies the Mediquery application.

### What This Plan Does NOT Include

- ❌ Dagster, Polars, or any pipeline orchestration (see Plan 2+)
- ❌ Automated ingestion from S3 (manual for now)
- ❌ Data quality frameworks (Great Expectations — Plan 3)
- ❌ MLOps, vector stores, training data (Plan 4)

---

## Current State

| Component            | Now                              | After This Plan                             |
| -------------------- | -------------------------------- | ------------------------------------------- |
| **KPI Data**         | MySQL 8.4 (single shared DB)     | MySQL database-per-tenant                   |
| **App Data**         | PostgreSQL (users, chat, tokens) | PostgreSQL + `tenants` registry table added |
| **Agent Wait_time** | Single MySQL engine              | Dynamic `USE <tenant_db>` per tenant        |
| **Tenant Isolation** | None                             | Hard database isolation                     |
| **Data Loading**     | `infra/mysql/init.sql.gz`        | Manual SQL scripts into tenant database     |

### Existing App Data (PostgreSQL — stays as-is)

- `users` — UUID PK, username, email, role, preferences, monthly_token_limit
- `chat_threads` — per-user threads
- `chat_messages` — messages within threads
- `token_usage` — LLM token consumption tracking
- `token_blacklist` — JWT revocation

### Existing MySQL Tables (KPI Data — to be moved into tenant databases)

- `patients` (currently `patients`) — Patient master data
- `lab_results` (currently `DAILY_PRODUCTION`) — Daily production KPIs
- `wait_times` — Wait_time times and capacities
- Plus ~5 more domain tables from `semantic_view.yaml`

---

## Implementation Tasks

### 1.1 Create Tenants Table in PostgreSQL

Add a `tenants` registry to the existing PostgreSQL database.

- [ ] Create Alembic migration `add_tenants_table`:
  ```sql
  CREATE TABLE tenants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      db_name VARCHAR(63) NOT NULL UNIQUE,  -- e.g., 'tenant_demo' (MySQL DB name)
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  ```
- [ ] Add SQLAlchemy model `Tenant` in `backend/domain/models.py`
- [ ] Seed one default tenant: `name='Demo', db_name='tenant_demo'`

### 1.2 Link Users to Tenants

- [ ] Add `tenant_id` FK column to `users` table via Alembic migration
  ```sql
  ALTER TABLE users ADD COLUMN tenant_id UUID REFERENCES tenants(id);
  ```
- [ ] Update `User` model in `backend/domain/models.py`
- [ ] Update JWT token generation to include `tenant_db` claim
- [ ] Update `auth_service.py` to resolve tenant database from user on login

### 1.3 Define KPI Database Template

Design the "master template" — the set of tables every tenant database gets. Based on the current MySQL schema + `semantic_view.yaml`.

- [ ] Document the canonical table definitions (columns, types, constraints, indexes)
- [ ] Create utility to provision a new tenant database:
  ```python
  def create_tenant_database(db_name: str):
      """Creates a tenant database with all KPI tables."""
      engine.execute(f"CREATE DATABASE IF NOT EXISTS {db_name}")
      # Create patients, lab_results, wait_times, etc. inside database
  ```
- [ ] Build utility function `create_tenant_database(tenant_id)` in a new `backend/app/services/tenant_manager.py`
- [ ] Utility should: create database, create all tables, register in `tenants` table

### 1.4 Load Demo Data into Tenant Database

Move existing demo data from the shared MySQL database into `tenant_demo` database.

- [ ] Write a script that:
  1. Creates `tenant_demo` database using the template
  2. Copies rows from current shared tables into `tenant_demo.<table_name>`
  3. Renames tables to canonical names (e.g., `patients` → `patients`)
- [ ] Validate row counts match
- [ ] Store script in `scripts/seed_tenant_demo.py` (reusable for new tenants)

### 1.5 Agent Wait_time Switching

Modify the database service so the LangGraph agent connects to the correct tenant database.

- [ ] Update `DatabaseService` in `backend/services/database.py`:
  - Add method `get_tenant_connection(db_name)` that:
    ```python
    def get_tenant_connection(self, db_name: str):
        """Returns a wait_time scoped to a tenant database."""
        conn = self.engine.connect()
        conn.execute(text(f"USE {db_name}"))
        return conn
    ```
- [ ] Update `execute_query()` and `validate_sql()` to accept a `db_name` param
- [ ] Update `get_schema()` to introspect from tenant database
- [ ] Wire tenant database through the agent graph: JWT → user → tenant → db_name → DB wait_time

### 1.6 Update Config

- [ ] Add MySQL KPI database settings to `config.py`:

  ```python
  # PostgreSQL (app data — existing, unchanged)
  postgresql_host: str = "mediquery-postgres"
  postgresql_port: int = 5432
  postgresql_user: str = "mediquery"
  postgresql_password: str = ""
  postgresql_database: str = "mediquery"

  # MySQL (KPI data — tenant databases)
  mysql_host: str = "mediquery-mysql"
  mysql_port: int = 3306
  mysql_user: str = "mediquery"
  mysql_password: str = ""
  ```

- [ ] Create a separate SQLAlchemy engine for MySQL KPI wait_times
- [ ] Ensure MySQL wait_time string is AWS Aurora-compatible: `mysql+pymysql://user:pass@host:3306`

### 1.7 Multi-Tenant Testing

- [ ] Create 2 test tenant databases (`tenant_demo`, `tenant_test`) with different synthetic data
- [ ] Write integration test: Agent connected to `tenant_demo` cannot see `tenant_test` tables
- [ ] Write integration test: `USE tenant_demo` correctly scopes `information_schema.tables`
- [ ] Write integration test: Text-to-SQL query runs against `tenant_demo.lab_results` successfully
- [ ] Update existing tests that reference MySQL shared database to work with tenant databases

---

## Deliverables

1. **`tenants` table** in PostgreSQL with `tenant_demo` seeded
2. **`users.tenant_id`** FK linking users to tenants
3. **Tenant database template** — utility to create identical KPI tables per MySQL database
4. **`tenant_demo` database** — populated with existing demo data in MySQL
5. **Agent wait_time switching** — `USE <tenant_db>` on MySQL based on authenticated user's tenant
6. **Isolation test suite** — proves hard database isolation works

---

## Definition of Done

- [ ] Agent can answer "What is average patient age?" against `tenant_demo` database
- [ ] Agent connected as User A (tenant_demo) cannot see User B (tenant_test) data
- [ ] All existing tests pass (PostgreSQL app data + MySQL KPI data)
- [ ] Dual-database config works: PostgreSQL for app data, MySQL for KPI data

---

## Decision Log

| Decision                   | Choice                  | Rationale                                                                 |
| -------------------------- | ----------------------- | ------------------------------------------------------------------------- |
| KPI data engine            | **MySQL 8.4 (Percona)** | Already operational, AWS Aurora-compatible, database-per-tenant isolation |
| App data engine            | **PostgreSQL**          | Already operational, Alembic-managed, no reason to migrate                |
| Database naming convention | `tenant_<slug>`         | Matches design doc                                                        |
| Tenants registry location  | PostgreSQL (app data)   | Users reference tenants — keep in same database                           |
| UUID strategy              | PostgreSQL native UUID  | `gen_random_uuid()` in PostgreSQL, MySQL KPI tables use `CHAR(36)`        |

---

## Files to Create / Modify

| File                                          | Action | Purpose                                                    |
| --------------------------------------------- | ------ | ---------------------------------------------------------- |
| `backend/domain/models.py`                    | Modify | Add `Tenant` model, `tenant_id` FK on `User`               |
| `backend/alembic/versions/xxx_add_tenants.py` | Create | Tenants table + users FK migration (PostgreSQL)            |
| `backend/app/services/tenant_manager.py`      | Create | MySQL database creation, tenant registry                   |
| `backend/services/database.py`                | Modify | Add MySQL KPI engine, `get_tenant_connection()` with `USE` |
| `backend/services/auth_service.py`            | Modify | Include `tenant_db` in JWT claims                          |
| `backend/config.py`                           | Modify | Add MySQL KPI config (keep existing PostgreSQL config)     |
| `scripts/seed_tenant_demo.py`                 | Create | Seed tenant_demo database with demo data                   |
| `backend/tests/test_tenant_isolation.py`      | Create | Database isolation integration tests                       |

---

## Risk Mitigation

| Risk                                                       | Impact | Mitigation                                                            |
| ---------------------------------------------------------- | ------ | --------------------------------------------------------------------- |
| MySQL `USE` statement not thread-safe with wait_time pool | Medium | Use separate wait_times per tenant, or create per-tenant engines     |
| Wait_time pool exhaustion with per-tenant databases       | Low    | Phase 1 has <5 tenants; use wait_time pooling with `USE` on checkout |
| Dual-database complexity (two engines to manage)           | Low    | Already the existing setup — no new operational burden                |
| Existing tests break                                       | Medium | Run full test suite before merging                                    |
