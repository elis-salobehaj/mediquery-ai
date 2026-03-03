---
status: active
priority: high
date_created: 2026-02-27
date_updated: 2026-03-02
related_files:
  - backend/src/ai/benchmarks/dev-benchmark.ts
  - backend/test/ai/dev-benchmark.spec.ts
  - backend/src/ai/queries.controller.ts
  - backend/src/ai/graph.ts
  - backend/src/ai/agents/critic-agent.ts
  - backend/src/ai/agents/reflector-agent.ts
  - backend/src/ai/agents/schema-navigator-agent.ts
  - backend/src/ai/agents/sql-writer-agent.ts
  - backend/src/ai/agents/router-agent.ts
  - backend/src/ai/agents/policy-gate.ts
  - backend/src/ai/common.ts
  - backend/src/ai/state.ts
  - backend/src/database/database.service.ts
  - backend/src/ai/prompts/system_prompts.yaml
  - backend/src/ai/prompts/semantic_view.yaml
  - docs/humans/context/BENCHMARKING.md
  - docs/humans/designs/benchmarking_framework.md
  - docs/reports/guardrail_benchmark_dev.json
depends_on:
  - docs/plans/implemented/llm_routing_agentic_optimization.md
blocks: []
assignee: null
completion:
  - [x] Phase 1A - Extend deterministic harness with real corpus (34 OMOP JSONL cases, 100% guardrail pass — delivered via omop_golden_dataset_hardening Phases 2+7)
  - [ ] Phase 1B - Node-isolation evaluation framework
  - [ ] Phase 2A - E2E graph test harness with execution validation
  - [ ] Phase 2B - LLM-as-a-Judge semantic scoring
  - [ ] Phase 3 - CI integration and regression gates
---

# Automated Benchmarking & Evaluation Pipeline Plan

> **⚠️ MIGRATION NOTE**: This plan was authored before the MySQL → PostgreSQL/OMOP CDM v5.4 migration.
> All references to "MySQL" in this document should be read as **PostgreSQL (OMOP CDM v5.4)**.
> The clinical data now lives in `omop_db` (schemas `tenant_nexus_health` + `omop_vocab`), not MySQL.
> Agent files have been renamed and moved to `backend/src/ai/agents/*-agent.ts`.
> See `docs/plans/implemented/migrate_tenant_db_to_postgres.md` for migration details.

## Objective

Build a production-grade automated benchmarking and evaluation pipeline for Mediquery's Text-to-SQL agentic stack that measures:

1. **Retrieval accuracy** — does the navigator select the correct tables for a given question?
2. **SQL correctness** — does the generated SQL execute cleanly and return semantically correct results?
3. **Domain-intent fidelity** — does the system correctly translate medical jargon into the right metrics and grains?
4. **Safety/guardrail quality** — unsupported intent rejection, hallucination resistance, and retry-loop stability.
5. **Operational health** — latency, token cost, retry rate, and failure-mode distribution.

The pipeline should produce repeatable, explainable benchmark outputs for both local development and CI, with explicit regression gates — starting with immediate value from the existing harness and scaling incrementally.

---

## Why This Is Needed Now

Mediquery has mature agent orchestration (Router → Policy Gate → Schema Navigator → SQL Writer → Critic ↔ Reflector, Meta-Agent) but still relies on ad-hoc spot-checking. The current benchmark harness (`dev-benchmark.ts`) validates only 5 deterministic cases covering policy-gate regex and static SQL safety checks — **zero coverage** of:

- Table selection accuracy (the most impactful failure mode)
- LLM-generated SQL quality against real MySQL execution
- Semantic correctness (SQL produces right answer vs. golden reference)
- Multi-turn follow-up queries (scoped memory feature is entirely untested)
- Critic false-positive rate (does semantic triage catch real issues without blocking valid SQL?)

Without this pipeline, the team risks:

- **Silent retrieval regressions** — navigator picks wrong tables after prompt changes, producing valid-looking SQL that answers the wrong question.
- **Metric-shifting blindness** — prompt/policy changes that improve one metric while regressing another.
- **Hallucination masking** — syntax-valid SQL that references correct tables but computes wrong aggregations.
- **Unbounded retry loops** — critic/reflector cycles that burn tokens without converging.

---

## Scope Boundaries

### In Scope

- Node-isolation benchmarks for each pipeline stage (router, navigator, writer, critic).
- End-to-end graph evaluation with real MySQL execution and result comparison.
- Versioned dataset corpus with tiered difficulty, stored as git-tracked JSONL.
- LLM-as-a-Judge for semantic scoring where deterministic checks are insufficient.
- CI-ready reporting with regression thresholds and baseline snapshots.

### Out of Scope (for this plan)

- Real-time user-facing scorecards in frontend UI.
- Automatic prompt rewriting/fine-tuning loop.
- Production rollout governance policy (separate release operations plan).
- Multi-tenant schema evaluation (deferred until multi-tenant pipeline ships).

---

## Architecture Overview

```text
                    ┌─────────────────────────────────────────────┐
                    │            Benchmark Runner                  │
                    │  (Vitest suite OR standalone tsx script)      │
                    └────────────────┬────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────────┐
                    │         Execution Modes                      │
                    │                                              │
                    │  A) Node-Isolation    B) Full-Graph E2E      │
                    │     (unit-test DI)      (compiled graph)     │
                    │                                              │
                    │  fast_mode=true for    full pipeline with    │
                    │  rapid iteration       retry loops enabled   │
                    └────────────────┬────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────────┐
                    │    Deterministic Evaluator (runs first)      │
                    │                                              │
                    │  1. SQL parse check (syntax)                 │
                    │  2. Table/column existence vs schema         │
                    │  3. Read-only + complexity enforcement       │
                    │  4. EXPLAIN against MySQL (validates plan)   │
                    │  5. Execute both golden + candidate SQL      │
                    │  6. Row-signature comparison                 │
                    │     (column names, row count, value hash)    │
                    │  7. Table-selection precision/recall          │
                    └────────────────┬────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────────┐
                    │    LLM Judge (runs only on survivors)        │
                    │                                              │
                    │  Semantic equivalence when results differ    │
                    │  but intent may still be satisfied.          │
                    │  Domain interpretation grading for Medical.      │
                    │  Schema faithfulness spot-check.             │
                    └────────────────┬────────────────────────────┘
                                     │
                    ┌────────────────▼────────────────────────────┐
                    │         Aggregator + Reporter                │
                    │                                              │
                    │  JSON summary + markdown digest              │
                    │  Baseline diff + regression gate verdict     │
                    │  Per-case breakdown with error tags          │
                    └─────────────────────────────────────────────┘
```

### Design Principle: Deterministic-First, LLM-Second

The LLM judge is expensive and non-deterministic. We run 7 deterministic checks first and only invoke the judge when:

- Candidate SQL executes successfully but returns different results than golden SQL.
- The question requires domain-intent grading (category = domain_knowledge).
- Row signatures differ but the delta is within a plausible-equivalence window.

This reduces judge invocations by an estimated 40-60% (based on typical failure distributions where most failures are caught deterministically).

**Cost model**: For a 100-case corpus, ~40-60 cases skip the judge entirely. Remaining ~40-60 cases × ~3K tokens/judge call = 120-180K tokens per run. At GPT-4.1 pricing (~$5/M output) this is approximately $0.60-$0.90 per full run — patient within nightly budget. PR smoke runs (20-case subset) cost ~$0.15.

---

## Evaluation Dimensions

### Why Not Just "Data-Specific" vs "Domain Knowledge"?

A simple 2×3 matrix (2 categories × 3 difficulty tiers) underserves several critical evaluation dimensions the pipeline actually needs:

| Dimension | What it tests | Why it's separate |
|-----------|--------------|-------------------|
| **Retrieval accuracy** | Navigator table selection | #1 silent failure mode; wrong tables → plausible but incorrect SQL |
| **SQL correctness** | Writer output quality | Given correct tables, does the SQL actually work? |
| **Domain translation** | Medical jargon → metrics | Requires industry context, not just schema knowledge |
| **Safety/rejection** | Policy gate + critic | Must block destructive/unsupported intent with zero false-allows |
| **Retry convergence** | Critic ↔ Reflector loop | Does the system self-correct or burn tokens cycling? |
| **Multi-turn context** | Scoped memory | Follow-up queries depend on thread state |
| **Edge cases** | Null handling, empty results, ties | Corner cases that break production confidence |

