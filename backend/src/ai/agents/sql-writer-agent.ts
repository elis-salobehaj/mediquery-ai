import { Logger } from '@nestjs/common';
import {
  HumanMessage,
  SystemMessage,
  AIMessage,
} from '@langchain/core/messages';
import { GraphState } from '@/ai/state';
import {
  addThought,
  cleanSql,
  autoCorrectTableNames,
  extractTablesFromSql,
} from '@/ai/common';
import { QuotaExceededException } from '@/ai/exceptions';
import {
  TokenUsageService,
  Provider,
  AgentRole,
} from '@/token-usage/token-usage.service';
import type { LangChainLLMResponse } from '@/common/types';
import { LLMService } from '@/ai/llm.service';
import { PromptService } from '@/ai/prompt.service';
import { DatabaseService } from '@/database/database.service';
import { ConfigService } from '@/config/config.service';
import { formatMemoryContext, formatMemoryThought } from '@/ai/memory-context';

const logger = new Logger('SQLWriterNode');

export interface SQLWriterDeps {
  dbService: DatabaseService;
  promptService: PromptService;
  tokenUsageService: TokenUsageService;
  llmService: LLMService;
  config: ConfigService;
}

interface SQLWriterResponse {
  sql: string;
  thought?: string;
  table_strategy?: string;
}

function parseSqlWriterResponse(raw: string): SQLWriterResponse {
  const trimmed = raw.trim();

  try {
    const parsed = JSON.parse(trimmed) as {
      sql?: unknown;
      thought?: unknown;
      table_strategy?: unknown;
    };

    if (typeof parsed.sql === 'string') {
      return {
        sql: parsed.sql,
        thought:
          typeof parsed.thought === 'string' ? parsed.thought : undefined,
        table_strategy:
          typeof parsed.table_strategy === 'string'
            ? parsed.table_strategy
            : undefined,
      };
    }
  } catch {
    // Fallback to raw SQL parsing below
  }

  return { sql: trimmed };
}

/**
 * SQL Writer: Generate SQL from schema context.
 */
