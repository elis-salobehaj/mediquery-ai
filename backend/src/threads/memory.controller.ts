import {
  Controller,
  Delete,
  UseGuards,
  Request,
  Get,
  Patch,
  Body,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { ThreadMemoryService } from '@/threads/thread-memory.service';
import { UserMemoryPreferencesService } from '@/threads/user-memory-preferences.service';
import { z } from 'zod';
import { ZodValidationPipe } from '@/common/pipes/zod-validation.pipe';

const MemoryPreferencesSchema = z.object({
  preferred_units: z.string().min(1).max(64).optional(),
  preferred_chart_style: z.string().min(1).max(64).optional(),
});

type MemoryPreferencesDto = z.infer<typeof MemoryPreferencesSchema>;

@Controller('api/v1/memory')
@UseGuards(JwtAuthGuard)
export class MemoryController {
  constructor(
    private readonly threadMemoryService: ThreadMemoryService,
    private readonly userMemoryPreferencesService: UserMemoryPreferencesService,
  ) {}

  @Delete()
  async clearUserMemory(@Request() req: ExpressRequest) {
    const userId = req.user!.id;
    this.threadMemoryService.clearUserMemory(userId);
    await this.userMemoryPreferencesService.clearUserMemoryPreferences(userId);
    return { status: 'success' };
  }

  @Get('preferences')
  async getUserMemoryPreferences(@Request() req: ExpressRequest) {
    const userId = req.user!.id;
    const preferences =
      await this.userMemoryPreferencesService.getUserMemoryPreferences(userId);

    return {
      preferred_units: preferences?.preferredUnits || null,
      preferred_chart_style: preferences?.preferredChartStyle || null,
      updated_at: preferences?.updatedAt || null,
    };
  }

  @Patch('preferences')
  async updateUserMemoryPreferences(
    @Request() req: ExpressRequest,
    @Body(new ZodValidationPipe(MemoryPreferencesSchema))
    body: MemoryPreferencesDto,
  ) {
    const userId = req.user!.id;
    const preferences =
      await this.userMemoryPreferencesService.upsertUserMemoryPreferences(
        userId,
        {
          preferredUnits: body.preferred_units,
          preferredChartStyle: body.preferred_chart_style,
        },
      );

    return {
      preferred_units: preferences?.preferredUnits || null,
      preferred_chart_style: preferences?.preferredChartStyle || null,
      updated_at: preferences?.updatedAt || null,
    };
  }
}