### Dataset Categories (Revised)

We keep the 2-axis matrix but add essential orthogonal test groups:

**Primary axis — Question Origin:**

1. **Schema-Grounded** — questions directly answerable from table/column knowledge (e.g., "list patients with spud date after 2024").
2. **Domain-Interpreted** — questions requiring Medical context translation (e.g., "show me the fastest visiting crews" → billing speed metrics).

**Difficulty axis** (applicable to both):

- **Easy** — single-table, basic filtering.
- **Medium** — multi-table JOINs, standard aggregations, time bounding.
- **Hard** — CTEs, window functions, ambiguous jargon, non-obvious join paths.

**Orthogonal test groups** (each can be easy/medium/hard):

3. **Negative cases** — unsupported intents, write attempts, out-of-scope analytics (production, financial, reservoir). These MUST be rejected.
4. **Multi-turn sequences** — follow-up queries that depend on prior context (e.g., "now show just the top 3" after a patient comparison).
5. **Edge cases** — empty result sets, null-heavy columns, ambiguous column names across tables, tie-breaking in rankings.

### Target Corpus Size

| Group | Seed (Phase 1A) | Target (Phase 2A) | Rationale |
|-------|------------------|--------------------|-----------|
| Schema-Grounded Easy | 5 | 15 | Baseline sanity, fast to curate |
| Schema-Grounded Medium | 5 | 15 | Core join/aggregation paths |
| Schema-Grounded Hard | 3 | 10 | CTEs, window functions |
| Domain-Interpreted Easy | 5 | 10 | Medical term mapping |
| Domain-Interpreted Medium | 3 | 10 | Multi-metric domain queries |
| Domain-Interpreted Hard | 2 | 8 | Ambiguous jargon |
| Negative cases | 5 | 15 | Zero false-allow tolerance |
| Multi-turn sequences | 0 | 8 | Deferred to Phase 2A (requires memory mock) |
| Edge cases | 2 | 8 | Null/empty/tie behavior |
| **Total** | **30** | **99** | |

**Tradeoff: 30 vs 100+ initial cases.** 30 is enough to catch regressions in each bucket without a multi-week curation effort blocking Phase 1. The existing 5 cases migrate directly into Negative cases.

---

## Difficulty Criteria (Technical)

### Schema-Grounded Tier Criteria

- **Easy**
  - Exactly one source table.
  - One predicate group (`WHERE` + optional `ORDER BY` + optional `LIMIT`).
  - No CTE, no subquery, no aggregation.
  - Example: "List all patients operated by [hospital]" → `SELECT patient_name, hospital FROM patients WHERE hospital = '...' LIMIT 20`
- **Medium**
  - 2-4 joins using valid FK relationships.
  - At least one aggregate (`SUM/AVG/COUNT`) with valid grouping grain.
  - Explicit date/time bounds (absolute or relative).
  - Example: "Average DURATION by clinic for patients spudded in 2024" → `patients JOIN visits ... WHERE SPUD_DATE >= '2024-01-01' GROUP BY clinic_name`
- **Hard**
  - CTE and/or subquery and/or window function.
  - Potential null-handling edge cases, rank tie behavior, or partitioned calculations.
  - Requires non-obvious schema bridge joins (e.g., `PROCEDURE_TABLES` via `PROCEDURE_PATIENT_ID`).
  - Example: "Rank patients by visit efficiency, showing percentile within their clinic" → CTE with `PERCENT_RANK() OVER (PARTITION BY clinic_name ...)`

### Domain-Interpreted Tier Criteria

- **Easy**
  - Straight mapping from domain phrase to a known KPI column and entity grain.
  - Minimal ambiguity (single likely metric interpretation).
  - Example: "Which patients have the best DURATION?" → `visits.AVG_ROP`
- **Medium**
  - Multi-metric interpretation (e.g., clinical efficiency = DURATION + wait_time time + flat time).
  - Temporal logic expected (compare periods, rolling windows).
- **Hard**
  - Ambiguous jargon requiring explicit assumption handling.
  - Must infer suitable metric proxies and geographic/operational context.
  - May require normalized comparison logic (e.g., per-foot, per-stage, per-day).
  - Example: "Show me the tightest patients" → ambiguous: could mean fastest examine time, smallest hole size (bit tables), or narrowest casing — system must pick reasonable proxy or state assumption

---

## Benchmark Case Contract

### Lean Core (Phase 1A — Required Fields)

Every case MUST have these fields to be valid:

```jsonc
{
  "id": "schema_easy_001",
  "category": "schema_grounded",     // schema_grounded | domain_interpreted | negative | multi_turn | edge_case
  "tier": "easy",                     // easy | medium | hard
  "question": "Show top 5 patients by average DURATION",
  "expected_outcome": "sql",          // sql | rejection | domain_answer
  "golden_sql": "SELECT wm.patient_name, rk.AVG_ROP FROM patients wm JOIN visits rk ON wm.patient_id = rk.patient_id ORDER BY rk.AVG_ROP DESC LIMIT 5",
  "expected_tables": ["patients", "visits"],
  "expected_row_count_range": [1, 5]  // [min, max] inclusive, null for rejections
}
```

### Extended Fields (Phase 2A — Optional Enrichment)

Added progressively as curation matures, never blocking Phase 1:

```jsonc
{
  // ...lean core fields above...
  "acceptable_sql_variants": [],      // alternate valid SQL approaches
  "required_columns": ["patient_name", "AVG_ROP"],
  "disallowed_columns": ["patient_id"],  // should not appear in SELECT output
  "expected_routing": "DATA",         // DATA | DOMAIN_KNOWLEDGE | OFF_TOPIC
  "hallucination_traps": ["PRODUCTION_VOLUME", "EUR", "NPV"],  // near-miss invalid references
  "semantic_intent_notes": "Ranking by DURATION, descending, bounded to 5",
  "expected_grain": "patient",
  "predecessor_id": null              // for multi-turn, points to prior case
}
```

### Why This Phased Contract

**Problem with an everything-required contract:** Proposing 14+ required fields per case including `hallucination_traps[]`, `expected_output_schema[]`, `acceptable_sql_patterns[]`, `expected_time_scope`, `disallowed_tables[]` — ALL required — creates an enormous curation bottleneck. Authoring a single Hard case with all those fields takes 15-30 minutes. At 99 cases, that's 25-50 hours of curation before any benchmark can run.

**Fix:** The lean core (7 fields) can be authored in 2-3 minutes per case. Extended fields are added when they provide signal for a specific case, not as blanket requirements. The schema validator enforces lean-core completeness and warns on cases missing useful extended fields.

### Storage and Versioning

**Decision: Git-tracked JSONL files in `backend/src/ai/benchmarks/corpus/`.**

```
backend/src/ai/benchmarks/
  corpus/
    schema_grounded.jsonl
    domain_interpreted.jsonl
    negative_cases.jsonl
    multi_turn_sequences.jsonl
    edge_cases.jsonl
  dev-benchmark.ts          (existing — extended)
  eval-runner.ts            (new — E2E runner)
  eval-deterministic.ts     (new — deterministic checks)
  eval-judge.ts             (new — LLM judge)
  eval-report.ts            (new — aggregation + reporting)
```

**Why JSONL over JSON array:** Each line is independently parseable, enabling `grep`/`wc -l` for quick corpus stats, easier git diffs (line-level), and streaming reads for large corpora.

**Why git-tracked over database-stored:** The corpus is small (<1000 cases foreseeable), changes should be code-reviewed alongside prompt/policy changes, and git blame traces who added/modified each case. Database storage adds unnecessary operational complexity for a development-time artifact.

**Why `backend/src/ai/benchmarks/corpus/` over `docs/`:** The corpus is consumed directly by TypeScript code. Co-location with the runner eliminates path ambiguity and keeps the data near its consumers. Reports (outputs) still go in `docs/reports/`.

---

## Node-Isolation Evaluation

### Why This Matters

Jumping straight to end-to-end evaluation is a critical gap because:

