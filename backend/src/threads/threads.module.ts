import { Module } from '@nestjs/common';
import { ThreadsService } from './threads.service';
import { ThreadsController } from './threads.controller';
import { MemoryController } from './memory.controller';
import { DatabaseModule } from '@/database/database.module';
import { AuthModule } from '@/auth/auth.module';
import { ThreadMemoryService } from '@/threads/thread-memory.service';
import { UserMemoryPreferencesService } from './user-memory-preferences.service';

@Module({
  imports: [DatabaseModule, AuthModule],
  providers: [
    ThreadsService,
    ThreadMemoryService,
    UserMemoryPreferencesService,
  ],
  controllers: [ThreadsController, MemoryController],
  exports: [ThreadsService, ThreadMemoryService, UserMemoryPreferencesService],
})
export class ThreadsModule {}
