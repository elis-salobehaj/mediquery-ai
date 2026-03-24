import { ForbiddenException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { TokenUsageController } from '@/token-usage/token-usage.controller';
import { TokenUsageService } from '@/token-usage/token-usage.service';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';

describe('TokenUsageController', () => {
  let controller: TokenUsageController;
  let service: {
    getUsageStatus: ReturnType<typeof vi.fn>;
    getMonthlyUsage: ReturnType<typeof vi.fn>;
    getProviderBreakdown: ReturnType<typeof vi.fn>;
    getNodeMetrics: ReturnType<typeof vi.fn>;
    getAllUsersUsage: ReturnType<typeof vi.fn>;
    updateUserQuota: ReturnType<typeof vi.fn>;
  };
  let eventsService: {
    subscribe: ReturnType<typeof vi.fn>;
    emit: ReturnType<typeof vi.fn>;
  };

  const mockStatus = {
    tokens_used: 100,
    tokens_limit: 10000,
    usage_percentage: 1,
    warning_level: 'normal',
    can_proceed: true,
    tokens_remaining: 9900,
    month: '2026-02',
  };

  beforeEach(async () => {
    service = {
      getUsageStatus: vi.fn().mockResolvedValue(mockStatus),
      getMonthlyUsage: vi.fn().mockResolvedValue([]),
      getProviderBreakdown: vi.fn().mockResolvedValue([]),
      getNodeMetrics: vi.fn().mockResolvedValue({
        user_id: 'user-1',
        window: { start_month: '2026-01', end_month: '2026-02' },
        summary: {
          request_count: 1,
          avg_attempts_per_request: 1,
          first_pass_validity_rate: 1,
        },
        node_metrics: [],
      }),
      getAllUsersUsage: vi.fn().mockResolvedValue([]),
      updateUserQuota: vi.fn().mockResolvedValue({ user_id: 'u2', new_limit: 5000 }),
    };

    eventsService = {
      subscribe: vi.fn().mockReturnValue(() => {}), // returns cleanup fn
      emit: vi.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [TokenUsageController],
      providers: [
        { provide: TokenUsageService, useValue: service },
        { provide: TokenUsageEventsService, useValue: eventsService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<TokenUsageController>(TokenUsageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── GET / ────────────────────────────────────────────────────────────────────

  describe('GET / (getCurrentUsage)', () => {
    it('returns current usage for the authenticated user', async () => {
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      await controller.getCurrentUsage(req);
      expect(service.getUsageStatus).toHaveBeenCalledWith('user-1');
    });
  });

  // ─── GET /status ──────────────────────────────────────────────────────────────

  describe('GET /status', () => {
    it('delegates to getUsageStatus and includes thresholds', async () => {
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getUsageStatus(req);
      expect(service.getUsageStatus).toHaveBeenCalledWith('user-1');
      expect(result).toHaveProperty('thresholds');
      expect(result.thresholds).toMatchObject({
        normal: 0,
        medium: 80,
        high: 90,
        critical: 95,
      });
    });
  });

  // ─── GET /monthly ─────────────────────────────────────────────────────────────

  describe('GET /monthly', () => {
    it('returns usage array wrapped with user_id', async () => {
      service.getMonthlyUsage.mockResolvedValue([{ month: '2026-02', total_tokens: 500 }]);
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getMonthlyUsage(req, '2026-01', '2026-02');
      expect(result).toEqual({
        user_id: 'user-1',
        usage: [{ month: '2026-02', total_tokens: 500 }],
      });
      expect(service.getMonthlyUsage).toHaveBeenCalledWith('user-1', '2026-01', '2026-02');
    });

    it('works without optional query params', async () => {
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getMonthlyUsage(req);
      expect(result).toHaveProperty('user_id', 'user-1');
      expect(service.getMonthlyUsage).toHaveBeenCalledWith('user-1', undefined, undefined);
    });
  });

  // ─── GET /monthly/breakdown ───────────────────────────────────────────────────

  describe('GET /monthly/breakdown', () => {
    it('returns provider breakdown wrapped with user_id', async () => {
      service.getProviderBreakdown.mockResolvedValue([{ month: '2026-02', provider: 'bedrock' }]);
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getProviderBreakdown(req, '2026-01', '2026-02');
      expect(result.user_id).toBe('user-1');
      expect(result.usage).toHaveLength(1);
    });
  });

  // ─── GET /metrics/nodes ──────────────────────────────────────────────────────

  describe('GET /metrics/nodes', () => {
    it('returns node metrics for authenticated user', async () => {
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getNodeMetrics(req, '2026-01', '2026-02');

      expect(service.getNodeMetrics).toHaveBeenCalledWith('user-1', '2026-01', '2026-02');
      expect(result).toHaveProperty('summary');
      expect(result).toHaveProperty('node_metrics');
    });
  });

  // ─── GET /events (SSE) ────────────────────────────────────────────────────────

  describe('GET /events (SSE)', () => {
    it('subscribes user to the SSE stream', async () => {
      const req = {
        user: { id: 'user-2' },
        on: vi.fn(),
      } as unknown as import('express').Request;
      const res = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      await controller.streamEvents(req, res as any);
      expect(eventsService.subscribe).toHaveBeenCalledWith('user-2', res);
    });

    it('pushes an initial status event immediately on connect', async () => {
      const req = {
        user: { id: 'user-2' },
        on: vi.fn(),
      } as unknown as import('express').Request;
      const res = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      await controller.streamEvents(req, res as any);
      expect(service.getUsageStatus).toHaveBeenCalledWith('user-2');
      expect(eventsService.emit).toHaveBeenCalledWith(
        'user-2',
        expect.objectContaining({ tokens_used: 100 }),
      );
    });

    it('registers close and error handlers for cleanup', async () => {
      const req = {
        user: { id: 'user-2' },
        on: vi.fn(),
      } as unknown as import('express').Request;
      const res = { on: vi.fn(), write: vi.fn(), end: vi.fn() };
      await controller.streamEvents(req, res as any);
      expect(req.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(req.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  // ─── GET /admin/users ────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('returns all users usage for admin', async () => {
      service.getAllUsersUsage.mockResolvedValue([{ user_id: 'u1', username: 'alice' }]);
      const req = {
        user: { id: 'admin-1', role: 'admin' },
      } as unknown as import('express').Request;
      const result = await controller.getAllUsersUsage(req, '2026-02');
      expect(result).toHaveLength(1);
      expect(service.getAllUsersUsage).toHaveBeenCalledWith('2026-02');
    });

    it('throws ForbiddenException for non-admin users', async () => {
      const req = {
        user: { id: 'user-1', role: 'user' },
      } as unknown as import('express').Request;
      await expect(controller.getAllUsersUsage(req)).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── PUT /admin/users/:user_id/quota ─────────────────────────────────────────

  describe('PUT /admin/users/:user_id/quota', () => {
    it('updates quota for admin', async () => {
      const req = {
        user: { id: 'admin-1', role: 'admin' },
      } as unknown as import('express').Request;
      const result = await controller.updateUserQuota(req, 'u2', 5000);
      expect(result).toMatchObject({ user_id: 'u2', new_limit: 5000 });
      expect(service.updateUserQuota).toHaveBeenCalledWith('u2', 5000);
    });

    it('throws ForbiddenException for non-admin users', async () => {
      const req = {
        user: { id: 'user-1', role: 'user' },
      } as unknown as import('express').Request;
      await expect(controller.updateUserQuota(req, 'u2', 5000)).rejects.toThrow(ForbiddenException);
    });
  });
});
