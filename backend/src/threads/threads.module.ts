import { Module } from '@nestjs/common';
import { AuthModule } from '@/auth/auth.module';
import { DatabaseModule } from '@/database/database.module';
import { ThreadMemoryService } from '@/threads/thread-memory.service';
import { MemoryController } from './memory.controller';
import { ThreadsController } from './threads.controller';
import { ThreadsService } from './threads.service';
import { UserMemoryPreferencesService } from './user-memory-preferences.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [ThreadsService, ThreadMemoryService, UserMemoryPreferencesService],
  controllers: [ThreadsController, MemoryController],
  exports: [ThreadsService, ThreadMemoryService, UserMemoryPreferencesService],
})
export class ThreadsModule {}
