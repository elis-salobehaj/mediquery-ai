---
status: implemented
priority: medium
date_created: 2026-01-18
date_updated: 2026-02-27
date_completed: 2026-02-27
related_files:
  - backend/services/langgraph_agent.py
  - backend/services/llm_agent.py
depends_on:
    - docs/plans/implemented/langgraph-refactor.md
blocks: []
assignee: null
---

# Multi-Agent Reflexion Deep Dive: Implementation Plan

**Status**: ✅ Implemented (Project Evolved)

> **Implementation Note (2026-02-27):** This design has already been implemented in practice and evolved through the TypeScript LangGraph architecture, router/meta-agent split, critic-reflector loop, and guardrail/benchmark work. Keep this document as historical design context.

## Overview

This plan extends Phase 1's single-agent SQL Reflexion Loop with an optional **LangGraph-based multi-agent architecture** for complex queries. The system uses **hybrid routing with a user toggle** to choose between fast single-agent and thorough multi-agent paths.

**Target Use Case:** Scaling MediqueryAI to handle complex medical KPI datasets with 50+ tables, intricate joins, and domain-specific business logic.

---

## Architecture Comparison

### Current Single-Agent Flow (Phase 1)

```
User Query → [Semantic Retrieval] → [Plan Construction] → [SQL Generation] → [Validation]
                                            ↑                                      ↓
                                            └────── [Self-Reflection] ←───────────┘
```

**Characteristics:**
- Single LLM handles all stages
- Self-reflection (same model critiques itself)
- 60s timeout, max 3 retries
- ~200 LOC in `llm_agent.py`

### Proposed Multi-Agent Flow (LangGraph)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     LangGraph State Machine                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌───────────────┐   ┌───────────────┐   ┌───────────────┐         │
│   │ Schema Agent  │   │    SQL Agent  │   │  Critic Agent │         │
│   │ (Navigator)   │   │   (Writer)    │   │  (Validator)  │         │
│   │               │   │               │   │               │         │
│   │ - Table       │   │ - Query plan  │   │ - Semantic    │         │
│   │   selection   │   │   execution   │   │   validation  │         │
│   │ - Join path   │   │ - SQL syntax  │   │ - KPI logic   │         │
│   │   discovery   │   │ - Aggregations│   │   checking    │         │
│   └───────────────┘   └───────────────┘   └───────────────┘         │
│          │                    │                    │                 │
│          ▼                    ▼                    ▼                 │
│   ┌─────────────────────────────────────────────────────────┐       │
│   │              Shared State (AgentState)                   │       │
│   │  - messages: list[BaseMessage]                           │       │
│   │  - query_plan: str                                       │       │
│   │  - selected_tables: list[str]                            │       │
│   │  - generated_sql: str                                    │       │
│   │  - validation_result: ValidationResult                   │       │
│   │  - reflections: list[str]                                │       │
│   │  - attempt_count: int                                    │       │
│   └─────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

