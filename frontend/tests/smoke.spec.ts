/// <reference types="node" />
import { test, expect } from '@playwright/test';

test.describe('Post-Deployment Smoke Tests', () => {
  test('Backend Health Endpoint should be accessible and verify DB connectivity', async ({ request, baseURL }) => {
    // Determine apiURL depending on environment or fallback
    const apiURL = process.env.VITE_API_URL || `${baseURL}/api/v1`;
    
    // We expect the health endpoint to respond within 10s max
    const response = await request.get(`${apiURL}/health`, { timeout: 10000 });
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    
    // DB & LLM basic checks
    expect(body.status).toBe('healthy');
    expect(body).toHaveProperty('postgres');
    expect(body).toHaveProperty('mysql');
  });

  test('Frontend should load successfully', async ({ page }) => {
    const response = await page.goto('/');
    expect(response?.status()).toBe(200);
    
    // Verify basic element on page
    await expect(page.locator('body')).toBeVisible();
  });
});
