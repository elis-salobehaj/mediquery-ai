import { defineConfig, devices } from '@playwright/experimental-ct-react';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { frontendTestEnv } from './tests/env';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
  testDir: './tests/components',
  snapshotDir: './__snapshots__',
  timeout: 10 * 1000,
  fullyParallel: true,
  forbidOnly: frontendTestEnv.isCi,
  retries: frontendTestEnv.isCi ? 2 : 0,
  workers: frontendTestEnv.isCi ? 1 : undefined,
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    ctPort: 3100,
    ctViteConfig: {
      resolve: {
        alias: {
          '@': resolve(__dirname, './src'),
        },
      },
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
