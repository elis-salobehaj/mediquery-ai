# Modular Backend Refactor - Quick Reference

This document describes the modern TypeScript (`backend`) codebase using NestJS and `@langchain/langgraph`. (For the old Python codebase, see `MODULAR_BACKEND_REFERENCE_LEGACY.md`).

## Directory Structure

```
backend/src/
├── main.ts                          # Execution entrypoint
├── app.module.ts                    # Root module
│
├── ai/                              # Core AI Orchestration
│   ├── ai.module.ts                 # NestJS AI module
│   ├── graph.ts                     # LangGraph orchestration (GraphBuilder)
│   ├── state.ts                     # GraphState interface definition
│   ├── router.ts                    # routerNode (query classification)
│   ├── meta-agent.ts                # metaAgentNode (schema & domain questions)
│   ├── schema-navigator.ts          # schemaNavigatorNode (table selection)
│   ├── sql-writer.ts                # sqlWriterNode (SQL generation)
│   ├── critic.ts                    # criticNode (validation)
│   ├── reflector.ts                 # reflectorNode (self-correction hints)
│   ├── common.ts                    # Shared functions (cleanSql, autoCorrectTableNames)
│   │
│   ├── llm.service.ts               # LLM Provider factory (Bedrock, Gemini, Local)
│   ├── insight.service.ts           # Post-query NL summary generation
│   ├── visualization.service.ts     # Chart selection logic
│   ├── prompt.service.ts            # Dynamic Prompt Management
│   │
│   ├── queries.controller.ts        # REST/SSE streaming endpoints for queries
│   └── config.controller.ts         # API for showing available models
│
├── config/                          # Typed configuration
│   ├── env.config.ts                # Zod schema definitions
│   └── config.service.ts            # Config dependency injection
│
└── utils/                           # General utilities
```

## Quick Start (Graph Execution)

### 1. Build the Graph

```typescript
import { GraphBuilder } from './ai/graph';
import { LLMService } from './ai/llm.service';

// Inside a NestJS Service/Controller using Dependency Injection:
constructor(
  private readonly graphBuilder: GraphBuilder
) {}

const graph = this.graphBuilder.build();
```

### 2. Create Initial State

```typescript
const initialState = {
  original_query: "Show top 10 patients by DURATION",
  user_id: "user-uuid",
  messages: [],
  start_time: Date.now() / 1000,
  max_attempts: 3,
  timeout_seconds: 120,
  fast_mode: false,
};
```

### 3. Run the Graph (Streaming)

```typescript
const stream = await graph.streamEvents(initialState, {
  version: "v2",
  runName: "Mediquery-AI-Execution",
});

for await (const event of stream) {
  if (event.event === "on_chat_model_stream") {
    // Stream tokens
  } else if (event.event === "on_chain_end") {
    // Node completed
  }
}
```

## Key Components

### GraphState Definition

```typescript
export interface GraphState {
  // Core
  original_query: string;
  messages: BaseMessage[];
  routing_decision?: "DATA" | "DOMAIN_KNOWLEDGE" | "OFF_TOPIC";

  // Navigation
  selected_tables?: string[];
  table_schemas?: Record<string, string>;

  // SQL
  generated_sql?: string;
  validation_result?: {
    valid: boolean;
    issues?: string[];
    row_count?: number;
  };

  // Reflection/Retries
  reflections?: string[];
  previous_sqls?: string[];
  attempt_count: number;
  max_attempts: number;

  // Options
  fast_mode?: boolean;
  selected_provider?: string;
  selected_model_override?: string;

  // Meta
  start_time: number;
  timeout_seconds: number;
  user_id?: string;
  thoughts?: string[];
}
```

### LLM Provider Selection

```typescript
// Inside a Node (like sql-writer.ts)
const llm = deps.llmService.createChatModel("sql_writer", options.provider);
```

Priority is configured via `.env` and `ConfigService`.

## Workflow Overview

### Router Decision Flow

```
user_query → routerNode → {
    "DATA" → schemaNavigatorNode → sqlWriterNode → criticNode → {
        "valid: true" → END
        "valid: false" → reflectorNode → sqlWriterNode (retry loop)
        "max_attempts" → END
        "timeout" → END
    }
    "DOMAIN_KNOWLEDGE" → metaAgentNode → END
    "OFF_TOPIC" → END
}
```

### State Transitions

1. **Entry**: Start node routes to `router`.
2. **Router**: Sets `routing_decision`.
3. **Navigator**: Identifies tables and adds DDL schemas to `table_schemas`.
4. **Writer**: Writes `generated_sql` based on schema. Increments `attempt_count`.
5. **Critic**: Runs `validation_result` check against logic and DB parsing.
6. **Conditional**:
   - Valid → Ends flow.
   - Invalid → Goes to `reflector`, builds hints, returns to `sql_writer`.

## Migrating Notes (Legacy Python to Node.js)

- **LangGraph.js replaces LangGraph Python**: Identical concepts (nodes, conditional edges), but `app.addNode` accepts pure functions rather than classes mapped through methods.
- **`GraphState` Channels**: LangGraph.js requires strict reducers for state updates (e.g. `value: (x, y) => x.concat(y)` to push history).
- **Tool calls vs Parsing**: The TypeScript rewrite uses native LLM `withStructuredOutput()` extensively.

## Common Patterns

### Adding a New Node

1. Create `backend/src/ai/new-agent.ts`.
2. Export `export async function newAgentNode(state: GraphState, deps: Deps): Promise<Partial<GraphState>>`.
3. In `graph.ts`, register the node: `w.addNode('new_agent', (state) => newAgentNode(state, deps));`.
4. Add edges connecting it: `w.addEdge('prev_node', 'new_agent')`.

### Event Streaming in NestJS

The backend relies entirely on Server-Sent Events (SSE) via `Observable` for streaming thought blocks and validation messages cleanly into `QueriesController`.
