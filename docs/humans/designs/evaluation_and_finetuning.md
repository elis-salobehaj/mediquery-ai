# Mediquery AI Accuracy: Evaluation & Prompt Optimization (API Models)

> **Document Purpose**: Design for systematically measuring and improving Text-to-SQL accuracy when using **third-party LLM APIs** (OpenAI, AWS Bedrock, Google Gemini, Anthropic). No model training required — this is about evaluation harnesses, prompt engineering, few-shot optimization, and provider comparison.
>
> **Last Updated**: February 2026 | **Status**: Roadmap (future work)
>
> **Companion Document**: [Self-Hosted Model Training](self_hosted_model_training.md) — covers fine-tuning your own models (future path)

---

## 1. The Problem

Mediquery uses third-party LLM APIs (Bedrock Claude, OpenAI GPT, Gemini, Anthropic) to generate SQL from natural language. Today we have **no systematic way** to:

- Know if a prompt change improved or degraded accuracy
- Compare providers against each other on our specific workload
- Detect regressions when upgrading model versions (e.g., GPT-4o → GPT-5)
- Quantify which question types the agent struggles with

We need an **evaluation framework** that treats prompt + provider combinations as testable artifacts, with the same rigor we apply to code.

---

## 2. Vision: Test-Driven Prompt Development

```
          ┌─────────────────────┐
          │  Golden Query Suite  │ ◄── curated Q&A pairs
          │  (YAML / JSON)       │     version-controlled in repo
          └──────────┬──────────┘
                     │
              run against agent
             (all providers × prompts)
                     │
          ┌──────────▼──────────┐
          │  Evaluation Runner   │
          │  (pytest + CLI)      │──── per-question pass/fail
          └──────────┬──────────┘     accuracy %, latency, cost
                     │
            ┌────────┴────────┐
            ▼                 ▼
    scores healthy      scores dropped
    ─────────────▶      ──────────────▶
    merge PR             block PR / investigate
```

The key insight: **prompts are code**. Every change to a system prompt, few-shot example set, or provider configuration gets validated against the golden suite before merging — just like unit tests validate application logic.

---

## 3. Core Components

### 3.1 Golden Query Suite

A version-controlled set of **(question, expected SQL, expected result)** triples stored alongside the codebase.

**Format** (YAML for readability, one file per difficulty tier):

```yaml
# golden_queries/omop_easy.yaml
- id: omop-001
  question: "How many patients are in the dataset?"
  expected_sql: "SELECT COUNT(*) FROM person"
  expected_columns: ["count"]
  expected_row_count: 1
  difficulty: easy
  tags: [aggregation, demographics, person]

- id: omop-002
  question: "What are the top 5 most common diagnoses?"
  expected_sql: >
    SELECT c.concept_name, COUNT(*) AS occurrence_count
    FROM condition_occurrence co
    JOIN omop_vocab.concept c ON co.condition_concept_id = c.concept_id
    GROUP BY c.concept_name
    ORDER BY occurrence_count DESC
    LIMIT 5
  difficulty: medium
  tags: [aggregation, conditions, concept_join, condition_occurrence]
```

**Key design choices**:

- **Result comparison, not SQL string matching**: Two different SQL statements can produce identical results. We compare output DataFrames, not query text.
- **Version-controlled**: Golden queries live in the repo (`backend/tests/golden_queries/`), not in a database. Changes are PR-reviewed.
- **Tagged**: Categories (`aggregation`, `join`, `filter`, `time-series`, `ranking`, `edge-case`) and difficulty (`easy`, `medium`, `hard`) enable targeted analysis.

**Growth strategy**: Start with **50 hand-curated queries**. Grow to 200+ by harvesting validated production queries (queries where the user confirmed the result was correct).

### 3.2 Evaluation Runner

A CLI + pytest harness that runs the agent against the golden suite and produces structured reports.

```bash
# Run deterministic benchmark (current harness — Mode A + B)
cd backend
pnpm benchmark:dev

# Run against a specific provider
pnpm benchmark:dev -- --provider bedrock

# Run live SQL execution mode (Mode B)
pnpm exec tsx src/ai/benchmarks/dev-benchmark.ts --mode=live

# Compare two providers side-by-side (planned)
pnpm benchmark:dev -- --compare bedrock,openai

# Dry run — validate corpus structure without executing (planned)
pnpm benchmark:dev -- --dry-run
```

