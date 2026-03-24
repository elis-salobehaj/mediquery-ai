import { Test, TestingModule } from '@nestjs/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ConfigController } from '@/ai/config.controller';
import { LLMService } from '@/ai/llm.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';

const MOCK_MODELS = [
  { id: 'openai/gpt-4o', name: 'GPT-4o (OpenAI)', provider: 'openai' },
  { id: 'bedrock/claude-3', name: 'Claude 3 (Bedrock)', provider: 'bedrock' },
];

describe('ConfigController', () => {
  let controller: ConfigController;
  let llmService: { getAvailableModels: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    llmService = { getAvailableModels: vi.fn().mockReturnValue(MOCK_MODELS) };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConfigController],
      providers: [{ provide: LLMService, useValue: llmService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<ConfigController>(ConfigController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('GET /api/v1/config/models', () => {
    it('delegates to llmService.getAvailableModels and wraps in { models }', () => {
      const result = controller.getModels();
      expect(llmService.getAvailableModels).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ models: MOCK_MODELS });
    });

    it('returns an empty models array when no providers are enabled', () => {
      llmService.getAvailableModels.mockReturnValue([]);
      expect(controller.getModels()).toEqual({ models: [] });
    });
  });
});
