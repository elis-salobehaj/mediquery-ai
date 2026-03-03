---
status: implemented
priority: high
date_created: 2026-02-26
date_updated: 2026-02-27
date_completed: 2026-02-27
related_files:
  - backend/src/ai/graph.ts
  - backend/src/ai/router.ts
  - backend/src/ai/schema-navigator.ts
  - backend/src/ai/sql-writer.ts
  - backend/src/ai/critic.ts
  - backend/src/ai/reflector.ts
  - backend/src/ai/common.ts
  - backend/src/ai/prompts/system_prompts.yaml
  - backend/src/ai/prompts/semantic_view.yaml
  - backend/src/ai/benchmarks/dev-benchmark.ts
  - backend/src/ai/queries.controller.ts
  - backend/src/threads/user-memory-preferences.service.ts
  - backend/src/threads/memory.controller.ts
  - backend/src/database/schema.ts
  - packages/db/drizzle/0002_add_user_memory_preferences.sql
  - docs/designs/multi_agent_architecture.md
  - docs/context/ARCHITECTURE.md
  - docs/context/SEMANTIC_RETRIEVAL.md
  - docs/reports/guardrail_benchmark_dev.json
depends_on: []
blocks: []
assignee: null
completion:
  - [x] Phase 1 - Remove legacy-table drift in runtime code paths
  - [x] Phase 2 - Enforce structured contracts between agents
  - [x] Phase 3 - Add retrieval quality + token observability
  - [x] Phase 4 - Introduce hybrid semantic retrieval and reranking
  - [x] Phase 5 - Add scoped agent memory and conversation context policies
  - [x] Phase 5.1 - Add long-lived memory persistence foundation
  - [x] Phase 6 - Add routing policy engine and safety guardrails
  - [x] Phase 6.1 - Tune critic semantic triage for advisory vs blocking issues
  - [x] Phase 7 - Add development benchmarking baseline (no rollout checklist)
---

# LLM Routing & Agentic Optimization Plan

## Objective

Improve query success rate, lower token consumption, and reduce hallucinations by hardening the Router → Navigator → Writer → Critic ↔ Reflector loop in the TypeScript backend.

## Why this is needed now

Current implementation and docs show drift in several places. This increases retry loops, weakens schema grounding, and wastes tokens.

## Verified Mismatch Notes (Design vs Implementation)

1. **Legacy table names still referenced in active code paths**
   - `schema-navigator.ts` example/fallback still references `lab_results`, `billing`
   - `common.ts` auto-correction still maps to unavailable tables
2. **Semantic retrieval status mismatch**
   - Design/docs previously implied embedding/vector retrieval, but TS implementation currently uses prompt-based LLM table selection
3. **Human-in-the-loop mismatch**
   - Design diagram includes human review for critical ops, but active graph has no HITL node
4. **Unsupported-intent handling not fully enforced in runtime**
   - Prompts are updated to decline unsupported asks, but runtime reflection logic can still pressure SQL generation
5. **Routing terminology mismatch in docs**
   - Old docs used `data_query/domain_question`; implementation uses `DATA/DOMAIN_KNOWLEDGE/OFF_TOPIC`

## Industry Best-Practice Direction

### A. Routing reliability first
- Move from free-text routing outputs to strict typed contracts at each hop.
- Fail fast for unsupported intents before SQL generation.
- Keep strict allowlist of available tables and join keys.

### B. Token efficiency by retrieval control
- Reduce selected table set dynamically (`k` bound by intent type).
- Prefer summary KPI tables for overview questions.
- Add retrieval diagnostics and token budget checks per node.

### C. Reflection quality over retry count
- Reflection should produce root-cause + concrete fix instructions.
- Block duplicate SQL retries using canonical SQL hashing.
- Early stop when repeated failure signature is detected.

### D. Memory, but scoped and safe
Agent memory is useful **in this case**, if constrained:
- Keep **short-lived working memory** per thread (selected patients, date range, units, active KPI intent)
- Keep **long-lived preference memory** (preferred unit system, preferred chart style) only with user consent
- Do not persist raw chain-of-thought; persist compact structured facts
- Enforce memory TTL and size limits to prevent token bloat and stale context errors

## Proposed Target Architecture

```text
Router
  ├─ OFF_TOPIC -> End
  ├─ DOMAIN_KNOWLEDGE -> Meta-Agent -> End
  └─ DATA -> Policy Gate -> Retriever (hybrid) -> Navigator Rerank -> SQL Writer
                                                   -> Critic -> (valid) -> Execute
                                                             -> (issues) -> Reflector -> SQL Writer
```

## Phase Plan

## Phase 1 - Remove legacy-table drift in runtime code paths

**Goal:** Ensure runtime logic references only actual MySQL schema tables.

- Update navigator example and fallback defaults to current table set
- Update auto-correction maps in `common.ts` to supported tables only
- Add unit tests to assert no unknown-table fallbacks
- Add CI grep guard for forbidden legacy table names

**Exit Criteria:**
- No runtime fallback references to unavailable tables
- Tests fail if forbidden table names reappear

## Phase 2 - Enforce structured contracts between agents

**Goal:** Make each node handoff machine-parseable and deterministic.

- Navigator output schema: `{ supported, tables, join_plan, confidence, notes }`
- Critic output schema: `{ valid, severity, issues, fixes }`
- Reflector output schema: `{ root_cause, fix, next_tables, keep_or_replace_query }`
- Introduce runtime validators (Zod) before downstream node execution

