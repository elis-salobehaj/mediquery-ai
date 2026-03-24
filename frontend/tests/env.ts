import { z } from 'zod';

const FrontendTestEnvSchema = z.object({
  CI: z.string().optional(),
  PLAYWRIGHT_TEST_BASE_URL: z.string().optional(),
  VITE_API_URL: z.string().optional(),
});

const parsed = FrontendTestEnvSchema.safeParse(process.env);

if (!parsed.success) {
  throw new Error(`Invalid frontend test environment: ${JSON.stringify(parsed.error.format())}`);
}

export const frontendTestEnv = {
  ...parsed.data,
  isCi: parsed.data.CI === 'true' || parsed.data.CI === '1',
};
