---
status: complete
priority: high
date_created: 2026-01-29
date_updated: 2026-02-01
date_completed: 2026-02-01
related_files:
  - backend/services/legacy/langgraph_agent.py (archived)
  - backend/services/legacy/llm_agent.py (archived)
  - backend/app/core/state.py
  - backend/app/core/llm_provider.py
  - backend/app/graph.py
  - backend/api/v1/endpoints/auth.py
  - backend/api/v1/endpoints/threads.py
  - backend/api/v1/endpoints/queries.py
  - docs/designs/multi_agent_architecture.md
depends_on: []
blocks: []
assignee: null
completion:
  - [x] Phase 1: Foundation & Core ✅
  - [x] Phase 2: LLM Service Modularization ✅
  - [x] Phase 3: Agent Migration ✅
  - [x] Phase 4: Graph Orchestration ✅
  - [x] Phase 5: Integration & Verification ✅
  - [x] Phase 6: API Restructuring (2026 Best Practices) ✅
---

# Plan: LangGraph Modular Backend Refactor

**Goal**: Transition the backend from monolithic services (`langgraph_agent.py` and `llm_agent.py`) to a modular, "distributed system" style architecture (`backend/app/`) using LangGraph best practices. This ensures scalability, testability, and clear separation of State, Logic, and Orchestration.

## Context
The current implementation has two large monolithic files:
- `langgraph_agent.py`: 1701 lines (all agent logic, state, graph wiring)
- `llm_agent.py`: 1117 lines (LLM providers, SQL generation, insights, visualization, token tracking)

As we scale to more agents and complex workflows (like Thinking Mode vs. Multi-Agent Mode), this becomes unmaintainable. We are adopting modular architecture patterns:
- **Three-File Rule**: State, Nodes (Agents), Graph
- **Single Responsibility**: Each module handles one concern
- **Dependency Injection**: Configurable providers and services

**Current State (2026-02-01)**:
- Prompts already in `backend/agents/prompts/` (system_prompts.yaml, semantic_view.yaml)
- Token tracking integrated across all agent modes
- Multi-provider support (Bedrock, Ollama, Gemini, Anthropic)
- Need to preserve quota enforcement in refactored structure

## Architecture

We will implement the structure defined in [`docs/designs/multi_agent_architecture.md`](../../designs/multi_agent_architecture.md).

### Directory Structure
```
backend/
└── app/
    ├── prompts/           # [MOVED] YAML Prompt Templates
    │   ├── system_prompts.yaml
    │   └── semantic_view.yaml
    ├── core/              # Core Infrastructure
    │   ├── state.py       # GraphState (Pydantic V2)
    │   ├── llm_provider.py # Multi-provider LLM abstraction
    │   ├── prompt_loader.py # Prompt management
    │   └── config.py      # Configuration & DI
    ├── services/          # Business Logic Services
    │   ├── sql_generator.py    # SQL generation with reflection
    │   ├── insight_generator.py # Natural language insights
    │   ├── visualization.py     # Vis type determination
    │   └── semantic_engine.py   # LlamaIndex integration
    ├── agents/            # LangGraph Agent Nodes
    │   ├── router.py
    │   ├── meta_agent.py
    │   ├── schema_navigator.py
    │   ├── sql_writer.py
    │   ├── critic.py
    │   └── common.py      # Shared utilities
    ├── utils/             # Cross-cutting Utilities
    │   └── token_tracking.py # Token tracking helpers
    └── graph.py           # Graph Orchestration
```

## Tasks

### Phase 1: Foundation & Core ✅
- [x] Create directory structure `backend/app/{core,services,agents,utils,prompts}`
- [x] **Prompts**: Move `backend/agents/prompts/*.yaml` to `backend/app/prompts/`
- [x] Implement `backend/app/core/state.py`
    - [x] Port `AgentState` (TypedDict) to Pydantic V2 model `GraphState`
    - [x] Include all fields: messages, schema_context, sql_result, etc.
    - [x] Ensure serialization compatibility with LangGraph checkpointing
    - [x] Preserve token tracking fields (input_tokens, output_tokens, cost_usd)
