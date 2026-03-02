# Mediquery Data Pipeline: Architecture Design

> **Document Purpose**: Architectural rationale and high-level design for Mediquery's multi-tenant data pipeline. Intended for engineering team review and stakeholder alignment.
>
> **Last Updated**: February 2026 | **Status**: Approved for implementation

---

## 1. Problem Statement

Mediquery is a **Text-to-SQL platform** for medical KPI analysis. Users ask natural language questions, and an AI agent generates SQL to query production data (patient metadata, visits, procedures, conditions, etc.).

As we onboard multiple customers, we need a **multi-tenant data architecture** that:

- **Isolates** each customer's data with zero risk of cross-tenant leaks
- **Standardizes** ingestion so every customer's data flows through the same pipeline
- **Decouples** the data pipeline from the AI agent for independent scaling and future MLOps
- **Scales** from 1 to hundreds of tenants without per-tenant code changes

---

## 2. Design Decision: Schema-per-Tenant

### Why Not Row-Level Security (RLS)?

In a conventional SaaS app, RLS is a reasonable choice — the application always generates its own queries. But Mediquery's core product is **AI-generated SQL**. This changes the threat model:

| Concern                                    | RLS                                                                                                            | Schema-per-Tenant                                                    |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| AI generates a query that bypasses filters | **Possible** — system functions, leaked admin roles, or missing `WHERE` clauses can expose other tenants' rows | **Impossible** — tenant tables aren't visible outside the schema     |
| Token cost for isolation instructions      | Every prompt must include "Remember to filter by `tenant_id`"                                                  | No filtering needed — `SELECT * FROM condition_occurrence` is safe by default |
| Client data export requests                | Complex extraction with `WHERE tenant_id = ?` across all tables                                                | `pg_dump -n tenant_abc` — simple, auditable                          |
| Debugging & auditing                       | Implicit filtering makes it hard to verify isolation                                                           | Explicit logical boundary (`search_path`) — easy to inspect          |

**Verdict**: Schema-per-Tenant gives us **hard isolation** at the database level instead of relying on the AI to never make a mistake. For a B2B platform handling sensitive production data in the energy sector, this is the correct trade-off.

> **Note**: We use PostgreSQL schemas (`tenant_abc`) rather than separate Postgres databases to keep connection pooling simple, but achieve the exact same SQL isolation by setting the search path.

---

## 3. Architecture Overview

### 3.1 The Switchboard Pattern

The pipeline identifies data owners **early** (at ingestion) and routes them to isolated schemas. We call this the "Switchboard" — one pipeline definition serves all tenants through dynamic routing.

```
┌─────────────────┐     ┌──────────────────────┐     ┌─────────────────────────┐
│  Data Sources   │     │  Data Pipeline       │     │  PostgreSQL 18.1        │
│                 │     │  (Dagster + Polars)  │     │                         │
│  CSV uploads    │────▶│                      │────▶│  tenant_abc.person      │
│  API feeds      │     │  Bronze → Silver →   │     │  tenant_abc.measurement │
│  Manual loads   │     │  Validated → Gold    │     │  tenant_xyz.person      │
└─────────────────┘     └──────────────────────┘     │  tenant_xyz.measurement │
                                                     └────────────┬────────────┘
                                                                  │
                                                          SET search_path TO tenant_abc
                                                                  │
                                                      ┌───────────▼─────────────┐
                                                      │  LangGraph Agent        │
                                                      │  (Text-to-SQL)          │
                                                      │                         │
                                                      │  Sees ONLY the tables   │
                                                      │  in its schema (`tenant_abc`) │
                                                      └─────────────────────────┘
```

### 3.2 The Medallion Layers

Data flows through three stages before reaching the agent:

| Layer                | Storage                      | Purpose                                                                                                                                                      |
| -------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Bronze** (Raw)     | S3 / MinIO                   | Immutable source files, partitioned by tenant and date. Enables full reprocessing. Path: `s3://mediquery-raw/tenant_id=abc/table=synthea_csvs/2026-02-11.csv` |
| **Silver** (Refined) | In-memory (Polars)           | Cleaned, type-cast, unit-standardized DataFrames. Validated against the Universal Schema before loading.                                                     |
| **Gold** (Analytics) | PostgreSQL schema-per-tenant | Optimized for Text-to-SQL queries. Identical table structure across all schemas (the "Schema Contract").                                                     |

