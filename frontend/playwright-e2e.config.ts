import { defineConfig, devices } from '@playwright/test';
import { frontendTestEnv } from './tests/env';

export default defineConfig({
  testDir: './tests',
  testMatch: /.*\.spec\.ts/, // Only match .spec.ts files (E2E), ignore .spec.tsx (Component CT)
  testIgnore: 'components/**',
  fullyParallel: true,
  forbidOnly: frontendTestEnv.isCi,
  retries: frontendTestEnv.isCi ? 2 : 0,
  workers: frontendTestEnv.isCi ? 1 : '50%',
  reporter: 'html',
  use: {
    baseURL: frontendTestEnv.PLAYWRIGHT_TEST_BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
