import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Res,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { GraphBuilder } from './graph';
import { ThreadsService } from '@/threads/threads.service';
import { DatabaseService } from '@/database/database.service';
import { InsightService } from './insight.service';
import { VisualizationService } from './visualization.service';
import { GraphState } from './state';
import { HumanMessage, BaseMessage } from '@langchain/core/messages';
import type { KpiQueryResult } from '@/common/types';
import { randomUUID } from 'crypto';
import {
  deriveScopedMemory,
  MEMORY_SOURCE_MESSAGE_LIMIT,
} from '@/ai/memory-context';
import { ThreadMemoryService } from '@/threads/thread-memory.service';
import { UserMemoryPreferencesService } from '@/threads/user-memory-preferences.service';

import { QueryRequestDto, QueryRequestSchema } from './dto/query-request.dto';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

function isClinicalUnitSystem(value?: string): value is 'SI' | 'conventional' {
  return value === 'SI' || value === 'conventional';
}

@Controller('api/v1/queries')
export class QueriesController {
  constructor(
    private readonly graphBuilder: GraphBuilder,
    private readonly threadsService: ThreadsService,
    private readonly threadMemoryService: ThreadMemoryService,
    private readonly userMemoryPreferencesService: UserMemoryPreferencesService,
    private readonly dbService: DatabaseService,
    private readonly insightService: InsightService,
    private readonly visualizationService: VisualizationService,
  ) {}

  private async buildScopedMemory(
    threadId: string,
    userId: string,
    question: string,
    enableMemory?: boolean,
  ) {
    if (enableMemory === false) {
      return {
        active_persons: [],
        confidence: 0,
        summary: 'Memory disabled by user settings',
        updated_at: new Date().toISOString(),
      };
    }

    const recentMessages = await this.threadsService.getThreadMessages(
      threadId,
      MEMORY_SOURCE_MESSAGE_LIMIT,
    );
    const persistedPreferences =
      await this.userMemoryPreferencesService.getUserMemoryPreferences(userId);

    const derived = deriveScopedMemory(
      question,
      recentMessages.map((message) => ({
        role: message.role,
        text: message.text,
      })),
    );

    const mergedMemory = {
      ...derived,
      preferred_clinical_units:
        derived.preferred_clinical_units ||
        persistedPreferences?.preferredUnits ||
        undefined,
    };

    const scopedMemory = this.threadMemoryService.upsertThreadMemory(
      threadId,
      userId,
      mergedMemory,
    );

    if (
      isClinicalUnitSystem(scopedMemory.preferred_clinical_units) &&
      scopedMemory.preferred_clinical_units !== persistedPreferences?.preferredUnits
    ) {
      await this.userMemoryPreferencesService.upsertUserMemoryPreferences(
        userId,
        {
          preferredUnits: scopedMemory.preferred_clinical_units,
        },
      );
    }

    return scopedMemory;
  }

  private getLastAiMessage(finalState: GraphState): string | null {
    const aiMessages = (finalState.messages || []).filter(
      (m: BaseMessage) => m._getType() === 'ai',
    );
    if (aiMessages.length === 0) {
      return null;
    }

    const last = aiMessages[aiMessages.length - 1];
    return typeof last.content === 'string'
      ? last.content
      : JSON.stringify(last.content);
  }