- **Diagnosability**: When an E2E test fails, you can't tell if the navigator, writer, or critic caused it.
- **Targeted regression detection**: A prompt change to `sql_writer` shouldn't require re-running the full graph to verify.
- **Speed**: Node-isolation tests run in seconds (no retry loops), enabling PR-level gating.

### Node Evaluation Matrix

| Node | Input | Output Measured | Metric | Requires LLM? | Requires DB? |
|------|-------|-----------------|--------|---------------|-------------|
| **Router** | `original_query` | `routing_decision` | Classification accuracy (DATA/DOMAIN_KNOWLEDGE/OFF_TOPIC) | Yes | No |
| **Policy Gate** | `original_query` + routing | `error` presence | Precision/recall for UNSUPPORTED_INTENT | No | No |
| **Navigator** | `original_query` + routing | `selected_tables`, `navigator_contract` | Table selection precision/recall vs `expected_tables` | Yes | Yes (schema DDL) |
| **SQL Writer** | Full state (tables, schemas, navigator contract) | `generated_sql` | Syntax validity, table/column correctness, EXPLAIN success | Yes | Yes |
| **Critic** | State with `generated_sql` | `validation_result` | Semantic triage correctness: does it catch real issues without false-positive blocking? | Yes | Yes |

### Table Selection Accuracy — The Highest-Leverage Metric

**Why this is the #1 priority:** If the navigator selects `DIAGNOSIS_STATE_KPIS` instead of `RIG_STATE_KPIS` for a clinic-state question, the writer will produce syntactically valid SQL that queries the wrong data. The critic may not catch this because the SQL itself is patient-formed. The user gets plausible-looking but incorrect results.

**Measurement:**

```
Table Precision = |selected ∩ expected| / |selected|
Table Recall    = |selected ∩ expected| / |expected|
Table F1        = 2 × (precision × recall) / (precision + recall)
```

For each benchmark case with `expected_tables`, we run the navigator in isolation and compute these metrics. A precision drop means the navigator is adding irrelevant tables (token waste, potential confusion). A recall drop means it's missing critical tables (wrong or incomplete results).

**Target thresholds (initial):**
- Table Recall ≥ 0.90 (missing a required table is worse than adding an extra one)
- Table Precision ≥ 0.70 (some over-selection is acceptable as the writer can ignore unused tables)
- Table F1 ≥ 0.80

### autoCorrectTableNames Testing

The pipeline includes a hardcoded regex-based table name corrector (`common.ts`) that transforms patterns like `\bwell\b` → `patients`. This is both helpful (catches common LLM hallucinations) and dangerous (could corrupt SQL where "patient" appears as a column alias). The benchmark should include cases specifically designed to test for autocorrect regressions:

- Case where autocorrect correctly fixes `FROM PATIENT` → `FROM patients`
- Case where a CTE alias named `patient_ranked` should NOT be mangled

---

## LLM-as-a-Judge Architecture

### When the Judge Is Invoked (Precisely)

The judge is NOT a universal evaluator. It runs only when deterministic checks are insufficient:

| Deterministic Result | Judge Invoked? | Reason |
|---------------------|----------------|--------|
| SQL fails to parse | **No** | Hard failure, no ambiguity |
| SQL references non-existent table/column | **No** | Schema violation, deterministic |
| SQL fails EXPLAIN | **No** | MySQL rejects it, deterministic |
| Read-only/complexity violation | **No** | Policy failure, deterministic |
| SQL executes, results match golden exactly | **No** | Full match, no grading needed |
| SQL executes, results differ from golden | **Yes** | May be semantically equivalent despite different approach |
| Negative case: SQL generated when rejection expected | **Yes** | Judge confirms if system should have rejected |
| Domain-interpreted case (any result) | **Yes** | Domain intent requires semantic grading |

**Estimated judge invocation rate:** ~40-60% of cases, depending on corpus composition.

### Judge Prompt Structure

The judge receives the deterministic evaluator's findings as input, preventing it from contradicting hard facts:

```yaml
role: "SQL evaluation judge for medical analytics"
constraints:
  - "Return strict JSON only, no commentary outside the JSON block"
  - "You CANNOT override deterministic findings — if the evaluator reports a schema violation, you must reflect that"
  - "Score each dimension independently — a query can have good domain interpretation but poor schema faithfulness"

inputs:
  - user_question: "The natural language question asked"
  - candidate_sql: "The SQL generated by the agent"
  - golden_sql: "The reference SQL (canonical correct answer)"
  - schema_context: "Relevant table DDLs and FK relationships"
  - deterministic_results:
      execution_success: boolean
      candidate_row_count: number
      golden_row_count: number
      column_overlap: string[]  # columns present in both result sets
      value_match_ratio: number # % of cells matching (0-1)
      table_precision: number
      table_recall: number

scoring_rubric:
  semantic_equivalence:
    1.0: "Results are identical or produce the same business answer"
    0.7: "Minor differences (ordering, extra columns) but same core answer"
    0.4: "Partially correct — right tables/metrics but wrong filter or grain"
    0.0: "Fundamentally different answer or wrong metric"
  domain_intent:
    1.0: "Correctly interprets all Medical terminology and selects appropriate metrics"
    0.5: "Partially correct interpretation, reasonable but imprecise proxy"
    0.0: "Misinterprets domain terminology or selects wrong metric entirely"
  schema_faithfulness:
    1.0: "All tables/columns/joins are valid and correctly used"
    0.5: "Valid schema references but suboptimal join path or unnecessary tables"
    0.0: "Fabricated tables, columns, or impossible joins"
```

### Output JSON Contract

```typescript
interface JudgeVerdict {
  semantic_equivalence_score: number;   // 0.0 - 1.0
  domain_intent_score: number;          // 0.0 - 1.0
  schema_faithfulness_score: number;    // 0.0 - 1.0
  hallucination_detected: boolean;
  error_tags: string[];                 // e.g., ["wrong_metric", "missing_join", "stale_alias"]
  final_verdict: 'pass' | 'borderline' | 'fail';
  rationale: string;                    // 1-3 sentence explanation
}
```

### Verdict Composition Rules

The final pass/fail is NOT a simple average. Deterministic results have precedence:

```
IF execution_failed AND reason is blocking → FAIL (no judge override possible)
IF hallucination_detected → FAIL
IF semantic_equivalence < 0.4 → FAIL
IF semantic_equivalence >= 0.7 AND schema_faithfulness >= 0.7 → PASS
IF all scores >= 0.4 AND < 0.7 → BORDERLINE
ELSE → FAIL
```

Borderline cases are logged for human review — they don't block CI but surface in the report digest for manual triage.

### Metrics Collected

**Core metrics (per-case and aggregate):**

| Metric | Source | Level |
|--------|--------|-------|
| Execution Success Rate | Deterministic | Aggregate |
| Table Selection F1 | Deterministic | Aggregate + per-tier |
| Semantic Equivalence Score | Judge | Aggregate + per-tier |
| Schema Faithfulness Score | Judge | Aggregate |
| Domain Intent Score | Judge | Domain cases only |
| Hallucination Rate | Deterministic + Judge | Aggregate |
| Pass@1 Rate | Combined | Per-category, per-tier |

**Operational metrics (per-run):**

| Metric | Source | Purpose |
|--------|--------|---------|
| Average attempts before valid answer | Graph state | Retry efficiency |
| Retry loop rate | Graph state | % of cases requiring >1 attempt |
| Termination reason distribution | Graph state | Why cases end (valid/timeout/max_attempts/unsupported) |
| Token cost per case (input + output) | TokenUsageService | Budget tracking |
| p50/p95 latency per case | Timer | Performance |
| Judge invocation rate | Runner | Cost efficiency of deterministic-first strategy |
| Judge disagreement rate | Dual-judge mode | Evaluator reliability |

### Judge Bias Mitigation Strategy

1. **Deterministic precedence (hard rule)**
   - The judge cannot override schema violations, execution failures, or policy blocks. Its scores are layered ON TOP of deterministic checks, never contradicting them.
   - Implementation: deterministic results are injected into the judge prompt as facts, not suggestions.

2. **Order randomization**
   - Candidate and golden SQL are presented in randomized order to prevent positional bias (judges tend to favor the first example shown).
   - The position is logged in metadata for analysis.