### 3.3 Dual-Database Layout

Mediquery uses **two database engines**, each optimized for its role:

### 3.3 Unified Postgres Layout

Instead of multiple disparate database engines, Mediquery consolidates everything into a single powerful **PostgreSQL 18.1** cluster. We separate core application data (which uses the `public` schema) from tenant records (which each get their own schema):

```
PostgreSQL 18.1
├── public (App Data)
│   ├── tenants                     ← Tenant registry (id, name, db_name/schema_name)
│   ├── users                       ← Auth, linked to tenants via tenant_id
│   ├── chat_threads                ← Conversation history
│   ├── chat_messages               ← Messages within threads
│   ├── token_usage                 ← LLM consumption tracking
│   ├── golden_queries              ← Evaluation suite (Plan 4)
│   └── table_statistics            ← Schema stats for prompting (Plan 4)
│
├── tenant_abc                      ← ABC's KPI data schema
│   ├── person
│   ├── measurement
│   ├── visit_occurrence
│   └── ... (8+ standard tables)
│
├── tenant_xyz                      ← XYZ's KPI data schema
│   ├── person
│   ├── measurement
│   ├── visit_occurrence
│   └── ... (identical structure)
│
└── tenant_<n>                      ← Each new customer gets a cloned schema
```

**Why one database with multiple schemas?**

- Simplifies infrastructure, testing, and connection pooling (no cross-DB cross-connections required).
- Provides equal hard isolation guarantees as long as the AI's execution thread uses `SET search_path = tenant_abc`.
- Avoids the maintenance overhead of managing hundreds of distinct databases on AWS RDS.
- AI Agent has access to Postgres' powerful analytical features (extensions, window functions) uniformly across tenants.

**KPI Database Synchronization**: Drizzle ORM / Alembic migrations iterate across all tenant schemas, ensuring every customer is on the same table version. A `schema_version` field in the `tenants` registry tracks migration state.

---

## 4. The Agent Execution Model

This is where schema-per-tenant provides its biggest advantage — the AI agent layer becomes dramatically simpler.

### Step 1: Context Switch (The "Handshake")

When a user sends a question, the backend resolves their tenant **before** the agent starts thinking, and sets the schema context on the database connection:

```python
def get_tenant_connection(user_session):
    # Resolve tenant from authenticated user's JWT claims
    schema_name = user_session.tenant_schema  # e.g., "tenant_abc"

    # Acquire connection and restrict search path to the tenant
    conn = pool.get_connection()
    conn.execute(f"SET search_path TO {schema_name};")

    return conn
```

### Step 2: The Agent's Isolated View

