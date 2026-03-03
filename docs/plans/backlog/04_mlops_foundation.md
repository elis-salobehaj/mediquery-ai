---
title: "Plan 4: MLOps Foundation"
status: backlog
priority: low
estimated_hours: 40-60
dependencies:
  - 01_schema_foundation
  - 02_etl_scripts
  - 03_pipeline_orchestration
created: 2026-02-11
related_files:
  - docs/plans/backlog/01_schema_foundation.md
  - docs/plans/backlog/02_etl_scripts.md
  - docs/plans/backlog/03_pipeline_orchestration.md
tags:
  - mlops
  - vector-stores
  - model-training
  - evaluation
  - standalone
---

## Alignment Update (2026-02-27)

Plan 4 should **extend** the active benchmark pipeline in [docs/plans/active/automated_benchmarking_evaluation_pipeline.md](../active/automated_benchmarking_evaluation_pipeline.md), not replace it.

### Scope refinement (to avoid duplicate evaluators)

- Keep one shared evaluation engine (active benchmark runner)
- Add MLOps-specific wrappers: model promotion gates, tenant cohort evaluations, registry metadata linkage
- Treat "golden query suite" as a tenant-scoped corpus extension of the same benchmark contract

### Required integration points before implementation sign-off

- Model registry entries must include benchmark artifact IDs and score snapshots
- Candidate model promotion requires benchmark gate pass on target tenant cohorts
- Prompt/model experiments should publish comparable reports to the same baseline diff pipeline

## Goal

Build the MLOps layer on top of the data pipeline: vector stores for RAG, training data export, model evaluation, and model registry. This extends the `data-pipeline/` project and remains **outside** the Mediquery application.

> **Note**: This is a future/backlog plan. Scope and priorities will be refined when Plans 1-3 are complete and production usage patterns are clearer.

### What This Plan Adds
- ✅ Qdrant for tenant-isolated document embeddings (RAG)
- ✅ Training data export (question → SQL → result triples)
- ✅ Golden query evaluation suite per tenant
- ✅ Schema statistics for prompt engineering
- ✅ Model registry integration (MLflow or W&B)

---

## Architecture

```
                     data-pipeline/
┌────────────────────────────────────────────────┐
│                                                │
│  Dagster Assets (from Plan 3)                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐     │
│  │  Bronze   │→│  Silver   │→│   Gold    │     │
│  └──────────┘  └──────────┘  └──────────┘     │
│                                    │           │
│          ┌─────────────────────────┤           │
│          ▼                         ▼           │
│  ┌──────────────┐      ┌──────────────────┐   │
│  │  Training    │      │  Schema Stats    │   │
│  │  Data Export │      │  (Cardinality,   │   │
│  │  (JSONL)     │      │   Distributions) │   │
│  └──────┬───────┘      └────────┬─────────┘   │
│         │                       │              │
│         ▼                       ▼              │
│  ┌──────────────┐      ┌──────────────────┐   │
│  │  Model       │      │  Golden Query    │   │
│  │  Registry    │      │  Evaluation      │   │
│  │  (MLflow)    │      │  Suite           │   │
│  └──────────────┘      └──────────────────┘   │
│                                                │
└────────────────────────────────────────────────┘
                        │
                ┌───────┴───────┐
                ▼               ▼
         Qdrant (Vector)    PostgreSQL (App Data)
         ┌─────────────┐  ┌───────────────────┐
         │ collections: │  │ public.             │
         │  documents   │  │  golden_queries      │
         │  (per tenant)│  │  table_statistics    │
         └─────────────┘  └───────────────────┘
```

---

## Implementation Tasks

### 4.1 Qdrant — Tenant-Isolated Document Embeddings

- [ ] Deploy Qdrant as a Docker service in `docker-compose.yml` (pipeline profile)
- [ ] Create tenant-scoped collections:
  ```python
  from qdrant_client import QdrantClient
  from qdrant_client.models import Distance, VectorParams, Filter, FieldCondition, MatchValue

  client = QdrantClient(host="qdrant", port=6333)

  # Create collection with tenant payload filtering
  client.create_collection(
      collection_name="document_embeddings",
      vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
  )

  # Upsert with tenant_id in payload
  client.upsert(
      collection_name="document_embeddings",
      points=[PointStruct(
          id=str(uuid4()),
          vector=embedding,
          payload={"tenant_id": tenant_id, "chunk_text": text, "document_id": doc_id},
      )],
  )
  ```
- [ ] Dagster asset to generate embeddings from tenant documents (PDFs, reports)
- [ ] Query interface with tenant filtering:
  ```python
  results = client.search(
      collection_name="document_embeddings",
      query_vector=query_embedding,
      query_filter=Filter(must=[FieldCondition(key="tenant_id", match=MatchValue(value=tenant_id))]),
      limit=5,
  )
  ```

> Note: Vector store uses tenant_id payload filter (soft isolation) since document text is less sensitive than financial/production data. The KPI tables remain in hard-isolated databases.

### 4.2 Training Data Export

