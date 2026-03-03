import {
  Controller,
  Get,
  Query,
  UseGuards,
  Request,
  Put,
  Param,
  Body,
  ForbiddenException,
  Res,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { TokenUsageService } from '@/token-usage/token-usage.service';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';

@Controller('api/v1/token-usage')
@UseGuards(JwtAuthGuard)
export class TokenUsageController {
  constructor(
    private readonly tokenUsageService: TokenUsageService,
    private readonly eventsService: TokenUsageEventsService,
  ) {}

  @Get()
  async getCurrentUsage(@Request() req: ExpressRequest) {
    return this.tokenUsageService.getUsageStatus(req.user!.id);
  }

  @Get('monthly')
  async getMonthlyUsage(
    @Request() req: ExpressRequest,
    @Query('start_month') startMonth?: string,
    @Query('end_month') endMonth?: string,
  ) {
    return {
      user_id: req.user!.id,
      usage: await this.tokenUsageService.getMonthlyUsage(
        req.user!.id,
        startMonth,
        endMonth,
      ),
    };
  }

  @Get('monthly/breakdown')
  async getProviderBreakdown(
    @Request() req: ExpressRequest,
    @Query('start_month') startMonth?: string,
    @Query('end_month') endMonth?: string,
  ) {
    return {
      user_id: req.user!.id,
      usage: await this.tokenUsageService.getProviderBreakdown(
        req.user!.id,
        startMonth,
        endMonth,
      ),
    };
  }

  @Get('metrics/nodes')
  async getNodeMetrics(
    @Request() req: ExpressRequest,
    @Query('start_month') startMonth?: string,
    @Query('end_month') endMonth?: string,
  ) {
    return this.tokenUsageService.getNodeMetrics(
      req.user!.id,
      startMonth,
      endMonth,
    );
  }

  @Get('status')
  async getUsageStatus(@Request() req: ExpressRequest) {
    const status = await this.tokenUsageService.getUsageStatus(req.user!.id);
    return {
      ...status,
      thresholds: {
        normal: 0,
        medium: 80,
        high: 90,
        critical: 95,
      },
    };
  }

  /**
   * SSE stream – clients subscribe here instead of polling /status.
   * The backend pushes a status event every time token usage is logged.
   * An initial event is sent immediately on connect so the UI populates
   * without waiting for the first query.
   */
  @Get('events')
  async streamEvents(@Request() req: ExpressRequest, @Res() res: Response) {
    const userId = req.user!.id;
    const cleanup = this.eventsService.subscribe(userId, res);

    // Send current status immediately on connect
    const status = await this.tokenUsageService.getUsageStatus(userId);
    this.eventsService.emit(userId, {
      ...status,
      thresholds: { normal: 0, medium: 80, high: 90, critical: 95 },
    });

    // Clean up on client disconnect
    req.on('close', cleanup);
    req.on('error', cleanup);
  }

  // --- Admin Endpoints ---

  @Get('admin/users')
  async getAllUsersUsage(
    @Request() req: ExpressRequest,
    @Query('month') month?: string,
  ) {
    if (req.user!.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.tokenUsageService.getAllUsersUsage(month);
  }

  @Put('admin/users/:user_id/quota')
  async updateUserQuota(
    @Request() req: ExpressRequest,
    @Param('user_id') targetUserId: string,
    @Body('tokens_limit') tokensLimit: number,
  ) {
    if (req.user!.role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.tokenUsageService.updateUserQuota(targetUserId, tokensLimit);
  }
}
