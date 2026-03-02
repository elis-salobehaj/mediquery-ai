import { describe, it, expect, vi } from 'vitest';
import { schemaNavigatorNode } from '@/ai/schema-navigator';
import { createInitialState } from '@/ai/state';

function buildDeps(
  llmContent: string,
  options?: {
    tables?: string[];
    getTableSchema?: (tableName: string) => Promise<Array<[string, string]>>;
  },
) {
  const tables = options?.tables || ['person', 'visit_occurrence', 'billing'];

  return {
    dbService: {
      getAllTableNames: vi.fn(async () => tables),
      getTableSchema: vi.fn(
        options?.getTableSchema ||
        (async (tableName: string) => [
          ['person_id', 'integer'],
          [tableName === 'person' ? 'person_source_value' : 'visit_concept_id', 'text'],
        ]),
      ),
    },
    promptService: {
      getPrompt: vi.fn(() => ({
        role: 'Schema Navigator',
        instructions: 'Select relevant tables',
      })),
    },
    tokenUsageService: {
      checkMonthlyLimit: vi.fn(async () => [true, 0, 1000]),
      logTokenUsage: vi.fn(async () => undefined),
    },
    llmService: {
      createChatModel: vi.fn(() => ({
        invoke: vi.fn(async () => ({
          content: llmContent,
        })),
      })),
    },
    config: {
      getActiveProvider: vi.fn(() => 'bedrock'),
      getActiveModelForRole: vi.fn(() => 'navigator-model'),
    },
  };
}

describe('schemaNavigatorNode', () => {
  it('parses JSON contract and keeps only valid existing tables', async () => {
    const state = createInitialState('show medical performance');
    const deps = buildDeps(
      JSON.stringify({
        supported: true,
        tables: ['person', 'concept', 'visit_occurrence'],
      }),
      { tables: ['person', 'concept', 'visit_occurrence', 'observation'] }
    );

    const result = await schemaNavigatorNode(state, deps as never);

    expect(result.selected_tables).toEqual(['person', 'concept', 'visit_occurrence']);
  });

  it('returns empty selection for supported=false JSON contract', async () => {
    const state = createInitialState('forecast production by quarter');
    const deps = buildDeps(
      JSON.stringify({
        supported: false,
        tables: ['person'],
      }),
    );

    const result = await schemaNavigatorNode(state, deps as never);

    expect(result.selected_tables).toEqual([]);
  });

  it('uses supported fallback when LLM output has no valid tables', async () => {
    const state = createInitialState('list all kpis');
    const filteredTables = ['person', 'visit_occurrence'];
    const deps = buildDeps('invalid1, invalid2', { tables: filteredTables });

    const result = await schemaNavigatorNode(state, deps as never);

    expect(result.selected_tables).toEqual(['person', 'visit_occurrence']);
  });

  it('includes candidate shortlist count in thoughts', async () => {
    const state = createInitialState('show patient performance');
    const deps = buildDeps(
      JSON.stringify({
        supported: true,
        tables: ['person', 'visit_occurrence'],
        thought: 'Using patient and performance related tables',
      }),
    );

    const result = await schemaNavigatorNode(state, deps as never);
    const thoughts = result.thoughts || [];

    expect(
      thoughts.some((thought) =>
        thought.includes('shortlisted 3 candidate tables before reranking'),
      ),
    ).toBe(true);
  });

  it('falls back to all tables when candidate pre-ranking fails', async () => {
    const state = createInitialState('show medical performance');
    let shouldFailOnce = true;
    const deps = buildDeps('person,visit_occurrence', {
      tables: ['person', 'visit_occurrence', 'billing'],
      getTableSchema: vi.fn(async (tableName: string) => {
        if (shouldFailOnce) {
          shouldFailOnce = false;
          throw new Error('schema read failed');
        }

        return [
          ['patient_id', 'varchar(255)'],
          [tableName === 'person' ? 'patient_name' : 'VALUE', 'text'],
        ] as [string, string][];
      }),
    });

    await schemaNavigatorNode(state, deps as never);

    const invokeMock = (
      deps.llmService.createChatModel as ReturnType<typeof vi.fn>
    ).mock.results[0]?.value.invoke as ReturnType<typeof vi.fn>;
    const prompt = invokeMock.mock.calls[0][0][0].content as string;

    expect(prompt).toContain(
      'Candidate Tables (pre-ranked): person, visit_occurrence, billing',
    );
  });
});