**Evaluation metrics per query**:

| Metric              | What It Measures                 | How                                                        |
| ------------------- | -------------------------------- | ---------------------------------------------------------- |
| **Execution Match** | Same result set as expected SQL? | Run both queries, compare DataFrames (order-independent)   |
| **Column Match**    | Correct columns selected?        | Compare column names (case-insensitive)                    |
| **Row Count Match** | Correct number of rows?          | Compare counts (with tolerance for time-dependent queries) |
| **Partial Credit**  | How close was the result?        | Column overlap %, row count ratio                          |
| **Latency**         | End-to-end time                  | Wall-clock from question to final SQL                      |
| **Token Cost**      | How expensive was this query?    | Input + output tokens × provider pricing                   |

**Output**: JSON report + human-readable summary:

```
═══════════════════════════════════════════
  Mediquery Eval Report — 2026-02-12
  Provider: bedrock (claude-sonnet-4-5)
═══════════════════════════════════════════

  Overall:    43/50 passed (86.0%)
  Easy:       20/20 (100%)
  Medium:     18/20 (90.0%)
  Hard:        5/10 (50.0%)

  Regressions (previously passing, now failing):
    ⚠ omop-047: "Top 5 most common conditions by visit type"
    ⚠ omop-031: "Monthly condition occurrence trend"

  Avg latency: 3.2s | Avg cost: $0.012/query
═══════════════════════════════════════════
```

### 3.3 Provider Comparison Matrix

Since we support 5 providers, the eval runner can produce a **head-to-head comparison**:

```
┌──────────────┬──────────┬──────────┬──────────┬──────────┐
│              │ Bedrock  │ OpenAI   │ Gemini   │Anthropic │
│              │ Sonnet   │ GPT-5.2  │ 1.5 Pro  │ Sonnet   │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ Easy (20)    │ 20/20    │ 20/20    │ 19/20    │ 20/20    │
│ Medium (20)  │ 18/20    │ 17/20    │ 15/20    │ 18/20    │
│ Hard (10)    │  5/10    │  6/10    │  3/10    │  5/10    │
├──────────────┼──────────┼──────────┼──────────┼──────────┤
│ Total        │ 86%      │ 86%      │ 74%      │ 86%      │
│ Avg Latency  │ 3.2s     │ 2.1s     │ 1.8s     │ 3.5s     │
│ Avg Cost     │ $0.012   │ $0.015   │ $0.004   │ $0.013   │
└──────────────┴──────────┴──────────┴──────────┴──────────┘
```

This answers the question: _"Which provider gives us the best accuracy-to-cost ratio for our specific workload?"_

### 3.4 Prompt Versioning & A/B Testing

Prompts are stored as versioned files. The evaluation runner can compare any two prompt versions:

```
backend/agents/prompts/
├── system_prompt.v3.md        ← current production
├── system_prompt.v4.md        ← candidate with improved join instructions
├── few_shot_examples.v2.yaml  ← current few-shot set
└── few_shot_examples.v3.yaml  ← candidate with more edge cases
```

```bash
# Compare prompts — run benchmark with a candidate prompt set (planned)
pnpm benchmark:dev -- --prompts v4
```

**Promotion rule**: A prompt change is merged only if the candidate scores >= baseline on the golden suite. Regressions (queries that passed before but fail now) require explicit justification.

### 3.5 Schema Statistics for Smarter Prompting

A lightweight but high-impact optimization: collect per-tenant column statistics and inject them into the agent's system prompt.

**What we collect** (refreshed nightly or on data load):

| Statistic       | Example                                                                   | Why It Helps                                       |
| --------------- | ------------------------------------------------------------------------- | -------------------------------------------------- |
| Distinct values | `gender_concept_id` resolves to `MALE`, `FEMALE` via `omop_vocab.concept` | Agent uses valid vocabulary names instead of guessing |
| Value ranges    | `measurement_date`: 2011-01-01 to 2025-12-31                              | Agent generates valid date range filters           |
| Null rates      | `visit_end_date`: 94% populated                                           | Agent knows which columns are reliably filled      |
| Date ranges     | `condition_start_date`: 2010-01-01 to 2025-11-20                          | Agent generates valid date filters                 |
| Row counts      | `condition_occurrence`: ~250,000 rows                                     | Agent knows whether to add LIMIT clauses           |

