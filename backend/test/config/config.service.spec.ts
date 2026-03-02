import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@/config/config.service';
import { describe, beforeEach, it, expect } from 'vitest';

describe('ConfigService', () => {
  let service: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfigService],
    }).compile();

    service = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should load active provider', () => {
    // Should fallback to gemini by default unless something overrides
    expect(service.activeProvider).toBeDefined();
  });
});
