/**
 * Shared types used across the application.
 * Centralised here to avoid duplication and satisfy @typescript-eslint/no-explicit-any.
 */

// ─── Auth ─────────────────────────────────────────────────────────────────

/** Shape of the JWT payload issued by AuthService and decoded by JwtAuthGuard. */
export interface JwtPayload {
  sub: string;
  id: string;
  username: string;
  role: string;
  iat?: number;
  exp?: number;
}

/** User object returned from AuthService.validateUser() and passed to AuthService.login(). */
export interface ValidatedUser {
  id: string;
  username: string;
  email: string | null;
  fullName: string | null;
  role: string;
  isActive: boolean | null;
}

// ─── LangChain / LLM ──────────────────────────────────────────────────────

/**
 * Token usage metadata attached to LangChain LLM responses.
 * Reflects the shape returned by @langchain/core BaseMessage.usage_metadata.
 */
export interface UsageMetadata {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
}

/** A LangChain-compatible response that may carry usage_metadata. */
export interface LangChainLLMResponse {
  usage_metadata?: UsageMetadata;
  content?: string | { text: string }[];
}

// ─── Database ─────────────────────────────────────────────────────────────

/** A single row returned by a raw MySQL KPI query. */
export type KpiRow = Record<string, string | number | boolean | null | Date>;

/** Structured result returned by DatabaseService.executeQuery(). */
export interface KpiQueryResult {
  columns: string[];
  data: KpiRow[];
  row_count: number;
}

// ─── Prompts / Semantic View ───────────────────────────────────────────────

/** Nested prompt dictionary loaded from system_prompts.yaml. */
export type PromptCategory = Record<string, string>;
export type PromptsSchema = Record<string, PromptCategory>;

/** Column definitions within a table entry in semantic_view.yaml. */
export interface SemanticViewColumn {
  description?: string;
  [k: string]: string | undefined;
}

/** A single table entry in the semantic view. */
export interface SemanticViewTable {
  description?: string;
  primary_key?: string;
  join_key?: string;
  important_notes?: string[];
  columns?: Record<string, string>;
  [k: string]: unknown;
}

/** Top-level shape of semantic_view.yaml. */
export interface SemanticView {
  database?: string;
  dialect?: string;
  hub_table?: string;
  hub_key?: string;
  reasoning?: string;
  tables?: Record<string, SemanticViewTable>;
  [k: string]: unknown;
}

// ─── JWT ───────────────────────────────────────────────────────────────────

/**
 * JWT signing algorithm — a subset of the jsonwebtoken Algorithm union.
 * Used to cast the string value from ConfigService to the typed signOptions field.
 */
export type JwtAlgorithm =
  | 'HS256'
  | 'HS384'
  | 'HS512'
  | 'RS256'
  | 'RS384'
  | 'RS512'
  | 'ES256'
  | 'ES384'
  | 'ES512'
  | 'PS256'
  | 'PS384'
  | 'PS512'
  | 'none';

// ─── Login form ────────────────────────────────────────────────────────────

/** Body shape posted to POST /api/v1/auth/token (OAuth2-like form). */
export interface LoginFormBody {
  username: string;
  password: string;
}