**Impact**: When the agent knows `gender_concept_id` resolves to `8507` (MALE) and `8532` (FEMALE) via `omop_vocab.concept`, it generates correct concept joins instead of guessing column values. This alone can improve accuracy by 10-15% on vocabulary-heavy queries.

### 3.6 CI/CD Integration

The golden suite runs in CI on every PR that touches prompts, agent logic, or database schema:

```yaml
# .github/workflows/eval.yml (conceptual — planned CI gate)
eval-gate:
  runs-on: ubuntu-latest
  steps:
    - name: Run golden query suite
      run: cd backend && pnpm benchmark:dev --format json

    - name: Check for regressions
      run: |
        accuracy=$(jq '.omop_accuracy.table_selection_accuracy' docs/reports/guardrail_benchmark_dev.json)
        if (( $(echo "$accuracy < 0.90" | bc -l) )); then
          echo "❌ Table selection accuracy dropped below 90% threshold"
          exit 1
        fi
```

---

## 4. What This Design Does NOT Cover

These are intentionally out of scope — they belong to the [Self-Hosted Model Training](self_hosted_model_training.md) design:

- ❌ LoRA / QLoRA fine-tuning
- ❌ Training your own base model
- ❌ GPU infrastructure (RunPod, Lambda Labs, etc.)
- ❌ Model registry (MLflow, W&B)
- ❌ Self-hosted inference (vLLM, Ollama in production)

This design is about **maximizing accuracy with the models you already have access to** through better evaluation, prompts, and provider selection.

---

## 5. Implementation Approach

This lives inside the Mediquery backend since it tests the agent directly. The current harness is TypeScript-based:

```
backend/
├── src/ai/benchmarks/
│   ├── dev-benchmark.ts           ← benchmark harness (Mode A + B)
│   └── corpus/
│       └── omop_golden_queries.jsonl  ← 25+ OMOP v5.4 golden queries (JSONL)
├── test/ai/
│   └── dev-benchmark.spec.ts      ← Vitest integration for benchmark runner
├── src/ai/prompts/
│   ├── system_prompts.yaml        ← Agent system prompts (current production)
│   └── semantic_view.yaml         ← OMOP retrieval metadata + join graph
└── docs/reports/
    └── guardrail_benchmark_dev.json  ← benchmark output report
```

---

## 6. Success Metrics

| Metric                     | Target                               | Measurement                         |
| -------------------------- | ------------------------------------ | ----------------------------------- |
| **Golden query pass rate** | >85% execution accuracy              | Eval runner on each PR              |
| **Regression rate**        | 0 regressions per release            | CI gate blocks PRs with regressions |
| **Provider comparison**    | Updated quarterly                    | Eval runner across all providers    |
| **Prompt iteration cycle** | <1 day from idea to validated change | Eval runner gives instant feedback  |
| **Schema stats coverage**  | 100% of tenant tables profiled       | Nightly refresh job                 |

---

## 7. Open Questions

1. **User feedback capture** — How do we know a production query was "correct"? Thumbs up/down button? Implicit (no correction = correct)?
2. **Time-dependent queries** — Golden queries with `CURRENT_DATE` produce different results daily. Use relative date fixtures or snapshot data?
3. **Cost budget for eval runs** — Running 50 queries × 4 providers = 200 API calls per PR. Acceptable cost?
4. **Tenant-specific suites** — Same golden suite for all tenants, or per-tenant variants for specialized vocabularies?

---

## 8. Relationship to Other Documents

| Document                                                             | Relationship                                     |
| -------------------------------------------------------------------- | ------------------------------------------------ |
| [Self-Hosted Model Training](self_hosted_model_training.md)          | Future path when API models hit accuracy ceiling |
| [Data Pipeline Architecture](schema_per_tenant_rationale.md)         | Schema stats depend on tenant data being loaded  |
| [Plan 1: Schema Foundation](../plans/active/01_schema_foundation.md) | Eval runs against tenant databases               |
| [Multi-Agent Architecture](multi_agent_architecture.md)              | The agent being evaluated                        |
