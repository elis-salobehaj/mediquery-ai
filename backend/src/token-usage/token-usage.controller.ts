import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  Put,
  Query,
  Request,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest, Response } from 'express';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { getAuthenticatedUser } from '@/common/request-utils';
import { TokenUsageService } from '@/token-usage/token-usage.service';
import { TokenUsageEventsService } from '@/token-usage/token-usage-events.service';

@Controller('api/v1/token-usage')
@UseGuards(JwtAuthGuard)
export class TokenUsageController {
  constructor(
    private readonly tokenUsageService: TokenUsageService,
    private readonly eventsService: TokenUsageEventsService,
  ) {}

  @Get()
  async getCurrentUsage(@Request() req: ExpressRequest) {
    return this.tokenUsageService.getUsageStatus(getAuthenticatedUser(req).id);
  }

  @Get('monthly')
  async getMonthlyUsage(
    @Request() req: ExpressRequest,
    @Query('start_month') startMonth?: string,
    @Query('end_month') endMonth?: string,
  ) {
    const authenticatedUser = getAuthenticatedUser(req);
    return {
      user_id: authenticatedUser.id,
      usage: await this.tokenUsageService.getMonthlyUsage(
        authenticatedUser.id,
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
    const authenticatedUser = getAuthenticatedUser(req);
    return {
      user_id: authenticatedUser.id,
      usage: await this.tokenUsageService.getProviderBreakdown(
        authenticatedUser.id,
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
      getAuthenticatedUser(req).id,
      startMonth,
      endMonth,
    );
  }

  @Get('status')
  async getUsageStatus(@Request() req: ExpressRequest) {
    const status = await this.tokenUsageService.getUsageStatus(getAuthenticatedUser(req).id);
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
    const userId = getAuthenticatedUser(req).id;
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
  async getAllUsersUsage(@Request() req: ExpressRequest, @Query('month') month?: string) {
    if (getAuthenticatedUser(req).role !== 'admin') {
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
    if (getAuthenticatedUser(req).role !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }
    return this.tokenUsageService.updateUserQuota(targetUserId, tokensLimit);
  }
}