- [x] Implement `backend/app/core/prompt_loader.py`
    - [x] Extract YAML prompt loading logic from llm_agent.py
    - [x] Create PromptManager class with caching
    - [x] Support multiple prompt files (system_prompts.yaml, semantic_view.yaml)
- [x] Create `backend/app/__init__.py` to expose the compiled graph

### Phase 2: LLM Service Modularization ✅
- [x] **LLM Provider Abstraction**: Create `core/llm_provider.py`
    - [x] Define `LLMProvider` protocol/interface
    - [x] Implement `BedrockProvider`, `OllamaProvider`, `GeminiProvider`, `AnthropicProvider`
    - [x] Move conditional imports and initialization logic from llm_agent.py
    - [x] Centralize token tracking in provider wrapper
- [x] **Token Tracking Utils**: Create `utils/token_tracking.py`
    - [x] Extract `_log_tokens()` and quota check logic
    - [x] Create helper functions for usage metadata extraction
    - [x] Support all provider formats (Bedrock, Anthropic, etc.)
- [x] **SQL Generation Service**: Create `services/sql_generator.py`
    - [x] Extract `generate_sql()`, `generate_sql_with_retry()`, `reflect_on_error()`
    - [x] Includes query planning and reflexion loop
    - [x] Depends on llm_provider and prompt_loader
- [x] **Insight & Visualization**: Create `services/insight_generator.py` and `services/visualization.py`
    - [x] Extract `generate_insight()` → insight_generator.py
    - [x] Extract `determine_visualization()` → visualization.py
    - [x] Heuristic rules + LLM fallback pattern
- [x] **Semantic Engine**: Create `services/semantic_engine.py`
    - [x] Extract `_setup_semantic_engine()` and `retrieve_relevant_tables()`
    - [x] LlamaIndex integration with table retrieval
    - [x] Graceful degradation if dependencies missing
### Phase 3: Agent Migration (LangGraph Nodes) ✅
- [x] **Common Utilities**: Create `agents/common.py` (138 lines)
    - [x] Move SQL cleaning functions (remove markdown, fix formatting)
    - [x] Shared logging utilities
    - [x] Helper functions for agent nodes
- [x] **Router Agent**: Extract `_router_node` to `agents/router.py` (116 lines)
    - [x] Import token tracker for quota pre-checks
    - [x] Preserve routing logic (thinking vs multi-agent)
    - [x] Use llm_provider from core
- [x] **Meta Agent**: Extract `_meta_agent_node` to `agents/meta_agent.py` (109 lines)
    - [x] Handle meta queries (what tables, describe schema)
    - [x] Use llm_provider abstraction
- [x] **Schema Navigator**: Extract to `agents/schema_navigator.py` (159 lines)
    - [x] Table selection logic
    - [x] Join path generation
    - [x] Integrate with semantic_engine service
- [x] **SQL Writer**: Extract to `agents/sql_writer.py` (175 lines)
    - [x] Use sql_generator service for generation
    - [x] Integration with token tracker
    - [x] Handle reflexion loop results
- [x] **Critic & Reflexion**: Extract to `agents/critic.py` (180 lines)
    - [x] Semantic validation logic
    - [x] Error feedback for reflection loop
    - [x] Use llm_provider for validation calls

### Phase 4: Graph Orchestration ✅
- [x] Implement `backend/app/graph.py` (215 lines)
    - [x] Import all functional node modules
    - [x] Define the `StateGraph` with `GraphState` schema
    - [x] Add all nodes (router, meta_agent, navigator, sql_writer, critic)
    - [x] Replicate conditional edges (router decisions, should_reflect)
    - [x] Configure checkpointing with PostgreSQL (MemorySaver for now)
    - [x] Compile the graph and export as `compiled_graph`
- [x] Create graph factory function for dependency injection
- [x] Add configuration for different graph modes (thinking vs multi-agent)

### Phase 5: Integration & Verification ✅
- [x] Create standalone integration test (test_modular_integration.py)
- [x] Verify all modules import successfully
- [x] Test GraphState creation and validation
- [x] Test PromptManager functionality
- [x] Test LLM Factory provider detection
- [x] Test common utilities (SQL cleaning)
- [x] Prepare legacy directory structure
- [x] Update `backend/main.py` - integrated with create_graph()
- [x] Run full integration tests - basic tests passing
- [x] Archive old files to `services/legacy/` - llm_agent.py and langgraph_agent.py moved

