import { z } from 'zod';

const DbEnvSchema = z.object({
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('mediquery'),
  POSTGRES_PASSWORD: z.coerce.string().default(''),
  APP_DB_NAME: z.string().default('mediquery_db'),
  APP_DB_SCHEMA: z.string().default('mediquery_app'),
});

export type DbEnv = z.infer<typeof DbEnvSchema>;

// No cache — process.env is mutated by dotenv.config() in entry-point scripts
// (seed.ts, migrate.ts) after module imports run. Caching at import time would
// capture stale values (e.g. empty POSTGRES_PASSWORD) before dotenv has loaded.
export const loadDbEnv = (): DbEnv => {
  const parsed = DbEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(
      `Invalid DB environment: ${JSON.stringify(parsed.error.format())}`,
    );
  }
  return parsed.data;
};
