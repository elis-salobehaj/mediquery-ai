import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GraphBuilder } from '@/ai/graph';
import { InsightService } from '@/ai/insight.service';
import { QueriesController } from '@/ai/queries.controller';
import { VisualizationService } from '@/ai/visualization.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { DatabaseService } from '@/database/database.service';
import { ThreadMemoryService } from '@/threads/thread-memory.service';
import { ThreadsService } from '@/threads/threads.service';
import { UserMemoryPreferencesService } from '@/threads/user-memory-preferences.service';

describe('QueriesController', () => {
  let controller: QueriesController;
  let graphBuilder: any;
  let threadsService: any;
  let dbService: any;
  let threadMemoryService: any;
  let insightService: any;
  let visualizationService: any;
  let userMemoryPreferencesService: any;

  // Minimal graph mock – invoke returns a resolved GraphState
  const mockWorkflow = {
    invoke: vi.fn().mockResolvedValue({
      generated_sql: 'SELECT 1',
      validation_result: { valid: true },
      messages: [],
      attempt_count: 1,
      reflections: [],
    }),
    stream: vi.fn().mockReturnValue(
      (async function* () {
        yield {
          sql_writer: {
            thoughts: ['writing sql'],
            generated_sql: 'SELECT 1',
            validation_result: { valid: true },
            messages: [],
            attempt_count: 1,
            reflections: [],
          },
        };
      })(),
    ),
  };

  beforeEach(async () => {
    mockWorkflow.invoke.mockClear();
    mockWorkflow.stream.mockClear();

    graphBuilder = { build: vi.fn().mockReturnValue(mockWorkflow) };
    threadsService = {
      createThread: vi.fn().mockResolvedValue('thread-123'),
      addMessage: vi.fn().mockResolvedValue(undefined),
      getThreadMessages: vi.fn().mockResolvedValue([]),
    };
    threadMemoryService = {
      upsertThreadMemory: vi.fn((_, __, memory) => memory),
    };
    userMemoryPreferencesService = {
      getUserMemoryPreferences: vi.fn().mockResolvedValue(null),
      upsertUserMemoryPreferences: vi.fn().mockResolvedValue(null),
    };
    dbService = {
      executeQuery: vi.fn().mockResolvedValue({
        data: [{ val: 1 }],
        row_count: 1,
        columns: ['val'],
      }),
    };
    insightService = {
      generateInsight: vi.fn().mockResolvedValue('Great data!'),
    };
    visualizationService = {
      determineVisualization: vi.fn().mockResolvedValue('bar'),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueriesController],
      providers: [
        { provide: GraphBuilder, useValue: graphBuilder },
        { provide: ThreadsService, useValue: threadsService },
        { provide: ThreadMemoryService, useValue: threadMemoryService },
        {
          provide: UserMemoryPreferencesService,
          useValue: userMemoryPreferencesService,
        },
        { provide: DatabaseService, useValue: dbService },
        { provide: InsightService, useValue: insightService },
        { provide: VisualizationService, useValue: visualizationService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<QueriesController>(QueriesController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('POST /query – model_id / model_provider contract', () => {
    const mockReq = {
      user: { id: 'user-1', username: 'alice' },
    } as unknown as import('express').Request;

    it('passes model_provider and model_id as selected_provider / selected_model_override', async () => {
      await controller.query(
        {
          question: 'show persons',
          model_id: 'gpt-5.2',
          model_provider: 'openai',
        },
        mockReq,
      );

      const invokeArg = mockWorkflow.invoke.mock.calls[0][0];
      expect(invokeArg.selected_provider).toBe('openai');
      expect(invokeArg.selected_model_override).toBe('gpt-5.2');
    });

    it('passes undefined provider/model when neither field is supplied', async () => {
      await controller.query({ question: 'show persons' }, mockReq);

      const invokeArg = mockWorkflow.invoke.mock.calls[0][0];
      expect(invokeArg.selected_provider).toBeUndefined();
      expect(invokeArg.selected_model_override).toBeUndefined();
    });

    it('forwards model_provider to insightService and visualizationService', async () => {
      await controller.query(
        {
          question: 'show persons',
          model_provider: 'gemini',
          model_id: 'gemini-1.5-pro',
        },
        mockReq,
      );

      expect(insightService.generateInsight).toHaveBeenCalledWith(
        'show persons',
        expect.anything(),
        'user-1',
        'gemini',
      );
      expect(visualizationService.determineVisualization).toHaveBeenCalledWith(
        'show persons',
        expect.anything(),
        'user-1',
        'gemini',
      );
    });

    it('returns sql, data, insight, visualization_type and meta', async () => {
      const result = await controller.query({ question: 'show persons' }, mockReq);
      expect(result).toMatchObject({
        sql: expect.any(String),
        data: expect.any(Object),
        insight: 'Great data!',
        visualization_type: 'bar',
        meta: expect.objectContaining({ thread_id: 'thread-123' }),
      });
    });

    it('skips memory when enable_memory is false', async () => {
      await controller.query({ question: 'show persons', enable_memory: false }, mockReq);

      expect(threadMemoryService.upsertThreadMemory).not.toHaveBeenCalled();
    });

    it('uses non-DATA AI message directly for DOMAIN_KNOWLEDGE responses', async () => {
      mockWorkflow.invoke.mockResolvedValueOnce({
        generated_sql: '',
        routing_decision: 'DOMAIN_KNOWLEDGE',
        validation_result: { valid: false },
        messages: [
          {
            _getType: () => 'ai',
            content: 'Schema summary from meta agent',
          },
        ],
        attempt_count: 1,
        reflections: [],
      });

      const result = await controller.query({ question: 'what data is in my database?' }, mockReq);

      expect(result.insight).toBe('Schema summary from meta agent');
      expect(result.visualization_type).toBe('text');
      expect(insightService.generateInsight).not.toHaveBeenCalledWith(
        'what data is in my database?',
        expect.anything(),
        'user-1',
        expect.anything(),
      );
    });
  });
});