3. **Calibration corpus (20 cases, human-verified)**
   - A fixed subset with human-adjudicated verdicts. Run on each judge model version to detect drift.
   - If calibration accuracy drops below 85%, judge model/prompt must be revised before production use.
   - Calibration cases should span all verdict types: clear-pass, clear-fail, and genuine borderline.

4. **Dual-judge mode (feature-flagged, nightly-only)**
   - Two different model providers grade independently.
   - Agreement → accept shared verdict.
   - Disagreement with >0.3 score delta → log for human review, use more conservative verdict.
   - **Why nightly-only:** Dual-judge doubles token cost. At ~$1.80/dual-judge run for 100 cases, nightly is affordable; per-PR is not.

5. **Conservative borderline handling**
   - Borderline cases never auto-pass in CI gates. They pass through to the report as "needs review".
   - This prevents grade inflation from a lenient judge while keeping the pipeline unblocked.

### Tradeoff: Why Not Skip the Judge Entirely?

A pure-deterministic approach (exact-match golden SQL + row comparison) is cheaper and more reproducible. However:

- **SQL equivalence is many-to-many** — `ORDER BY a DESC LIMIT 5` and `SELECT ... FROM (SELECT ... RANK() ...) WHERE rank <= 5` can produce identical results. Exact-match penalizes valid alternatives.
- **Domain interpretation can't be checked deterministically** — "fastest visiting crew" has no single correct SQL, only correct intent.
- **Row comparison fails on ordering** — two queries returning the same rows in different order are semantically equivalent but fail byte-level comparison.

The hybrid approach handles all three without fully depending on LLM reliability.

---

## Phased Roadmap

### Phase 1A — Extend Deterministic Harness with Real Corpus

**Goal:** Get a runnable 30-case benchmark producing actionable metrics within the first week, reusing and extending the existing `dev-benchmark.ts` infrastructure.

#### Deliverables

- Lean-core case contract with TypeScript types and JSONL schema validator.
- 30-case seed corpus across all category/tier buckets (stored as JSONL).
- Extended `dev-benchmark.ts` that reads JSONL corpus instead of hardcoded cases.
- Baseline report snapshot in `docs/reports/`.

#### Tasks

1. Define `BenchmarkCaseV2` TypeScript interface matching lean-core contract.
2. Write JSONL schema validator (Zod-based, run on load + as vitest test).
3. Author 30 seed cases — 5×schema_easy, 5×schema_medium, 3×schema_hard, 5×domain_easy, 3×domain_medium, 2×domain_hard, 5×negative, 2×edge.
4. Migrate existing 5 `devCases` into `negative_cases.jsonl` (4 of 5 are negative/edge).
5. Extend `evaluateBenchmarkCases()` to load from JSONL, compute policy-gate + sql-policy accuracy per bucket.
6. Run baseline and commit report snapshot.

#### Exit Criteria

- `pnpm benchmark:dev` runs against 30 cases and produces per-bucket accuracy.
- All cases pass schema validation.
- Baseline report committed with per-category/tier breakdown.

#### Estimated Effort: 3-5 days

---

### Phase 1B — Node-Isolation Evaluation Framework

**Goal:** Measure each pipeline node independently, enabling targeted regression detection and fast failure diagnosis.

#### Deliverables

- Router accuracy benchmark (DATA/DOMAIN_KNOWLEDGE/OFF_TOPIC classification).
- Navigator table-selection precision/recall/F1 benchmark.
- Writer syntax-validity and EXPLAIN-success benchmark (given correct state).
- Critic false-positive/false-negative rate benchmark.

#### Tasks

1. Create `eval-node-isolation.ts` with per-node evaluation harness.
2. For router: run each case through `routerNode()`, measure classification accuracy against `expected_routing` field.
3. For navigator: run each SQL-expected case through `schemaNavigatorNode()`, compute table P/R/F1 against `expected_tables`.
4. For writer: construct state with correct `selected_tables` + `table_schemas` (from golden case), run `sqlWriterNode()`, validate output via EXPLAIN against MySQL.
5. For critic: construct state with golden SQL + question, run `criticNode()`, verify `valid=true`. Then run with intentionally broken SQL, verify `valid=false`.
6. Add `autoCorrectTableNames` regression cases (valid correction, CTE alias preservation, abbreviation expansion).
7. Add `pnpm benchmark:nodes` script to `package.json`.

#### Exit Criteria

- Router classification accuracy ≥ 90% on seed corpus.
- Navigator table F1 ≥ 0.80 on seed corpus.
- Writer EXPLAIN-success ≥ 80% when given correct tables.
- Critic correctly validates golden SQL with zero false-positive blocks.

#### Estimated Effort: 5-7 days

#### Dependencies

- Requires live MySQL wait_time (use docker compose db from dev environment).
- Requires LLM access for navigator, writer, critic nodes.
- Phase 1A corpus must be complete.

---

### Phase 2A — E2E Graph Test Harness with Execution Validation

**Goal:** Run the full LangGraph pipeline end-to-end for each benchmark case, execute both golden and candidate SQL against MySQL, and compare results deterministically.

#### Deliverables

- `eval-runner.ts` — invokes compiled graph for each case, captures full state trace.
- `eval-deterministic.ts` — runs the 7-step deterministic evaluation chain.
- Result comparison logic (row-signature matching with tolerance for ordering differences).
- JSON + markdown report with per-case breakdown and aggregate metrics.

#### Tasks

1. Build E2E runner that instantiates `GraphBuilder` via NestJS test module (same pattern as `app-test.module.ts`), invokes graph per case.
2. Implement deterministic evaluator chain:
   - SQL syntax parse check (regex + keyword validation).
   - Table/column existence check against `INFORMATION_SCHEMA`.
   - Read-only + complexity enforcement (reuse `enforceReadOnlySql` + `enforceSqlComplexity`).
   - EXPLAIN validation against MySQL.
   - Execute golden SQL, capture results.
   - Execute candidate SQL, capture results.
   - Row-signature comparison: match column names (order-insensitive), row count, value hash (sort rows before hashing to handle ORDER BY differences).
3. Implement `fast_mode` option for rapid iteration (skips router, caps attempts at 1).
4. Capture full state trace per case: `routing_decision`, `selected_tables`, `generated_sql`, `validation_result`, `attempt_count`, `reflections`, `thoughts`, token counts.
5. Expand corpus from 30 → ~60 cases based on Phase 1B failure analysis (add cases for gap areas).
6. Add `pnpm benchmark:e2e` script.

#### Exit Criteria

- E2E benchmark completes for full corpus within 15-minute timeout budget.
- Execution success rate ≥ 70% (Phase 2A target — expect improvement through Phase 2B insights).
- Row-signature match rate ≥ 50% for executing cases (indicating correct answers).
- Full state trace captured for every case (supports root-cause analysis).

#### Estimated Effort: 7-10 days

#### Dependencies

- Phase 1A corpus.
- Live MySQL with seeded data (docker compose).
- LLM API access.

---

### Phase 2B — LLM-as-a-Judge Semantic Scoring

**Goal:** Add semantic evaluation for cases where deterministic checks pass but results differ, and for domain-interpretation quality grading.

#### Deliverables

- `eval-judge.ts` — judge prompt builder, LLM invocation, response parser.
- Judge prompt templates (YAML, version-tracked alongside agent prompts).
- Calibration corpus (20 human-verified cases with expected verdicts).
- Dual-judge mode behind feature flag.

#### Tasks

1. Implement judge module:
   - Build prompt from template + case data + deterministic results.
   - Invoke via `LLMService` with dedicated judge model config.
   - Parse response with strict JSON validation (Zod schema).
   - Log parse failures and retry with simplified prompt (1 retry max).
2. Create judge prompt YAML template in `backend/src/ai/prompts/judge_prompts.yaml`.
3. Implement verdict composition rules (deterministic precedence + judge scoring).
4. Build calibration corpus: 20 cases with human-adjudicated verdicts (5 clear-pass, 5 clear-fail, 5 borderline, 5 domain-specific).
5. Run calibration validation: judge must agree with human verdicts on ≥85% of calibration set.
6. Implement dual-judge mode: two model providers, disagreement detection, conservative arbitration.
7. Feature-flag dual-judge behind `BENCHMARK_DUAL_JUDGE=true` env var.
8. Integrate judge into `eval-runner.ts` output pipeline.

