import { Logger } from '@nestjs/common';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { GraphState } from '@/ai/state';
import { addThought } from '@/ai/common';
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

const logger = new Logger('SchemaNavigatorNode');

export interface NavigatorDeps {
  dbService: DatabaseService;
  promptService: PromptService;
  tokenUsageService: TokenUsageService;
  llmService: LLMService;
  config: ConfigService;
}

interface NavigatorContract {
  supported: boolean;
  tables: string[];
  join_plan: string[];
  confidence: number;
  notes: string;
  thought?: string;
}

const OMOP_FACT_TABLES = new Set([
  'visit_occurrence',
  'condition_occurrence',
  'drug_exposure',
  'measurement',
  'procedure_occurrence',
  'observation',
  'condition_era',
  'drug_era',
]);

const CLINICAL_SIGNAL_TOKENS = new Set([
  'diagnosis',
  'diagnoses',
  'condition',
  'conditions',
  'drug',
  'drugs',
  'medication',
  'medications',
  'visit',
  'encounter',
  'measurement',
  'lab',
  'vital',
  'procedure',
  'observation',
  'era',
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);
}

function computeTableScore(
  queryTokens: Set<string>,
  tableName: string,
  tableSchemaRows: Array<[string, string]>,
): number {
  const nameTokens = new Set(tokenize(tableName));
  const columnTokens = new Set(
    tableSchemaRows.flatMap(([columnName]) => tokenize(columnName)),
  );

  let score = 0;
  for (const token of queryTokens) {
    if (nameTokens.has(token)) {
      score += 5;
    }
    if (columnTokens.has(token)) {
      score += 2;
    }
  }

  const joinedName = tableName.toLowerCase();
  for (const token of queryTokens) {
    if (joinedName.includes(token)) {
      score += 1;
    }
  }

  if (joinedName === 'concept') {
    for (const token of queryTokens) {
      if (CLINICAL_SIGNAL_TOKENS.has(token)) {
        score += 3;
      }
    }
  }

  return score;
}

function requiresConceptTable(tables: string[]): boolean {
  return tables.some((table) => OMOP_FACT_TABLES.has(table));
}

function enforceConceptTableSelection(
  selectedTables: string[],
  allTables: string[],
): string[] {
  const unique = Array.from(new Set(selectedTables));
  const conceptAvailable = allTables.includes('concept');

  if (
    conceptAvailable &&
    requiresConceptTable(unique) &&
    !unique.includes('concept')
  ) {
    unique.push('concept');
  }

  return unique;
}

async function retrieveCandidateTables(
  userQuery: string,
  allTables: string[],
  deps: NavigatorDeps,
): Promise<string[]> {
  const queryTokens = new Set(tokenize(userQuery));
  const scored = await Promise.all(
    allTables.map(async (tableName) => {
      const schema = await deps.dbService.getTableSchema(tableName);
      return {
        tableName,
        score: computeTableScore(queryTokens, tableName, schema),
      };
    }),
  );

  scored.sort((left, clinicht) => clinicht.score - left.score);

  const minCandidates = Math.min(4, allTables.length);
  const maxCandidates = Math.min(8, allTables.length);
  const positive = scored
    .filter((entry) => entry.score > 0)
    .slice(0, maxCandidates);
  if (positive.length >= minCandidates) {
    return positive.map((entry) => entry.tableName);
  }

  return scored.slice(0, maxCandidates).map((entry) => entry.tableName);
}