The agent introspects the database and sees **only** its tenant's tables:

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema = current_schema();
-- Returns: person, measurement, visit_occurrence, ...
-- Does NOT return: tenant_xyz.person, tenant_exxon.measurement
```

### Step 3: Clean SQL Generation

The user asks: _"What is the average visit duration?"_

The agent generates:

```sql
SELECT AVG(value_as_number) FROM measurement;
```

No `WHERE tenant_id = ...` needed. The database executes this inside `tenant_abc` schema. Isolation is enforced by PostgreSQL `search_path` itself, not by the AI's ability to remember a filter clause.

---

## 5. Pipeline & Agent Decoupling

The data pipeline and the AI agent are **two independent systems** connected only by the Schema Contract.

### The Schema Contract

> \_The pipeline guarantees that every `tenant\__` schema contains exactly the same tables with the same columns, types, and constraints.\*

This contract means:

- **The AI agent** is trained/prompted against the Master Template schema once. It works for every tenant without reconfiguration.
- **The pipeline** can be developed, tested, and deployed independently of the Mediquery application.
- **New tenants** are onboarded by creating a new schema, pushing the table structure, and loading their data — no application changes required.

### Separation of Concerns

| Component                           | Owned By                     | Deploys Independently     |
| ----------------------------------- | ---------------------------- | ------------------------- |
| Mediquery App (NestJS + LangGraph)  | Application team             | Yes                       |
| Data Pipeline (Polars + Alembic)    | Data/Platform team           | Yes                       |
| PostgreSQL + Schema Template        | Shared (via Drizzle/Alembic) | Migrations run separately |

This decoupling is intentional — the pipeline may evolve into a broader MLOps platform (model training, evaluation, feature stores) without requiring changes to the application.

---

## 6. Vector Stores & RAG (Future)

For document-based retrieval (e.g., searching PDF patient reports), we use a dedicated vector database (e.g., Qdrant, ChromaDB, or Milvus) alongside PostgreSQL:

- **Isolation approach**: `tenant_id` metadata filter (soft isolation) — acceptable for non-financial document text
- **KPI data**: Hard `search_path` schema isolation (as described above) — required for sensitive production/financial data

```python
# RAG query scoped to tenant (using vector DB client)
results = vector_db.search(
    collection="document_embeddings",
    query_vector=embedding,
    filter={"tenant_id": tenant_id},
    limit=5
)
```

---

## 7. Technology Stack Summary

| Layer                 | Technology                       | Role                                                 |
| --------------------- | -------------------------------- | ---------------------------------------------------- |
| **Orchestration**     | Dagster                          | Pipeline scheduling, monitoring, data lineage, retry |
| **Transformation**    | Polars                           | Fast, memory-efficient DataFrame processing          |
| **Raw Storage**       | S3 / MinIO                       | Bronze layer — immutable source files                |
| **App Data**          | PostgreSQL 18.1 (public schema)  | Users, chat, tenants registry, MLOps metadata        |
| **KPI Storage**       | PostgreSQL 18.1 (tenant schemas) | Gold layer — schema-per-tenant KPI tables            |
| **Schema Migrations** | Drizzle/Alembic                  | Core App and multi-schema migration strategies       |
| **Data Quality**      | Great Expectations               | Validation rules, anomaly detection                  |
| **AI Agent**          | LangGraph + LangChain            | Multi-agent Text-to-SQL orchestration                |
| **Vector Store**      | Qdrant / ChromaDB                | Tenant-filtered document embeddings (RAG)            |

---

## 8. Implementation Roadmap

The implementation is structured as four independent, deliverable-focused plans:

| Plan                          | Scope                                                                                   | Key Deliverable                                              |
| ----------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **1. Schema Foundation**      | Tenant registry, schema template, agent tenant context switching                        | Agent queries tenant-isolated data in PostgreSQL             |
| **2. Manual ETL Scripts**     | Standalone Polars pipeline reading from S3, loading into tenant schemas (CLI-triggered) | `etl load --tenant abc --table lab_results` works end-to-end |
| **3. Pipeline Orchestration** | Dagster wrapping ETL scripts, scheduling, Great Expectations, monitoring                | Automated daily runs with data quality checks                |
| **4. MLOps Foundation**       | Qdrant vector store, training data export, golden query evaluation, model registry      | Self-improving agent accuracy via automated evaluation       |

Each plan produces a working, testable deliverable. Plan 1 is the only one that modifies the Mediquery application — Plans 2-4 live in a standalone `data-pipeline/` project.

---

## 9. Trade-offs & Mitigations

| Trade-off                             | Impact                                          | Mitigation                                                                  |
| ------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Migrations must apply to every schema | Slower execution for many schemas               | Drizzle handles transaction rollbacks; track `schema_version` per tenant    |
| Database object count increases       | Many tables within one database                 | Manageable up to 10k tables; can shard by database cluster if >1000 tenants |
| Single Point of Failure (one DB host) | If the Postgres node dies, all tenants are down | High Availability clusters via AWS RDS / Aurora Postgres replicas           |

---

## 10. Key Takeaway

> Schema-per-Tenant trades slightly higher schema migration complexity for **dramatically higher security** and **simpler AI prompting**. In a platform where an AI agent writes SQL against sensitive production data, this is not optional — it's a requirement.
