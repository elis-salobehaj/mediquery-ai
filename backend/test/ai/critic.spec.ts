import { describe, it, expect, vi } from 'vitest';
import { criticNode } from '@/ai/critic';
import { createInitialState } from '@/ai/state';

describe('criticNode', () => {
  it('downgrades alias false-positives and advisory notes to warnings', async () => {
    const state = createInitialState('top 10 patients by duration');
    state.generated_sql =
      'SELECT wm.patient_name, rk.CLINIC_STATE_medical FROM patients wm';
    state.table_schemas = {
      CLINIC_STATE_KPIS: 'CLINIC_STATE_medical',
      patients: 'patient_id, patient_name',
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
                'Column `rk.CLINIC_STATE_medical` does not exist in CLINIC_STATE_KPIS — the correct column name is `CLINIC_STATE_medical` (this exists).',
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
      'Column `rk.CLINIC_STATE_medical` does not exist in CLINIC_STATE_KPIS — the correct column name is `CLINIC_STATE_medical` (this exists).',
    );
    expect(result.validation_result?.warnings).toContain(
      'LEFT JOIN may include rows with NULL metrics and could skew ranking.',
    );
  });

  it('keeps blocking behavior for concrete semantic errors', async () => {
    const state = createInitialState('show duration by patient');
    state.generated_sql = 'SELECT bad_column FROM visits';

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
              issues: ['Column `bad_column` does not exist in `visits`.'],
              fixes: ['Replace `bad_column` with `visit_duration`.'],
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
      'Column `bad_column` does not exist in `visits`.',
    );
    expect(result.validation_result?.issues).toEqual([
      'Column `bad_column` does not exist in `visits`.',
    ]);
  });
});
