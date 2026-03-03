import { Injectable, Logger } from '@nestjs/common';
import {
  BaseChatModel,
  SimpleChatModel,
} from '@langchain/core/language_models/chat_models';
import { BaseMessage } from '@langchain/core/messages';

/**
 * Minimal Mock LLM for E2E tests
 */
export class MockLLM extends SimpleChatModel {
  private readonly assignedRole: string;

  constructor(role: string) {
    super({});
    this.assignedRole = role.toLowerCase();
  }

  _llmType() {
    return 'mock';
  }

  async _call(
    messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
  ): Promise<string> {
    const firstMsg = (
      typeof messages[0].content === 'string'
        ? messages[0].content
        : JSON.stringify(messages[0].content)
    ).toLowerCase();

    // 1. SQL Writer
    if (
      this.assignedRole === 'sql_writer' ||
      firstMsg.includes('sql writer') ||
      firstMsg.includes('sql_writer') ||
      firstMsg.includes('generate postgresql') ||
      firstMsg.includes('list patients')
    ) {
      new Logger('MockLLM').log('Matched: SQL WRITER');
      if (firstMsg.includes('compare')) {
        return 'SELECT state, COUNT(*) as patient_count FROM patients GROUP BY state';
      }
      return "SELECT name, age, state, bmi FROM patients WHERE state = 'TX' LIMIT 10";
    }

    // 2. Mock Router
    if (
      this.assignedRole === 'navigator' &&
      (firstMsg.includes('router') ||
        firstMsg.includes('intent') ||
        firstMsg.includes('classify'))
    ) {
      new Logger('MockLLM').log('Matched: ROUTER');
      return JSON.stringify({
        type: 'DATA',
        reason: 'User is asking for data.',
      });
    }

    // 3. Mock Navigator
    if (
      this.assignedRole === 'navigator' ||
      firstMsg.includes('navigator') ||
      firstMsg.includes('schema')
    ) {
      new Logger('MockLLM').log('Matched: NAVIGATOR');
      return JSON.stringify({ tables: ['patients', 'visits'] });
    }

    // 4. Mock Critic / Validator
    if (
      this.assignedRole === 'critic' ||
      firstMsg.includes('critic') ||
      firstMsg.includes('validator') ||
      firstMsg.includes('has_issues')
    ) {
      new Logger('MockLLM').log('Matched: CRITIC');
      return JSON.stringify({ has_issues: false, critique: '' });
    }

    // 5. Mock Analyst / Insight / Base / Formatter / Visualization Expert
    if (
      this.assignedRole === 'base' ||
      this.assignedRole === 'analyst' ||
      this.assignedRole === 'local' ||
      firstMsg.includes('insight') ||
      firstMsg.includes('analyze') ||
      firstMsg.includes('format') ||
      firstMsg.includes('expert') ||
      firstMsg.includes('plotly.js chart type')
    ) {
      if (firstMsg.includes('plotly.js chart type')) {
        new Logger('MockLLM').log('Matched: VISUALIZATION');
        if (firstMsg.includes('state')) return 'bar';
        return 'table';
      }
      new Logger('MockLLM').log('Matched: INSIGHT');
      return 'I have analyzed the medical data. Texas continues to show a diverse patient demographic across multiple clinics.';
    }

    new Logger('MockLLM').log('Matched: DEFAULT');
    return 'I am a Mediquery AI agent specializing in medical KPIs. How can I help you?';
  }
}

@Injectable()
export class MockLLMService {
  createChatModel(
    roleOrModel?: string,
    _providerOverride?: string,
  ): BaseChatModel {
    return new MockLLM(roleOrModel || 'base');
  }

  getAvailableModels(): Array<{ id: string; name: string; provider: string }> {
    return [
      { id: 'mock_sql', name: 'Mock SQL Writer', provider: 'mock' },
      { id: 'mock_base', name: 'Mock Base', provider: ' mock ' },
    ];
  }
}
