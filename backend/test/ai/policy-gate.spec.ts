import { describe, it, expect } from 'vitest';
import { policyGateNode } from '@/ai/policy-gate';
import { createInitialState } from '@/ai/state';

describe('policyGateNode', () => {
  it('blocks write-intent user requests', async () => {
    const state = createInitialState('delete rows from daily medical reports');
    state.routing_decision = 'DATA';

    const result = await policyGateNode(state);

    expect(result.validation_result?.valid).toBe(false);
    expect(result.validation_result?.error).toBe('UNSUPPORTED_INTENT');
    expect(result.messages?.length).toBeGreaterThan(0);
  });

  it('passes supported data requests', async () => {
    const state = createInitialState(
      'show top 5 patients by duration this month',
    );
    state.routing_decision = 'DATA';

    const result = await policyGateNode(state);

    expect(result.validation_result).toBeUndefined();
  });
});
