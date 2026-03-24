import { HumanMessage } from '@langchain/core/messages';
import { Injectable, Logger } from '@nestjs/common';
import type { KpiQueryResult, LangChainLLMResponse } from '@/common/types';
import { ConfigService } from '@/config/config.service';
import { AgentRole, Provider, TokenUsageService } from '@/token-usage/token-usage.service';
import { LLMService } from './llm.service';
import { PromptService } from './prompt.service';

@Injectable()
export class InsightService {
  private readonly logger = new Logger(InsightService.name);

  constructor(
    private readonly llmService: LLMService,
    private readonly promptService: PromptService,
    private readonly tokenUsageService: TokenUsageService,
    private readonly config: ConfigService,
  ) {}

  async generateInsight(
    userQuery: string,
    data: KpiQueryResult,
    userId?: string,
    providerOverride?: string,
  ): Promise<string> {
    const llm = this.llmService.createChatModel('base', providerOverride);

    const formatterConfig = this.promptService.getPrompt('response_formatter');
    const role = formatterConfig?.role || 'medical KPI Response Formatter';
    const instructions =
      formatterConfig?.instructions || 'Format query results for operational teams.';

    const dataPreview = JSON.stringify(data.data || []).slice(0, 5000);
    const rowCount = data.row_count || 0;

    const prompt = `${role}

${instructions}

The user asked: '${userQuery}'
We executed a SQL query and got the following data:
${dataPreview}
Row count: ${rowCount}

Task:
1. Answer the user's question clearly based on the data provided.
2. Identify potential patterns or KPI insights if visible.
3. Keep the response helpful, professional, and data-driven.
4. IMPORTANT: Do NOT include raw JSON charting configurations (like mapbox configs or plotly payload data) in your text response. Any required visualizations will be handled securely by the presentation layer. Just provide text insights.`;

    try {
      const response = await llm.invoke([new HumanMessage(prompt)]);
      const content =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Track usage
      const usage = (response as LangChainLLMResponse).usage_metadata;
      if (userId && usage) {
        const provider = (providerOverride || this.config.getActiveProvider()) as Provider;
        const model = this.config.getActiveModelForRole('base', providerOverride);

        await this.tokenUsageService.logTokenUsage(
          userId,
          provider,
          model,
          usage.input_tokens || 0,
          usage.output_tokens || 0,
          AgentRole.BASE,
        );
      }

      return content;
    } catch (err) {
      this.logger.error(
        `Insight generation failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return "I have the data but couldn't generate a summary insight.";
    }
  }
}
