import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { LLMService } from './llm.service';

@Controller('api/v1/config')
@UseGuards(JwtAuthGuard)
export class ConfigController {
  constructor(private readonly llmService: LLMService) {}

  /**
   * Returns the list of available LLM models based on the current provider config.
   * Mirrors Python's GET /api/v1/config/models.
   */
  @Get('models')
  getModels() {
    return { models: this.llmService.getAvailableModels() };
  }
}