function parseNavigatorSelection(
  content: string,
  allTables: string[],
): { contract: NavigatorContract; selected: string[] } {
  const valid = new Set(allTables);

  try {
    const parsed = JSON.parse(content) as {
      supported?: boolean;
      tables?: unknown;
      join_plan?: unknown;
      confidence?: unknown;
      notes?: unknown;
      thought?: unknown;
    };
    const supported = parsed?.supported !== false;
    const joinPlan = Array.isArray(parsed?.join_plan)
      ? parsed.join_plan.map((item) => String(item))
      : [];
    const confidence =
      typeof parsed?.confidence === 'number' ? parsed.confidence : 0;
    const notes = typeof parsed?.notes === 'string' ? parsed.notes : '';
    const thought =
      typeof parsed?.thought === 'string' ? parsed.thought : undefined;

    if (Array.isArray(parsed?.tables)) {
      const tables = parsed.tables
        .map((table) => String(table).trim())
        .filter((table) => valid.has(table));
      return {
        contract: {
          supported,
          tables,
          join_plan: joinPlan,
          confidence,
          notes,
          thought,
        },
        selected: supported ? tables : [],
      };
    }

    return {
      contract: {
        supported,
        tables: [],
        join_plan: joinPlan,
        confidence,
        notes,
        thought,
      },
      selected: [],
    };
  } catch {
    // Fallback to CSV parsing below
  }

  const selected = content
    .split(',')
    .map((table) => table.trim())
    .filter((table) => valid.has(table));

  return {
    contract: {
      supported: true,
      tables: selected,
      join_plan: [],
      confidence: 0,
      notes: 'Parsed from non-JSON navigator output',
      thought: 'Selected tables using fallback parser from non-JSON output',
    },
    selected,
  };
}

/**
 * Schema Navigator: Select relevant tables for the query.
 */
export async function schemaNavigatorNode(
  state: GraphState,
  deps: NavigatorDeps,
  overrides?: { provider?: string; model?: string },
): Promise<Partial<GraphState>> {
  // 0. Timeout check
  if (Date.now() / 1000 - state.start_time > state.timeout_seconds) {
    addThought(state, 'Timeout reached, skipping Schema Navigator');
    return {};
  }

  addThought(
    state,
    '🗺️  Schema Navigator: Analyzing query and selecting tables...',
  );
  logger.log(
    `[NAVIGATOR] request_id=${state.request_id || 'n/a'} query_len=${state.original_query.length}`,
  );

  try {
    // 1. Semantic retrieval (Skipped for now, using LLM-based fallback)
    // 2. LLM-based table selection
    const { selectedTables, contract, candidateTables } =
      await llmTableSelection(state, deps, overrides);

    // 3. Get schemas for selected tables
    const tableSchemas: Record<string, string> = {};
    for (const tableName of selectedTables) {
      const schema = await deps.dbService.getTableSchema(tableName);
      if (schema.length > 0) {
        const columnsStr = schema
          .map(([col, dtype]) => `${col} ${dtype}`)
          .join(', ');
        tableSchemas[tableName] = `CREATE TABLE ${tableName} (${columnsStr})`;
      }
    }

    const tableListStr = selectedTables.join(', ');
    const totalColumns = Object.values(tableSchemas).reduce(
      (acc, s) => acc + s.split(',').length,
      0,
    );
    const schemaSummary = `${selectedTables.length} tables with ${totalColumns} total columns`;

    if (candidateTables.length > 0) {
      addThought(
        state,
        `🗺️ Navigator shortlisted ${candidateTables.length} candidate tables before reranking`,
      );
    }

    if (contract.thought) {
      addThought(state, `🗺️ Navigator: ${contract.thought}`);
    } else if (contract.notes) {
      addThought(state, `🗺️ Navigator: ${contract.notes}`);
    }

    addThought(
      state,
      `✅ Navigator selected: ${tableListStr} (${schemaSummary}) from ${candidateTables.length} candidates`,
    );

    return {
      selected_tables: selectedTables,
      navigator_contract: contract,
      table_schemas: tableSchemas,
      thoughts: state.thoughts,
      messages: [
        ...state.messages,
        new AIMessage({
          content: `Schema Navigator selected ${selectedTables.length} relevant tables: ${tableListStr}\n\nSchema details:\n${schemaSummary}`,
          name: 'schema_navigator',
        }),
      ],
    };
  } catch (err) {
    if (err instanceof QuotaExceededException) {
      throw err;
    }
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error(`Schema Navigator error: ${errMsg}`, errStack);
    addThought(state, `⚠️ Schema Navigator error: ${errMsg}`);
    return {
      selected_tables: [],
      table_schemas: {},
    };
  }
}

/**
 * LLM-based table selection fallback.
 */
