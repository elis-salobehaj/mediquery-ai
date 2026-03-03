# Benchmarking Framework Design

## Purpose

Define a repeatable framework to evaluate the Router → Policy Gate → Navigator → Writer → Critic flow under development conditions, grounded in the **OMOP CDM v5.4 Golden Dataset**.

The design emphasizes:

- deterministic correctness checks against the golden query corpus
- policy/safety regression detection
- OMOP-aware accuracy metrics (table selection, concept join usage)
- low-friction local execution

## System Under Test

### Pipeline segments measured

1. **Intent routing + policy admission**
2. **SQL safety policy checks**
3. **OMOP golden query accuracy** — table selection and concept join detection
4. **Execution-path behavior through `/queries/stream`** (Mode B)

### Current benchmark harness

- Runner: `backend/src/ai/benchmarks/dev-benchmark.ts`
- Corpus: `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl` (25+ OMOP v5.4 queries)
- Report: `docs/reports/guardrail_benchmark_dev.json`

## OMOP Golden Query Corpus

The corpus (`omop_golden_queries.jsonl`) contains **25+ golden queries** organized by clinical category:

| Category | Count | OMOP Tables |
|---|---|---|
| **Demographics** | 4 | `person`, `omop_vocab.concept` |
| **Conditions** | 5 | `condition_occurrence`, `condition_era`, `person`, `concept` |
| **Medications** | 5 | `drug_exposure`, `drug_era`, `visit_occurrence`, `concept` |
| **Measurements** | 4 | `measurement`, `person`, `concept` |
| **Visits** | 3 | `visit_occurrence`, `concept` |
| **Cross-domain** | 3 | Multi-table joins across condition + drug + person |
| **Edge cases** | 3+ | Concept-join-required queries, procedure lookups |

Each corpus entry schema:

```json
{
  "id": "unique_id",
  "category": "demographics|conditions|medications|measurements|visits|cross_domain|edge_cases",
  "tier": "easy|medium|hard",
  "question": "Natural language clinical question",
  "expected_outcome": "sql",
  "golden_sql": "SELECT ... FROM omop_table JOIN omop_vocab.concept ...",
  "expected_tables": ["person", "concept"],
  "expected_joins": ["person.person_id = visit_occurrence.person_id"],
  "validation_hints": "What the result should look like"
}
```

## Benchmark Case Taxonomy

### Policy gate regression cases

Deterministic OMOP-aligned cases verifying:

1. **Supported OMOP data analysis** — ALLOW (e.g., top diagnoses, gender distribution)
2. **Schema/domain knowledge questions** — ALLOW (e.g., "what columns exist in person?")
3. **Destructive/write intent** — BLOCK (e.g., DELETE FROM condition_occurrence)
4. **Out-of-scope analytical intent** — BLOCK (e.g., train ML model)
5. **High-complexity SQL edge cases** — BLOCK for unbounded multi-table joins

### OMOP accuracy cases (from golden corpus)

Static analysis checks run against golden SQL:

- **Table Selection Accuracy**: do the `expected_tables` all appear in `golden_sql`?
- **Concept Join Detection**: when `concept` is in `expected_tables`, does `golden_sql` use `omop_vocab.concept`?

## Metrics Model

### Core correctness metrics

- `policy_gate_accuracy` — policy gate correct / total cases
- `sql_policy_accuracy` — SQL policy correct / SQL policy cases
- `table_selection_accuracy` — golden queries with all expected tables present / total golden queries
- `concept_join_accuracy` — golden queries using `omop_vocab.concept` when needed / total that need it

### Per-category accuracy breakdown

Report includes `by_category` map with per-category `tableSelectionAccuracy` and `conceptJoinAccuracy` for demographics, conditions, medications, measurements, visits, cross_domain, edge_cases.

### Supporting diagnostic metrics

- false-allow count for blocked-intent cases
- false-block count for supported-intent cases
- issue frequency by category (write-op, complexity-limit, unsupported-intent)
- per-golden-query `expectedTablesMissing` list for pinpointing schema navigation failures

### Optional runtime metrics (adjacent)

- first-pass SQL validity
- reflection loop count
- p95 latency for stream completion

## Execution Modes

### Mode A: deterministic harness (default)

Runs quickly in CI/dev without LLM or network. Checks:

1. Policy gate regression (5 OMOP-aligned deterministic cases)
2. Golden corpus static analysis (Table Selection + Concept Join Detection)

```bash
cd backend && pnpm benchmark:dev
```

Live SQL execution validation (Mode B):

```bash
cd backend && pnpm exec tsx src/ai/benchmarks/dev-benchmark.ts --mode=live
```

### Mode B: live endpoint validation

Uses authenticated curl requests against `/api/v1/queries/stream` to validate true end-to-end OMOP query behavior including auth, memory, schema navigation, SQL generation, and response streaming.

Example battery:

```bash
TOKEN=$(curl -sS -X POST http://localhost:8001/api/v1/auth/guest \
  -H 'Content-Type: application/json' | jq -r '.access_token')

curl -sS -N -X POST 'http://localhost:8001/api/v1/queries/stream' \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"question":"What are the top 5 most common diagnoses?","thread_id":"bench-01"}'
```

Verify for each golden query:

- `condition_occurrence` and `omop_vocab.concept` appear in generated SQL
- No SQL execution errors returned
- Response contains clinical condition names (not concept IDs)

## Expected Artifacts

For each benchmark run:

- JSON summary report in `docs/reports/guardrail_benchmark_dev.json`
- timestamped `generated_at`
- per-case pass/fail and issue details
- `by_category` accuracy breakdown
- `golden_results` array with per-query table selection and concept join results

For major feature increments:

- update active plan progress notes
- append benchmark interpretation notes (what changed, why)

## Guardrail Regression Strategy

Trigger benchmark runs when any of these change:

- router intent logic
- policy gate patterns
- SQL policy functions (`classify`, `read-only`, `complexity`)
- critic validation flow
- `semantic_view.yaml` or `system_prompts.yaml` (may affect table selection)

Regression criteria (development phase):

- no drop in policy accuracy for deterministic corpus
- no new false-allow on destructive intents
- `table_selection_accuracy` ≥ 0.9 on golden corpus
- `concept_join_accuracy` = 1.0 on golden corpus (all concept joins must use `omop_vocab.concept`)

## Design Tradeoffs

### Why deterministic corpus first

- stable, reproducible, fast feedback
- isolates policy regressions from model variability
- validates golden SQL quality independent of LLM behavior

### Why OMOP-grounded golden queries

- golden corpus acts as the ground truth for acceptable SQL patterns
- concept join detection catches a common error class (bare `concept` vs `omop_vocab.concept`)
- category breakdown reveals which clinical domain the agents struggle with most

### Why keep live curl checks alongside

- catches runtime integration failures not visible in unit harnesses
- validates auth/migrations/configuration realities
- verifies end-to-end OMOP tenant schema access

## Next Design Extensions

1. Mode B automation — run golden corpus questions via curl in CI with SQL error detection
2. Capture node-level latency summaries per benchmark run
3. Generate diff reports between two benchmark snapshots
4. Add `condition_era` and `drug_era` accuracy category
5. Add follow-up query tests (multi-turn OMOP conversations)

## References

- `docs/humans/context/BENCHMARKING.md`
- `docs/humans/context/ARCHITECTURE.md`
- `docs/humans/context/SEMANTIC_RETRIEVAL.md`
- `docs/humans/designs/multi_agent_architecture.md`
- `backend/src/ai/benchmarks/corpus/omop_golden_queries.jsonl`
