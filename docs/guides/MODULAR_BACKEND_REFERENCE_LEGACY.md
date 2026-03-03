# Modular Backend Refactor - Quick Reference (Legacy Python)

> **⚠️ DEPRECATED**: This document describes the legacy Python (`backend-py-legacy`) codebase. The primary backend has been migrated to TypeScript/NestJS. See `docs/plans/active/typescript_backend_migration.md`.

## New Directory Structure

```
backend/app/
├── __init__.py                      # Package exports (create_graph, get_compiled_graph)
├── graph.py                         # LangGraph orchestration (GraphBuilder)
│
├── core/                            # Core Infrastructure
│   ├── __init__.py
│   ├── state.py                     # GraphState (Pydantic V2 model)
│   ├── llm_provider.py              # LLMFactory (multi-provider abstraction)
│   └── prompt_loader.py             # PromptManager (YAML caching)
│
├── services/                        # Business Logic
│   ├── __init__.py
│   ├── sql_generator.py             # SQLGeneratorService (SQL + reflexion)
│   ├── insight_generator.py         # InsightGeneratorService (NL summaries)
│   ├── visualization.py             # VisualizationService (chart selection)
│   └── semantic_engine.py           # SemanticEngineService (LlamaIndex)
│
├── agents/                          # LangGraph Nodes
│   ├── __init__.py
│   ├── common.py                    # Shared utilities (clean_sql, etc.)
│   ├── router.py                    # router_node (query classification)
│   ├── meta_agent.py                # meta_agent_node (schema questions)
│   ├── schema_navigator.py          # schema_navigator_node (table selection)
│   ├── sql_writer.py                # sql_writer_node (SQL generation)
│   └── critic.py                    # critic_node (validation)
│
├── utils/                           # Cross-cutting Utilities
│   ├── __init__.py
│   └── token_tracking.py            # Token tracking helpers
│
└── prompts/                         # YAML Prompt Templates
    ├── system_prompts.yaml          # Agent system prompts
    └── semantic_view.yaml           # Semantic retrieval config
```

## Quick Start

### 1. Import the Graph

```python
from app.graph import create_graph

# With dependencies
graph = create_graph(
    db_service=db_service,
    token_tracker=token_tracker,
    provider="bedrock"  # Optional override
)
```

### 2. Create Initial State

```python
from app.core.state import GraphState
import time

state = GraphState(
    original_query="Show top 10 patients by DURATION",
    user_id=user_uuid,
    username="john_doe",
    start_time=time.time(),
    max_attempts=2,
    timeout_seconds=120
)
```

### 3. Run the Graph

```python
# Sync execution
result = graph.invoke(state.model_dump())

# Async streaming
async for chunk in graph.astream(state.model_dump()):
    print(chunk)
```

## Key Components

### GraphState (Pydantic V2)

```python
state = GraphState(
    # Core fields
    original_query="...",
    user_id=UUID("..."),
    routing_decision="DATA",  # DATA, SCHEMA, OFF_TOPIC

    # Schema navigation
    selected_tables=["patients", "lab_results"],
    table_schemas={"patients": "CREATE TABLE ..."},

    # SQL generation
    generated_sql="SELECT ...",
    validation_result={"valid": True, "row_count": 10},

    # Reflection
    reflections=["Attempt 1 failed: ..."],
    previous_sqls=["SELECT * FROM ..."],
    attempt_count=0,
    max_attempts=2,

    # Token tracking
    input_tokens=1500,
    output_tokens=500,
    cost_usd=0.0045
)
```

### LLM Provider Selection

```python
from app.core.llm_provider import get_llm_for_role

# Automatic provider selection
sql_writer_llm = get_llm_for_role("sql_writer", temperature=0.0)
navigator_llm = get_llm_for_role("navigator", temperature=0.0)
critic_llm = get_llm_for_role("critic", temperature=0.3)

# Provider override
llm = get_llm_for_role("base", provider="anthropic")
```

### Services

```python
from app.services.sql_generator import SQLGeneratorService
from app.services.insight_generator import InsightGeneratorService
from app.services.visualization import VisualizationService

# SQL generation with reflexion
sql_service = SQLGeneratorService(token_tracker, provider)
sql = sql_service.generate_sql(
    user_query="Show patients with DURATION > 100",
    schema_str=schema,
    user_id=user_id
)

# Insight generation
insight_service = InsightGeneratorService(token_tracker, provider)
insight = insight_service.generate_insight(
    user_query=query,
    data={"data": rows, "row_count": 10},
    user_id=user_id
)

# Visualization recommendation
vis_service = VisualizationService(token_tracker, provider)
chart_type = vis_service.determine_visualization(
    user_query=query,
    data={"data": rows, "columns": cols, "row_count": 10},
    user_id=user_id
)
```

