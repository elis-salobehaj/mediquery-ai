import { describe, expect, it, vi } from 'vitest';
import { criticNode } from '@/ai/agents/critic-agent';
import { createInitialState } from '@/ai/state';

describe('criticNode', () => {
  it('downgrades alias false-positives and advisory notes to warnings', async () => {
    const state = createInitialState('top 10 diagnoses by prevalence');
    state.generated_sql = 'SELECT co.condition_concept_id FROM condition_occurrence co';
    state.table_schemas = {
      condition_occurrence: 'person_id, condition_concept_id',
      concept: 'concept_id, concept_name',
    };

    const deps = {
      dbService: {
        validateSql: vi.fn(async () => ({
          valid: true,
          row_count: 10,
          warnings: [] as string[],
        })),
      },
      promptService: {
        getPrompt: vi.fn(() => ({
          role: 'Critic',
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
              valid: false,
              severity: 'high',
              issues: [
                'Column `co.condition_concept_id` does not exist in condition_occurrence — the correct column name is `condition_concept_id` (this exists).',
                'LEFT JOIN may include rows with NULL metrics and could skew ranking.',
              ],
              fixes: ['Add stricter filters for ranking columns'],
            }),
            usage_metadata: { input_tokens: 1, output_tokens: 1 },
          })),
        })),
      },
      config: {
        getActiveProvider: vi.fn(() => 'bedrock'),
        getActiveModelForRole: vi.fn(() => 'critic-model'),
      },
    };

    const result = await criticNode(state, deps as never);

    expect(result.validation_result?.valid).toBe(true);
    expect(result.validation_result?.warnings).toContain(
      'Column `co.condition_concept_id` does not exist in condition_occurrence — the correct column name is `condition_concept_id` (this exists).',
    );
    expect(result.validation_result?.warnings).toContain(
      'LEFT JOIN may include rows with NULL metrics and could skew ranking.',
    );
  });

  it('keeps blocking behavior for concrete semantic errors', async () => {
    const state = createInitialState('show diagnosis counts by person');
    state.generated_sql = 'SELECT bad_column FROM condition_occurrence';

    const deps = {
      dbService: {
        validateSql: vi.fn(async () => ({
          valid: true,
          row_count: 0,
          warnings: [] as string[],
        })),
      },
      promptService: {
        getPrompt: vi.fn(() => ({
          role: 'Critic',
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
              valid: false,
              severity: 'high',
              issues: ['Column `bad_column` does not exist in `condition_occurrence`.'],
              fixes: ['Replace `bad_column` with `condition_concept_id`.'],
            }),
            usage_metadata: { input_tokens: 1, output_tokens: 1 },
          })),
        })),
      },
      config: {
        getActiveProvider: vi.fn(() => 'bedrock'),
        getActiveModelForRole: vi.fn(() => 'critic-model'),
      },
    };

    const result = await criticNode(state, deps as never);

    expect(result.validation_result?.valid).toBe(false);
    expect(result.validation_result?.error).toBe(
      'Column `bad_column` does not exist in `condition_occurrence`.',
    );
    expect(result.validation_result?.issues).toEqual([
      'Column `bad_column` does not exist in `condition_occurrence`.',
    ]);
  });
});
