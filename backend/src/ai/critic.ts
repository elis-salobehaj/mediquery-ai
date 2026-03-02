import { Logger } from '@nestjs/common';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { GraphState } from '@/ai/state';
import {
  addThought,
  enforceReadOnlySql,
  enforceSqlComplexity,
} from '@/ai/common';
import { QuotaExceededException } from '@/ai/exceptions';
import {
  TokenUsageService,
  Provider,
  AgentRole,
} from '@/token-usage/token-usage.service';
import { LLMService } from '@/ai/llm.service';
import { PromptService } from '@/ai/prompt.service';
import { DatabaseService } from '@/database/database.service';
import { ConfigService } from '@/config/config.service';
import type { LangChainLLMResponse } from '@/common/types';

const logger = new Logger('CriticNode');

export interface CriticDeps {
  dbService: DatabaseService;
  promptService: PromptService;
  tokenUsageService: TokenUsageService;
  llmService: LLMService;
  config: ConfigService;
}

interface CriticContract {
  valid: boolean;
  severity: 'none' | 'low' | 'medium' | 'high';
  issues: string[];
  fixes: string[];
}

interface SemanticIssueTriage {
  blockingIssues: string[];
  advisoryIssues: string[];
  shouldBlock: boolean;
}

function normalizeSemanticIssue(issue: string): string {
  return issue.replace(/\s+/g, ' ').trim();
}

function isLikelyAliasFalsePositive(issue: string): boolean {
  const lowered = issue.toLowerCase();
  if (!lowered.includes('does not exist')) {
    return false;
  }

  return (
    lowered.includes('correct column name is') ||
    lowered.includes('this exists') ||
    lowered.includes(' are valid') ||
    lowered.includes(' ✓')
  );
}

function isAdvisoryIssue(issue: string): boolean {
  const lowered = issue.toLowerCase();

  const advisorySignals = [
    'may ',
    'might ',
    'could ',
    'potentially',
    'ambiguous',
    'reasonable default',
    'low-concern',
    'low concern',
    'left join',
    'no where clause to exclude',
    'null',
  ];

  return advisorySignals.some((signal) => lowered.includes(signal));
}

function triageSemanticIssues(contract: CriticContract): SemanticIssueTriage {
  const normalizedIssues = Array.from(
    new Set(
      (contract.issues || []).map(normalizeSemanticIssue).filter(Boolean),
    ),
  );

  const blockingIssues: string[] = [];
  const advisoryIssues: string[] = [];

  for (const issue of normalizedIssues) {
    if (isLikelyAliasFalsePositive(issue) || isAdvisoryIssue(issue)) {
      advisoryIssues.push(issue);
      continue;
    }

    blockingIssues.push(issue);
  }

  const shouldBlock =
    !contract.valid &&
    (contract.severity === 'high' || contract.severity === 'medium') &&
    blockingIssues.length > 0;

  return { blockingIssues, advisoryIssues, shouldBlock };
}