#### Exit Criteria

- Judge JSON parse success > 99% across corpus.
- Calibration accuracy ≥ 85% (judge matches human verdicts).
- Dual-judge disagreement rate < 20% on calibration set.
- End-to-end benchmark with judge produces composite scores per category/tier.

#### Estimated Effort: 5-7 days

---

### Phase 3 — CI Integration and Regression Gates

**Goal:** Automate benchmark execution on PRs and nightly, with regression detection that blocks merges when quality drops.

#### Deliverables

- CI pipeline configuration (GitHub Actions or equivalent).
- Smoke benchmark on PR (20-case subset, deterministic-only, <3 min).
- Full benchmark nightly (full corpus + judge, <20 min).
- Baseline diffing tool that compares current run against last committed baseline.
- Regression gate with configurable thresholds.

#### Tasks

1. Create benchmark CI profiles:
   - `smoke` — 20-case subset, no judge, fast_mode=true. Target: <3 min. Runs on every PR.
   - `full` — complete corpus, single-judge, full pipeline. Target: <20 min. Runs nightly.
   - `deep` — complete corpus, dual-judge, full pipeline. Target: <40 min. Runs on release candidates.
2. Implement baseline diffing:
   - Compare current run metrics against `docs/reports/benchmark_baseline.json`.
   - Flag regressions: any metric dropping more than configured delta threshold.
   - Default thresholds: execution_success -5%, table_f1 -5%, semantic_equivalence -10%.
3. Implement regression gate:
   - Smoke: FAIL if policy_gate_accuracy < 100% OR execution_success drops > 5%.
   - Full: FAIL if any core metric drops below threshold. WARN on borderline increases.
   - Include override mechanism for intentional regressions (commit message tag `[benchmark-override: reason]`).
4. Publish reports:
   - JSON summary + markdown digest to `docs/reports/` with timestamp.
   - Nightly results archived in `docs/reports/history/YYYY-MM-DD.json`.
   - PR comments with metric delta summary (if CI integration supports it).
5. Implement baseline update command: `pnpm benchmark:update-baseline` — runs full benchmark and commits results as new baseline.
6. Document regression workflow in `docs/humans/context/BENCHMARKING.md`.

#### Exit Criteria

- PR smoke benchmark fails on simulated policy regression.
- Nightly benchmark produces trend-comparable report with history.
- Baseline update workflow documented and tested.
- Regression gates enforced on main branch.

#### Estimated Effort: 5-7 days

---

## Evaluation Runner Architecture: Placement & Isolation

### The Core Question

Should the evaluation runner live inside `backend/`, in its own standalone package, or in a fully separate container? This decision has long-term consequences for how the pipeline evolves across canary deploys, QA environments, schema migrations, and multi-tenant expansion.

### Three Viable Approaches

#### Approach A: In-Backend (Start Small)

Keep `eval-runner.ts` in `backend/src/ai/benchmarks/` alongside the existing `dev-benchmark.ts`. Import graph nodes and services directly via `@/` path aliases. Run via `tsx` scripts without bootstrapping NestJS.

```
backend/
  src/
    ai/
      benchmarks/
        dev-benchmark.ts     (existing)
        eval-runner.ts       (new — E2E)
        eval-deterministic.ts
        eval-judge.ts
        eval-report.ts
        corpus/
          schema_grounded.jsonl
          ...
```

**Proven pattern.** The existing `dev-benchmark.ts` already does this — it imports `policyGateNode` and `createInitialState` directly from `@/ai/...` and runs as a standalone `tsx` script via `pnpm benchmark:dev`. No NestJS bootstrap, no HTTP server, no DI container. It works.

**What the runner would import directly:**
- `env.config.ts` — standalone Zod config (no NestJS dependency)
- `llm.service.ts` — LLM factory (depends only on config, can be called without `@Injectable`)
- Graph node functions (`routerNode`, `schemaNavigatorNode`, `sqlWriterNode`, `criticNode`) — each takes explicit `Deps` objects, not injected services
- `mysql2` pool — direct wait_time for `EXPLAIN` + `executeQuery`, skipping `DatabaseService` wrapper
- `semantic_view.yaml` — loaded from filesystem

**What the runner does NOT need:**
- `@nestjs/*` (no DI container, no HTTP server)
- `pg` / `drizzle-orm` (PostgreSQL is app-data only — threads, tokens — irrelevant to SQL evaluation)
- `argon2` / `jsonwebtoken` (auth is irrelevant for benchmark)
- `nestjs-pino` (benchmark has its own logging)

**Advantages:**
- Zero duplication — imports are direct, code stays DRY.
- Path aliases (`@/`) resolve via `tsx` (already proven).
- Same lockfile, same dependency versions — no version drift.
- Fastest path to running benchmarks (~1 day to wire up).
- CI can run `pnpm benchmark:dev` in the same job that runs `pnpm test`.

**Disadvantages:**
- Tightly coupled to backend's internal structure — refactoring `graph.ts` or `state.ts` breaks the runner.
- Same `node_modules` tree (~400MB) even though the runner uses <30% of dependencies.
- Cannot benchmark a *different* version of the backend without switching branches.
- Cannot run against a remote backend in a canary/QA environment — it's hardcoded to local imports.

#### Approach B: Separate Package in Monorepo (Hybrid)

Create `eval/` as a sibling to `backend/` and `frontend/`, with its own `package.json` and a pnpm workspace at the root. The eval package calls the backend's HTTP API for E2E tests and imports shared types for corpus validation.

```
mediquery-ai/
  pnpm-workspace.yaml         (new — root workspace)
  backend/
  frontend/
  eval/
    package.json               (minimal deps: mysql2, zod, promptfoo)
    tsconfig.json
    Dockerfile                 (lightweight Node image)
    promptfooconfig.yaml
    src/
      runner.ts
      deterministic.ts
      judge.ts
      report.ts
      providers/
        mediquery-provider.ts (Promptfoo custom provider)
      assertions/
        table-selection.ts     (Promptfoo custom assertion)
        sql-quality.ts
    corpus/
      schema_grounded.jsonl
      ...
```

**How it interacts with the backend:**
- E2E evaluation: HTTP POST to `http://<backend-host>:8001/api/v1/queries/query` (sync endpoint — simpler than stream).
- Deterministic validation: Direct `mysql2` wait_time to the KPI database (same MySQL instance the backend uses).
- The runner doesn't import any backend source code — it calls the backend as a black box.

**pnpm workspace setup** (root `pnpm-workspace.yaml`):
```yaml
packages:
  - backend
  - frontend
  - eval
```

