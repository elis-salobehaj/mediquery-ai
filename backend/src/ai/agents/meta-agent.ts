import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { Logger } from '@nestjs/common';
import { addThought } from '@/ai/common';
import { QuotaExceededException } from '@/ai/exceptions';
import { LLMService } from '@/ai/llm.service';
import { GraphState } from '@/ai/state';
import type { LangChainLLMResponse } from '@/common/types';
import { ConfigService } from '@/config/config.service';
import { DatabaseService } from '@/database/database.service';
import { AgentRole, Provider, TokenUsageService } from '@/token-usage/token-usage.service';

const logger = new Logger('MetaAgentNode');

export interface MetaAgentDeps {
  dbService: DatabaseService;
  tokenUsageService: TokenUsageService;
  llmService: LLMService;
  config: ConfigService;
}

interface MetaAgentResponse {
  answer: string;
  thought?: string;
}

function parseMetaAgentResponse(raw: string): MetaAgentResponse {
  const content = raw.trim();

  try {
    const parsed = JSON.parse(content) as {
      answer?: unknown;
      thought?: unknown;
    };
    if (typeof parsed.answer === 'string') {
      return {
        answer: parsed.answer,
        thought: typeof parsed.thought === 'string' ? parsed.thought : undefined,
      };
    }
  } catch {
    // Fallback to plain-text answer
  }

  return { answer: content };
}

/**
 * Meta Agent: Answers questions about schema or general medical domain knowledge.
 */
export async function metaAgentNode(
  state: GraphState,
  deps: MetaAgentDeps,
  overrides?: { provider?: string; model?: string },
): Promise<Partial<GraphState>> {
  addThought(state, '🤖 MetaAgent: Answering domain/schema question...');
  logger.log(
    `[META_AGENT] request_id=${state.request_id || 'n/a'} query_len=${state.original_query.length}`,
  );

  try {
    const userId = state.user_id;

    // 1. Quota check
    if (userId) {
      const [canProceed, used, limit] = await deps.tokenUsageService.checkMonthlyLimit(userId);
      if (!canProceed) {
        const currentMonth = new Date().toISOString().slice(0, 7);
        throw new QuotaExceededException(userId, used, limit, currentMonth);
      }
    }

    // 2. Gather schema info
    const tables = await deps.dbService.getAllTableNames();
    const tableSchemas: Record<string, string> = {};
    for (const tableName of tables) {
      const schema = await deps.dbService.getTableSchema(tableName);
      if (schema.length > 0) {
        const columnsStr = schema.map(([col, dtype]) => `${col} ${dtype}`).join(', ');
        tableSchemas[tableName] = `CREATE TABLE ${tableName} (${columnsStr})`;
      }
    }

    const schemaContext = Object.entries(tableSchemas)
      .map(([table, schema]) => `${table}: ${schema}`)
      .join('\n');

    const prompt = `You are an OMOP clinical data expert and database schema specialist.
The user has asked a question about the data or the medical domain.
You have access to the following database schema:

${schemaContext}

User Question: ${state.original_query}

Your Goal:
1. Answer the user's question directly and professionally.
2. If they ask about "what data you have", summarize the tables and what they represent.
3. If they ask a general medical question (e.g. "What is hypertension?"), explain it using concise clinical language.
4. Do NOT generate SQL code. Provide a natural language explanation.

Return strict JSON only:
{"thought":"one short sentence on how you approached this","answer":"final user-facing response"}`;

    const llm = deps.llmService.createChatModel(overrides?.model || 'base', overrides?.provider);
    const response = await llm.invoke([new HumanMessage(prompt)]);
    const rawResponse = (
      typeof response.content === 'string' ? response.content : JSON.stringify(response.content)
    ).trim();
    const parsed = parseMetaAgentResponse(rawResponse);
    const answer = parsed.answer;

    // 3. Track Usage
    const usage = (response as LangChainLLMResponse).usage_metadata;
    if (userId && usage) {
      const provider = (overrides?.provider || deps.config.getActiveProvider()) as Provider;
      const model =
        overrides?.model || deps.config.getActiveModelForRole('base', overrides?.provider);

      await deps.tokenUsageService.logTokenUsage(
        userId,
        provider,
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        AgentRole.BASE,
      );
    }

    if (parsed.thought) {
      addThought(state, `🤖 MetaAgent: ${parsed.thought}`);
    }
    addThought(state, `✅ MetaAgent: Provided answer (${answer.length} chars)`);

    return {
      messages: [...state.messages, new AIMessage({ content: answer, name: 'meta_agent' })],
    };
  } catch (err) {
    if (err instanceof QuotaExceededException) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error(`MetaAgent error: ${errMsg}`, errStack);
    addThought(state, `⚠️ MetaAgent error: ${errMsg}`);
    return {
      messages: [
        ...state.messages,
        new AIMessage({
          content: 'I encountered an error trying to answer your question.',
          name: 'meta_agent',
        }),
      ],
    };
  }
}
