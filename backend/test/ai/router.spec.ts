import { describe, it, expect, vi } from 'vitest';
import { routerNode } from '@/ai/agents/router-agent';
import { createInitialState } from '@/ai/state';

function buildDeps(content: string) {
  return {
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
      getActiveModelForRole: vi.fn(() => 'navigator-model'),
    },
  };
}

describe('routerNode', () => {
  it('parses strict JSON decision and thought', async () => {
    const state = createInitialState('what data is in my database');
    const deps = buildDeps(
      JSON.stringify({
        decision: 'DOMAIN_KNOWLEDGE',
        thought: 'User is asking about schema contents.',
      }),
    );

    const result = await routerNode(state, deps as never);

    expect(result.routing_decision).toBe('DOMAIN_KNOWLEDGE');
    expect(result.thoughts).toContain(
      '🧭 Router: User is asking about schema contents.',
    );
  });

  it('falls back to legacy type/reason JSON shape', async () => {
    const state = createInitialState('show top 10 diagnoses by prevalence');
    const deps = buildDeps(
      JSON.stringify({
        type: 'DATA',
        reason: 'Requires ranking rows from database tables.',
      }),
    );

    const result = await routerNode(state, deps as never);

    expect(result.routing_decision).toBe('DATA');
    expect(result.thoughts).toContain(
      '🧭 Router: Requires ranking rows from database tables.',
    );
  });
});