**Advantages:**
- Clean separation of concerns — the eval package has its own dependency tree (~60% smaller install).
- Can benchmark any backend deployment (local, staging, canary, QA) by changing `BACKEND_URL`.
- Naturally supports the future: canary deploys, A/B testing two backend versions, different QA schemas.
- Promptfoo integrates cleanly (it's a dependency of eval, not backend).
- Shared types can be published as an internal package or duplicated (corpus is JSON, not TS imports).

**Disadvantages:**
- Cannot do node-isolation testing (router accuracy, navigator F1) without importing backend internals. Either duplicate node functions or accept that node-level benchmarks stay in `backend/test/`.
- Two lockfiles (or one shared root lockfile with workspaces — more CI complexity).
- Slightly more setup friction (workspace config, separate tsconfig, Docker image).
- Risk of type drift between corpus schema in `eval/` and graph state in `backend/`.

#### Approach C: Fully Separate Container (Start Separate)

Standalone Docker container with its own Dockerfile, independent of the backend image entirely. Communicates exclusively via HTTP API.

```yaml
# docker-compose.eval.yml
services:
  eval-runner:
    build:
      context: ./eval
      dockerfile: Dockerfile
    environment:
      - BACKEND_URL=http://mediquery-backend:8001
      - DB_HOST=mediquery-db
      - PROMPTFOO_REMOTE_API_BASE_URL=http://promptfoo:3000
    depends_on:
      backend:
        condition: service_healthy
      db:
        condition: service_healthy
    volumes:
      - ./eval/corpus:/app/corpus
      - ./docs/reports:/app/reports
    networks:
      - mediquery-network
```

**Advantages:**
- Complete isolation — eval runner is a first-class service with its own lifecycle.
- Can run against any environment by changing `BACKEND_URL` and `DB_HOST`.
- Perfect for CI: `docker compose -f docker-compose.eval.yml up eval-runner` is a one-liner.
- Natural fit for canary evaluation: spin up two backend containers (current + canary), run eval against both, compare.

**Disadvantages:**
- Highest initial setup cost (~2-3 days to Dockerize + wire).
- Still cannot do node-isolation testing (black-box only).
- Requires the full stack to be running (backend + MySQL + Postgres) even for corpus validation.
- Overkill for Phase 1A where we just need to extend `dev-benchmark.ts`.

### Recommended Strategy: Start Small, Evolve to Hybrid

**Phase 1A-1B: Approach A (In-Backend)**

Stay in `backend/src/ai/benchmarks/`. Extend the existing proven pattern. The dev-benchmark already imports node functions directly — do the same for corpus loading, policy checks, and node-isolation tests. This delivers value in days, not weeks.

- `pnpm benchmark:dev` — extended deterministic corpus (Phase 1A)
- `pnpm benchmark:nodes` — node-isolation metrics (Phase 1B)

**Phase 2A: Evolve to Approach B (Hybrid Monorepo)**

When E2E evaluation arrives, create `eval/` as a separate workspace package. The E2E runner calls the backend via HTTP API. Node-isolation benchmarks remain in `backend/` (they need direct imports). The eval package owns:

- E2E runner (HTTP-based, environment-agnostic)
- Corpus files (moved from `backend/src/ai/benchmarks/corpus/` to `eval/corpus/`)
- Promptfoo configuration and custom provider/assertions
- Report generation and baseline diffing

Shared types (corpus schema, report format) are defined once in `eval/` and the backend references them via workspace dependency or JSON schema.

**Phase 3: Full Container Isolation**

When canary deploys and multiple QA environments arrive, the `eval/` package gets its own Dockerfile and Docker Compose service. CI runs `docker compose -f docker-compose.eval.yml up` against any target environment. The node-isolation benchmarks in `backend/` remain as unit-level regression checks; the eval container handles environment-level validation.

### Why This Evolution Path

| Concern | Phase 1 (In-Backend) | Phase 2 (Hybrid) | Phase 3 (Container) |
|---------|----------------------|-------------------|---------------------| 
| Time-to-value | ✅ Days | ⚠️ 1 week setup | ⚠️ 2-3 day Dockerize |
| Node isolation | ✅ Direct imports | ✅ Stays in backend/ | ✅ Stays in backend/ |
| E2E evaluation | ❌ Not yet needed | ✅ HTTP-based | ✅ HTTP-based |
| Multi-environment | ❌ Local only | ✅ Configurable URL | ✅ Docker Compose |
| Canary comparison | ❌ Not possible | ⚠️ Manual URL swap | ✅ Side-by-side containers |
| Schema evolution | ✅ Same codebase | ✅ Corpus versioned | ✅ Per-environment corpus |
| Promptfoo UI | ❌ Not integrated | ✅ Eval package owns it | ✅ Dedicated container |
| Dependency bloat | ⚠️ Full backend deps | ✅ Minimal eval deps | ✅ Minimal eval deps |

The key insight: **node-isolation and E2E evaluation have fundamentally different dependency needs**. Node isolation requires backend internals. E2E requires only HTTP. Trying to force both into one package creates awkward compromises. The hybrid approach respects this boundary naturally.

---

## Promptfoo Integration Architecture

### Role in the Pipeline

Promptfoo is **not the evaluation runner** — it is the **visualization and team collaboration layer**. The custom TypeScript runner (`eval-runner.ts`) produces raw evaluation data. Promptfoo consumes that data and provides:

1. **Matrix UI** — side-by-side comparison of candidate SQL vs golden SQL across the full corpus, filterable by category/tier/verdict.
2. **Eval history** — longitudinal view of how metrics change across runs, branches, and deployments.
3. **Team access** — data science team can browse results, inspect failures, and triage borderline cases without touching the codebase.
4. **Prompt A/B testing** — when iterating on system prompts (navigator, writer, critic), Promptfoo's matrix view shows the impact across all corpus cases simultaneously.

### Container Architecture

Promptfoo runs as a dedicated Docker service (`ghcr.io/promptfoo/promptfoo:latest`) on the Mediquery Docker network:

```yaml
# Addition to docker-compose.yml (or docker-compose.eval.yml)
services:
  promptfoo:
    image: ghcr.io/promptfoo/promptfoo:latest
    container_name: mediquery-promptfoo
    ports:
      - "3001:3000"     # 3001 to avoid conflict with frontend (3000)
    volumes:
      - promptfoo_data:/home/promptfoo/.promptfoo
      - ./eval/promptfoo:/app/config:ro   # config + custom provider/assertions
    environment:
      - PROMPTFOO_CONFIG_DIR=/home/promptfoo/.promptfoo
    networks:
      - default          # same network as backend, db
    restart: unless-stopped

volumes:
  promptfoo_data:
    driver: local
```

**Key decisions:**

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Port** | 3001 (host) → 3000 (container) | Frontend already occupies host port 3000 |
| **Persistence** | Named volume `promptfoo_data` | SQLite DB + eval results survive container restarts |
| **Config mount** | Bind-mount `eval/promptfoo/` read-only | Custom provider and assertion files accessible to Promptfoo CLI |
| **Network** | Same `mediquery-network` as backend | Promptfoo's custom provider needs to reach `mediquery-backend:8001` |
| **Profiles** | None (always available) or `profiles: ["eval"]` | Depends on whether the data science team wants it always-on or on-demand |

### Promptfoo Architecture (Self-Hosted OSS)

| Aspect | Detail |
|--------|--------|
| **Image** | `ghcr.io/promptfoo/promptfoo:latest` (single Express server) |
| **Database** | SQLite only (OSS limitation — cannot use Postgres without Enterprise) |
| **Scaling** | Single instance only (SQLite is not concurrent-safe across replicas) |
| **Auth** | None built-in (OSS). Place behind nginx/Caddy with basic auth if needed |
| **Storage** | `/home/promptfoo/.promptfoo/promptfoo.db` + blobs directory |

### Custom Provider: Mediquery Backend Bridge

Promptfoo calls the backend through a custom TypeScript provider that handles authentication, NDJSON parsing, and metadata extraction:

```typescript
// eval/promptfoo/mediquery-provider.ts
import type { ApiProvider, ProviderOptions, ProviderResponse, CallApiContextParams } from 'promptfoo';

export default class MediqueryProvider implements ApiProvider {
  private baseUrl: string;
  private authToken: string;

  constructor(options: ProviderOptions) {
    this.baseUrl = options.config?.baseUrl || 'http://mediquery-backend:8001';
    this.authToken = options.config?.authToken || process.env.MEDIQUERY_AUTH_TOKEN || '';
  }

  id() { return 'mediquery-text-to-sql'; }

  async callApi(prompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
    // Use the synchronous /query endpoint (not /stream) for simpler parsing
    const res = await fetch(`${this.baseUrl}/api/v1/queries/query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.authToken}`,
      },
      body: JSON.stringify({
        question: prompt,
        thread_id: context?.vars?.thread_id,
        fast_mode: context?.vars?.fast_mode ?? true,
      }),
    });

    const json = await res.json();

    return {
      output: JSON.stringify({
        sql: json.sql,
        data: json.data,
        insight: json.insight,
        error: json.error,
        attempts: json.attempts,
      }),
      tokenUsage: {
        total: json.meta?.total_tokens || 0,
      },
    };
  }
}
```

**Why `/queries/query` instead of `/queries/stream`:** The synchronous endpoint returns a complete JSON response. No NDJSON parsing, no stream buffering, no event-type filtering. Promptfoo's provider contract expects a single response — streaming adds complexity with no evaluation benefit. The synchronous endpoint runs the same LangGraph pipeline internally.

### Custom Assertions: SQL Quality Checks

