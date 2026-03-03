import { Test, TestingModule } from '@nestjs/testing';
import { LLMService } from '@/ai/llm.service';
import { ConfigService } from '@/config/config.service';
import { describe, it, expect, vi } from 'vitest';

/**
 * Factory that builds a ConfigService mock whose get() returns values from
 * the supplied partial env map, and false for everything else.
 */
function makeConfig(env: Record<string, unknown>) {
  return {
    get: vi.fn((key: string) => (key in env ? env[key] : false)),
  };
}

describe('LLMService', () => {
  async function buildService(env: Record<string, unknown>) {
    const config = makeConfig(env);
    const module: TestingModule = await Test.createTestingModule({
      providers: [LLMService, { provide: ConfigService, useValue: config }],
    }).compile();
    return module.get<LLMService>(LLMService);
  }

  describe('getAvailableModels()', () => {
    it('returns an empty list when no provider is enabled', async () => {
      const svc = await buildService({});
      expect(svc.getAvailableModels()).toEqual([]);
    });

    it('returns OpenAI models when USE_OPENAI is true', async () => {
      const svc = await buildService({
        USE_OPENAI: true,
        OPENAI_SQL_WRITER_MODEL: 'gpt-5.2',
      });
      const models = svc.getAvailableModels();
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider === 'openai')).toBe(true);
      expect(models[0].id).toBe('gpt-5.2');
    });

    it('returns Bedrock models when USE_BEDROCK is true', async () => {
      const svc = await buildService({
        USE_BEDROCK: true,
        BEDROCK_SQL_WRITER_MODEL: 'claude-sonnet',
        BEDROCK_NAVIGATOR_MODEL: 'claude-haiku',
      });
      const models = svc.getAvailableModels();
      expect(models.every((m) => m.provider === 'bedrock')).toBe(true);
    });

    it('deduplicates models with the same id', async () => {
      // If writer and navigator happen to be the same model id, dedup kicks in
      const svc = await buildService({
        USE_BEDROCK: true,
        BEDROCK_SQL_WRITER_MODEL: 'same-model',
        BEDROCK_NAVIGATOR_MODEL: 'same-model',
      });
      const models = svc.getAvailableModels();
      const ids = models.map((m) => m.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('combines models from multiple active providers', async () => {
      const svc = await buildService({
        USE_OPENAI: true,
        OPENAI_SQL_WRITER_MODEL: 'gpt-5.2',
        USE_GEMINI: true,
        GEMINI_SQL_WRITER_MODEL: 'gemini-1.5-pro',
        GEMINI_BASE_MODEL: 'gemini-1.5-flash',
      });
      const models = svc.getAvailableModels();
      const providers = new Set(models.map((m) => m.provider));
      expect(providers.has('openai')).toBe(true);
      expect(providers.has('gemini')).toBe(true);
    });
  });
});
