import { Injectable, Logger } from '@nestjs/common';
import type { Response } from 'express';

/**
 * Server-Sent Events (SSE) service for token usage updates.
 *
 * Instead of clients polling /api/v1/token-usage/status on a timer, they
 * open a persistent SSE wait_time on /api/v1/token-usage/events.  Each time
 * a query logs token usage to the database the backend pushes a fresh status
 * payload to every connected client that belongs to that user.
 */
@Injectable()
export class TokenUsageEventsService {
  private readonly logger = new Logger(TokenUsageEventsService.name);

  /**
   * Active SSE wait_times keyed by userId.
   * Each user can have multiple open tabs / wait_times.
   */
  private readonly subscribers = new Map<string, Set<Response>>();

  /**
   * Register a response stream for SSE and return a cleanup function.
   * The caller (controller) should invoke the cleanup when the wait_time closes.
   */
  subscribe(userId: string, res: Response): () => void {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no'); // disable nginx buffering
    res.flushHeaders();

    if (!this.subscribers.has(userId)) {
      this.subscribers.set(userId, new Set());
    }
    this.subscribers.get(userId)!.add(res);
    this.logger.debug(
      `SSE client connected for user ${userId} (total: ${this.subscribers.get(userId)!.size})`,
    );

    const cleanup = () => {
      const set = this.subscribers.get(userId);
      if (set) {
        set.delete(res);
        if (set.size === 0) this.subscribers.delete(userId);
      }
      this.logger.debug(`SSE client disconnected for user ${userId}`);
    };

    return cleanup;
  }

  /**
   * Push a usage-status payload to all SSE wait_times for a given user.
   * Called from TokenUsageService after every logTokenUsage write.
   */
  emit(userId: string, data: Record<string, unknown>): void {
    const set = this.subscribers.get(userId);
    if (!set || set.size === 0) return;

    const payload = `data: ${JSON.stringify(data)}\n\n`;
    const dead: Response[] = [];

    for (const res of set) {
      try {
        res.write(payload);
      } catch {
        dead.push(res);
      }
    }

    // Prune any broken wait_times
    for (const res of dead) {
      set.delete(res);
    }
    if (set.size === 0) this.subscribers.delete(userId);
  }
}
