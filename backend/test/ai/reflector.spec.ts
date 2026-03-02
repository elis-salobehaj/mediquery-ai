import { describe, it, expect, vi } from 'vitest';
import { reflectorNode } from '@/ai/reflector';
import { createInitialState } from '@/ai/state';

describe('reflectorNode', () => {
  it('adds reflection + streamed thought from parsed reflector contract', async () => {
    const state = createInitialState('top 10 patients by duration');
    state.generated_sql = 'SELECT * FROM visits';
    state.attempt_count = 1;
    state.validation_result = {
      valid: false,
      error: 'column does not exist',
      issues: ['column does not exist'],
      fixes: ['use visit_duration'],
      severity: 'high',
      row_count: 0,
      warnings: [],
    };

    const deps = {
      promptService: {
        getPrompt: vi.fn(() => ({
          role: 'Reflector',
          instructions: 'Return strict JSON',
        })),
      },
      tokenUsageService: {
        checkMonthlyLimit: vi.fn(async () => [true, 0, 1000]),
        logTokenUsage: vi.fn(async () => undefined),
      },
      llmService: {
        createChatModel: vi.fn(() => ({
          invoke: vi.fn(async () => ({
            content: JSON.stringify({
              root_cause: 'wrong column',
              fix: 'Use visit_duration column and regroup by patient.',
              next_tables: ['visits', 'patients'],
              keep_or_replace_query: 'replace',
            }),
          })),
        })),
      },
      config: {
        getActiveProvider: vi.fn(() => 'bedrock'),
        getActiveModelForRole: vi.fn(() => 'critic-model'),
      },
    };

    const result = await reflectorNode(state, deps as never);

    expect(result.reflector_contract).toMatchObject({
      root_cause: 'wrong column',
      keep_or_replace_query: 'replace',
    });
    expect(result.reflections).toBeDefined();
    expect((result.reflections as string[])[0]).toContain(
      'Use visit_duration column and regroup by patient.',
    );
    expect(state.thoughts).toContain(
      '🪞 Reflector: Use visit_duration column and regroup by patient. (root cause: wrong column)',
    );
  });
});
