import { ChatAnthropic } from '@langchain/anthropic';
import { ChatBedrockConverse } from '@langchain/aws';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { ChatOllama } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@/config/config.service';

@Injectable()
export class LLMService {
  private readonly logger = new Logger(LLMService.name);

  constructor(private readonly config: ConfigService) {}

  /**
   * Factory method to create a ChatModel based on the active provider and role.
   * Priority: Bedrock > OpenAI > Gemini > Anthropic > Local
   * @param roleOrModel  A role name (e.g. 'sql_writer') or a raw model ID.
   * @param providerOverride  When provided, overrides which SDK/provider is used
   *                          (e.g. 'openai' to use ChatOpenAI regardless of env flags).
   */
  createChatModel(roleOrModel?: string, providerOverride?: string): BaseChatModel {
    const provider = providerOverride || this.getActiveProvider();
    const roleName = roleOrModel || '';

    // Determine model ID: if roleOrModel is a known role, get its model, otherwise treat as model ID or use default
    let modelId = '';
    if (['navigator', 'sql_writer', 'critic', 'base'].includes(roleName)) {
      modelId = this.getModelForRole(provider, roleName);
    } else {
      modelId = roleOrModel || this.getDefaultModelForProvider(provider);
    }

    this.logger.log(`Initializing LLM: ${provider}/${modelId} (role: ${roleOrModel || 'default'})`);

    switch (provider) {
      case 'bedrock':
        return new ChatBedrockConverse({
          region: this.config.get('AWS_BEDROCK_REGION'),
          model: modelId,
          maxTokens: 4096,
        });

      case 'openai':
        return new ChatOpenAI({
          modelName: modelId,
          openAIApiKey: this.config.get('OPENAI_API_KEY'),
          maxTokens: 4096,
        });

      case 'gemini':
        return new ChatGoogleGenerativeAI({
          model: modelId,
          apiKey: this.config.get('GEMINI_API_KEY'),
          maxOutputTokens: 4096,
        });

      case 'anthropic':
        return new ChatAnthropic({
          modelName: modelId,
          anthropicApiKey: this.config.get('ANTHROPIC_API_KEY'),
          maxTokens: 4096,
        });

      case 'local':
        if (!this.config.get('OLLAMA_HOST')) {
          throw new Error(
            'OLLAMA_HOST is not configured. Set it in your environment to use the local provider.',
          );
        }
        return new ChatOllama({
          model: modelId,
          baseUrl: this.config.get('OLLAMA_HOST'),
        });

      default:
        throw new Error(`Unsupported LLM provider: ${provider}`);
    }
  }

  private getModelForRole(provider: string, role: string): string {
    const p = provider.toUpperCase();
    const r = role.toUpperCase();
    const key = `${p}_${r}_MODEL` as keyof import('../config/env.config').AppConfig;

    try {
      return (this.config.all[key] as string) || this.getDefaultModelForProvider(provider);
    } catch {
      return this.getDefaultModelForProvider(provider);
    }
  }

  private getActiveProvider(): string {
    if (this.config.get('USE_BEDROCK')) return 'bedrock';
    if (this.config.get('USE_OPENAI')) return 'openai';
    if (this.config.get('USE_GEMINI')) return 'gemini';
    if (this.config.get('USE_ANTHROPIC')) return 'anthropic';
    if (this.config.get('USE_LOCAL_MODEL')) return 'local';
    return 'gemini'; // Default fallback
  }

  private getDefaultModelForProvider(provider: string): string {
    switch (provider) {
      case 'bedrock':
        return this.config.get('BEDROCK_BASE_MODEL');
      case 'openai':
        return this.config.get('OPENAI_BASE_MODEL');
      case 'gemini':
        return this.config.get('GEMINI_BASE_MODEL');
      case 'anthropic':
        return this.config.get('ANTHROPIC_BASE_MODEL');
      case 'local':
        return this.config.get('LOCAL_BASE_MODEL');
      default:
        return '';
    }
  }

  /**
   * Returns list of available LLM models based on configured providers.
   * Mirrors the Python backend's LLMAgentCompat.get_available_models() logic.
   */
  getAvailableModels(): Array<{ id: string; name: string; provider: string }> {
    const models: Array<{ id: string; name: string; provider: string }> = [];

    if (this.config.get('USE_BEDROCK')) {
      const writer = this.config.get('BEDROCK_SQL_WRITER_MODEL');
      const navigator = this.config.get('BEDROCK_NAVIGATOR_MODEL');
      models.push({
        id: writer,
        name: 'Claude Sonnet 4.6 (Bedrock)',
        provider: 'bedrock',
      });
      models.push({
        id: navigator,
        name: 'Claude Haiku 4.5 (Bedrock)',
        provider: 'bedrock',
      });
    }

    if (this.config.get('USE_OPENAI')) {
      const writer = this.config.get('OPENAI_SQL_WRITER_MODEL');
      models.push({
        id: writer,
        name: 'GPT 5.2 (OpenAI)',
        provider: 'openai',
      });
    }

    if (this.config.get('USE_GEMINI')) {
      const writer = this.config.get('GEMINI_SQL_WRITER_MODEL');
      const base = this.config.get('GEMINI_BASE_MODEL');
      models.push({
        id: writer,
        name: 'Gemini 1.5 Pro (Google)',
        provider: 'gemini',
      });
      models.push({
        id: base,
        name: 'Gemini 1.5 Flash (Google)',
        provider: 'gemini',
      });
    }

    if (this.config.get('USE_ANTHROPIC')) {
      const writer = this.config.get('ANTHROPIC_SQL_WRITER_MODEL');
      models.push({
        id: writer,
        name: 'Claude 3.5 Sonnet (Anthropic)',
        provider: 'anthropic',
      });
    }

    if (this.config.get('USE_LOCAL_MODEL')) {
      const writer = this.config.get('LOCAL_SQL_WRITER_MODEL');
      const base = this.config.get('LOCAL_BASE_MODEL');
      models.push({
        id: writer,
        name: 'SQLCoder 7B (Local)',
        provider: 'local',
      });
      models.push({
        id: base,
        name: `${base} (Local)`,
        provider: 'local',
      });
    }

    // Deduplicate by id
    const seen = new Set<string>();
    return models.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }
}
