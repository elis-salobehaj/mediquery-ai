import { Module } from '@nestjs/common';
import { ConfigModule } from '@/config/config.module';
import { LLMService } from './llm.service';
import { PromptService } from '@/ai/prompt.service';
import { GraphBuilder } from '@/ai/graph';
import { InsightService } from '@/ai/insight.service';
import { VisualizationService } from '@/ai/visualization.service';
import { TokenUsageModule } from '@/token-usage/token-usage.module';
import { DatabaseModule } from '@/database/database.module';
import { QueriesController } from '@/ai/queries.controller';
import { ConfigController } from '@/ai/config.controller';

import { ThreadsModule } from '@/threads/threads.module';
import { AuthModule } from '@/auth/auth.module';

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
    LLMService,
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
export class AIModule {}