**Characteristics:**
- Specialized agents with focused responsibilities
- Cross-model critique (e.g., Claude critiques Gemini's SQL)
- Explicit state machine with conditional edges
- ~500-800 LOC in new `langgraph_agent.py`

---

## Tradeoff Analysis

| Aspect | Single-Agent (Current) | Multi-Agent (LangGraph) |
|--------|------------------------|-------------------------|
| **LLM Calls** | 1-4 per query | 5-10+ per query |
| **Latency** | 3-15s typical | 15-45s typical |
| **Cost** | Lower | 2-5x higher |
| **Schema Complexity** | ≤15 tables optimal | 15-100+ tables |
| **Error Recovery** | Limited (same model blind spots) | Better (diverse perspectives) |
| **Debugging** | Simple linear trace | LangSmith integration |
| **Best For** | Simple queries, low latency | Complex KPIs, high accuracy |

---

## Implementation Phases

### Phase A: Foundation (Week 1-2)

#### A1. Add LangGraph Dependencies

**File:** `backend/requirements.txt`

```
langgraph>=0.2.0
langchain-core>=0.3.0
```

#### A2. Create Agent State Schema

**File:** `backend/services/langgraph_agent.py`

```python
from typing import TypedDict, Annotated, Sequence
from langchain_core.messages import BaseMessage
import hospital

class AgentState(TypedDict):
    """Shared state for multi-agent SQL generation workflow."""
    messages: Annotated[Sequence[BaseMessage], hospital.add]
    original_query: str
    query_plan: str | None
    selected_tables: list[str]
    generated_sql: str | None
    validation_result: dict | None
    reflections: list[str]
    attempt_count: int
    max_attempts: int
    timeout_seconds: float
    start_time: float
```

#### A3. Implement Schema Navigator Agent

**Purpose:** Analyze query and select relevant tables/columns from complex schemas.

```python
def schema_navigator_node(state: AgentState) -> AgentState:
    """
    Agent 1: Schema Navigator
    - Analyzes natural language query
    - Identifies required tables and join paths
    - Handles 50+ table medical schemas
    """
    # Use existing retrieve_relevant_tables() as foundation
    # Enhanced with multi-hop join path discovery
    pass
```

#### A4. Implement SQL Writer Agent

**Purpose:** Generate SQL based on schema context and query plan.

```python
def sql_writer_node(state: AgentState) -> AgentState:
    """
    Agent 2: SQL Writer
    - Receives schema context from Navigator
    - Generates SQL following query plan
    - Specializes in complex aggregations and window functions
    """
    pass
```

#### A5. Implement Critic Agent

**Purpose:** Validate SQL semantically and provide actionable feedback.

```python
def critic_node(state: AgentState) -> AgentState:
    """
    Agent 3: Critic (uses different LLM for diverse perspective)
    - Validates SQL syntax via EXPLAIN
    - Checks semantic correctness (does SQL answer the question?)
    - Validates KPI business logic
    - Provides specific, actionable feedback
    """
    pass
```

---

### Phase B: LangGraph Workflow (Week 2-3)

#### B1. Define Graph Structure

```python
from langgraph.graph import StateGraph, END

def create_sql_agent_graph() -> StateGraph:
    """Create the multi-agent SQL generation workflow."""
    
    workflow = StateGraph(AgentState)
    
    # Add nodes
    workflow.add_node("schema_navigator", schema_navigator_node)
    workflow.add_node("sql_writer", sql_writer_node)
    workflow.add_node("critic", critic_node)
    workflow.add_node("reflect", reflect_node)
    
    # Define edges
    workflow.set_entry_point("schema_navigator")
    workflow.add_edge("schema_navigator", "sql_writer")
    workflow.add_edge("sql_writer", "critic")
    
    # Conditional edge: retry or finish
    workflow.add_conditional_edges(
        "critic",
        should_retry,
        {
            "retry": "reflect",
            "success": END,
            "max_attempts": END,
            "timeout": END
        }
    )
    
    workflow.add_edge("reflect", "sql_writer")
    
    return workflow.compile()
```

#### B2. Implement Conditional Routing

```python
def should_retry(state: AgentState) -> str:
    """Determine next step based on validation result."""
    import time
    
    # Check timeout
    elapsed = time.time() - state["start_time"]
    if elapsed > state["timeout_seconds"]:
        return "timeout"
    
    # Check attempt limit
    if state["attempt_count"] >= state["max_attempts"]:
        return "max_attempts"
    
    # Check validation result
    validation = state["validation_result"]
    if validation and validation.get("valid") and validation.get("row_count", 0) > 0:
        return "success"
    
    return "retry"
```

#### B3. Implement Reflection Node

```python
def reflect_node(state: AgentState) -> AgentState:
    """
    Generate actionable reflection from Critic feedback.
    This is passed back to SQL Writer for the next attempt.
    """
    pass
```

---

### Phase C: Hybrid Routing with Toggle (Week 3-4)

#### C1. Update API Models

**File:** `backend/main.py`

```python
class QueryRequest(BaseModel):
    query: str
    fast_mode: bool = False
    multi_agent: bool = False  # NEW: User toggle for multi-agent mode
    username: Optional[str] = None
    model: Optional[str] = None

class QueryResponse(BaseModel):
    # ... existing fields ...
    agent_mode: str  # "single" or "multi"
    agents_used: list[str] | None  # e.g., ["schema_navigator", "sql_writer", "critic"]
```

#### C2. Implement Router Logic

**File:** `backend/main.py`

```python
async def route_query(request: QueryRequest, db_service, llm_agent):
    """Route query to appropriate agent based on toggle."""
    
    if request.multi_agent:
        # Use LangGraph multi-agent pipeline
        from services.langgraph_agent import create_sql_agent_graph
        
        graph = create_sql_agent_graph()
        result = await graph.ainvoke({
            "original_query": request.query,
            "messages": [],
            "attempt_count": 0,
            "max_attempts": 3,
            "timeout_seconds": 120,  # Longer timeout for multi-agent
            "start_time": time.time(),
            # ... other initial state
        })
        
        return build_multi_agent_response(result)
    else:
        # Use existing single-agent flow
        return await existing_query_handler(request, db_service, llm_agent)
```

#### C3. Frontend Toggle UI

**File:** `frontend/src/components/ChatBox.tsx`

```tsx
// Add alongside existing Fast Mode toggle
<label className="flex items-center gap-2">
  <input
    type="checkbox"
    checked={multiAgentMode}
    onChange={(e) => setMultiAgentMode(e.target.checked)}
    className="toggle"
  />
  <span>Multi-Agent Mode</span>
  <Tooltip content="Use specialized AI agents for complex queries. Slower but more accurate for large schemas." />
</label>
```

#### C4. localStorage Persistence

```tsx
// Save preference
useEffect(() => {
  localStorage.setItem('multiAgentMode', JSON.stringify(multiAgentMode));
}, [multiAgentMode]);

// Load preference
const [multiAgentMode, setMultiAgentMode] = useState(() => {
  const saved = localStorage.getItem('multiAgentMode');
  return saved ? JSON.parse(saved) : false;
});
```

---

### Phase D: medical Schema Support (Week 4-5)

#### D1. Schema Complexity Profiler

**File:** `backend/services/database.py`

```python
def profile_schema_complexity() -> dict:
    """
    Analyze schema complexity for routing decisions.
    Returns metrics useful for multi-agent decision making.
    """
    return {
        "table_count": len(tables),
        "total_columns": sum(len(t.columns) for t in tables),
        "max_join_depth": calculate_max_join_depth(),
        "has_window_functions": detect_window_function_candidates(),
        "kpi_patterns_detected": detect_kpi_patterns(),
    }
```

#### D2. medical KPI Patterns

**File:** `backend/data/oil_gas_patterns.json`

```json
{
  "kpi_patterns": {
    "production_efficiency": {
      "tables": ["patients", "production_daily", "downtime_events"],
      "join_strategy": "patients → production_daily (patient_id), LEFT JOIN downtime_events",
      "typical_aggregations": ["SUM(oil_bbl)", "AVG(uptime_pct)", "COUNT(DISTINCT patient_id)"]
    },
    "opex_breakdown": {
      "tables": ["cost_centers", "transactions", "patients", "fields"],
      "join_strategy": "cost_centers → transactions → patients → fields",
      "typical_aggregations": ["SUM(amount) GROUP BY category", "running totals"]
    },
    "patient_performance": {
      "tables": ["patients", "production_daily", "targets", "benchmarks"],
      "join_strategy": "...",
      "typical_aggregations": ["variance analysis", "percentile rankings"]
    }
  }
}
```

#### D3. Pattern-Aware Schema Navigator

Enhance the Schema Navigator agent to recognize medical KPI patterns and pre-select appropriate table subsets.

---

## Testing Strategy

### Unit Tests

**File:** `backend/tests/test_langgraph_agent.py`

```python
class TestMultiAgentWorkflow:
    def test_schema_navigator_selects_relevant_tables(self):
        """Schema Navigator correctly identifies tables for complex query."""
        pass
    
    def test_sql_writer_generates_valid_sql(self):
        """SQL Writer produces syntactically valid SQL."""
        pass
    
    def test_critic_catches_semantic_errors(self):
        """Critic identifies when SQL doesn't answer the question."""
        pass
    
    def test_reflexion_loop_improves_sql(self):
        """Subsequent attempts improve based on Critic feedback."""
        pass
    
    def test_timeout_handling(self):
        """Workflow respects timeout and returns partial result."""
        pass
    
    def test_hybrid_routing_toggle(self):
        """multi_agent=True routes to LangGraph, False to single-agent."""
        pass
```

### Integration Tests

```python
class TestMultiAgentIntegration:
    def test_complex_kpi_query_end_to_end(self):
        """Full workflow for 'Show production efficiency by patient last quarter'."""
        pass
    
    def test_fallback_to_single_agent_on_error(self):
        """Graceful degradation if LangGraph fails."""
        pass
```

---

## Dependencies

```
# backend/requirements.txt additions
langgraph>=0.2.0
langchain-core>=0.3.0
langchain-google-genai>=2.0.0  # For Gemini as SQL Writer
langchain-anthropic>=0.2.0     # For Claude as Critic (optional)
```

---

## Configuration

```python
# backend/services/config.py (new file or add to existing)

MULTI_AGENT_CONFIG = {
    "timeout_seconds": 120,
    "max_attempts": 3,
    "schema_navigator_model": "gemini-1.5-flash",
    "sql_writer_model": "gemini-1.5-flash",
    "critic_model": "claude-3-5-sonnet",  # Different model for diverse perspective
    "enable_langsmith_tracing": True,
}
```

---

## Rollout Plan

| Phase | Duration | Deliverable |
|-------|----------|-------------|
| **A: Foundation** | Week 1-2 | Agent nodes, state schema, dependencies |
| **B: LangGraph Workflow** | Week 2-3 | Compiled graph with conditional routing |
| **C: Hybrid Toggle** | Week 3-4 | API + Frontend toggle, localStorage |
| **D: medical Patterns** | Week 4-5 | Schema profiler, KPI pattern library |
| **E: Testing & Polish** | Week 5-6 | Unit/integration tests, error handling |

---

## Future Iterations (Deferred)

The following are explicitly deferred to future iterations:

1. **Cost Management**
   - Per-query token budgets
   - Early termination on budget exhaustion
   - Cost estimation before execution

2. **Advanced Schema Caching**
   - Redis-backed schema metadata cache
   - Automatic cache invalidation on schema changes

3. **Query Plan Caching**
   - Semantic similarity matching for cached plans
   - LRU eviction with configurable TTL

4. **Observability**
   - LangSmith integration for multi-agent traces
   - Prometheus metrics for agent performance

---

## Success Metrics

| Metric | Single-Agent Baseline | Multi-Agent Target |
|--------|----------------------|-------------------|
| Accuracy (complex queries) | ~70% | 85%+ |
| First-attempt success | ~50% | 70%+ |
| Max schema complexity | 15 tables | 100+ tables |
| User satisfaction (complex) | TBD | Higher than single-agent |

---

## References

- [Reflexion: Language Agents with Verbal Reinforcement Learning](https://arxiv.org/abs/2303.11366) (Shinn et al., 2023)
- [DIN-SQL: Decomposed In-Context Learning with Self-Correction](https://arxiv.org/abs/2304.11015) (Pourreza & Rafiei, NeurIPS 2023)
- [LangGraph Multi-Agent Workflows](https://blog.langchain.dev/langgraph-multi-agent-workflows/)
- [LangGraph Documentation](https://langchain-ai.github.io/langgraph/)
