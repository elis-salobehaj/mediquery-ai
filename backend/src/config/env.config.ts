import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load .env explicitly in case it hasn't been handled yet
dotenv.config({ path: path.resolve(process.cwd(), '../.env') });

const booleanString = z.preprocess((val) => {
  if (typeof val === 'string') {
    if (val.toLowerCase() === 'true') return true;
    if (val.toLowerCase() === 'false') return false;
  }
  return val;
}, z.boolean());

const ConfigSchema = z.object({
  // Project Branding
  PROJECT_NAME: z.string().default('mediquery'),
  PROJECT_TITLE: z.string().default('Mediquery'),

  // Database (Percona MySQL 8.4)
  DB_HOST: z.string().default('mediquery-db'),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string().default('mediquery'),
  DB_PASSWORD: z.string().default(''),
  DB_NAME: z.string().default('mediquery'),

  // PostgreSQL 18.1 (Token Tracking, Users, Chat)
  POSTGRES_HOST: z.string().default('mediquery-postgres'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('mediquery'),
  POSTGRES_PASSWORD: z.string().default(''),
  POSTGRES_DB_NAME: z.string().default('mediquery_db'),
  TENANTS_DB_NAME: z.string().default('omop_db'),
  NEXUS_TENANT_DB_NAME: z.string().default('tenant_nexus_health'),

  // App Config
  LOG_LEVEL: z.string().default('DEBUG'),
  CHAT_HISTORY_RETENTION_HOURS: z.coerce.number().default(24),
  NODE_ENV: z.string().default('development'),
  PORT: z.coerce.number().default(8001),

  // Auth
  JWT_SECRET_KEY: z.string().default('supersecretkey'),
  JWT_ALGORITHM: z.string().default('HS256'),
  ACCESS_TOKEN_EXPIRE_MINUTES: z.coerce.number().default(60),

  // Provider Selection
  USE_BEDROCK: booleanString.default(false),
  USE_OPENAI: booleanString.default(false),
  USE_GEMINI: booleanString.default(false),
  USE_ANTHROPIC: booleanString.default(false),
  USE_LOCAL_MODEL: booleanString.default(false),

  // Credentials
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),

  // AWS Bedrock
  AWS_BEDROCK_REGION: z.string().default('us-west-2'),
  AWS_EC2_METADATA_DISABLED: booleanString.default(true),
  AWS_BEARER_TOKEN_BEDROCK: z.string().optional(),
  BEDROCK_BASE_MODEL: z.string().default('global.anthropic.claude-sonnet-4-6'),
  BEDROCK_SQL_WRITER_MODEL: z
    .string()
    .default('global.anthropic.claude-sonnet-4-6'),
  BEDROCK_NAVIGATOR_MODEL: z
    .string()
    .default('global.anthropic.claude-sonnet-4-6'),
  BEDROCK_CRITIC_MODEL: z
    .string()
    .default('global.anthropic.claude-sonnet-4-6'),

  // Gemini Models
  GEMINI_BASE_MODEL: z.string().default('gemini-1.5-flash'),
  GEMINI_SQL_WRITER_MODEL: z.string().default('gemini-1.5-pro'),
  GEMINI_NAVIGATOR_MODEL: z.string().default('gemini-1.5-flash'),
  GEMINI_CRITIC_MODEL: z.string().default('gemini-1.5-flash'),

  // OpenAI Models
  OPENAI_BASE_MODEL: z.string().default('gpt-5.2'),
  OPENAI_SQL_WRITER_MODEL: z.string().default('gpt-5.2'),
  OPENAI_NAVIGATOR_MODEL: z.string().default('gpt-5.2'),
  OPENAI_CRITIC_MODEL: z.string().default('gpt-5.2'),

  // Anthropic Models
  ANTHROPIC_BASE_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  ANTHROPIC_SQL_WRITER_MODEL: z.string().default('claude-3-5-sonnet-20241022'),
  ANTHROPIC_NAVIGATOR_MODEL: z.string().default('claude-3-5-haiku-20241022'),
  ANTHROPIC_CRITIC_MODEL: z.string().default('claude-3-5-haiku-20241022'),

  // Local Models (Ollama)
  LOCAL_BASE_MODEL: z.string().default('qwen3:latest'),
  LOCAL_SQL_WRITER_MODEL: z.string().default('sqlcoder:7b'),
  LOCAL_NAVIGATOR_MODEL: z.string().default('qwen2.5-coder:7b'),
  LOCAL_CRITIC_MODEL: z.string().default('llama3.1'),
  OLLAMA_HOST: z.string().default('http://localhost:11434'),

  // Default UI Toggle Settings
  MULTI_AGENT: booleanString.default(true),
  FAST_MODE: booleanString.default(false),
  ENABLE_HUMAN_INTERRUPTS: booleanString.default(false),

  // Benchmark Configuration
  BENCHMARK_MODE: z.enum(['mode-a', 'mode-b', 'live']).default('mode-a'),
  BENCHMARK_DB_SCHEMA: z.string().default('tenant_nexus_health'),
  BENCHMARK_POSTGRES_HOST: z.string().default('localhost'),
  BENCHMARK_POSTGRES_PORT: z.coerce.number().default(5432),
  BENCHMARK_POSTGRES_USER: z.string().default('omop_user'),
  BENCHMARK_POSTGRES_PASSWORD: z.string().default('omop_password'),
  BENCHMARK_POSTGRES_DB_NAME: z.string().default('omop_db'),
  BENCHMARK_DB_CONNECT_TIMEOUT_MS: z.coerce.number().default(3000),
  BENCHMARK_DB_IDLE_TIMEOUT_MS: z.coerce.number().default(10000),
  BENCHMARK_DB_QUERY_TIMEOUT_MS: z.coerce.number().default(5000),
});

// Infer TS rules directly from the Schema
export type AppConfig = z.infer<typeof ConfigSchema>;

let _config: AppConfig | null = null;

export const loadConfig = (): AppConfig => {
  if (_config) return _config;

  const parsed = ConfigSchema.safeParse(process.env);

  if (!parsed.success) {
    console.error('❌ Invalid environment variables:', parsed.error.format());
    throw new Error('Invalid environment configuration');
  }

  _config = parsed.data;

  return _config;
};

// Singleton export
export const config = loadConfig();
