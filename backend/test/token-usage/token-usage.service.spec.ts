import { Test, TestingModule } from '@nestjs/testing';
import {
  TokenUsageService,
  Provider,
  AgentRole,
} from '@/token-usage/token-usage.service';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';
import { DatabaseService } from '@/database/database.service';
import { vi, describe, beforeEach, it, expect } from 'vitest';

// ─── Helper: fluent Drizzle ORM chain mock ───────────────────────────────────
// Every method in the chain returns the same object, so any combination of
// .from().where().groupBy().orderBy().execute() works without extra setup.
function makeChain(result: unknown[] = []) {
  const chain: Record<string, unknown> = {
    execute: vi.fn().mockResolvedValue(result),
  };
  for (const m of [
    'from',
    'where',
    'groupBy',
    'orderBy',
    'set',
    'values',
    'returning',
    'onConflictDoNothing',
  ]) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  return chain;
}

describe('TokenUsageService', () => {
  let service: TokenUsageService;
  let db: {
    pg: {
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let eventsService: {
    emit: ReturnType<typeof vi.fn>;
    subscribe: ReturnType<typeof vi.fn>;
  };

  const mockUser = {
    id: 'u1',
    username: 'alice',
    monthlyTokenLimit: 10000,
    email: null,
    isActive: true,
  };

  beforeEach(async () => {
    db = {
      pg: {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
      },
    };
    eventsService = { emit: vi.fn(), subscribe: vi.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TokenUsageService,
        { provide: DatabaseService, useValue: db },
        { provide: TokenUsageEventsService, useValue: eventsService },
      ],
    }).compile();

    service = module.get<TokenUsageService>(TokenUsageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── calculateCost ───────────────────────────────────────────────────────────

  describe('calculateCost (private)', () => {

    it('calculates bedrock sonnet cost by alias', () => {
      expect(
        (service as any).calculateCost(
          Provider.BEDROCK,
          'sonnet',
          1_000_000,
          1_000_000,
        ),
      ).toBe(18);
    });

    it('calculates bedrock haiku cost by alias', () => {
      expect(
        (service as any).calculateCost(
          Provider.BEDROCK,
          'haiku',
          1_000_000,
          1_000_000,
        ),
      ).toBeCloseTo(4.8);
    });

    it('calculates bedrock cost via full model id containing "sonnet"', () => {
      expect(
        (service as any).calculateCost(
          Provider.BEDROCK,
          'anthropic.claude-3-5-sonnet-20241022-v2:0',
          1_000_000,
          0,
        ),
      ).toBe(3);
    });

    it('calculates openai gpt cost by alias', () => {
      expect(
        (service as any).calculateCost(
          Provider.OPENAI,
          'gpt',
          1_000_000,
          1_000_000,
        ),
      ).toBeCloseTo(12.5);
    });

    it('calculates openai o3 cost by alias', () => {
      expect(
        (service as any).calculateCost(
          Provider.OPENAI,
          'o3',
          1_000_000,
          1_000_000,
        ),
      ).toBeCloseTo(10);
    });

    it('calculates openai cost via model id gpt-4.1', () => {
      expect(
        (service as any).calculateCost(
          Provider.OPENAI,
          'gpt-4.1',
          1_000_000,
          0,
        ),
      ).toBe(2);
    });

    it('returns 0 for unknown provider (gemini, no pricing table)', () => {
      expect(
        (service as any).calculateCost(
          Provider.GEMINI,
          'gemini-pro',
          1_000_000,
          1_000_000,
        ),
      ).toBe(0);
    });

    it('returns 0 for local/ollama provider', () => {
      expect(
        (service as any).calculateCost(Provider.LOCAL, 'llama', 100, 100),
      ).toBe(0);
    });
  });

  // ─── checkMonthlyLimit ───────────────────────────────────────────────────────

  describe('checkMonthlyLimit', () => {
    it('returns [false, 0, 0] when user not found', async () => {
      db.pg.select.mockReturnValue(makeChain([]));
      const [canProceed, used, limit] =
        await service.checkMonthlyLimit('nonexistent');
      expect(canProceed).toBe(false);
      expect(used).toBe(0);
      expect(limit).toBe(0);
    });

    it('returns [true, used, limit] when usage is under limit', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser])) // user lookup
        .mockReturnValueOnce(makeChain([{ total: '500' }])); // usage lookup
      const [canProceed, used, limit] = await service.checkMonthlyLimit('u1');
      expect(canProceed).toBe(true);
      expect(used).toBe(500);
      expect(limit).toBe(10000);
    });

    it('returns [false, used, limit] when usage exceeds limit', async () => {
      const heavyUser = { ...mockUser, monthlyTokenLimit: 100 };
      db.pg.select
        .mockReturnValueOnce(makeChain([heavyUser]))
        .mockReturnValueOnce(makeChain([{ total: '9999' }]));
      const [canProceed, used] = await service.checkMonthlyLimit('u1');
      expect(canProceed).toBe(false);
      expect(used).toBe(9999);
    });

    it('treats null total as 0 usage', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: null }]));
      const [, used] = await service.checkMonthlyLimit('u1');
      expect(used).toBe(0);
    });
  });

  // ─── getUsageStatus ──────────────────────────────────────────────────────────

  describe('getUsageStatus', () => {
    it('returns formatted status with warning_level "normal"', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '500' }]));
      const status = await service.getUsageStatus('u1');
      expect(status).toMatchObject({
        tokens_used: 500,
        tokens_limit: 10000,
        warning_level: 'normal',
        can_proceed: true,
      });
    });

    it('sets warning_level "critical" when >= 95% used', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '9600' }]));
      const { warning_level } = await service.getUsageStatus('u1');
      expect(warning_level).toBe('critical');
    });

    it('sets warning_level "high" when >= 90% used', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '9100' }]));
      const { warning_level } = await service.getUsageStatus('u1');
      expect(warning_level).toBe('high');
    });

    it('sets warning_level "medium" when >= 80% used', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '8100' }]));
      const { warning_level } = await service.getUsageStatus('u1');
      expect(warning_level).toBe('medium');
    });

    it('handles zero limit gracefully (no division by zero)', async () => {
      db.pg.select
        .mockReturnValueOnce(makeChain([{ ...mockUser, monthlyTokenLimit: 0 }]))
        .mockReturnValueOnce(makeChain([{ total: '0' }]));
      const status = await service.getUsageStatus('u1');
      expect(status.usage_percentage).toBe(0);
    });
  });

  // ─── getMonthlyUsage ─────────────────────────────────────────────────────────

  describe('getMonthlyUsage', () => {
    const mockRows = [
      {
        month: '2026-02',
        totalInputTokens: '100',
        totalOutputTokens: '50',
        totalTokens: '150',
        totalCost: '0.001',
        requestCount: 1,
      },
    ];

    it('returns mapped monthly rows', async () => {
      db.pg.select.mockReturnValue(makeChain(mockRows));
      const result = await service.getMonthlyUsage('u1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({ month: '2026-02', total_tokens: 150 });
    });

    it('returns empty array when no data', async () => {
      db.pg.select.mockReturnValue(makeChain([]));
      const result = await service.getMonthlyUsage('u1', '2026-01', '2026-02');
      expect(result).toEqual([]);
    });

    it('accepts explicit startMonth/endMonth parameters', async () => {
      db.pg.select.mockReturnValue(makeChain(mockRows));
      const result = await service.getMonthlyUsage('u1', '2025-03', '2026-02');
      expect(result[0].month).toBe('2026-02');
    });
  });

  // ─── getProviderBreakdown ────────────────────────────────────────────────────

  describe('getProviderBreakdown', () => {
    it('returns mapped provider breakdown rows', async () => {
      const rows = [
        {
          month: '2026-02',
          provider: 'bedrock',
          totalInputTokens: '100',
          totalOutputTokens: '50',
          totalTokens: '150',
          totalCost: '0.001',
          requestCount: 1,
        },
      ];
      db.pg.select.mockReturnValue(makeChain(rows));
      const result = await service.getProviderBreakdown('u1');
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        month: '2026-02',
        provider: 'bedrock',
        total_tokens: 150,
      });
    });

    it('returns empty array when no data', async () => {
      db.pg.select.mockReturnValue(makeChain([]));
      const result = await service.getProviderBreakdown(
        'u1',
        '2026-01',
        '2026-02',
      );
      expect(result).toEqual([]);
    });
  });

  // ─── getNodeMetrics ──────────────────────────────────────────────────────────

  describe('getNodeMetrics', () => {
    it('aggregates per-node tokens/latency and summary stats', async () => {
      const rows = [
        {
          requestId: 'req-1',
          agentType: 'router',
          inputTokens: 10,
          outputTokens: 5,
          requestMetadata: { duration_ms: 100, attempt: 1 },
        },
        {
          requestId: 'req-1',
          agentType: 'critic',
          inputTokens: 20,
          outputTokens: 10,
          requestMetadata: { duration_ms: 120, attempt: 1, parsed_valid: true },
        },
        {
          requestId: 'req-2',
          agentType: 'sql_writer',
          inputTokens: 30,
          outputTokens: 15,
          requestMetadata: {
            duration_ms: 250,
            attempt: 2,
            selected_table_count: 4,
            sql_table_count: 2,
          },
        },
      ];

      db.pg.select.mockReturnValue(makeChain(rows));

      const result = await service.getNodeMetrics('u1', '2026-01', '2026-02');

      expect(result.user_id).toBe('u1');
      expect(result.summary.request_count).toBe(2);
      expect(result.summary.avg_attempts_per_request).toBe(1.5);
      expect(result.summary.first_pass_validity_rate).toBe(1);
      expect(result.node_metrics.length).toBeGreaterThan(0);

      const router = result.node_metrics.find((m) => m.node === 'router');
      expect(router).toMatchObject({
        total_tokens: 15,
        call_count: 1,
        avg_latency_ms: 100,
      });
    });
  });

  // ─── getAllUsersUsage ─────────────────────────────────────────────────────────

  describe('getAllUsersUsage', () => {
    it('returns empty array when no active users exist', async () => {
      db.pg.select.mockReturnValue(makeChain([]));
      const result = await service.getAllUsersUsage();
      expect(result).toEqual([]);
    });
  });

  // ─── updateUserQuota ─────────────────────────────────────────────────────────

  describe('updateUserQuota', () => {
    it('updates quota and returns new quota info', async () => {
      db.pg.update.mockReturnValue(makeChain());
      db.pg.select.mockReturnValue(
        makeChain([{ ...mockUser, monthlyTokenLimit: 20000 }]),
      );
      const result = await service.updateUserQuota('u1', 20000);
      expect(result).toMatchObject({ user_id: 'u1', new_limit: 20000 });
      expect(db.pg.update).toHaveBeenCalled();
    });
  });

  // ─── logTokenUsage ───────────────────────────────────────────────────────────

  describe('logTokenUsage', () => {
    it('inserts a usage record and emits an SSE event', async () => {
      db.pg.insert.mockReturnValue(makeChain());
      // Two select calls for getUsageStatus inside logTokenUsage
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '600' }]));

      await service.logTokenUsage(
        'u1',
        Provider.BEDROCK,
        'sonnet',
        100,
        50,
        AgentRole.ROUTER,
      );

      expect(db.pg.insert).toHaveBeenCalled();
      expect(eventsService.emit).toHaveBeenCalled();
    });

    it('uses provided requestId when given', async () => {
      db.pg.insert.mockReturnValue(makeChain());
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '100' }]));
      // Should not throw even when a specific request id is passed
      await expect(
        service.logTokenUsage(
          'u1',
          Provider.OPENAI,
          'gpt-4.1',
          10,
          10,
          undefined,
          {},
          'req-123',
        ),
      ).resolves.not.toThrow();
    });

    it('swallows SSE emit errors without rejecting', async () => {
      db.pg.insert.mockReturnValue(makeChain());
      // Empty users → getUsageStatus returns 0 limit — emit path still executes
      db.pg.select
        .mockReturnValueOnce(makeChain([mockUser]))
        .mockReturnValueOnce(makeChain([{ total: '100' }]));
      eventsService.emit.mockImplementationOnce(() => {
        throw new Error('SSE failure');
      });
      await expect(
        service.logTokenUsage('u1', Provider.LOCAL, 'llama', 10, 10),
      ).resolves.not.toThrow();
    });
  });
});