async function llmTableSelection(
  state: GraphState,
  deps: NavigatorDeps,
  overrides?: { provider?: string; model?: string },
): Promise<{
  selectedTables: string[];
  contract: NavigatorContract;
  candidateTables: string[];
}> {
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
    overrides?.model || 'navigator',
    overrides?.provider,
  );
  const allTables = await deps.dbService.getAllTableNames();
  let candidateTables = allTables;
  try {
    candidateTables = await retrieveCandidateTables(
      state.original_query,
      allTables,
      deps,
    );
  } catch (err) {
    logger.warn(
      `[NAVIGATOR] request_id=${state.request_id || 'n/a'} candidate_retrieval_fallback=${err instanceof Error ? err.message : String(err)}`,
    );
  }
  const navigatorConfig = deps.promptService.getPrompt('schema_navigator');

  const role = navigatorConfig?.role || 'Schema Navigator';
  const instructions =
    navigatorConfig?.instructions || 'Select relevant tables';
  let llmDurationMs = 0;

  const prompt = `${role}

${instructions}

Candidate Tables (pre-ranked): ${candidateTables.join(', ')}

User Query: ${state.original_query}

Return strict JSON only:
{
  "supported": true,
  "tables": ["person", "visit_occurrence", "concept"],
  "join_plan": ["person.person_id = visit_occurrence.person_id", "visit_occurrence.visit_concept_id = concept.concept_id"],
  "confidence": 0.0,
  "thought": "short sentence on retrieval strategy",
  "notes": "optional constraints or caveats"
}`;

  try {
    const llmStartMs = Date.now();
    const response = await llm.invoke([new HumanMessage(prompt)]);
    llmDurationMs = Date.now() - llmStartMs;
    const content = (
      typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)
    ).trim();

    logger.log(
      `[NAVIGATOR] request_id=${state.request_id || 'n/a'} raw_response=${content.slice(0, 240)}`,
    );

    // 2. Parse table names (JSON contract first, CSV fallback)
    const parsed = parseNavigatorSelection(content, candidateTables);
    const selected = parsed.selected;

    // 3. Track Usage
    const usage = (response as LangChainLLMResponse).usage_metadata;
    if (userId && usage) {
      const provider = (overrides?.provider ||
        deps.config.getActiveProvider()) as Provider;
      const model =
        overrides?.model ||
        deps.config.getActiveModelForRole('navigator', overrides?.provider);

      await deps.tokenUsageService.logTokenUsage(
        userId,
        provider,
        model,
        usage.input_tokens || 0,
        usage.output_tokens || 0,
        AgentRole.NAVIGATOR,
        {
          node: 'schema_navigator',
          duration_ms: llmDurationMs,
          candidate_table_count: candidateTables.length,
          candidate_tables: candidateTables,
          selected_table_count: parsed.selected.length,
          selected_tables: parsed.selected,
          supported: parsed.contract.supported,
          confidence: parsed.contract.confidence,
        },
        state.request_id,
      );
    }

    if (selected.length > 0) {
      const enforcedSelection = enforceConceptTableSelection(
        selected,
        allTables,
      );
      return {
        selectedTables: enforcedSelection,
        candidateTables,
        contract: {
          ...parsed.contract,
          tables: enforcedSelection,
        },
      };
    }

    if (!parsed.contract.supported) {
      return {
        selectedTables: [],
        candidateTables,
        contract: parsed.contract,
      };
    }
  } catch (err) {
    logger.error(
      `LLM table selection failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  // Final fallback: return only supported available tables
  if (allTables.includes('person') && allTables.includes('visit_occurrence')) {
    const fallbackTables = enforceConceptTableSelection(
      ['person', 'visit_occurrence'].filter((table) =>
        allTables.includes(table),
      ),
      allTables,
    );
    return {
      selectedTables: fallbackTables,
      candidateTables,
      contract: {
        supported: true,
        tables: fallbackTables,
        join_plan: [],
        confidence: 0,
        notes: 'Fallback selection due to parse or LLM failure',
      },
    };
  }

  if (allTables.includes('person')) {
    return {
      selectedTables: ['person'],
      candidateTables,
      contract: {
        supported: true,
        tables: ['person'],
        join_plan: [],
        confidence: 0,
        notes: 'Fallback to hub table only',
      },
    };
  }

  const minimalFallback = allTables.slice(0, 1);
  const enforcedMinimalFallback = enforceConceptTableSelection(
    minimalFallback,
    allTables,
  );
  return {
    selectedTables: enforcedMinimalFallback,
    candidateTables,
    contract: {
      supported: true,
      tables: enforcedMinimalFallback,
      join_plan: [],
      confidence: 0,
      notes: 'Fallback to first available table',
    },
  };
}
