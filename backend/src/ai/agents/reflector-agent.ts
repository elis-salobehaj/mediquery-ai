import { Logger } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import { GraphState } from '@/ai/state';
import { addThought } from '@/ai/common';
import { QuotaExceededException } from '@/ai/exceptions';
import {
  TokenUsageService,
  Provider,
  AgentRole,
} from '@/token-usage/token-usage.service';
import { LLMService } from '@/ai/llm.service';
import { PromptService } from '@/ai/prompt.service';
import { ConfigService } from '@/config/config.service';
import type { LangChainLLMResponse } from '@/common/types';

const logger = new Logger('ReflectorNode');

export interface ReflectorDeps {
  promptService: PromptService;
  tokenUsageService: TokenUsageService;
  llmService: LLMService;
  config: ConfigService;
}

interface ReflectorContract {
  root_cause: string;
  fix: string;
  next_tables: string[];
  keep_or_replace_query: 'keep' | 'replace';
}

function parseReflectorContract(raw: string): ReflectorContract | null {
  let content = raw.trim();
  if (content.includes('```json')) {
    content = content.split('```json')[1].split('```')[0].trim();
  } else if (content.includes('```')) {
    content = content.split('```')[1].split('```')[0].trim();
  }

  try {
    const parsed = JSON.parse(content) as {
      root_cause?: unknown;
      fix?: unknown;
      next_tables?: unknown;
      keep_or_replace_query?: unknown;
    };

    const keepOrReplace =
      parsed.keep_or_replace_query === 'keep' ||
      parsed.keep_or_replace_query === 'replace'
        ? parsed.keep_or_replace_query
        : 'replace';

    return {
      root_cause:
        typeof parsed.root_cause === 'string'
          ? parsed.root_cause
          : 'unknown_root_cause',
      fix:
        typeof parsed.fix === 'string'
          ? parsed.fix
          : 'Regenerate SQL using only schema-supported tables/columns',
      next_tables: Array.isArray(parsed.next_tables)
        ? parsed.next_tables.map((table) => String(table))
        : [],
      keep_or_replace_query: keepOrReplace,
    };
  } catch {
    return null;
  }
}

/**
 * Add reflection to state based on validation failure.
 */
export async function reflectorNode(
  state: GraphState,
  deps: ReflectorDeps,
  overrides?: { provider?: string; model?: string },
): Promise<Partial<GraphState>> {
  const errorMsg = state.validation_result?.error || 'Unknown error';
  const generatedSql = state.generated_sql || '';
  const attemptNum = state.attempt_count || 0;

  const userId = state.user_id;
  if (userId) {
    const [canProceed, used, limit] =
      await deps.tokenUsageService.checkMonthlyLimit(userId);
    if (!canProceed) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      throw new QuotaExceededException(userId, used, limit, currentMonth);
    }
  }

  const reflectorConfig = deps.promptService.getPrompt('reflector_agent');
  const role = reflectorConfig?.role || 'Reflector';
  const instructions =
    reflectorConfig?.instructions ||
    'Provide root-cause guidance and next-step correction in strict JSON.';

  const llm = deps.llmService.createChatModel(
    overrides?.model || 'critic',
    overrides?.provider,
  );

  const prompt = `${role}

${instructions}

User Question: ${state.original_query}
Attempt Number: ${attemptNum}
Validation Error: ${errorMsg}
Current SQL:
${generatedSql || 'N/A'}

Critic Issues:
${JSON.stringify(state.validation_result?.issues || [], null, 2)}
Critic Fixes:
${JSON.stringify(state.validation_result?.fixes || [], null, 2)}

Return strict JSON only.`;

  let contract: ReflectorContract | null = null;
  try {
    const llmStartMs = Date.now();
    const response = await llm.invoke([new HumanMessage(prompt)]);
    const llmDurationMs = Date.now() - llmStartMs;
    const content =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    contract = parseReflectorContract(content);

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
        AgentRole.REFLECTOR,
        {
          node: 'reflector',
          duration_ms: llmDurationMs,
          attempt: attemptNum,
          error: errorMsg,
        },
        state.request_id,
      );
    }
  } catch (err) {
    logger.error(
      `Reflector LLM call failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  if (!contract) {
    contract = {
      root_cause: 'reflection_parse_failure',
      fix: 'Generate new SQL with strict schema table/column validation and read-only SELECT syntax.',
      next_tables: state.selected_tables || [],
      keep_or_replace_query: 'replace',
    };
  }

  const reflection = `Attempt ${attemptNum} failed (${contract.root_cause}): ${contract.fix}`;
  addThought(
    state,
    `🪞 Reflector: ${contract.fix} (root cause: ${contract.root_cause})`,
  );

  const reflections = [...(state.reflections || []), reflection];
  logger.log(
    `[REFLECTOR] Added reflection #${reflections.length}: ${reflection.slice(0, 150)}...`,
  );

  return {
    reflections,
    reflector_contract: contract,
    thoughts: state.thoughts,
  };
}
