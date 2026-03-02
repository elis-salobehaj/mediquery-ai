/**
 * AppTestModule — used exclusively when NODE_ENV=test.
 *
 * Mirrors AppModule but substitutes MockLLMService for LLMService so the
 * real LLM infrastructure is never touched during E2E runs.  All other
 * providers, controllers and modules are identical to production.
 */
import { Module } from '@nestjs/common';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from '../src/config/config.module';
import { DatabaseModule } from '../src/database/database.module';
import { AuthModule } from '../src/auth/auth.module';
import { TokenUsageModule } from '../src/token-usage/token-usage.module';
import { ThreadsModule } from '../src/threads/threads.module';
import { LLMService } from '../src/ai/llm.service';
import { PromptService } from '../src/ai/prompt.service';
import { GraphBuilder } from '../src/ai/graph';
import { InsightService } from '../src/ai/insight.service';
import { VisualizationService } from '../src/ai/visualization.service';
import { QueriesController } from '../src/ai/queries.controller';
import { ConfigController } from '../src/ai/config.controller';
import { MockLLMService } from './mocks/llm.service';

/**
 * Inline AI module that swaps LLMService → MockLLMService.
 * We re-declare the controllers/providers here rather than importing AIModule
 * so NestJS resolves MockLLMService wherever LLMService is injected.
 */
@Module({
  imports: [
    ConfigModule,
    TokenUsageModule,
    DatabaseModule,
    AuthModule,
    ThreadsModule,
  ],
  controllers: [QueriesController, ConfigController],
  providers: [
    { provide: LLMService, useClass: MockLLMService },
    PromptService,
    GraphBuilder,
    InsightService,
    VisualizationService,
  ],
  exports: [
    LLMService,
    PromptService,
    GraphBuilder,
    InsightService,
    VisualizationService,
  ],
})
class AITestModule {}

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuthModule,
    TokenUsageModule,
    ThreadsModule,
    AITestModule,
    LoggerModule.forRoot({
      pinoHttp: {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, singleLine: true },
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppTestModule {}