**Exit Criteria:**
- Invalid JSON outputs are rejected and retried with low-cost repair prompt
- All handoffs validated before execution

## Phase 3 - Add retrieval quality + token observability

**Goal:** Make token spend and retrieval quality measurable.

- Emit per-node metrics: prompt tokens, completion tokens, latency
- Emit retrieval metrics: selected table count, overlap with executed SQL tables, retry count
- Add dashboards for p50/p95 latency, first-pass validity, avg attempts, token/query
- Add route-level token budget limits (soft warnings + hard caps)

**Exit Criteria:**
- Baseline established for Fast vs Multi-agent modes
- Weekly trend of cost/query and retry loop count visible

## Phase 4 - Introduce hybrid semantic retrieval and reranking

**Goal:** Reduce schema context size while improving table relevance.

- Build embedding index from `semantic_view.yaml` + DB schema signatures
- Retrieve top-k candidates via vector search
- Rerank with navigator prompt and join-graph constraints
- Pass minimal schema context to SQL Writer

**Exit Criteria:**
- Lower writer prompt tokens/query vs baseline
- First-pass valid SQL rate improves without accuracy regression

## Phase 5 - Add scoped agent memory and conversation context policies

**Goal:** Improve multi-turn continuity without context explosion.

- Add per-thread structured memory store:
  - active patient set
  - active timeframe
  - active KPI intent
  - preferred units
- Add memory summarizer to condense history into compact facts
- Add stale-memory invalidation (TTL + confidence decay)
- Add “memory opt-out” and clear-memory endpoint per thread

**Exit Criteria:**
- Multi-turn follow-up success rate increases
- Token/query stays bounded with long chats

### Phase 5.1 - Long-lived preference memory persistence

**Goal:** Persist user-approved preferences in PostgreSQL and blend them safely into thread memory.

- Add `user_memory_preferences` table (user-scoped, unique per user)
- Persist long-lived preference facts only (e.g., `preferred_units`, `preferred_chart_style`)
- Keep request-time memory control explicit via `enable_memory`
- Add global memory clear endpoint (`DELETE /api/v1/memory`) to reset both thread memory cache and persisted user preferences
- Merge persisted preferences into scoped memory only when current request has `enable_memory=true`

**Exit Criteria:**
- Long-lived preferences survive process restarts
- Clearing memory removes both short-lived and long-lived memory state
- Memory remains bounded and explicit (no transcript persistence)

## Phase 6 - Add routing policy engine and safety guardrails

**Goal:** Improve correctness and reduce risky generations.

- Policy gate for unsupported intents before SQL Writer
- SQL operation classifier to block non-read-only statements pre-validation
- Enforce query complexity limits (join depth, result size, timeout tiers)
- Add fallback responses with nearest supported alternatives

**Exit Criteria:**
- Unsupported-intent precision > baseline
- Zero write-operation SQL reaching execution layer

**Implementation Notes (2026-02-26):**
- Added `policy_gate` node between Router and Schema Navigator to block unsupported or write-intent requests early.
- Added SQL operation classifier enforcement (read-only only) before database validation.
- Added SQL complexity guardrails (join-depth, union+join, and bounded result policy via required LIMIT in high-join cases).
- Added fallback responses with supported alternatives for blocked requests.

**Implementation Notes (2026-02-27):**
- Updated `critic.ts` semantic triage to distinguish blocking semantic defects from advisory observations.
- Added alias-qualified false-positive downgrading (for cases like alias + correct existing column) so valid SQL is not rejected.
- Preserved advisory issues (NULL/LEFT JOIN/ambiguity notes) as warnings without forcing retry loops.
- Added dedicated unit coverage in `backend/test/ai/critic.spec.ts` for advisory and blocking semantic paths.

## Key Metrics (Primary)

- First-pass SQL validity rate
- Average attempts per successful query
- Token cost per query (router/navigator/writer/critic split)
- p95 end-to-end latency
- Unsupported-intent precision/recall
- Multi-turn follow-up success rate

## Risks & Mitigations

- **Risk:** Over-constrained routing misses valid analyses  
  **Mitigation:** confidence thresholds + controlled fallback policy
- **Risk:** Memory introduces stale assumptions  
  **Mitigation:** TTL, source tagging, explicit user override
- **Risk:** Extra validation adds latency  
  **Mitigation:** lightweight validators + model tiering by node

## Immediate Next Step

Continue Phase 7 development benchmarking: expand baseline corpus and compare pre/post-guardrail metrics in dev mode (rollout checklist deferred until production readiness).

## Phase 7 - Development Benchmark Baseline (In Progress)

**Goal:** Establish a repeatable dev-mode benchmark harness to measure guardrail behavior before any production rollout work.

- Add a deterministic benchmark corpus for supported, unsupported, and SQL policy edge cases
- Add a benchmark runner that records policy-gate and SQL-policy accuracy into `docs/reports`
- Keep this phase focused on development diagnostics only (no rollout checklist / release gates yet)

**Progress (2026-02-26):**
- Added dev benchmark harness script in `backend/src/ai/benchmarks/dev-benchmark.ts`
- Added initial benchmark corpus and metric summary generation (`policy_gate`, `sql_policy`)
- Added test coverage for benchmark summary generation
