import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { getAuthenticatedUser } from '@/common/request-utils';
import type { ThreadCreateDto, ThreadUpdateDto } from './dto/thread.dto';
import { ThreadsService } from './threads.service';

@Controller('api/v1/threads')
@UseGuards(JwtAuthGuard)
export class ThreadsController {
  constructor(private readonly threadsService: ThreadsService) {}

  @Get()
  async getThreads(@Request() req: ExpressRequest) {
    const threads = await this.threadsService.getUserThreads(getAuthenticatedUser(req).id);
    return { threads };
  }

  @Post()
  async createThread(@Request() req: ExpressRequest, @Body() body: ThreadCreateDto) {
    const threadId = await this.threadsService.createThread(
      getAuthenticatedUser(req).id,
      body.title,
    );
    return { id: threadId, title: body.title };
  }

  @Get(':thread_id/messages')
  async getMessages(@Param('thread_id') threadId: string) {
    const messages = await this.threadsService.getThreadMessages(threadId);
    return { messages };
  }

  @Delete(':thread_id')
  async deleteThread(@Param('thread_id') threadId: string) {
    await this.threadsService.deleteThread(threadId);
    return { status: 'success' };
  }

  @Patch(':thread_id')
  async updateThread(@Param('thread_id') threadId: string, @Body() body: ThreadUpdateDto) {
    await this.threadsService.updateThread(threadId, body.title, body.pinned);
    return { status: 'success' };
  }
}
