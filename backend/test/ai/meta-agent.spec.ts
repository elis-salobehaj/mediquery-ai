import { describe, it, expect, vi } from 'vitest';
import { metaAgentNode } from '@/ai/meta-agent';
import { createInitialState } from '@/ai/state';

function buildDeps(content: string) {
  return {
    dbService: {
      getAllTableNames: vi.fn(async () => ['patients', 'visits']),
      getTableSchema: vi.fn(async (table: string) => [
        ['patient_id', 'varchar'],
        [table === 'patients' ? 'patient_name' : 'visit_duration', 'text'],
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
        answer: 'Your database includes patients and visits.',
      }),
    );

    const result = await metaAgentNode(state, deps as never);

    expect(result.messages).toBeDefined();
    const messages = result.messages as Array<{ content: string }>;
    expect(messages[messages.length - 1].content).toContain(
      'patients and visits',
    );
    expect(state.thoughts).toContain(
      '🤖 MetaAgent: Summarized available schema tables for the user.',
    );
  });
});
