import { Test, TestingModule } from '@nestjs/testing';
import { ThreadsController } from '@/threads/threads.controller';
import { ThreadsService } from '@/threads/threads.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('ThreadsController', () => {
  let controller: ThreadsController;
  let service: {
    getUserThreads: ReturnType<typeof vi.fn>;
    createThread: ReturnType<typeof vi.fn>;
    getThreadMessages: ReturnType<typeof vi.fn>;
    deleteThread: ReturnType<typeof vi.fn>;
    updateThread: ReturnType<typeof vi.fn>;
  };
  beforeEach(async () => {
    service = {
      getUserThreads: vi.fn().mockResolvedValue([]),
      createThread: vi.fn().mockResolvedValue('new-id'),
      getThreadMessages: vi.fn().mockResolvedValue([]),
      deleteThread: vi.fn().mockResolvedValue(undefined),
      updateThread: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ThreadsController],
      providers: [{ provide: ThreadsService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ThreadsController>(ThreadsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── GET / ─────────────────────────────────────────────────────────────

  describe('GET / (getThreads)', () => {
    it('returns threads for the authenticated user', async () => {
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getThreads(req);
      expect(result).toHaveProperty('threads');
      expect(service.getUserThreads).toHaveBeenCalledWith('user-1');
    });

    it('returns threads array with correct shape', async () => {
      service.getUserThreads.mockResolvedValue([
        { id: 't1', title: 'Chat 1', updated_at: 1700000000, pinned: true },
      ]);
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.getThreads(req);
      expect(result.threads).toHaveLength(1);
      expect(result.threads[0].id).toBe('t1');
      expect(result.threads[0].pinned).toBe(true);
    });
  });

  // ─── POST / ───────────────────────────────────────────────────────────

  describe('POST / (createThread)', () => {
    it('creates a thread and returns id and title', async () => {
      const req = {
        user: { id: 'user-1' },
      } as unknown as import('express').Request;
      const result = await controller.createThread(req, {
        title: 'New Thread',
      });
      expect(result).toEqual({ id: 'new-id', title: 'New Thread' });
      expect(service.createThread).toHaveBeenCalledWith('user-1', 'New Thread');
    });
  });

  // ─── GET /:thread_id/messages ─────────────────────────────────────

  describe('GET /:thread_id/messages', () => {
    it('returns messages for a given thread', async () => {
      service.getThreadMessages.mockResolvedValue([
        {
          id: 'm1',
          role: 'user',
          text: 'hello',
          timestamp: 1700000000,
          meta: {},
        },
      ]);
      const result = await controller.getMessages('thread-1');
      expect(result).toEqual({
        messages: [
          {
            id: 'm1',
            role: 'user',
            text: 'hello',
            timestamp: 1700000000,
            meta: {},
          },
        ],
      });
      expect(service.getThreadMessages).toHaveBeenCalledWith('thread-1');
    });

    it('returns empty messages array when thread has no messages', async () => {
      const result = await controller.getMessages('empty-thread');
      expect(result.messages).toEqual([]);
    });
  });

  // ─── DELETE /:thread_id ────────────────────────────────────────────

  describe('DELETE /:thread_id', () => {
    it('deletes a thread and returns status success', async () => {
      const result = await controller.deleteThread('thread-1');
      expect(result).toEqual({ status: 'success' });
      expect(service.deleteThread).toHaveBeenCalledWith('thread-1');
    });
  });

  // ─── PATCH /:thread_id ─────────────────────────────────────────────

  describe('PATCH /:thread_id', () => {
    it('updates thread title and returns status success', async () => {
      const result = await controller.updateThread('thread-1', {
        title: 'Updated Title',
      });
      expect(result).toEqual({ status: 'success' });
      expect(service.updateThread).toHaveBeenCalledWith(
        'thread-1',
        'Updated Title',
        undefined,
      );
    });

    it('updates thread pinned status and returns status success', async () => {
      const result = await controller.updateThread('thread-1', {
        pinned: true,
      });
      expect(result).toEqual({ status: 'success' });
      expect(service.updateThread).toHaveBeenCalledWith(
        'thread-1',
        undefined,
        true,
      );
    });

    it('updates thread without a title (empty DTO)', async () => {
      const result = await controller.updateThread('thread-1', {});
      expect(result).toEqual({ status: 'success' });
      expect(service.updateThread).toHaveBeenCalledWith(
        'thread-1',
        undefined,
        undefined,
      );
    });
  });
});
