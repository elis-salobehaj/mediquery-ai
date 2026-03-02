import type { BaseMessage } from '@langchain/core/messages';

export interface ScopedConversationMemory {
  active_persons: string[];
  active_timeframe?: string;
  active_clinical_intent?: string;
  preferred_clinical_units?: string;
  summary?: string;
  confidence: number;
  updated_at: string;
  expires_at?: string;
}

/**
 * Shared state for multi-agent SQL generation workflow.
 * Replicates the Python TypedDict GraphState.
 */
export interface GraphState {
  // Core fields
  messages: BaseMessage[];
  original_query: string;
  username?: string;
  user_id?: string;
  request_id?: string;

  // Routing & Planning
  routing_decision?: 'DATA' | 'DOMAIN_KNOWLEDGE' | 'OFF_TOPIC';
  query_plan?: string;

  // Schema Navigation
  selected_tables: string[];
  table_schemas: Record<string, string>;
  navigator_contract?: {
    supported: boolean;
    tables: string[];
    join_plan: string[];
    confidence: number;
    notes: string;
  };

  // SQL Generation
  generated_sql?: string;
  validation_result?: {
    valid: boolean;
    severity?: 'none' | 'low' | 'medium' | 'high';
    issues?: string[];
    fixes?: string[];
    error?: string;
    row_count?: number;
    warnings?: string[];
  };

  // Reflection & Iteration
  reflections: string[];
  reflector_contract?: {
    root_cause: string;
    fix: string;
    next_tables: string[];
    keep_or_replace_query: 'keep' | 'replace';
  };
  previous_sqls: string[];
  attempt_count: number;
  max_attempts: number;

  // Human-in-the-Loop
  human_feedback?: string;

  // Execution Control
  timeout_seconds: number;
  start_time: number;

  // UI Transparency
  thoughts: string[];

  // Mode Tracking
  agent_mode: string;
  /** When true the router skips its LLM call and routes directly to DATA, max_attempts is also capped at 1. */
  fast_mode?: boolean;

  // User-selected model from the UI dropdown (format: "provider/model-id")
  // Agents use this to override the default provider/model from env config.
  selected_provider?: string;
  selected_model_override?: string;

  // Scoped memory (Phase 5 kickoff)
  scoped_memory?: ScopedConversationMemory;

  // Token Tracking (for quota enforcement)
  input_tokens: number;
  output_tokens: number;
  cost_usd: number;
}

/**
 * Helper to initialize the default state
 */
export const createInitialState = (
  query: string,
  userId?: string,
  username?: string,
): GraphState => ({
  messages: [],
  original_query: query,
  user_id: userId,
  username: username,
  selected_tables: [],
  table_schemas: {},
  reflections: [],
  previous_sqls: [],
  attempt_count: 0,
  max_attempts: 3,
  timeout_seconds: 120,
  start_time: Date.now() / 1000,
  thoughts: [],
  agent_mode: 'multi',
  scoped_memory: {
    active_persons: [],
    confidence: 0,
    updated_at: new Date().toISOString(),
  },
  input_tokens: 0,
  output_tokens: 0,
  cost_usd: 0,
});
