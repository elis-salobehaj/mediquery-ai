import * as fs from 'node:fs';
import * as path from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import * as yaml from 'js-yaml';
import type { PromptCategory, PromptsSchema } from '@/common/types';

@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);
  private prompts: PromptsSchema | null = null;

  constructor() {
    this.reloadPrompts();
  }

  public reloadPrompts() {
    try {
      const promptPath = path.resolve(__dirname, '../ai/prompts/system_prompts.yaml');
      if (fs.existsSync(promptPath)) {
        const fileContents = fs.readFileSync(promptPath, 'utf8');
        this.prompts = yaml.load(fileContents) as PromptsSchema;
        this.logger.log('Loaded system prompts configuration');
      } else {
        const devPath = path.resolve(process.cwd(), 'src/ai/prompts/system_prompts.yaml');
        if (fs.existsSync(devPath)) {
          const fileContents = fs.readFileSync(devPath, 'utf8');
          this.prompts = yaml.load(fileContents) as PromptsSchema;
          this.logger.log('Loaded system prompts configuration (dev path)');
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to load system prompts: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  getPrompt(category: string): PromptCategory | null;
  getPrompt(category: string, key: string): string | null;
  getPrompt(category: string, key?: string): PromptCategory | string | null {
    if (!this.prompts) return null;
    const cat = this.prompts[category];
    if (!cat) return null;
    if (key) return cat[key] ?? null;
    return cat;
  }
}