```typescript
// eval/promptfoo/assertions/table-selection.ts
export default function(output: string, context: any) {
  const parsed = JSON.parse(output);
  const expectedTables: string[] = context.test?.vars?.expected_tables || [];
  if (!expectedTables.length) return { pass: true, score: 1.0, reason: 'No table expectations defined' };

  // Extract tables from generated SQL (simple regex approach)
  const sql = (parsed.sql || '').toUpperCase();
  const actualTables = expectedTables.filter(t => sql.includes(t.toUpperCase()));

  const recall = actualTables.length / expectedTables.length;
  const pass = recall >= 0.9;

  return {
    pass,
    score: recall,
    reason: pass
      ? `All expected tables found (${actualTables.join(', ')})`
      : `Missing tables: ${expectedTables.filter(t => !actualTables.includes(t)).join(', ')}`,
    namedScores: { table_recall: recall },
  };
}
```

### Promptfoo Configuration

```yaml
# eval/promptfoo/promptfooconfig.yaml
description: 'Mediquery Text-to-SQL Evaluation'

sharing:
  apiBaseUrl: http://promptfoo:3000
  appBaseUrl: http://promptfoo:3000

providers:
  - id: file://./mediquery-provider.ts
    label: 'Mediquery Pipeline (Bedrock)'
    config:
      baseUrl: 'http://mediquery-backend:8001'
      authToken: '{{env.MEDIQUERY_AUTH_TOKEN}}'

prompts:
  - '{{question}}'

defaultTest:
  assert:
    - type: javascript
      value: file://./assertions/sql-is-readonly.ts
    - type: javascript
      value: file://./assertions/has-valid-response.ts

tests: file://./corpus/promptfoo-tests.yaml
  # Generated from JSONL corpus by eval runner
  # Each case maps: question → vars, golden_sql → metadata, expected_tables → assertion config
```

### Data Flow: Eval Runner → Promptfoo

The custom eval runner is the source of truth for evaluation. Promptfoo is a consumer:

```text
1. Eval runner executes corpus against backend (HTTP or direct import)
2. Runner produces:
   a. JSON report → docs/reports/benchmark_<timestamp>.json
   b. Promptfoo-compatible results → pushed via `promptfoo share` CLI
3. Promptfoo UI displays results:
   - Matrix view: corpus × provider (can compare Bedrock vs OpenAI vs Gemini)
   - Assertion breakdown per case
   - Named scores (table_recall, semantic_equivalence, etc.)
   - History timeline across runs
```

**CI integration:**
```bash
# In CI pipeline after eval runner completes
PROMPTFOO_REMOTE_API_BASE_URL=http://promptfoo:3000 \
PROMPTFOO_REMOTE_APP_BASE_URL=http://promptfoo:3000 \
pnpm exec promptfoo eval --share -c eval/promptfoo/promptfooconfig.yaml
```

### Promptfoo for Multi-Provider Comparison

One of Promptfoo's killer features for the data science team: comparing the same corpus across multiple LLM providers simultaneously.

```yaml
providers:
  - id: file://./mediquery-provider.ts
    label: 'Bedrock (Claude Sonnet 4)'
    config:
      baseUrl: 'http://mediquery-backend:8001'
      authToken: '{{env.MEDIQUERY_AUTH_TOKEN}}'

  - id: file://./mediquery-provider.ts
    label: 'OpenAI (GPT-4.1)'
    config:
      baseUrl: 'http://mediquery-backend:8001'
      authToken: '{{env.MEDIQUERY_AUTH_TOKEN}}'
      # Override model via query params or request body
```

This requires the backend to accept model override parameters per-request (already supported via `model_id` and `model_provider` in the query request DTO). The Promptfoo UI would then show a side-by-side matrix: same question, different models, with per-case assertion results.

### Promptfoo Limitations (OSS) and Mitigations

| Limitation | Impact | Mitigation |
|-----------|--------|------------|
| SQLite only (no Postgres) | No horizontal scaling, single-instance | Acceptable for team size; eval data is ephemeral (source of truth is git-tracked reports) |
| No authentication (OSS) | Anyone on the network can view results | Deploy behind nginx reverse proxy with basic auth; or restrict to VPN |
| No multi-user RBAC | Can't separate data science team views from CI runs | Use eval labels/tags to distinguish; all data visible to all users |
| Single container only | Can't scale for concurrent CI runs | Queue CI eval runs; nightly runs don't overlap with manual runs |
| No API for triggering evals | Can't trigger eval from Promptfoo UI | Eval triggered by CI or `pnpm benchmark:eval`; results pushed to Promptfoo |

---

## Future-Proofing: Multi-Environment Evaluation

### The Evolution Path

As Mediquery matures, the evaluation pipeline must support:

1. **Canary deploys** — evaluate a new backend version alongside the current production version.
2. **QA environments** — each QA instance may have different schemas, data volumes, or configuration.
3. **Schema evolution** — new tables, renamed columns, additional foreign keys.
4. **Multi-tenant schemas** — different customers with different schema subsets.

### How the Architecture Handles Each

#### Canary Evaluation

With the hybrid approach (Phase 2+), the eval runner is environment-agnostic. Compare two backend versions by pointing to different URLs:

```bash
# Evaluate current production
BACKEND_URL=http://mediquery-backend-stable:8001 pnpm benchmark:e2e

# Evaluate canary
BACKEND_URL=http://mediquery-backend-canary:8001 pnpm benchmark:e2e

# Diff reports
pnpm benchmark:diff --baseline stable_report.json --candidate canary_report.json
```

The Docker Compose can run both backend versions simultaneously:

```yaml
services:
  backend-stable:
    image: mediquery-backend:v2.3.0
    # ...
  backend-canary:
    image: mediquery-backend:v2.4.0-rc1
    # ...
  eval-runner:
    environment:
      - EVAL_TARGETS=http://backend-stable:8001,http://backend-canary:8001
```

#### QA Environment Differences

Each QA environment may have:
- **Different data** — more patients, different operators, different date ranges.
- **Different schemas** — additional columns, renamed tables.
- **Different config** — different LLM providers, different model versions.

The eval runner handles this through **environment-scoped corpus files**:

```
eval/corpus/
  base/                     # universal cases (work on any schema)
    schema_grounded.jsonl
    negative_cases.jsonl
  qa-staging/               # staging-specific cases
    schema_grounded.jsonl   # overrides or additions for staging schema
  qa-production/            # production-specific cases
    ...
```

The runner loads `base/` + environment-specific overlay. Golden SQL is validated via EXPLAIN on each run — if a golden query fails EXPLAIN in a specific environment, the case is flagged as "schema-incompatible" rather than failing silently.

#### Schema Evolution

When the MySQL schema changes (new tables, column renames, FK additions):

1. **Corpus validator** runs EXPLAIN for every golden SQL against the target MySQL instance.
2. Cases with EXPLAIN failures are flagged: `"schema_status": "stale"` in the report.
3. CI gates only enforce thresholds on `"schema_status": "valid"` cases.
4. Stale cases generate a maintenance task: "update golden SQL for case X after schema migration Y".

This means schema evolution doesn't break the benchmark — it degrades gracefully and surfaces maintenance work.

#### Multi-Tenant Schemas

When different tenants have different schema subsets:

- Corpus files are tagged with `"required_schema_features": ["PROCEDURE_TABLES", "WAIT_TIME_ANALYSIS"]`.
- The eval runner checks `INFORMATION_SCHEMA.TABLES` at startup and filters the corpus to match the available schema.
- Tenant-specific corpus overlays can add cases for tenant-specific tables.

### Environment Configuration

All environment-specific configuration flows through environment variables, never hardcoded:

```bash
# eval/.env.example
BACKEND_URL=http://mediquery-backend:8001
DB_HOST=mediquery-db
DB_PORT=3306
DB_USER=mediquery
DB_PASSWORD=
DB_NAME=mediquery
PROMPTFOO_REMOTE_API_BASE_URL=http://promptfoo:3000
MEDIQUERY_AUTH_TOKEN=
EVAL_CORPUS_DIR=./corpus/base
EVAL_CORPUS_OVERLAY=
BENCHMARK_DUAL_JUDGE=false
EVAL_PROFILE=smoke           # smoke | full | deep
```

---

## Cross-Plan Alignment: Backlog Plans 1-4 (MLOps Pipeline)

The active benchmarking plan is the immediate delivery priority and becomes the evaluation contract that backlog Plans 1-4 must satisfy as they ship.

### Why Alignment Is Required

