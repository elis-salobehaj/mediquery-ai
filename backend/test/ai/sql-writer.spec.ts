import { describe, expect, it, vi } from 'vitest';
import { sqlWriterNode } from '@/ai/agents/sql-writer-agent';
import { createInitialState } from '@/ai/state';

function buildDeps(responseContent: string) {
  return {
    dbService: {
      getSchema: vi.fn(async () => 'Table: person\nTable: visit_occurrence'),
    },
    promptService: {
      getPrompt: vi.fn(() => ({
        role: 'medical KPI SQL Writer',
        instructions: 'Generate SQL',
        dialect: 'mysql',
      })),
    },
    tokenUsageService: {
      checkMonthlyLimit: vi.fn(async () => [true, 0, 1000]),
      logTokenUsage: vi.fn(async () => undefined),
    },
    llmService: {
      createChatModel: vi.fn(() => ({
        invoke: vi.fn(async () => ({ content: responseContent })),
      })),
    },
    config: {
      getActiveProvider: vi.fn(() => 'bedrock'),
      getActiveModelForRole: vi.fn(() => 'sql-writer-model'),
    },
  };
}

describe('sqlWriterNode', () => {
  it('parses JSON sql/thought output and streams thought summaries', async () => {
    const state = createInitialState('top person by duration');
    state.selected_tables = ['person', 'visit_occurrence'];
    state.table_schemas = {
      person: 'CREATE TABLE person (person_id integer, person_source_value text)',
      visit_occurrence:
        'CREATE TABLE visit_occurrence (person_id integer, visit_start_date date, visit_end_date date)',
    };

    const deps = buildDeps(
      JSON.stringify({
        sql: 'SELECT p.person_source_value FROM person p JOIN visit_occurrence v ON p.person_id = v.person_id ORDER BY v.visit_start_date DESC LIMIT 10',
        thought: 'Join person demographics with visit occurrence for timeline analysis.',
        table_strategy: 'Use person as base and visit_occurrence for encounter dates.',
      }),
    );

    const result = await sqlWriterNode(state, deps as never);

    expect(result.generated_sql).toContain('FROM person');
    expect(result.thoughts).toEqual(
      expect.arrayContaining([
        '🧠 SQL Writer: Join person demographics with visit occurrence for timeline analysis.',
        '🗂️ SQL Writer: Use person as base and visit_occurrence for encounter dates.',
      ]),
    );
  });
});
