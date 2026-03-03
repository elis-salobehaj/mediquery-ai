---
status: implemented
priority: High
date_created: 2026-01-28
date_updated: 2026-02-27
date_completed: 2026-02-27
related_files:
  - backend/services/langgraph_agent.py
  - backend/services/llm_agent.py
  - backend/schemas/agent_state.py
  - frontend/src/components/Chat/ChatInterface.tsx
  - docs/designs/langgraph_workflow.md
---

# Plan: LangGraph Workflow Refactor (Router + Evaluator-Optimizer)

> **Implementation Note (2026-02-27):** Implemented **partially** as the project evolved. Core routing, evaluator-optimizer loop, and streaming architecture shipped in the TypeScript backend migration and subsequent LLM routing optimization work. Remaining items in this document are retained as historical context and optional enhancements.

**Goal**: Refactor the Multi-Agent system to use a proper LangGraph Workflow with Routing and Evaluator-Optimizer patterns. This will enable streaming responses, state memory persistence, and Human-in-the-loop (Interrupts).

## Context
The current implementation (`backend/services/langgraph_agent.py`) uses a custom loop within a StateGraph. We need to transition to a more robust workflow pattern that separates concerns (Routing vs Solver) and leverages LangGraph's native features for streaming and interrupts.

## Architecture Patterns
1.  **Router**: Determines if the user query is about the *schema/metadata* (generic) or requires *data fetching* (SQL generation).
2.  **Evaluator-Optimizer**: For data questions, a loop of "Generate SQL -> Evaluate/Validate -> Refine" ensures high-quality SQL. **Evaluator** judges the *answer quality* and *user intent match*, not just SQL syntax.
3.  **Human-in-the-loop**: Interrupts allow the user to clarify ambiguity or approve sensitive operations (e.g., executing a costly query). Controlled via `ENABLE_HUMAN_INTERRUPTS` env var.
4.  **Pydantic-First**: All agents, tools, and state definitions must use Pydantic V2 for strict type validation.

## Tasks

### Phase 1: Foundation & State Definition
- [x] Define `AgentState` schema using **Pydantic V2** for integrity (tracking `patient_id`, `kpi_results`, `errors`).
- [x] Configure LangGraph checkpointing for memory persistence (Postgres/Redis/In-Memory).
- [ ] Implement Streaming generator for token-by-token response.
- [x] Add `ENABLE_HUMAN_INTERRUPTS` to `.env` and `Settings`.

### Phase 2: Router Agent
- [x] Implement `RouterAgent` (or Node) that classifies queries:
    - `SCHEMA`: Questions about available data/tables ("What data do you have?").
    - `DATA`: Questions requiring SQL ("Show me the top patients").
    - `OFF_TOPIC`: Questions unrelated to the dataset.
- [x] Create conditional edge routing logic based on classification.

### Phase 3: Meta/Domain Agent (Direct Answer)
- [x] Implement `MetaAgent` to answer schema-related questions AND general clinical domain questions ("Clinical Expert").
- [x] Ensure it can explain the data dictionary and column meanings, and provide domain context.

### Phase 4: Text-to-SQL Workflow (Evaluator-Optimizer)
- [x] Re-implement `SQLWriter` as the **Generator**.
- [x] Re-implement `Critic` as the **Evaluator** (Syntax + Semantic + Answer Quality check).
- [x] Implement the **Reflexion** loop (Optimizer) that feeds errors back to the Generator.
- [x] Add `UserReview` interrupt for ambiguous queries or destructive operations (toggleable).

### Phase 5: Frontend Streaming Adaptation
- [x] Update frontend to handle **server-sent events (SSE)** or streaming response from the new workflow.
- [x] **Remove artificial steps**: Strip out "Step 1/2/3" logic. Stream raw thoughts directly from each node.
- [x] **Node Attribution**: Visually distinguish which node (Router, SQLWriter, MetaAgent) is emitting the stream (Handled via log prefixes).

### Phase 6: Integration & Verification

#### Phase 6.1: Backend Integration Tests
- [x] Add integration tests in `backend/tests/test_integration_scenarios.py` covering:
    1.  "List all patients" (Expect workflow + streaming thoughts).
    2.  "What kind of data is in my database?" (Expect MetaAgent routing).
    3.  "What is lateral clinical?" (Expect MetaAgent routing).
    4.  "Show me the patients with highest DURATION for the past 6 months" (Expect SQL generation + data).

#### Phase 6.2: Browser Verification
- [/] Verify scenario 1: "List all patients" via browser (Results + Streaming).
- [ ] Verify scenario 2: "What kind of data...?" (MetaAgent).
- [ ] Verify scenario 3: "What is lateral clinical?" (MetaAgent).
- [ ] Verify scenario 4: "Highest DURATION patients..." (Complex SQL).
- [ ] Verify Interrupts (e.g., pause for user approval).