Backlog Plans 1-4 introduce major system shifts (tenant schemas, ETL ingestion, orchestration, and MLOps). Without a shared evaluation contract, each change can break query quality silently.

This active plan therefore acts as the **quality gate** for the pipeline roadmap:

- Plan 1 changes schema boundaries (single schema → tenant-specific schema).
- Plan 2 changes data ingestion paths and canonicalization.
- Plan 3 changes scheduling and data-quality enforcement behavior.
- Plan 4 introduces model lifecycle and tenant-specific evaluation loops.

### Contract Between This Plan and Plans 1-4

| Backlog Plan | What Changes | Evaluation Contract Required from This Active Plan |
|--------------|--------------|----------------------------------------------------|
| **Plan 1: Schema Foundation** | Multi-tenant MySQL schema isolation | Environment-aware corpus overlays + schema drift checks + tenant-scoped benchmark runs |
| **Plan 2: ETL Scripts** | New data load/transform path | Data freshness checks + deterministic result-tolerance rules for ETL-lag windows |
| **Plan 3: Orchestration** | Scheduled pipeline + GE quality gates | Daily automated benchmark run after data refresh + trend diff vs prior day |
| **Plan 4: MLOps Foundation** | Model registry + tenant golden suites | Promote this benchmark runner as shared evaluation engine; avoid parallel evaluator duplication |

### Recommended Delivery Sequence (Clear and Deliverable)

#### Immediate (Current Priority)

1. Finish Phase 1A/1B/2A/2B/3 of this active benchmarking plan.
2. Publish stable corpus/report contracts (`BenchmarkCaseV2`, deterministic evaluator outputs, judge output schema).
3. Lock baseline thresholds and CI gate behavior.

#### Next (Backlog Plan Integration)

4. Start Plan 1 with benchmark environment matrix already in place (tenant-specific corpus overlays).
5. Start Plan 2 with ETL-aware validation windows (benchmark tags for post-load freshness sensitivity).
6. Start Plan 3 with scheduler-triggered benchmark hooks and daily trend reporting.
7. Start Plan 4 by reusing this benchmark engine for tenant golden query suites and model registry promotion gates.

### Merge/Breakdown Guidance for Plans 1-4

To keep the future path realistic and non-duplicative:

- Keep Plans 1-3 as data platform implementation layers.
- Re-scope Plan 4 to **MLOps extension** only (registry, retraining orchestration, tenant-level tuning), not a separate evaluation engine.
- Use this active benchmarking runner as the single evaluation substrate across product and MLOps workflows.

This avoids maintaining two competing evaluators (product benchmark vs MLOps golden suite) and keeps quality gates consistent across environments.

---

## Tooling Decision: Why Custom Runner + Promptfoo UI

### Why Not Promptfoo as the Primary Runner

Promptfoo is the wrong primary abstraction for Mediquery's core evaluation:

1. **State machine mismatch** — Promptfoo expects simple `prompt → response` evaluation. Mediquery's pipeline is a 7-node LangGraph state machine with conditional edges, retry loops, and accumulated state. Promptfoo cannot natively instrument node-by-node metrics or capture `navigator_contract`, `reflections`, `attempt_count`, etc.

2. **Node-isolation impossible** — Promptfoo can only call HTTP endpoints or custom providers that return a single response. Evaluating the navigator's table selection separately from the writer's SQL generation requires direct function calls into the backend's internals — something Promptfoo's architecture doesn't support.

3. **Deterministic evaluator chain** — Our 7-step deterministic chain (parse → schema check → EXPLAIN → execute → row-sig compare → table F1 → read-only check) is deeply custom. Promptfoo assertions can implement individual checks, but orchestrating a chain with early-exit logic (skip judge if deterministic fails) is awkward in YAML config.

4. **Metric surface area** — We need table-selection F1, critic false-positive rate, retry convergence, token cost per node, and node-level latency. These aren't standard Promptfoo metrics. While `namedScores` in custom assertions can carry them, the aggregation and baseline diffing logic must still be custom.

### Why Promptfoo Is Still Valuable (and Not Optional)

The data science team needs a visual interface to:

- **Browse evaluation results** without running CLI commands or reading JSON files.
- **Compare providers** (Bedrock vs OpenAI vs Gemini) side-by-side on the same corpus.
- **Inspect individual failures** — see the question, golden SQL, candidate SQL, assertion results, and judge rationale in one view.
- **Track trends** — Promptfoo's eval history shows how metrics change over time.
- **Iterate on prompts** — A/B test system prompt changes by running the same corpus through two prompt versions and viewing the matrix diff.

These are visualization and collaboration needs, not evaluation logic needs. Promptfoo excels at this.

### Why Ragas Is Dropped

Ragas is Python-ecosystem-first and its RAG-focused metrics (context relevancy, answer similarity) map poorly onto Text-to-SQL evaluation where we have exact schema constraints, EXPLAIN validation, and row-level result comparison. The LLM judge with a domain-specific rubric serves the same purpose with better control and no Python dependency bridge.

### Recommended Stack (Final)

1. **Custom TypeScript evaluation runner (primary)** — orchestrates corpus loading, deterministic eval chain, LLM judge, and report generation.
2. **Promptfoo (visualization + collaboration)** — dedicated container serving the UI for the data science team, consuming eval results via `promptfoo share` or the Node.js library API.
3. **Vitest as test framework** — node-isolation benchmarks run as vitest tests in `backend/`, sharing existing test infrastructure.
4. **Zod for contract validation** — corpus schema, judge output, and report structure validation.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| **Dataset staleness** — schema changes invalidate golden SQL | Medium | High | Schema drift checker in corpus validator; CI flag on DDL changes; golden SQL validated via EXPLAIN on each run |
| **Judge model drift** — model updates shift scoring behavior | Medium | Medium | Lock judge prompt version; calibration corpus with human verdicts; track calibration accuracy over time |
| **Benchmark overfitting** — prompts tuned to pass known cases | High | High | Maintain holdout set (20% of corpus hidden from dev); periodic injection of new cases from production query logs; rotate holdout quarterly |
| **LLM cost creep** — judge + dual-judge + large corpus escalates spend | Medium | Low | Deterministic-first strategy minimizes judge invocations; PR runs are judge-free; budget cap alarm in CI |
| **Test environment drift** — dev MySQL data diverges from benchmark expectations | Low | High | Benchmark runs against deterministic init.sql seed; Docker compose re-creates from scratch; golden row counts validated pre-run |
| **autoCorrectTableNames regressions** — hardcoded regex silently corrupts SQL | Medium | Medium | Dedicated regression cases in corpus; test CTE aliases, column aliases, and subquery aliases against correction logic |
| **Multi-turn memory coupling** — follow-up cases depend on prior case's actual (not expected) output | Medium | Medium | Multi-turn cases define explicit mock memory state rather than depending on sequential execution |

---

## Relationship to Existing Documentation

This plan supersedes the aspirational sections of:

- [docs/humans/designs/benchmarking_framework.md](docs/humans/designs/benchmarking_framework.md) — the "Next Design Extensions" section is now formalized here. The framework doc remains accurate for the current deterministic harness scope.
- [docs/humans/context/BENCHMARKING.md](docs/humans/context/BENCHMARKING.md) — the "Benchmark Metrics" section will be expanded as each phase ships. The baseline workflow section remains the correct dev-time process.
- `llm_routing_agentic_optimization.md` Phase 7 — this plan is the detailed execution spec for what Phase 7 outlined as "Development Benchmark Baseline". Phase 7 can be marked complete once Phase 1A ships.

---

## Immediate Next Steps

### First Action (Day 1)

1. Create `backend/src/ai/benchmarks/corpus/` directory.
2. Define `BenchmarkCaseV2` interface in a new `backend/src/ai/benchmarks/types.ts`.
3. Create Zod schema for lean-core validation.
4. Author the first 10 seed cases (5 schema_grounded_easy + 5 negative) with golden SQL verified against the live MySQL schema via EXPLAIN.
5. Wire `dev-benchmark.ts` to load from JSONL alongside existing hardcoded cases (backward-compatible migration).

### Definition of Done for Phase 1A

`pnpm benchmark:dev` loads 30 JSONL cases, runs policy+SQL-safety checks per case, produces a report with per-category/tier accuracy breakdown, and the baseline is committed to `docs/reports/`.
