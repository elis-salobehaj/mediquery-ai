import type { Response } from 'express';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';

function makeRes(): Response {
  return {
    setHeader: vi.fn(),
    flushHeaders: vi.fn(),
    write: vi.fn().mockReturnValue(true),
    end: vi.fn(),
  } as unknown as Response;
}

describe('TokenUsageEventsService', () => {
  let service: TokenUsageEventsService;

  beforeEach(() => {
    service = new TokenUsageEventsService();
  });

  describe('subscribe()', () => {
    it('sets the correct SSE headers and flushes', () => {
      const res = makeRes();
      service.subscribe('user-1', res);
      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-transform');
      expect(res.flushHeaders).toHaveBeenCalledTimes(1);
    });

    it('returns a cleanup function that removes the subscriber', () => {
      const res = makeRes();
      const cleanup = service.subscribe('user-1', res);

      // Emit before cleanup – should reach the subscriber
      service.emit('user-1', { tokens_used: 100 });
      expect(res.write).toHaveBeenCalledTimes(1);

      cleanup();

      // Emit after cleanup – subscriber was removed, write should not be called again
      service.emit('user-1', { tokens_used: 200 });
      expect(res.write).toHaveBeenCalledTimes(1);
    });

    it('supports multiple concurrent wait_times for the same user', () => {
      const res1 = makeRes();
      const res2 = makeRes();
      service.subscribe('user-1', res1);
      service.subscribe('user-1', res2);

      service.emit('user-1', { tokens_used: 50 });

      expect(res1.write).toHaveBeenCalledTimes(1);
      expect(res2.write).toHaveBeenCalledTimes(1);
    });
  });

  describe('emit()', () => {
    it('is a no-op when the user has no subscribers', () => {
      // Should not throw
      expect(() => service.emit('unknown-user', { tokens_used: 0 })).not.toThrow();
    });

    it('serialises the payload as an SSE data frame', () => {
      const res = makeRes();
      service.subscribe('user-1', res);

      const payload = { tokens_used: 500, tokens_limit: 1000 };
      service.emit('user-1', payload);

      const written = (res.write as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(written).toBe(`data: ${JSON.stringify(payload)}\n\n`);
    });

    it('prunes a dead wait_time that throws on write', () => {
      const good = makeRes();
      const dead = makeRes();
      (dead.write as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('socket closed');
      });

      service.subscribe('user-1', good);
      service.subscribe('user-1', dead);

      // Should not throw, and should prune the dead wait_time
      expect(() => service.emit('user-1', { tokens_used: 1 })).not.toThrow();

      // Only the good res was written successfully
      expect(good.write).toHaveBeenCalledTimes(1);

      // Dead wait_time should be purged; a second emit only hits the good one
      service.emit('user-1', { tokens_used: 2 });
      expect(good.write).toHaveBeenCalledTimes(2);
      expect(dead.write).toHaveBeenCalledTimes(1); // still only the first (failed) call
    });
  });
});
