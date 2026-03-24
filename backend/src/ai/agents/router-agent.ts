import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { Logger } from '@nestjs/common';
import { addThought } from '@/ai/common';
import { QuotaExceededException } from '@/ai/exceptions';
import { LLMService } from '@/ai/llm.service';
import { GraphState } from '@/ai/state';
import type { LangChainLLMResponse } from '@/common/types';
import { ConfigService } from '@/config/config.service';
import { AgentRole, Provider, TokenUsageService } from '@/token-usage/token-usage.service';

const logger = new Logger('RouterNode');

export interface RouterDeps {
  tokenUsageService: TokenUsageService;
  llmService: LLMService;
  config: ConfigService;
}

interface RouterDecision {
  decision: 'DATA' | 'DOMAIN_KNOWLEDGE' | 'OFF_TOPIC';
  thought: string;
}

function normalizeDecision(raw: string): 'DATA' | 'DOMAIN_KNOWLEDGE' | 'OFF_TOPIC' {
  const decision = raw.toUpperCase();
  if (decision.includes('DATA')) {
    return 'DATA';
  }
  if (decision.includes('DOMAIN_KNOWLEDGE') || decision.includes('SCHEMA')) {
    return 'DOMAIN_KNOWLEDGE';
  }
  if (decision.includes('OFF_TOPIC')) {
    return 'OFF_TOPIC';
  }
  return 'DATA';
}

function parseRouterResponse(content: string): RouterDecision {
  try {
    const parsed = JSON.parse(content) as {
      decision?: unknown;
      type?: unknown;
      thought?: unknown;
      reason?: unknown;
    };

    const rawDecision =
      typeof parsed.decision === 'string'
        ? parsed.decision
        : typeof parsed.type === 'string'
          ? parsed.type
          : content;

    const thought =
      typeof parsed.thought === 'string'
        ? parsed.thought
        : typeof parsed.reason === 'string'
          ? parsed.reason
          : `Classified query as ${normalizeDecision(rawDecision)}`;

    return {
      decision: normalizeDecision(rawDecision),
      thought,
    };
  } catch {
    return {
      decision: normalizeDecision(content),
      thought: `Classified query as ${normalizeDecision(content)}`,
    };
  }
}

/**
 * Router node: Classify user query intent.
 */
export async function routerNode(
  state: GraphState,
  deps: RouterDeps,
  overrides?: { provider?: string; model?: string },
): Promise<Partial<GraphState>> {
  // Fast mode: skip the router LLM call entirely and go straight to data query.
  if (state.fast_mode) {
    addThought(state, '⚡ Fast mode: (single-agent)');
    return { routing_decision: 'DATA' };
  }

  addThought(state, '🧭 Router: Analyzing user intent...');
  logger.log(
    `[ROUTER] request_id=${state.request_id || 'n/a'} fast_mode=${state.fast_mode ? 'true' : 'false'} query_len=${state.original_query.length}`,
  );

  const userId = state.user_id;

  // 1. Quota check
  if (userId) {
    const [canProceed, used, limit] = await deps.tokenUsageService.checkMonthlyLimit(userId);
    if (!canProceed) {
      const currentMonth = new Date().toISOString().slice(0, 7);
      throw new QuotaExceededException(userId, used, limit, currentMonth);
    }
  }

  try {
    // 2. LLM Selection (Navigator role is for routing)
    const llm = deps.llmService.createChatModel(
      overrides?.model || 'navigator',
      overrides?.provider,
    );

    const prompt = `Classify the following user query into exactly one category:
1. DATA - Query requires fetching data, rows, stats, or analysis from the database.
2. DOMAIN_KNOWLEDGE - Query asks about available tables, columns, data structure, or general domain information.
3. OFF_TOPIC - Query is unrelated to data or medical.

User Query: ${state.original_query}

Return strict JSON only:
{"decision":"DATA|DOMAIN_KNOWLEDGE|OFF_TOPIC","thought":"one short sentence explaining why"}`;

    const llmStartMs = Date.now();

    const response = await llm.invoke([new HumanMessage(prompt)]);
    const llmDurationMs = Date.now() - llmStartMs;

    // LangChain.js BaseMessage.content can be string or MessageContent[]
    const responseContent = (
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
    ).trim();

    const parsedDecision = parseRouterResponse(responseContent);

    // 3. Track Usage
    const usage = (response as LangChainLLMResponse).usage_metadata;
    if (userId && usage) {
      const provider = (overrides?.provider || deps.config.getActiveProvider()) as Provider;
      const model =
        overrides?.model || deps.config.getActiveModelForRole('navigator', overrides?.provider);

      await deps.tokenUsageService.logTokenUsage(
        userId,
        provider,
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        AgentRole.ROUTER,
        {
          node: 'router',
          duration_ms: llmDurationMs,
          attempt: state.attempt_count || 0,
          fast_mode: state.fast_mode || false,
          decision: parsedDecision.decision,
        },
        state.request_id,
      );
    }

    logger.log(
      `[ROUTER] request_id=${state.request_id || 'n/a'} decision=${parsedDecision.decision} thought="${parsedDecision.thought}"`,
    );

    addThought(state, `🧭 Router: ${parsedDecision.thought}`);
    addThought(state, `✅ Router: Classified as ${parsedDecision.decision}`);

    const updates: Partial<GraphState> = {
      routing_decision: parsedDecision.decision,
      thoughts: state.thoughts,
    };

    // 5. Add messages for non-DATA paths
    if (parsedDecision.decision === 'OFF_TOPIC') {
      updates.messages = [
        ...state.messages,
        new AIMessage({
          content: 'I can only help with questions about the Mediquery medical database.',
          name: 'router',
        }),
      ];
    }

    return updates;
  } catch (err) {
    if (err instanceof QuotaExceededException) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error(`Router error: ${errMsg}`, errStack);
    return {
      routing_decision: 'DATA',
      thoughts: state.thoughts,
    }; // Fallback
  }
}