function parseCriticContract(raw: string): CriticContract | null {
  let content = raw.trim();
  if (content.includes('```json')) {
    content = content.split('```json')[1].split('```')[0].trim();
  } else if (content.includes('```')) {
    content = content.split('```')[1].split('```')[0].trim();
  }

  try {
    const parsed = JSON.parse(content) as {
      valid?: unknown;
      severity?: unknown;
      issues?: unknown;
      fixes?: unknown;
    };

    const severity =
      parsed.severity === 'none' ||
      parsed.severity === 'low' ||
      parsed.severity === 'medium' ||
      parsed.severity === 'high'
        ? parsed.severity
        : 'none';

    return {
      valid: Boolean(parsed.valid),
      severity,
      issues: Array.isArray(parsed.issues)
        ? parsed.issues.map((issue) => String(issue))
        : [],
      fixes: Array.isArray(parsed.fixes)
        ? parsed.fixes.map((fix) => String(fix))
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * Critic: Validate SQL semantically and syntactically.
 */
export async function criticNode(
  state: GraphState,
  deps: CriticDeps,
  overrides?: { provider?: string; model?: string },
): Promise<Partial<GraphState>> {
  // 0. Timeout check
  if (Date.now() / 1000 - state.start_time > state.timeout_seconds) {
    addThought(state, 'Timeout reached, skipping Critic');
    return {};
  }

  addThought(state, '🔍 Critic: Validating SQL...');

  if (!state.generated_sql) {
    return {
      validation_result: {
        valid: false,
        severity: 'high',
        issues: ['No SQL generated'],
        fixes: ['Ensure SQL Writer returns a read-only SQL query'],
        error: 'No SQL generated',
        row_count: 0,
        warnings: [],
      },
    };
  }

  if (state.generated_sql === 'UNSUPPORTED_QUERY') {
    addThought(
      state,
      '🛑 Critic: Unsupported intent marked by upstream agents',
    );
    return {
      validation_result: {
        valid: false,
        severity: 'none',
        issues: ['Unsupported intent for current schema coverage'],
        fixes: ['Ask for supported medical KPI analyses'],
        error: 'UNSUPPORTED_INTENT',
        row_count: 0,
        warnings: [],
      },
      attempt_count: state.max_attempts,
    };
  }

  const readOnlyCheck = enforceReadOnlySql(state.generated_sql);
  if (!readOnlyCheck.allowed) {
    addThought(state, `🛑 Critic: ${readOnlyCheck.reason}`);
    return {
      validation_result: {
        valid: false,
        severity: 'high',
        issues: [readOnlyCheck.reason || 'Read-only enforcement failed'],
        fixes: ['Generate SELECT/WITH queries only'],
        error: 'READ_ONLY_POLICY_VIOLATION',
        row_count: 0,
        warnings: [],
      },
      attempt_count: state.max_attempts,
    };
  }

  const complexityCheck = enforceSqlComplexity(state.generated_sql);
  if (!complexityCheck.allowed) {
    addThought(
      state,
      `🛑 Critic: Query blocked by complexity policy - ${complexityCheck.issues.join('; ')}`,
    );
    return {
      validation_result: {
        valid: false,
        severity: 'high',
        issues: complexityCheck.issues,
        fixes: [
          'Reduce joins/UNION usage and add LIMIT for high-cardinality queries',
        ],
        error: 'QUERY_COMPLEXITY_LIMIT',
        row_count: 0,
        warnings: [],
      },
      attempt_count: state.max_attempts,
    };
  }

  try {
    // 1. Syntax validation via DatabaseService
    const validation = await deps.dbService.validateSql(state.generated_sql);

    // 2. Semantic validation via Critic LLM
    let criticContract: CriticContract = {
      valid: validation.valid,
      severity: validation.valid ? 'none' : 'high',
      issues: validation.valid
        ? []
        : [validation.error || 'SQL validation failed'],
      fixes: validation.valid
        ? []
        : ['Fix SQL syntax/schema issues and retry generation'],
    };

    if (validation.valid) {
      const semanticCritique = await getSemanticCritique(
        state,
        deps,
        overrides,
      );
      if (semanticCritique) {
        criticContract = semanticCritique;
      }

      const triagedIssues = triageSemanticIssues(criticContract);

      if (triagedIssues.advisoryIssues.length > 0) {
        validation.warnings.push(...triagedIssues.advisoryIssues);
        addThought(
          state,
          `⚠️ Critic: Advisory semantic notes - ${triagedIssues.advisoryIssues.join('; ')}`,
        );
      }

      if (triagedIssues.shouldBlock) {
        validation.valid = false;
        validation.error =
          triagedIssues.blockingIssues[0] || 'Semantic validation failed';
        addThought(
          state,
          `🔄 Critic: Found blocking semantic issues - ${triagedIssues.blockingIssues.join('; ')}`,
        );
      } else {
        addThought(
          state,
          `✅ Critic: SQL is valid (${validation.row_count || 0} rows${triagedIssues.advisoryIssues.length > 0 ? `, ${triagedIssues.advisoryIssues.length} advisory note(s)` : ', no semantic issues'})`,
        );
      }

      if (!validation.valid) {
        criticContract.issues = triagedIssues.blockingIssues;
      }
    } else {
      addThought(
        state,
        `❌ Critic: SQL validation failed - ${validation.error || 'Unknown error'}`,
      );
    }

    const msg = validation.valid
      ? `Critic: SQL is syntactically valid (returns ${validation.row_count ?? '?'} rows)`
      : `Critic: SQL validation failed - ${validation.error}`;

    return {
      validation_result: {
        valid: validation.valid,
        severity: criticContract.severity,
        issues: criticContract.issues,
        fixes: criticContract.fixes,
        error: validation.error || undefined,
        row_count: validation.row_count ?? undefined,
        warnings: validation.warnings,
      },
      thoughts: state.thoughts,
      messages: [
        ...state.messages,
        new AIMessage({ content: msg, name: 'critic' }),
      ],
    };
  } catch (err) {
    if (err instanceof QuotaExceededException) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error(`Critic error: ${errMsg}`, errStack);
    addThought(state, `⚠️ Critic error: ${errMsg}`);
    return {
      validation_result: {
        valid: false,
        severity: 'high',
        issues: [errMsg],
        fixes: ['Retry with stricter schema-constrained SQL'],
        error: `Validation error: ${errMsg}`,
        row_count: 0,
        warnings: [],
      },
    };
  }
}

/**
 * Use Critic LLM to validate semantic correctness.
 */
async function getSemanticCritique(
  state: GraphState,
  deps: CriticDeps,
  overrides?: { provider?: string; model?: string },
): Promise<CriticContract | null> {
  const userId = state.user_id;

  // 1. Quota check
  if (userId) {
    const [canProceed, used, limit] =
      await deps.tokenUsageService.checkMonthlyLimit(userId);
    if (!canProceed) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      throw new QuotaExceededException(userId, used, limit, currentMonth);
    }
  }

  const llm = deps.llmService.createChatModel(
    overrides?.model || 'critic',
    overrides?.provider,
  );
  const schemaContext = Object.entries(state.table_schemas || {})
    .map(([table, schema]) => `${table}: ${schema}`)
    .join('\n');

  const criticConfig = deps.promptService.getPrompt('critic');
  const role = criticConfig?.role || 'SQL Query Validator';
  const instructions =
    criticConfig?.instructions ||
    "Analyze if this SQL query correctly answers the user's question.";

  const prompt = `${role}

${instructions}

User Question: ${state.original_query}

Generated SQL:
\`\`\`sql
${state.generated_sql}
\`\`\`

Database Schema for selected tables:
${schemaContext}

Does this SQL correctly answer the question? 
Respond ONLY in JSON format:
{"valid": true/false, "severity": "none|low|medium|high", "issues": ["..."], "fixes": ["..."]}`;

  try {
    const llmStartMs = Date.now();
    const response = await llm.invoke([new HumanMessage(prompt)]);
    const llmDurationMs = Date.now() - llmStartMs;
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    const parsed = parseCriticContract(content);

    // Track usage
    const usage = (response as LangChainLLMResponse).usage_metadata;
    if (userId && usage) {
      const provider = (overrides?.provider ||
        deps.config.getActiveProvider()) as Provider;
      const model =
        overrides?.model ||
        deps.config.getActiveModelForRole('critic', overrides?.provider);

      await deps.tokenUsageService.logTokenUsage(
        userId,
        provider,
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        AgentRole.CRITIC,
        {
          node: 'critic',
          duration_ms: llmDurationMs,
          attempt: state.attempt_count || 0,
          parsed_valid: parsed?.valid ?? null,
          parsed_severity: parsed?.severity ?? null,
        },
        state.request_id,
      );
    }

    if (!parsed) {
      logger.warn(`Failed to parse Critic JSON: ${content}`);
    }
    return parsed;
  } catch (err) {
    logger.error(
      `Semantic critique error: ${err instanceof Error ? err.message : String(err)}`,
    );
    return null;
  }
}