## Testing

### Unit Tests (Individual Components)

```bash
# Test imports
uv run python -c "from app.core.state import GraphState; print('OK')"
uv run python -c "from app.graph import create_graph; print('OK')"

# Run integration test
uv run python tests/test_modular_integration.py
```

### Integration Tests (Full Workflow)

```bash
# After main.py integration (Phase 5 complete)
uv run pytest tests/test_langgraph_agent.py -v
uv run pytest tests/test_integration_scenarios.py -v
uv run pytest tests/test_quota_enforcement.py -v
```

## Workflow

### Router Decision Flow

```
user_query → router_node → {
    "DATA" → schema_navigator → sql_writer → critic → {
        "success" → END
        "retry" → sql_writer (with reflection)
        "max_attempts" → END
        "timeout" → END
    }
    "SCHEMA" → meta_agent → END
    "OFF_TOPIC" → END
}
```

### State Transitions

1. **Entry**: `routing_decision = "DATA"` (default)
2. **Router**: Sets `routing_decision` based on query
3. **Navigator**: Populates `selected_tables`, `table_schemas`
4. **Writer**: Sets `generated_sql`, increments `attempt_count`
5. **Critic**: Sets `validation_result`
6. **Conditional**:
   - Valid → END
   - Invalid → Add to `reflections`, retry Writer

## Configuration

### Environment Variables

```bash
# Provider selection (priority: Bedrock > Gemini > Anthropic > Local)
USE_BEDROCK=true
USE_GEMINI=false
USE_ANTHROPIC=true
USE_LOCAL_MODEL=false

# Model selection
BEDROCK_SQL_WRITER_MODEL=global.anthropic.claude-sonnet-4-5-20250929-v1:0
BEDROCK_NAVIGATOR_MODEL=global.anthropic.claude-haiku-4-5-20251001-v1:0
BEDROCK_CRITIC_MODEL=global.anthropic.claude-haiku-4-5-20251001-v1:0
```

### Settings Access

```python
from config import settings

# Always use settings.*, never os.getenv()
provider = settings.active_provider  # "bedrock", "gemini", "anthropic", "local"
sql_model = settings.sql_writer_model
db_url = settings.database_url
```

## Migration Guide (For Phase 5)

### Before (Old Monolithic)

```python
from services.langgraph_agent import MultiAgentSQLGenerator
from services.llm_agent import llm_agent

multi_agent = MultiAgentSQLGenerator(
    db_service, llm_agent, config
)
result = multi_agent.process_query(query, user_id)
```

### After (New Modular)

```python
from app.graph import create_graph
from app.core.state import GraphState
import time

graph = create_graph(db_service, token_tracker, provider)
state = GraphState(
    original_query=query,
    user_id=user_id,
    start_time=time.time(),
    max_attempts=2,
    timeout_seconds=120
)
result = graph.invoke(state.model_dump())
```

## Benefits

- ✅ **Modularity**: 17 focused modules vs 2 monolithic files
- ✅ **Testability**: Unit test individual components
- ✅ **Maintainability**: Each module < 300 lines
- ✅ **Scalability**: Easy to add new agents/services
- ✅ **Type Safety**: Pydantic V2 validation
- ✅ **DRY**: Eliminated ~400-500 lines of duplicate code

## Common Patterns

### Adding a New Agent

1. Create `app/agents/new_agent.py`
2. Define `new_agent_node(state, dependencies...) -> Dict[str, Any]`
3. Add to `app/graph.py`: `workflow.add_node("new_agent", self._wrap_new_agent)`
4. Wire with edges: `workflow.add_edge("prev_node", "new_agent")`

### Adding a New Service

1. Create `app/services/new_service.py`
2. Define class with `__init__(token_tracker, provider)`
3. Import in agent: `from app.services.new_service import NewService`
4. Use in agent node: `service = NewService(token_tracker, provider)`

### Token Tracking Pattern

```python
from app.utils.token_tracking import extract_usage_metadata, log_token_usage

response = llm.invoke(messages)
usage = extract_usage_metadata(response)

if user_id and token_tracker:
    log_token_usage(
        token_tracker, user_id, provider, model,
        "agent_role", usage["input_tokens"], usage["output_tokens"]
    )
```

---

**Last Updated**: 2026-02-01
**Status**: Phases 1-4 Complete, Phase 5 In Progress
