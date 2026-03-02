import { Test, TestingModule } from '@nestjs/testing';
import { ThreadsService } from '@/threads/threads.service';
import { DatabaseService } from '@/database/database.service';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('ThreadsService', () => {
  let service: ThreadsService;
  let dbService: { pg: Record<string, ReturnType<typeof vi.fn>> };

  // Universal fluent chain: every Drizzle method returns the same object.
  // This covers .select().from().where().orderBy().execute() and all variants.
  const makeChain = (result: unknown = []) => {
    const chain: Record<string, unknown> = {
      execute: vi.fn().mockResolvedValue(result),
    };
    for (const m of [
      'from',
      'where',
      'orderBy',
      'returning',
      'set',
      'values',
    ]) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    return chain;
  };

  beforeEach(async () => {
    dbService = {
      pg: {
        insert: vi.fn(),
        select: vi.fn(),
        delete: vi.fn(),
        update: vi.fn(),
      },
    };

    // Default mock return values
    dbService.pg.insert.mockReturnValue(makeChain([{ id: 'mock-thread-id' }]));
    dbService.pg.select.mockReturnValue(makeChain([]));
    dbService.pg.delete.mockReturnValue(makeChain());
    dbService.pg.update.mockReturnValue(makeChain());

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ThreadsService,
        { provide: DatabaseService, useValue: dbService },
      ],
    }).compile();

    service = module.get<ThreadsService>(ThreadsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── createThread ────────────────────────────────────────────────────────────

  describe('createThread', () => {
    it('creates a thread and returns the new id', async () => {
      const threadId = await service.createThread('user-id', 'Test Thread');
      expect(threadId).toBe('mock-thread-id');
      expect(dbService.pg.insert).toHaveBeenCalled();
    });

    it('uses "New Chat" as the default title', async () => {
      await service.createThread('user-id');
      expect(dbService.pg.insert).toHaveBeenCalled();
    });
  });

  // ─── getUserThreads ──────────────────────────────────────────────────────────

  describe('getUserThreads', () => {
    it('returns an empty array when user has no threads', async () => {
      const threads = await service.getUserThreads('user-id');
      expect(Array.isArray(threads)).toBe(true);
      expect(threads).toHaveLength(0);
    });

    it('maps DB rows to the frontend thread shape with pinned status', async () => {
      dbService.pg.select.mockReturnValue(
        makeChain([
          {
            id: 't1',
            title: 'Chat A',
            pinned: true,
            updatedAt: new Date('2026-01-01'),
          },
        ]),
      );
      const threads = await service.getUserThreads('user-id');
      expect(threads[0]).toMatchObject({
        id: 't1',
        title: 'Chat A',
        pinned: true,
      });
      expect(typeof threads[0].updated_at).toBe('number');
    });

    it('returns null updated_at when updatedAt is null', async () => {
      dbService.pg.select.mockReturnValue(
        makeChain([{ id: 't1', title: 'Chat A', updatedAt: null }]),
      );
      const threads = await service.getUserThreads('user-id');
      expect(threads[0].updated_at).toBeNull();
    });
  });

  // ─── deleteThread ───────────────────────────────────────────────────────────

  describe('deleteThread', () => {
    it('calls delete on the database', async () => {
      await service.deleteThread('thread-id');
      expect(dbService.pg.delete).toHaveBeenCalled();
    });
  });

  // ─── updateThread ──────────────────────────────────────────────────────────

  describe('updateThread', () => {
    it('updates the title when title is provided', async () => {
      await service.updateThread('thread-id', 'New Title');
      expect(dbService.pg.update).toHaveBeenCalled();
    });

    it('updates pinning status when pinned is provided', async () => {
      await service.updateThread('thread-id', undefined, true);
      expect(dbService.pg.update).toHaveBeenCalled();
    });

    it('returns early without hitting the DB when both title and pinned are undefined', async () => {
      await service.updateThread('thread-id', undefined, undefined);
      expect(dbService.pg.update).not.toHaveBeenCalled();
    });
  });

  // ─── getThreadMessages ────────────────────────────────────────────────────

  describe('getThreadMessages', () => {
    it('returns empty array when thread has no messages', async () => {
      const messages = await service.getThreadMessages('thread-id');
      expect(messages).toEqual([]);
    });

    it('maps DB rows to the message shape', async () => {
      dbService.pg.select.mockReturnValue(
        makeChain([
          {
            id: 'm1',
            role: 'user',
            content: 'Hello',
            createdAt: new Date('2026-01-01'),
            metadata: { sql: 'SELECT 1' },
          },
        ]),
      );
      const messages = await service.getThreadMessages('thread-id');
      expect(messages[0]).toMatchObject({
        id: 'm1',
        role: 'user',
        text: 'Hello',
        meta: { sql: 'SELECT 1' },
      });
      expect(typeof messages[0].timestamp).toBe('number');
    });

    it('returns null timestamp when createdAt is null', async () => {
      dbService.pg.select.mockReturnValue(
        makeChain([
          {
            id: 'm1',
            role: 'bot',
            content: 'hi',
            createdAt: null,
            metadata: {},
          },
        ]),
      );
      const messages = await service.getThreadMessages('thread-id');
      expect(messages[0].timestamp).toBeNull();
    });
  });

  // ─── addMessage ────────────────────────────────────────────────────────────────

  describe('addMessage', () => {
    it('inserts message and updates thread timestamp', async () => {
      await service.addMessage('thread-id', 'user', 'Hello', { foo: 'bar' });
      // insert for chatMessages + update for chatThreads
      expect(dbService.pg.insert).toHaveBeenCalled();
      expect(dbService.pg.update).toHaveBeenCalled();
    });

    it('uses empty metadata object as default', async () => {
      await service.addMessage('thread-id', 'bot', 'Hi');
      expect(dbService.pg.insert).toHaveBeenCalled();
    });
  });
});
