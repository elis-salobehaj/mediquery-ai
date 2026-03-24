/// <reference types="node" />
import { expect, test } from '@playwright/test';
import { frontendTestEnv } from './env';

test.describe('Post-Deployment Smoke Tests', () => {
  test('Backend Health Endpoint should be accessible and verify DB connectivity', async ({
    request,
    baseURL,
  }) => {
    // Determine apiURL depending on environment or fallback
    const apiURL = frontendTestEnv.VITE_API_URL || `${baseURL}/api/v1`;

    // We expect the health endpoint to respond within 10s max
    const response = await request.get(`${apiURL}/health`, { timeout: 10000 });

    expect(response.status()).toBe(200);

    const body = await response.json();

    // DB & LLM basic checks
    expect(['healthy', 'UP']).toContain(body.status);
    expect(body).toHaveProperty('database.postgres');
  });

  test('Frontend should load successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);

    // Verify basic element on page
    await expect(page.locator('body')).toBeVisible();
  });
});
