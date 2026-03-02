---
status: implemented
priority: high
date_created: 2026-01-15
date_completed: 2026-01-20
date_updated: 2026-01-22
related_files:
  - backend/services/llm_agent.py
  - backend/services/database.py
  - backend/main.py
  - frontend/src/components/ChatBox.tsx
  - frontend/src/utils/export.ts
depends_on: []
blocks: []
report: docs/reports/archive/2026/PHASE1_IMPLEMENTATION_SUMMARY.md
---

# Plan: MediqueryAI Feature Implementation

**Status**: ✅ Implemented  
**Completed**: January 20, 2026

Implement CSV data export and a Reflexion-based SQL retry loop to improve query reliability and user experience.

### Feature 1: CSV Export

**TL;DR**: Add frontend-only CSV export using existing JSON data from query responses. The `data` field contains raw query results (not chart-specific), making it ideal for direct export.

#### Data Structure (from backend)
```json
{
  "data": {
    "columns": ["name", "age", "chronic_condition"],
    "data": [{"name": "John", "age": 45, "chronic_condition": "diabetes"}, ...],
    "row_count": 2
  },
  "visualization_type": "bar"  // Chart type is separate - doesn't affect data
}
```

#### Steps
1. Add `exportToCSV()` utility function in `frontend/src/utils/export.ts`:
   - Accept `data: object[]` and `columns: string[]` parameters
   - Handle edge cases: empty data, special characters, commas in values
   - Use `columns` array for header row (preserves order)
   - Convert `data` array to CSV rows
   - Trigger download via `Blob` + `URL.createObjectURL()`
2. Add "Export CSV" button in `ChatBox.tsx` next to messages containing `data` property, styled consistently with existing HUD buttons
3. Wire button click to call `exportToCSV(message.data.data, message.data.columns)` with filename based on timestamp

---

### Feature 2: SQL Reflexion Loop

**TL;DR**: Implement the industry-standard 4-stage Multi-Stage Agentic Pipeline with Reflective Refinement: Schema Pruning → Plan Construction → SQL Generation → Reflexion Validation. Leverage existing `thoughts` tracking for real-time UI transparency.

#### Stage 1: Schema Pruning (Already Exists)
- Current semantic search via LlamaIndex already handles this
- No changes needed - uses RAG to select relevant tables/columns

#### Stage 2: Plan Construction (New)
1. Add `generate_query_plan()` method in `llm_agent.py` that outputs a natural language plan before SQL generation
   - Example output: "Step 1: Join patients and visits on patient_id. Step 2: Filter by date range. Step 3: Group by diagnosis."
2. Store plan in `thoughts` array for UI visibility

#### Stage 3: SQL Generation (Enhance Existing)
1. Modify `generate_sql()` in `llm_agent.py` to accept the query plan as context
2. SQL generation now follows the structured plan from Stage 2

#### Stage 4: Reflexion Loop (New)
1. Add `validate_sql()` method in `database.py`:
   - Dry-run validation via `EXPLAIN` query
   - Row count sanity checks: flag if 0 rows or >10k rows returned
   - Return `{ valid: bool, error: str | None, row_count: int, warnings: list }`

2. Add `reflect_on_error()` method in `llm_agent.py`:
   - Prompts LLM with: failed SQL + error message + original query + query plan
   - Returns verbal critique and suggested fix

3. Add `generate_sql_with_retry()` method in `llm_agent.py`:
   ```
   start_time = time.time()
   TIMEOUT_SECONDS = 60
   
   for attempt in range(max_retries=3):
       if time.time() - start_time > TIMEOUT_SECONDS:
           return timeout_error("Query exceeded 60s timeout")
       
       sql = generate_sql(query, plan, reflections)
       validation = validate_sql(sql)
       
       if validation.valid and validation.row_count > 0 and validation.row_count <= 10000:
           return success
       
       reflection = reflect_on_error(sql, validation.error, query, plan)
       reflections.append(reflection)
       thoughts.append(f"Attempt {attempt+1} failed: {reflection}")
   ```

4. Update `/query` endpoint in `main.py`:
   - Use `generate_sql_with_retry()` instead of `generate_sql()`
   - Include retry metadata in response

5. Update `QueryResponse` model:
   - Add `attempts: int` - number of tries before success/failure
   - Add `reflections: list[str]` - self-critiques from each failed attempt
   - Add `query_plan: str` - the natural language plan for transparency

#### UI Real-Time Streaming (New Infrastructure Required)

**Current State**: Thoughts are collected synchronously and returned ALL AT ONCE after query completion. No streaming support exists.

##### Backend Changes
1. Add new streaming endpoint `POST /query/stream` in `main.py`:
   - Use `StreamingResponse` with Server-Sent Events (SSE)
   - Emit events: `thought`, `sql`, `data`, `reflection`, `complete`
   ```python
   async def event_generator():
       yield f"data: {json.dumps({'type': 'thought', 'content': '...'})}\n\n"
   return StreamingResponse(event_generator(), media_type="text/event-stream")
   ```

2. Refactor `llm_agent.py` to accept a `thought_callback` function:
   - Replace `self.last_thoughts.append(...)` with `await thought_callback(...)`
   - Convert synchronous methods to async generators

##### Frontend Changes
1. Update `ChatBox.tsx` to use `fetch` with streaming instead of axios:
   - Read response body as stream via `response.body.getReader()`
   - Parse SSE events and update state incrementally
2. Add `isStreaming: boolean` to Message interface
3. Show animated "thinking" indicator while streaming
4. Display thoughts in real-time as they arrive (existing `<details>` UI works, just needs incremental updates)

##### Alternative: Polling (Simpler, Less Optimal)
If SSE is too complex initially:
1. Backend stores thoughts in Redis/memory with query ID
2. Frontend polls `GET /query/{id}/status` every 500ms
3. Less elegant but works without major refactoring