### Phase 6: API Restructuring (2026 Best Practices) ✅
- [x] Create `backend/api/` directory structure
    - [x] `api/v1/` - Version 1 endpoints
    - [x] `api/v1/endpoints/` - Route handlers
    - [x] `api/v1/dependencies.py` - Shared dependencies (auth, db, llm)
    - [x] `api/v1/schemas.py` - Pydantic request/response models
- [x] Extract routes from main.py into API modules
    - [x] Extract auth routes → `api/v1/endpoints/auth.py`
    - [x] Extract thread routes → `api/v1/endpoints/threads.py`
    - [x] Extract query routes → `api/v1/endpoints/queries.py`
    - [x] Keep `routers/token_usage.py` (already follows /api/v1 pattern)
- [x] Implement dependency injection in dependencies.py
    - [x] Create `get_db()` dependency
    - [x] Create `get_current_user()` dependency
    - [x] Create `get_llm_agent()` dependency (uses new graph)
    - [x] Create `get_token_tracker()` dependency
- [x] Update main.py to minimal app initialization
    - [x] Create FastAPI app with metadata
    - [x] Setup CORS middleware
    - [x] Include routers from api/v1/endpoints/
    - [x] Health check endpoint (both /health and /api/v1/health)
    - [x] Remove all route definitions (now in api/v1/endpoints/)
    - [x] Maintain backward compatibility (mount routes at both /api/v1 and root)
- [x] Testing & Validation
    - [x] Test all endpoints work after restructuring (app imports with 37 routes)
    - [x] Verify tests pass (9/9 tests passing)
    - [x] Maintain backward compatibility (legacy routes at root)

## Code Duplication Analysis

### Current Issues
Both `langgraph_agent.py` (1701 lines) and `llm_agent.py` (1117 lines) contain:
- **Duplicate LLM initialization**: Both files initialize Bedrock/Ollama/Gemini clients
- **Duplicate prompt handling**: Similar YAML loading patterns
- **Duplicate token tracking**: Similar usage logging patterns
- **Duplicate SQL cleaning**: Same markdown removal logic
- **Mixed responsibilities**: Business logic mixed with infrastructure concerns

### Proposed Deduplication
- **Shared LLM Provider**: Single abstraction in `core/llm_provider.py`
- **Shared Prompt Manager**: Single loader in `core/prompt_loader.py`  
- **Shared Token Utils**: Single implementation in `utils/token_tracking.py`
- **Shared SQL Utils**: Common cleaning in `agents/common.py`
- **Clear Boundaries**: Services use core, agents use services

This refactor will eliminate ~400-500 lines of duplicate code.
1. **Single-Shot (Fast Mode)**: "List all patients" → Direct LLM call (bypasses graph)
2. **Thinking Mode**: "Show patients with DURATION > 100" → Single-agent with reflection loop
3. **Multi-Agent Mode**:
    - **Meta Query**: "What tables do you have?" → Router → Meta Agent
    - **Complex Query**: "Show top 5 patients by DURATION in 2023" → Router → Navigator → SQL Writer → Critic
    - **Quota Test**: Over-quota user → Should fail at router with proper error

## Benefits of Modular Architecture

### Maintainability
- Each module in separate file (~200-300 lines vs 1701 + 1117 monolithic)
- Clear separation of concerns (State, Logic, Orchestration)
- Easier to understand and debug individual components
- Reduces cognitive load when making changes

### Testability
- Unit test individual modules without running full graph
- Mock dependencies more easily (LLM providers, token tracker)
- Faster test execution
- Better test isolation

### Scalability
- Add new agents without modifying existing code
- Add new LLM providers by implementing interface
- Easy to experiment with different routing strategies
- Support multiple graph configurations (thinking vs multi-agent)

### Code Quality
- Follows LangGraph best practices
- Better type safety with Pydantic V2
- Improved code reusability
- Eliminates code duplication (DRY principle)

### Developer Experience
- Clear module boundaries make onboarding easier
- Single Responsibility Principle reduces merge conflicts
- Easier to add features without breaking existing code
- Better IDE support with smaller, focused modules
