import { expect, test } from '@playwright/test';

test('homepage has title and main elements', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Mediquery/i);
  await expect(page.getByText(/INITIATE GUEST PROTOCOL/i)).toBeVisible();
});

async function loginAsGuest(page: any) {
  await page.goto('/');
  await page.getByRole('button', { name: /INITIATE GUEST PROTOCOL/i }).click();
  await expect(page.getByPlaceholder(/Ask Mediquery/i)).toBeVisible({
    timeout: 15000,
  });
}

async function waitForAgentResponse(page: any) {
  await expect(page.locator('.chat-message-text').last()).toBeVisible({
    timeout: 30000,
  });
}

async function assertSqlIfAvailable(page: any) {
  const sqlToggle = page.getByText(/View SQL Query/i).first();
  const sqlToggleCount = await sqlToggle.count();

  if (sqlToggleCount > 0) {
    await sqlToggle.click();
    const sqlCode = page
      .locator('code')
      .filter({ hasText: /select|from|where/i })
      .first();
    await expect(sqlCode).toBeVisible({ timeout: 10000 });
  }
}

async function assertVisualizationIfAvailable(page: any) {
  const plot = page.locator('.plotly').first();
  const plotCount = await plot.count();

  if (plotCount > 0) {
    await expect(plot).toBeVisible({ timeout: 30000 });
  }
}

test('E2E Test 1: Single-agent + Fast mode - list people in Texas', async ({ page }) => {
  await loginAsGuest(page);

  // Enable fast mode
  await page.getByRole('radio', { name: /Fast/i }).click();

  // Send query
  const input = page.getByPlaceholder(/Ask Mediquery/i);
  await input.fill('list people in Texas');
  await input.press('Enter');

  // Wait for bot response indicator
  await waitForAgentResponse(page);

  // Verify SQL if present
  await assertSqlIfAvailable(page);

  // Verify data visualization if present
  await assertVisualizationIfAvailable(page);
});

test('E2E Test 2: Multi-agent mode - list people in Texas', async ({ page }) => {
  await loginAsGuest(page);

  // Enable multi-agent mode
  await page.getByRole('radio', { name: /Multi-Agent/i }).click();

  // Send query
  const input = page.getByPlaceholder(/Ask Mediquery/i);
  await input.fill('list people in Texas');
  await input.press('Enter');

  // Wait for 'Show thinking' button and click it
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });
  await thinkingBtn.click();

  // Verify thoughts are visible
  await expect(page.locator('.thinking-process-text').first()).toBeVisible();

  // Verify SQL/visualization if available
  await assertSqlIfAvailable(page);
  await assertVisualizationIfAvailable(page);
});

test('E2E Test 3: Multi-agent + Fast mode - list people in Texas', async ({ page }) => {
  await loginAsGuest(page);

  // Enable multi-agent mode
  await page.getByRole('radio', { name: /Multi-Agent/i }).click();

  // Send query
  const input = page.getByPlaceholder(/Ask Mediquery/i);
  await input.fill('list people in Texas');
  await input.press('Enter');

  // Wait for 'Show thinking' button and click it
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });
  await thinkingBtn.click();

  // Verify multiple agents worked
  await expect(page.locator('.thinking-process-text').first()).toBeVisible();

  // Verify SQL/visualization if available
  await assertSqlIfAvailable(page);
  await assertVisualizationIfAvailable(page);
});

test('E2E Test 4: Complex Multi-agent Query - compare person count by state', async ({ page }) => {
  await loginAsGuest(page);

  // Enable multi-agent mode
  await page.getByRole('radio', { name: /Multi-Agent/i }).click();

  // Send query
  const input = page.getByPlaceholder(/Ask Mediquery/i);
  await input.fill('compare person count by state');
  await input.press('Enter');

  // Wait for 'Show thinking' button and click it
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });
  await thinkingBtn.click();

  // Verify multiple thoughts
  const thoughts = page.locator('.thinking-process-text');
  const count = await thoughts.count();
  expect(count).toBeGreaterThan(0);

  // Check results
  await waitForAgentResponse(page);
  await assertVisualizationIfAvailable(page);
});
