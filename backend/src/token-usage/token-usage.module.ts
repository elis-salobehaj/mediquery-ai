import { Module } from '@nestjs/common';
import { TokenUsageService } from '@/token-usage/token-usage.service';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/auth/auth.module';
import { TokenUsageController } from './token-usage.controller';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [TokenUsageService, TokenUsageEventsService],
  controllers: [TokenUsageController],
  exports: [TokenUsageService, TokenUsageEventsService],
})
export class TokenUsageModule {}
