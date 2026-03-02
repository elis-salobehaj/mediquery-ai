import { z } from 'zod';

const DbEnvSchema = z.object({
  POSTGRES_HOST: z.string().default('localhost'),
  POSTGRES_PORT: z.coerce.number().default(5432),
  POSTGRES_USER: z.string().default('mediquery'),
  POSTGRES_PASSWORD: z.string().default(''),
  POSTGRES_DB_NAME: z.string().default('mediquery_db'),
});

export type DbEnv = z.infer<typeof DbEnvSchema>;

let cachedDbEnv: DbEnv | null = null;

export const loadDbEnv = (): DbEnv => {
  if (cachedDbEnv) {
    return cachedDbEnv;
  }

  const parsed = DbEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid DB environment: ${JSON.stringify(parsed.error.format())}`);
  }

  cachedDbEnv = parsed.data;
  return cachedDbEnv;
};