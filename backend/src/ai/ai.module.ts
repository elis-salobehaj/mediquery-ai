import { Module } from '@nestjs/common';
import { ConfigController } from '@/ai/config.controller';
import { GraphBuilder } from '@/ai/graph';
import { InsightService } from '@/ai/insight.service';
import { PromptService } from '@/ai/prompt.service';
import { QueriesController } from '@/ai/queries.controller';
import { VisualizationService } from '@/ai/visualization.service';
import { AuthModule } from '@/auth/auth.module';
import { ConfigModule } from '@/config/config.module';
import { DatabaseModule } from '@/database/database.module';
import { ThreadsModule } from '@/threads/threads.module';
import { TokenUsageModule } from '@/token-usage/token-usage.module';
import { LLMService } from './llm.service';

@Module({
  imports: [ConfigModule, TokenUsageModule, DatabaseModule, AuthModule, ThreadsModule],
  controllers: [QueriesController, ConfigController],
  providers: [LLMService, PromptService, GraphBuilder, InsightService, VisualizationService],
  exports: [LLMService, PromptService, GraphBuilder, InsightService, VisualizationService],
})
export class AIModule {}
