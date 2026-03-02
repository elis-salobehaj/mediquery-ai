import { AIMessage } from '@langchain/core/messages';
import { addThought } from '@/ai/common';
import { GraphState } from '@/ai/state';

const WRITE_INTENT_PATTERN =
  /\b(insert|update|delete|drop|truncate|alter|create\s+table|grant|revoke)\b/i;

const UNSUPPORTED_ANALYTICS_PATTERN =
  /\b(train\s+model|fine[-\s]?tune|predict\s+the\s+future|forecast\s+for\s+next\s+year\s+without\s+data)\b/i;

function buildUnsupportedResponse(reason: string): string {
  return [
    `I can't run that request: ${reason}.`,
    'Try one of these supported alternatives:',
    '- Ask for read-only KPI analysis from existing medical tables',
    '- Request top/bottom patients, trends by timeframe, or KPI comparisons',
    '- Ask what tables/columns are available before querying',
  ].join('\n');
}

export async function policyGateNode(
  state: GraphState,
): Promise<Partial<GraphState>> {
  if (state.routing_decision && state.routing_decision !== 'DATA') {
    return {};
  }

  const query = state.original_query || '';

  if (WRITE_INTENT_PATTERN.test(query)) {
    const reason = 'write operations are blocked (read-only policy enforced)';
    addThought(state, `🛡️ Policy Gate: Blocked request - ${reason}`);

    return {
      validation_result: {
        valid: false,
        severity: 'none',
        issues: ['Unsupported intent: write operations are not allowed'],
        fixes: ['Rewrite as a read-only analytics question'],
        error: 'UNSUPPORTED_INTENT',
        row_count: 0,
        warnings: [],
      },
      attempt_count: state.max_attempts,
      messages: [
        ...state.messages,
        new AIMessage({
          content: buildUnsupportedResponse(reason),
          name: 'policy_gate',
        }),
      ],
    };
  }

  if (UNSUPPORTED_ANALYTICS_PATTERN.test(query)) {
    const reason =
      'that request is outside supported SQL-based medical KPI analysis';
    addThought(state, `🛡️ Policy Gate: Blocked request - ${reason}`);

    return {
      validation_result: {
        valid: false,
        severity: 'none',
        issues: ['Unsupported intent for current capabilities'],
        fixes: ['Ask a supported medical KPI question'],
        error: 'UNSUPPORTED_INTENT',
        row_count: 0,
        warnings: [],
      },
      attempt_count: state.max_attempts,
      messages: [
        ...state.messages,
        new AIMessage({
          content: buildUnsupportedResponse(reason),
          name: 'policy_gate',
        }),
      ],
    };
  }

  addThought(state, '🛡️ Policy Gate: Request passed safety checks');
  return {};
}
