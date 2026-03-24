import { Injectable } from '@nestjs/common';
import { AppConfig, config } from './env.config';

@Injectable()
export class ConfigService {
  get<K extends keyof AppConfig>(key: K): AppConfig[K] {
    return config[key];
  }

  get all(): AppConfig {
    return config;
  }

  get isProduction(): boolean {
    return this.get('NODE_ENV') === 'production';
  }

  getActiveProvider(): string {
    if (this.get('USE_BEDROCK')) return 'bedrock';
    if (this.get('USE_OPENAI')) return 'openai';
    if (this.get('USE_GEMINI')) return 'gemini';
    if (this.get('USE_ANTHROPIC')) return 'anthropic';
    if (this.get('USE_LOCAL_MODEL')) return 'local';
    return 'gemini'; // Default fallback
  }

  get activeProvider(): string {
    return this.getActiveProvider();
  }

  /**
   * Returns the configured model ID for a given role under a specific (or active)
   * provider.  Role names match LangGraph agent roles: navigator, sql_writer,
   * critic, base, router.
   */
  getActiveModelForRole(role: string, providerOverride?: string): string {
    const provider = (providerOverride || this.getActiveProvider()).toUpperCase();
    const r = role.replace('-', '_').toUpperCase();
    const key = `${provider}_${r}_MODEL` as keyof import('./env.config').AppConfig;
    return (this.all[key] as string | undefined) || '';
  }
}