---

### Feature 3: Fast Mode Toggle

**TL;DR**: Add a toggle to skip Plan Construction for simple queries, reducing latency by ~2-5 seconds.

#### Steps
1. Add `fast_mode: bool = False` parameter to `QueryRequest` model in `main.py`
2. In `generate_sql_with_retry()`, skip `generate_query_plan()` when `fast_mode=True`
3. Add toggle switch in `ChatBox.tsx` UI (near model selector)
4. Store preference in localStorage

#### Heuristics for Auto-Fast Mode (Optional)
- Queries under 10 words → auto-fast
- No JOINs detected in schema context → auto-fast
- Single table queries → auto-fast

---

### Feature 4: Query Plan Caching

**TL;DR**: Cache successful query plans to skip Plan Construction for repeated similar queries.

#### Steps
1. Add query similarity hashing in `llm_agent.py`:
   - Normalize query (lowercase, strip whitespace, remove stop words)
   - Generate hash of normalized query + relevant table names
2. Store successful `{hash: query_plan}` mappings:
   - Phase 1: In-memory `dict` with LRU eviction (simple, no dependencies)
   - Phase 2: Redis for persistence across restarts
3. On new query, check cache before calling `generate_query_plan()`
4. Add cache hit/miss to `thoughts` for transparency: "Using cached query plan" vs "Generating new plan"
5. Add cache invalidation:
   - Manual: Admin endpoint `DELETE /cache/query-plans`
   - Automatic: Clear on schema changes

#### Cache TTL Strategy
- Default: 24 hours
- Invalidate immediately if cached plan leads to SQL error

---

### Feature 5: Logging Standardization

**TL;DR**: Standardize all logging to a consistent format and fix inconsistencies for better observability.

#### Current State
- ✅ Centralized config in `main.py` with `%(asctime)s - %(name)s - %(levelname)s - %(message)s` format
- ❌ `chat_history.py` uses `print()` instead of `logger`
- ❌ No structured logging (JSON) for log aggregation tools
- ❌ No request correlation IDs

#### Steps
1. Fix inconsistent logging in `chat_history.py`:
   - Replace `print(f"ERROR: ...")` with `logger.error(...)`
2. Add request correlation ID middleware in `main.py`:
   - Generate UUID per request
   - Attach to all log messages for that request
   - Return in response headers for client-side correlation
3. Add structured JSON logging option:
   - Use `python-json-logger` library
   - Enable via `LOG_FORMAT=json` env variable
   - Keeps human-readable format for development
4. Add query metrics logging:
   - Log at end of each query: `{query_id, duration_ms, attempts, success, model, row_count}`
   - Enables future analytics without full observability stack

---

### Feature 6: Metrics & Observability (Phase 3)

**TL;DR**: Add Prometheus metrics for production monitoring and performance tracking.

#### Steps
1. Add `prometheus-fastapi-instrumentator` to `requirements.txt`
2. Instrument `main.py` with default HTTP metrics (latency, status codes)
3. Add custom metrics:
   - `mediquery_query_duration_seconds` (histogram) - total query time
   - `mediquery_llm_calls_total` (counter) - by model, by type (sql/insight/viz)
   - `mediquery_sql_retries_total` (counter) - by reason (syntax, empty, overflow)
   - `mediquery_cache_hits_total` (counter) - query plan cache effectiveness
4. Add `/metrics` endpoint for Prometheus scraping
5. Create Grafana dashboard template (optional)

---

## Implementation Phases

### Phase 1: Core Features (MVP)
| Feature | Priority | Complexity |
|---------|----------|------------|
| CSV Export | High | Low |
| SQL Reflexion Loop | High | Medium |
| 60s Timeout | High | Low |
| Fast Mode Toggle | Medium | Low |
| Multi-Tenant Isolation (cache/log separation) | High | Medium |

### Phase 2: Enhanced UX
| Feature | Priority | Complexity |
|---------|----------|------------|
| Real-Time Streaming (SSE) | Medium | High |
| Error Recovery (resume from last step) | Medium | Medium |
| User notification: "Something went wrong, looking into it..." | Medium | Low |
| LLM Token Tracking (if API supports) | Medium | Low |

### Phase 3: Observability
| Feature | Priority | Complexity |
|---------|----------|------------|
| Logging Standardization | Medium | Low |
| Query Plan Caching (exact match) | Medium | Medium |
| Prometheus Metrics | Low | Medium |

### Phase 4: Advanced Infrastructure
| Feature | Priority | Complexity |
|---------|----------|------------|
| User Abort (cancel query) | Low | Medium |
| Schema Caching | Low | Low |
| Redis for distributed caching | Low | Medium |
| Query Similarity Fuzzy Matching (90% threshold) | Low | Medium |
| LLM Token Tracking (fallback if not in Phase 2) | Low | Low |

### Phase 5: Growth & Optimization
| Feature | Priority | Complexity |
|---------|----------|------------|
| A/B Testing Framework (Reflexion vs single-shot) | Low | High |
| Rate Limiting (per-user query limits) | Medium | Medium |
| Feedback Loop (👍/👎 buttons) | Low | Low |

### Future Backlog
| Feature | Notes |
|---------|-------|
| Prompt Versioning | Track prompt templates to correlate success rates with changes |
| Query Complexity Scoring | Auto-detect complexity to choose fast mode vs full pipeline |
| Retry Backoff Strategy | Exponential backoff to reduce LLM rate limit pressure |
| Cost Budgets | Per-user/org LLM cost limits (depends on token tracking) |

---

### Further Considerations

1. **Schema Change Detection**: Automatically invalidate query plan cache when database schema changes (via checksum or migration hooks).
