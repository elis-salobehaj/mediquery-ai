import { describe, expect, it, vi } from 'vitest';
import { metaAgentNode } from '@/ai/agents/meta-agent';
import { createInitialState } from '@/ai/state';

function buildDeps(content: string) {
  return {
    dbService: {
      getAllTableNames: vi.fn(async () => ['person', 'visit_occurrence']),
      getTableSchema: vi.fn(async (table: string) => [
        ['person_id', 'varchar'],
        [table === 'person' ? 'person_source_value' : 'visit_start_date', 'text'],
      ]),
    },
    tokenUsageService: {
      checkMonthlyLimit: vi.fn(async () => [true, 0, 1000]),
      logTokenUsage: vi.fn(async () => undefined),
    },
    llmService: {
      createChatModel: vi.fn(() => ({
        invoke: vi.fn(async () => ({ content })),
      })),
    },
    config: {
      getActiveProvider: vi.fn(() => 'bedrock'),
      getActiveModelForRole: vi.fn(() => 'base-model'),
    },
  };
}

describe('metaAgentNode', () => {
  it('parses structured JSON answer and thought', async () => {
    const state = createInitialState('what data is in my database?');
    const deps = buildDeps(
      JSON.stringify({
        thought: 'Summarized available schema tables for the user.',
        answer: 'Your database includes person and visit_occurrence tables.',
      }),
    );

    const result = await metaAgentNode(state, deps as never);

    expect(result.messages).toBeDefined();
    const messages = result.messages as Array<{ content: string }>;
    expect(messages[messages.length - 1].content).toContain('person and visit_occurrence');
    expect(state.thoughts).toContain(
      '🤖 MetaAgent: Summarized available schema tables for the user.',
    );
  });
});