export async function sqlWriterNode(
  state: GraphState,
  deps: SQLWriterDeps,
  overrides?: { provider?: string; model?: string },
): Promise<Partial<GraphState>> {
  // 0. Timeout check
  if (Date.now() / 1000 - state.start_time > state.timeout_seconds) {
    addThought(state, 'Timeout reached, skipping SQL Writer');
    return {};
  }

  const attempt = (state.attempt_count || 0) + 1;
  addThought(state, `🔨 SQL Writer: Generating SQL (Attempt ${attempt})`);
  logger.log(
    `[SQL_WRITER] request_id=${state.request_id || 'n/a'} attempt=${attempt} selected_tables=${(state.selected_tables || []).length}`,
  );

  try {
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
      overrides?.model || 'sql_writer',
      overrides?.provider,
    );

    const navigatorContract = state.navigator_contract;
    if (navigatorContract && navigatorContract.supported === false) {
      addThought(
        state,
        '🛑 SQL Writer: Navigator marked query unsupported; skipping SQL generation',
      );
      return {
        generated_sql: 'UNSUPPORTED_QUERY',
        attempt_count: attempt,
        thoughts: state.thoughts,
        messages: [
          ...state.messages,
          new AIMessage({
            content: `SQL Writer skipped SQL generation because navigator reported unsupported intent: ${navigatorContract.notes}`,
            name: 'sql_writer',
          }),
        ],
      };
    }

    // 2. Build Context
    const fullSchema = await deps.dbService.getSchema();
    const schemaContext = Object.values(state.table_schemas || {})
      .filter((s) => !!s)
      .join('\n\n');
    const navigatorContext = navigatorContract
      ? JSON.stringify(navigatorContract, null, 2)
      : 'null';

    let reflectionsContext = '';
    if (state.reflections && state.reflections.length > 0) {
      reflectionsContext =
        '\n\nPrevious attempts failed with these issues:\n' +
        state.reflections.map((ref, i) => `${i + 1}. ${ref}`).join('\n');
    }

    let queryPlanContext = '';
    if (state.query_plan) {
      queryPlanContext = `\n\nQuery Plan:\n${state.query_plan}`;
    }

    const memoryContext = formatMemoryContext(state.scoped_memory);
    addThought(state, formatMemoryThought(state.scoped_memory));

    const sqlWriterConfig = deps.promptService.getPrompt('sql_writer');
    const role = sqlWriterConfig?.role || 'OMOP SQL Writer';
    const instructions =
      sqlWriterConfig?.instructions ||
      'Generate PostgreSQL SQL queries for OMOP CDM v5.4.';
    const dialect = sqlWriterConfig?.dialect || 'postgresql';

    const systemPrompt = `${role}

${instructions}

=== MASTER DATABASE MAP (ALL VALID TABLES) ===
${fullSchema}
==============================================

=== FOCUS TABLES (NAVIGATOR SELECTED) ===
${schemaContext}

=== NAVIGATOR CONTRACT ===
${navigatorContext}

!!! CRITICAL: TABLE NAMES ARE CASE-SENSITIVE AND MUST BE EXACT !!!
!!! DO NOT USE ANY TABLE NAME NOT LISTED IN THE "MASTER DATABASE MAP" !!!

${queryPlanContext}
${reflectionsContext}

=== SCOPED CONVERSATION MEMORY ===
${memoryContext}

${
  state.reflections && state.reflections.length > 0
    ? `
=== CRITICAL FEEDBACK FROM PREVIOUS ATTEMPTS ===
You have made ${state.reflections.length} previous attempts that FAILED.
You MUST NOT generate the same SQL or make the same mistakes again.
READ THE REFLECTIONS ABOVE CAREFULLY and generate a DIFFERENT approach.
===============================================
`
    : ''
}

Rules:
1. Return strict JSON only with keys: "sql", "thought", and optional "table_strategy"
2. "thought" must be one concise sentence describing your SQL strategy
3. "sql" must contain ONLY the SQL query text
4. Do NOT include markdown code fences like \`\`\`sql
5. Use proper JOIN syntax when combining tables
6. Handle NULL values appropriately
7. Use aggregations (SUM, AVG, COUNT) when appropriate
8. Do NOT include semicolons at the end
9. For complex queries, use CTEs (WITH clause) for clarity
10. Start directly with SELECT or WITH only (read-only SQL)
11. ALWAYS use the exact table names from the schema above - do NOT invent or modify table names
12. Target dialect: ${dialect}`;

    let userContent = `Question: ${state.original_query}\n\nREMINDER: You have the full database map above. Use standard table names even if not in Focus list.`;

    if (state.reflections && state.reflections.length > 0) {
      userContent += `\n\n⚠️ THIS IS RETRY ATTEMPT #${state.reflections.length + 1}. Your previous ${state.reflections.length} attempt(s) FAILED. You MUST generate DIFFERENT SQL this time based on the feedback above. DO NOT repeat the same mistake!`;
    }

    // 3. Generate SQL
    const llmStartMs = Date.now();
    const response = await llm.invoke([
      new SystemMessage(systemPrompt),
      new HumanMessage(userContent),
    ]);
    const llmDurationMs = Date.now() - llmStartMs;

    const rawResponse =
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content);
    const parsed = parseSqlWriterResponse(rawResponse);
    let sql = cleanSql(parsed.sql);

    if (parsed.thought) {
      addThought(state, `🧠 SQL Writer: ${parsed.thought}`);
    }
    if (parsed.table_strategy) {
      addThought(state, `🗂️ SQL Writer: ${parsed.table_strategy}`);
    }

    if (sql.toUpperCase() === 'UNSUPPORTED_QUERY') {
      addThought(
        state,
        '🛑 SQL Writer: Returned UNSUPPORTED_QUERY per output contract',
      );
      return {
        generated_sql: 'UNSUPPORTED_QUERY',
        previous_sqls: [...(state.previous_sqls || []), 'UNSUPPORTED_QUERY'],
        attempt_count: attempt,
        thoughts: state.thoughts,
        messages: [
          ...state.messages,
          new AIMessage({
            content: 'SQL Writer returned UNSUPPORTED_QUERY',
            name: 'sql_writer',
          }),
        ],
      };
    }

    // 4. Deduplication check
    const previousSqls = state.previous_sqls || [];
    if (previousSqls.includes(sql)) {
      logger.warn(`Generated DUPLICATE SQL on attempt ${attempt}`);
      addThought(
        state,
        `⚠️ SQL Writer: Generated duplicate SQL (attempt ${attempt}), adding note to reflections`,
      );
      state.reflections = [
        ...(state.reflections || []),
        `CRITICAL: Attempt ${attempt} generated THE SAME SQL as a previous attempt. You are repeating yourself! Generate something COMPLETELY DIFFERENT.`,
      ];
    }

    // 5. Auto-correct table names
    const validTables = new Set(Object.keys(state.table_schemas || {}));
    const { correctedSql, correctionsMade } = autoCorrectTableNames(
      sql,
      validTables,
    );
    if (correctionsMade.length > 0) {
      addThought(
        state,
        `🔧 SQL Writer: Auto-corrected table names: ${correctionsMade.join(', ')}`,
      );
      sql = correctedSql;
    }

    // 6. Update State
    const tablesInSql = extractTablesFromSql(sql, validTables);
    const tablesUsedStr =
      tablesInSql.size > 0
        ? Array.from(tablesInSql).sort().join(', ')
        : 'none detected';
    addThought(
      state,
      `✅ SQL Writer: Generated SQL (${sql.length} chars), using tables: ${tablesUsedStr}`,
    );

    // 7. Track Usage
    const usage = (response as LangChainLLMResponse).usage_metadata;
    if (userId && usage) {
      const provider = (overrides?.provider ||
        deps.config.getActiveProvider()) as Provider;
      const model =
        overrides?.model ||
        deps.config.getActiveModelForRole('sql_writer', overrides?.provider);

      await deps.tokenUsageService.logTokenUsage(
        userId,
        provider,
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        AgentRole.SQL_WRITER,
        {
          node: 'sql_writer',
          duration_ms: llmDurationMs,
          attempt,
          selected_table_count: validTables.size,
          sql_table_count: tablesInSql.size,
          sql_tables: Array.from(tablesInSql),
        },
        state.request_id,
      );
    }

    return {
      generated_sql: sql,
      previous_sqls: [...previousSqls, sql],
      attempt_count: attempt,
      thoughts: state.thoughts,
      messages: [
        ...state.messages,
        new AIMessage({
          content: `SQL Writer generated query:\n\`\`\`sql\n${sql}\n\`\`\``,
          name: 'sql_writer',
        }),
      ],
    };
  } catch (err) {
    if (err instanceof QuotaExceededException) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error(`SQL Writer error: ${errMsg}`, errStack);
    addThought(state, `⚠️ SQL Writer error: ${errMsg}`);
    return {
      generated_sql: undefined,
      attempt_count: attempt,
    };
  }
}
