import { Injectable, Logger } from '@nestjs/common';
import { and, eq, sql, sum } from 'drizzle-orm';
import { v4 as uuidv4 } from 'uuid';
import { DatabaseService } from '@/database/database.service';
import { tokenUsage, users } from '@/database/schema';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';

export enum Provider {
  BEDROCK = 'bedrock',
  OPENAI = 'openai',
  GEMINI = 'gemini',
  ANTHROPIC = 'anthropic',
  LOCAL = 'local',
}

export enum AgentRole {
  NAVIGATOR = 'navigator',
  ROUTER = 'router',
  SQL_WRITER = 'sql_writer',
  CRITIC = 'critic',
  REFLECTOR = 'reflector',
  SYNTHESIZER = 'synthesizer',
  BASE = 'base',
  MAIN = 'main',
}

const BEDROCK_PRICING: Record<string, { input: number; output: number }> = {
  'global.anthropic.claude-sonnet-4-5-20250929-v1:0': {
    input: 3.0 / 1000000,
    output: 15.0 / 1000000,
  },
  'global.anthropic.claude-haiku-4-5-20250929-v1:0': {
    input: 0.8 / 1000000,
    output: 4.0 / 1000000,
  },
  'anthropic.claude-3-5-sonnet-20241022-v2:0': {
    input: 3.0 / 1000000,
    output: 15.0 / 1000000,
  },
  'anthropic.claude-3-5-haiku-20241022-v1:0': {
    input: 0.8 / 1000000,
    output: 4.0 / 1000000,
  },
  sonnet: { input: 3.0 / 1000000, output: 15.0 / 1000000 },
  haiku: { input: 0.8 / 1000000, output: 4.0 / 1000000 },
};

const OPENAI_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-5.2': { input: 2.5 / 1000000, output: 10.0 / 1000000 },
  'gpt-4.1': { input: 2.0 / 1000000, output: 8.0 / 1000000 },
  o3: { input: 2.0 / 1000000, output: 8.0 / 1000000 },
  gpt: { input: 2.5 / 1000000, output: 10.0 / 1000000 },
};

@Injectable()
export class TokenUsageService {
  private readonly logger = new Logger(TokenUsageService.name);

  constructor(
    private readonly db: DatabaseService,
    private readonly eventsService: TokenUsageEventsService,
  ) {}

  async checkMonthlyLimit(userId: string): Promise<[boolean, number, number]> {
    const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

    const userRes = await this.db.pg.select().from(users).where(eq(users.id, userId)).execute();
    if (userRes.length === 0) {
      this.logger.error(`User ${userId} not found`);
      return [false, 0, 0];
    }

    const limit = userRes[0].monthlyTokenLimit || 0;

    const usageRes = await this.db.pg
      .select({
        total: sum(sql`${tokenUsage.inputTokens} + ${tokenUsage.outputTokens}`),
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') = ${currentMonth}`,
        ),
      )
      .execute();

    const used = Number(usageRes[0]?.total || 0);
    const canProceed = used < limit;

    this.logger.debug(
      `User ${userId} usage check: ${used}/${limit} tokens (all providers, ${currentMonth})`,
    );
    return [canProceed, used, limit];
  }

  async getUsageStatus(userId: string) {
    const [canProceed, used, limit] = await this.checkMonthlyLimit(userId);
    const currentMonth = new Date().toISOString().slice(0, 7);
    const usagePct = limit > 0 ? (used / limit) * 100 : 0;

    let warningLevel = 'normal';
    if (usagePct >= 95) warningLevel = 'critical';
    else if (usagePct >= 90) warningLevel = 'high';
    else if (usagePct >= 80) warningLevel = 'medium';

    return {
      can_proceed: canProceed,
      tokens_used: used,
      tokens_limit: limit,
      tokens_remaining: limit - used,
      usage_percentage: Math.round(usagePct * 100) / 100,
      warning_level: warningLevel,
      month: currentMonth,
    };
  }

  async getMonthlyUsage(userId: string, startMonth?: string, endMonth?: string) {
    const end = endMonth || new Date().toISOString().slice(0, 7);
    const start =
      startMonth ||
      new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 7);

    const results = await this.db.pg
      .select({
        month: sql<string>`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`,
        totalInputTokens: sum(tokenUsage.inputTokens),
        totalOutputTokens: sum(tokenUsage.outputTokens),
        totalTokens: sum(sql`${tokenUsage.inputTokens} + ${tokenUsage.outputTokens}`),
        totalCost: sum(tokenUsage.costUsd),
        requestCount: sql<number>`count(${tokenUsage.id})`,
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') >= ${start}`,
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') <= ${end}`,
        ),
      )
      .groupBy(sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`)
      .orderBy(sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') DESC`)
      .execute();