  @Post('query')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async query(
    @Body(new ZodValidationPipe(QueryRequestSchema)) request: QueryRequestDto,
    @Request() req: ExpressRequest,
  ) {
    const userId = req.user!.id;
    let threadId = request.thread_id;

    if (!threadId) {
      const title =
        request.question.length > 30
          ? request.question.slice(0, 30) + '...'
          : request.question;
      threadId = await this.threadsService.createThread(userId, title);
    }

    await this.threadsService.addMessage(threadId, 'user', request.question, {
      user: req.user!.username,
    });

    const scopedMemory = await this.buildScopedMemory(
      threadId,
      userId,
      request.question,
      request.enable_memory,
    );

    const workflow = this.graphBuilder.build();

    const selectedProvider = request.model_provider || undefined;
    const selectedModelOverride = request.model_id || undefined;
    const fastMode = request.fast_mode ?? false;
    const requestId = randomUUID();

    const initialState: Partial<GraphState> = {
      original_query: request.question,
      user_id: userId,
      request_id: requestId,
      messages: [new HumanMessage(request.question)],
      start_time: Date.now() / 1000,
      // Fast mode caps at 1 attempt (no reflection loop) and skips the router LLM call.
      max_attempts: fastMode ? 1 : 3,
      timeout_seconds: 120,
      selected_provider: selectedProvider,
      selected_model_override: selectedModelOverride,
      scoped_memory: scopedMemory,
      fast_mode: fastMode,
    };

    const finalState = (await workflow.invoke(
      initialState,
    )) as unknown as GraphState;

    const sqlQuery = finalState.generated_sql;
    let results: KpiQueryResult | null = null;
    let error: string | null = null;

    if (sqlQuery && finalState.validation_result?.valid) {
      try {
        results = await this.dbService.executeQuery(sqlQuery);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    } else if (finalState.validation_result?.error) {
      error = finalState.validation_result.error;
    }

    let insight: string;
    let visType: string;
    const isUnsupportedIntent =
      finalState.validation_result?.error === 'UNSUPPORTED_INTENT';

    if (
      isUnsupportedIntent ||
      (finalState.routing_decision && finalState.routing_decision !== 'DATA')
    ) {
      insight =
        this.getLastAiMessage(finalState) ||
        'I can only help with questions about the Mediquery medical database.';
      visType = 'text';
    } else {
      insight = await this.insightService.generateInsight(
        request.question,
        results || { columns: [], data: [], row_count: 0 },
        userId,
        selectedProvider || undefined,
      );
      visType = await this.visualizationService.determineVisualization(
        request.question,
        results || { columns: [], data: [], row_count: 0 },
        userId,
        selectedProvider || undefined,
      );
    }

    const thoughts = (finalState.messages || [])
      .filter((m: BaseMessage) => m._getType() === 'ai')
      .map((m: BaseMessage) =>
        typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      );

    const response = {
      sql: sqlQuery || '',
      data: results || { row_count: 0, columns: [], data: [] },
      insight: insight,
      visualization_type: visType,
      attempts: finalState.attempt_count || 1,
      reflections: finalState.reflections || [],
      error: error,
      meta: {
        thoughts: thoughts,
        thread_id: threadId,
      },
    };

    await this.threadsService.addMessage(threadId, 'bot', insight, {
      sql: sqlQuery,
      data: results,
      visualization_type: visType,
      thoughts: response.meta.thoughts,
      attempts: response.attempts,
    });

    return response;
  }

  @Post('stream')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async stream(
    @Body(new ZodValidationPipe(QueryRequestSchema)) request: QueryRequestDto,
    @Request() req: ExpressRequest,
    @Res() res: Response,
  ) {
    const userId = req.user!.id;
    let threadId = request.thread_id;

    if (!threadId) {
      const title =
        request.question.length > 30
          ? request.question.slice(0, 30) + '...'
          : request.question;
      threadId = await this.threadsService.createThread(userId, title);
    }

    await this.threadsService.addMessage(threadId, 'user', request.question, {
      user: req.user!.username,
    });

    const scopedMemory = await this.buildScopedMemory(
      threadId,
      userId,
      request.question,
      request.enable_memory,
    );

    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');

    const sendEvent = (event: Record<string, unknown>) => {
      res.write(JSON.stringify(event) + '\n');
    };

    try {
      const workflow = this.graphBuilder.build();

      const selectedProvider = request.model_provider || undefined;
      const selectedModelOverride = request.model_id || undefined;
      const fastMode = request.fast_mode ?? false;
      const requestId = randomUUID();

      const initialState: Partial<GraphState> = {
        original_query: request.question,
        user_id: userId,
        request_id: requestId,
        messages: [new HumanMessage(request.question)],
        start_time: Date.now() / 1000,
        // Fast mode caps at 1 attempt (no reflection loop) and skips the router LLM call.
        max_attempts: fastMode ? 1 : 3,
        timeout_seconds: 120,
        selected_provider: selectedProvider,
        selected_model_override: selectedModelOverride,
        scoped_memory: scopedMemory,
        fast_mode: fastMode,
      };

      sendEvent({
        type: 'thought',
        content: fastMode
          ? '⚡ Initializing single-agent workflow...'
          : '🤖 Initializing multi-agent workflow...',
        node: 'initial',
      });

      let finalStateAccumulator: Partial<GraphState> = {};
      const sentThoughts = new Set<string>();

      // Stream events from graph
      const stream = await workflow.stream(initialState);
      for await (const event of stream) {
        for (const [nodeName, nodeState] of Object.entries(event)) {
          const state = nodeState as Partial<GraphState>;

          // Stream NEW thoughts
          if (state.thoughts) {
            for (const thought of state.thoughts) {
              if (!sentThoughts.has(thought)) {
                sentThoughts.add(thought);
                sendEvent({
                  type: 'thought',
                  content: thought,
                  node: nodeName,
                });
              }
            }
          }

          finalStateAccumulator = { ...finalStateAccumulator, ...state };
        }
      }

      const finalState = finalStateAccumulator as GraphState;

      // Final results execution
      const sqlQuery = finalState.generated_sql;
      let results: KpiQueryResult | null = null;
      let error: string | null = null;

      if (sqlQuery && finalState.validation_result?.valid) {
        sendEvent({
          type: 'thought',
          content: 'Executing validated SQL...',
          node: 'executor',
        });
        try {
          results = await this.dbService.executeQuery(sqlQuery);
        } catch (err) {
          error = err instanceof Error ? err.message : String(err);
        }
      } else if (finalState.validation_result?.error) {
        error = finalState.validation_result.error;
      }

      let insight: string;
      let visType: string;
      const isUnsupportedIntent =
        finalState.validation_result?.error === 'UNSUPPORTED_INTENT';

      if (
        isUnsupportedIntent ||
        (finalState.routing_decision && finalState.routing_decision !== 'DATA')
      ) {
        insight =
          this.getLastAiMessage(finalState) ||
          'I can only help with questions about the Mediquery medical database.';
        visType = 'text';
      } else {
        sendEvent({
          type: 'thought',
          content: 'Generating insight...',
          node: 'analyst',
        });

        insight = await this.insightService.generateInsight(
          request.question,
          results || { columns: [], data: [], row_count: 0 },
          userId,
          selectedProvider || undefined,
        );
        visType = await this.visualizationService.determineVisualization(
          request.question,
          results || { columns: [], data: [], row_count: 0 },
          userId,
          selectedProvider || undefined,
        );
      }

      const thoughts = Array.from(sentThoughts);

      const finalResult = {
        sql: sqlQuery || '',
        data: results || { row_count: 0, columns: [], data: [] },
        insight: insight,
        visualization_type: visType,
        attempts: finalState.attempt_count || 1,
        reflections: finalState.reflections || [],
        error: error,
        meta: {
          thoughts: thoughts,
          thread_id: threadId,
        },
      };

      console.log(
        `[Stream] Sending Result. SQL: ${finalResult.sql ? 'YES' : 'NO'}`,
      );
      sendEvent({ type: 'result', payload: finalResult });
      sendEvent({ type: 'meta', thread_id: threadId });

      await this.threadsService.addMessage(threadId, 'bot', insight, {
        sql: sqlQuery,
        data: results,
        visualization_type: visType,
        thoughts: finalResult.meta.thoughts,
        attempts: finalResult.attempts,
      });
    } catch (err) {
      sendEvent({
        type: 'error',
        content: err instanceof Error ? err.message : String(err),
      });
    } finally {
      res.end();
    }
  }
}