- [ ] Create Dagster asset to export (question, SQL, result) triples from chat history:
  ```python
  @asset(partitions_def=tenant_partitions)
  def training_data_export(context):
      tenant_id = context.partition_key
      df = pl.read_database(
          """SELECT user_query, generated_sql, result_summary 
             FROM chat_messages cm
             JOIN chat_threads ct ON cm.thread_id = ct.id
             JOIN users u ON ct.user_id = u.id
             WHERE u.tenant_id = :tenant_id
               AND cm.role = 'assistant'
               AND cm.metadata->>'generated_sql' IS NOT NULL""",
          connection_uri=settings.postgres_url,
          params={"tenant_id": tenant_id}
      )
      # Export as JSONL for fine-tuning
      df.write_ndjson(f"s3://mediquery-mlops/training/{tenant_id}/{date}.jsonl")
  ```
- [ ] Format output for fine-tuning frameworks (JSONL, instruction format)
- [ ] Deduplication: skip identical (query, SQL) pairs
- [ ] Schedule: weekly export

### 4.3 Golden Query Evaluation Suite

- [ ] Create `public.golden_queries` table:
  ```sql
  CREATE TABLE public.golden_queries (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES public.tenants(id),
      question TEXT NOT NULL,
      expected_sql TEXT NOT NULL,
      expected_result JSONB,
      difficulty VARCHAR(20),  -- easy, medium, hard
      tags TEXT[],             -- e.g., ['aggregation', 'join', 'time-series']
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
  );
  ```
- [ ] Seed 50+ golden queries based on common Medical KPI questions
- [ ] Dagster asset to run evaluation:
  1. Feed question to agent
  2. Compare generated SQL to expected SQL (execution accuracy, not string match)
  3. Compare result sets
  4. Log accuracy metrics
- [ ] Track metrics over time: accuracy trend, regression detection

### 4.4 Schema Statistics for Prompt Engineering

- [ ] Create `public.table_statistics` table:
  ```sql
  CREATE TABLE public.table_statistics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id UUID REFERENCES public.tenants(id),
      table_name VARCHAR(255),
      column_name VARCHAR(255),
      distinct_count INTEGER,
      null_rate DECIMAL(5,4),
      sample_values JSONB,       -- e.g., ["Active", "Shut-In", "P&A"]
      min_value TEXT,
      max_value TEXT,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(tenant_id, table_name, column_name)
  );
  ```
- [ ] Nightly Dagster refresh: compute stats for each tenant's tables
- [ ] Feed into agent prompts: "The 'status' column has 5 distinct values: Active, Shut-In, ..."
- [ ] Improves SQL generation accuracy (agent knows valid filter values)

### 4.5 Model Registry Integration

- [ ] Set up MLflow server (or Weights & Biases):
  - Docker service in `docker-compose.yml` (pipeline profile)
  - Store artifacts in S3/MinIO
- [ ] Log fine-tuned models with metadata:
  - Base model (e.g., `codellama-7b`, `claude-sonnet`)
  - Training data version and source tenant(s)
  - Evaluation metrics (SQL exact match %, execution accuracy %, golden query pass rate)
- [ ] Dagster sensor: trigger retraining when training data exceeds threshold
- [ ] A/B testing framework: compare model versions on golden queries

---

## Deliverables

1. **Qdrant vector store** — Indexed and queryable with tenant isolation
2. **Training data pipeline** — Weekly JSONL export to S3
3. **Golden query suite** — 50+ curated Q&A pairs, daily evaluation runs
4. **Schema statistics** — Nightly refresh, fed into agent prompts
5. **Model registry** — MLflow tracking fine-tuned checkpoints

---

## Definition of Done

- [ ] RAG queries return only the requesting tenant's documents
- [ ] Training data export produces valid JSONL for 3+ tenants
- [ ] Golden query evaluation runs daily with accuracy metrics logged
- [ ] Schema statistics improve SQL generation accuracy (measured via golden queries)
- [ ] Model registry tracks at least 2 model versions with comparison metrics

---

## Open Questions (To Resolve Before Implementation)

1. **Embedding model**: OpenAI `text-embedding-3-small` (1536d) vs. open-source (e.g., `bge-large`, 1024d)?
2. **Fine-tuning target**: Which base model? CodeLlama, Mistral, or distilled Claude?
3. **Golden query authorship**: Who curates them — domain experts, or auto-generated from chat logs?
4. **Model serving**: Serve fine-tuned models via Ollama, vLLM, or cloud endpoints?
5. **Data retention**: How long to keep training data exports? (Recommend: 1 year)

---

## Files to Create

| File | Purpose |
|------|---------|
| `data-pipeline/src/mediquery_etl/mlops/embeddings.py` | Qdrant embedding pipeline |
| `data-pipeline/src/mediquery_etl/mlops/training_export.py` | Chat → JSONL exporter |
| `data-pipeline/src/mediquery_etl/mlops/golden_queries.py` | Evaluation runner |
| `data-pipeline/src/mediquery_etl/mlops/schema_stats.py` | Table statistics collector |
| `data-pipeline/src/mediquery_etl/dagster/assets/mlops.py` | Dagster assets for all above |
| `backend/alembic/versions/xxx_mlops_tables.py` | golden_queries + table_statistics migration (PostgreSQL) |
| `infra/mlflow/` | MLflow server configuration |

---

## References

- [Qdrant Documentation](https://qdrant.tech/documentation/)
- [MLflow Model Registry](https://mlflow.org/docs/latest/model-registry.html)
- [Great Expectations + Dagster](https://docs.dagster.io/integrations/great-expectations)
- [Fine-Tuning Best Practices](https://platform.openai.com/docs/guides/fine-tuning)