    return results.map((r) => ({
      month: r.month,
      total_input_tokens: Number(r.totalInputTokens || 0),
      total_output_tokens: Number(r.totalOutputTokens || 0),
      total_tokens: Number(r.totalTokens || 0),
      total_cost_usd: Number(r.totalCost || 0),
      request_count: Number(r.requestCount || 0),
    }));
  }

  async getProviderBreakdown(userId: string, startMonth?: string, endMonth?: string) {
    const end = endMonth || new Date().toISOString().slice(0, 7);
    const start =
      startMonth ||
      new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 7);

    const results = await this.db.pg
      .select({
        month: sql<string>`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`,
        provider: tokenUsage.provider,
        totalInputTokens: sum(tokenUsage.inputTokens),
        totalOutputTokens: sum(tokenUsage.outputTokens),
        totalTokens: sum(sql`${tokenUsage.inputTokens} + ${tokenUsage.outputTokens}`),
        totalCost: sum(tokenUsage.costUsd),
        requestCount: sql<number>`count(${tokenUsage.id})`,
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') >= ${start}`,
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') <= ${end}`,
        ),
      )
      .groupBy(
        sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM')`,
        tokenUsage.provider,
      )
      .orderBy(
        sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') DESC`,
        tokenUsage.provider,
      )
      .execute();

    return results.map((r) => ({
      month: r.month,
      provider: r.provider,
      total_input_tokens: Number(r.totalInputTokens || 0),
      total_output_tokens: Number(r.totalOutputTokens || 0),
      total_tokens: Number(r.totalTokens || 0),
      total_cost_usd: Number(r.totalCost || 0),
      request_count: Number(r.requestCount || 0),
    }));
  }

  async getNodeMetrics(userId: string, startMonth?: string, endMonth?: string) {
    const end = endMonth || new Date().toISOString().slice(0, 7);
    const start =
      startMonth ||
      new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString().slice(0, 7);

    const rows = await this.db.pg
      .select({
        requestId: tokenUsage.requestId,
        agentType: tokenUsage.agentType,
        inputTokens: tokenUsage.inputTokens,
        outputTokens: tokenUsage.outputTokens,
        requestMetadata: tokenUsage.requestMetadata,
      })
      .from(tokenUsage)
      .where(
        and(
          eq(tokenUsage.userId, userId),
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') >= ${start}`,
          sql`to_char(${tokenUsage.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM') <= ${end}`,
        ),
      )
      .execute();

    type NodeBucket = {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
      call_count: number;
      latencies: number[];
      selected_table_counts: number[];
      overlap_ratios: number[];
    };

    const byNode: Record<string, NodeBucket> = {};
    const attemptsByRequest = new Map<string, number>();
    let firstPassSuccessCount = 0;
    let totalCriticValidations = 0;

    const percentile = (values: number[], p: number): number => {
      if (values.length === 0) return 0;
      const sorted = [...values].sort((a, b) => a - b);
      const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1));
      return sorted[idx];
    };

    const avg = (values: number[]): number => {
      if (values.length === 0) return 0;
      return values.reduce((sum, v) => sum + v, 0) / values.length;
    };

    for (const row of rows) {
      const node = row.agentType || 'unknown';
      if (!byNode[node]) {
        byNode[node] = {
          prompt_tokens: 0,
          completion_tokens: 0,
          total_tokens: 0,
          call_count: 0,
          latencies: [],
          selected_table_counts: [],
          overlap_ratios: [],
        };
      }

      const bucket = byNode[node];
      const input = Number(row.inputTokens || 0);
      const output = Number(row.outputTokens || 0);
      const metadata = (row.requestMetadata || {}) as Record<string, unknown>;

      bucket.prompt_tokens += input;
      bucket.completion_tokens += output;
      bucket.total_tokens += input + output;
      bucket.call_count += 1;

      const duration = Number(metadata.duration_ms || 0);
      if (duration > 0) {
        bucket.latencies.push(duration);
      }

      const selectedTableCount = Number(metadata.selected_table_count || 0);
      if (selectedTableCount > 0) {
        bucket.selected_table_counts.push(selectedTableCount);
      }

      const sqlTableCount = Number(metadata.sql_table_count || 0);
      if (selectedTableCount > 0 && sqlTableCount >= 0) {
        bucket.overlap_ratios.push(Math.min(1, Math.max(0, sqlTableCount / selectedTableCount)));
      }

      const attempt = Number(metadata.attempt || 0);
      if (row.requestId && attempt > 0) {
        const prev = attemptsByRequest.get(row.requestId) || 0;
        attemptsByRequest.set(row.requestId, Math.max(prev, attempt));
      }

      if (node === AgentRole.CRITIC) {
        const parsedValid = metadata.parsed_valid;
        if (typeof parsedValid === 'boolean') {
          totalCriticValidations += 1;
          if (parsedValid && attempt === 1) {
            firstPassSuccessCount += 1;
          }
        }
      }
    }

    const node_metrics = Object.entries(byNode)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([node, bucket]) => ({
        node,
        prompt_tokens: bucket.prompt_tokens,
        completion_tokens: bucket.completion_tokens,
        total_tokens: bucket.total_tokens,
        call_count: bucket.call_count,
        avg_latency_ms: Math.round(avg(bucket.latencies)),
        p50_latency_ms: Math.round(percentile(bucket.latencies, 0.5)),
        p95_latency_ms: Math.round(percentile(bucket.latencies, 0.95)),
        avg_selected_table_count: Number(avg(bucket.selected_table_counts).toFixed(2)),
        avg_overlap_ratio: Number(avg(bucket.overlap_ratios).toFixed(4)),
      }));

    const attempts = [...attemptsByRequest.values()];
    const avg_attempts_per_request = Number(avg(attempts).toFixed(3));
    const first_pass_validity_rate =
      totalCriticValidations > 0
        ? Number((firstPassSuccessCount / totalCriticValidations).toFixed(4))
        : 0;

    return {
      user_id: userId,
      window: { start_month: start, end_month: end },
      summary: {
        request_count: attempts.length,
        avg_attempts_per_request,
        first_pass_validity_rate,
      },
      node_metrics,
    };
  }

  async getAllUsersUsage(month?: string) {
    const currentMonth = month || new Date().toISOString().slice(0, 7);

    const activeUsers = await this.db.pg
      .select()
      .from(users)
      .where(eq(users.isActive, true))
      .execute();

    const results = [];
    for (const user of activeUsers) {
      const status = await this.getUsageStatus(user.id);
      results.push({
        user_id: user.id,
        username: user.username,
        email: user.email,
        month: currentMonth,
        tokens_used: status.tokens_used,
        tokens_limit: status.tokens_limit,
        usage_percentage: status.usage_percentage,
        warning_level: status.warning_level,
      });
    }

    return results;
  }

  async updateUserQuota(userId: string, newLimit: number) {
    await this.db.pg
      .update(users)
      .set({ monthlyTokenLimit: newLimit })
      .where(eq(users.id, userId))
      .execute();

    const userRes = await this.db.pg.select().from(users).where(eq(users.id, userId)).execute();

    return {
      user_id: userId,
      username: userRes[0]?.username,
      new_limit: newLimit,
    };
  }

  async logTokenUsage(
    userId: string,
    provider: Provider,
    model: string,
    inputTokens: number,
    outputTokens: number,
    agentRole?: AgentRole,
    requestMetadata?: Record<string, unknown>,
    requestId?: string,
  ) {
    const reqId = requestId || uuidv4();
    const costUsd = this.calculateCost(provider, model, inputTokens, outputTokens);

    await this.db.pg
      .insert(tokenUsage)
      .values({
        userId,
        requestId: reqId,
        provider,
        model,
        inputTokens,
        outputTokens,
        costUsd: costUsd.toString(),
        agentType: agentRole || null,
        requestMetadata: requestMetadata || {},
      })
      .execute();

    this.logger.log(
      `Logged token usage: user=${userId}, tokens=${inputTokens + outputTokens}, cost=$${costUsd.toFixed(6)}, model=${model}`,
    );

    // Push updated status to any active SSE subscribers for this user
    try {
      const status = await this.getUsageStatus(userId);
      this.eventsService.emit(userId, {
        ...status,
        thresholds: { normal: 0, medium: 80, high: 90, critical: 95 },
      });
    } catch (err) {
      this.logger.warn(`Failed to push SSE usage update for ${userId}: ${err}`);
    }
  }

  private calculateCost(
    provider: Provider,
    model: string,
    inputTokens: number,
    outputTokens: number,
  ): number {
    let pricing = null;
    if (provider === Provider.BEDROCK) {
      pricing = BEDROCK_PRICING[model];
      if (!pricing) {
        const ml = model.toLowerCase();
        if (ml.includes('sonnet')) pricing = BEDROCK_PRICING.sonnet;
        else if (ml.includes('haiku')) pricing = BEDROCK_PRICING.haiku;
      }
    } else if (provider === Provider.OPENAI) {
      pricing = OPENAI_PRICING[model];
      if (!pricing) {
        const ml = model.toLowerCase();
        if (ml.includes('gpt') || ml.includes('codex')) pricing = OPENAI_PRICING.gpt;
        else if (ml.includes('o3') || ml.includes('o4')) pricing = OPENAI_PRICING.o3;
      }
    }

    if (pricing) {
      return inputTokens * pricing.input + outputTokens * pricing.output;
    }

    this.logger.warn(`No pricing data for provider=${provider}, model=${model}`);
    return 0;
  }
}
