import { test, expect } from '@playwright/test';

test('homepage has title and main elements', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Mediquery/i);
  await expect(page.getByText(/INITIATE GUEST PROTOCOL/i)).toBeVisible();
});

async function loginAsGuest(page: any) {
  await page.goto('/');
  await page.getByRole('button', { name: /INITIATE GUEST PROTOCOL/i }).click();
  await expect(
    page.getByRole('textbox', { name: /Ask Mediquery/i }),
  ).toBeVisible({ timeout: 15000 });
}

test('E2E Test 1: Single-agent + Fast mode - list people in Texas', async ({
  page,
}) => {
  await loginAsGuest(page);

  // Enable fast mode
  await page.getByRole('radio', { name: /Fast/i }).click();

  // Send query
  const input = page.getByRole('textbox', { name: /Ask Mediquery/i });
  await input.fill('list people in Texas');
  await input.press('Enter');

  // Wait for bot response indicator
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });

  // Verify SQL is generated
  await page
    .getByText(/View SQL Query/i)
    .first()
    .click();
  const sqlCode = page.locator('code');
  await expect(sqlCode).toBeVisible({ timeout: 10000 });
  await expect(sqlCode).toContainText(/person/i);

  // Verify data visualization (Plotly)
  const plotlyChart = page.locator('.plotly');
  await expect(plotlyChart).toBeVisible({ timeout: 30000 });
});

test('E2E Test 2: Multi-agent mode - list people in Texas', async ({
  page,
}) => {
  await loginAsGuest(page);

  // Enable multi-agent mode
  await page.getByRole('radio', { name: /Multi-Agent/i }).click();

  // Send query
  const input = page.getByRole('textbox', { name: /Ask Mediquery/i });
  await input.fill('list people in Texas');
  await input.press('Enter');

  // Wait for 'Show thinking' button and click it
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });
  await thinkingBtn.click();

  // Verify thoughts are visible
  await expect(
    page.locator('text=/Initializing|Navigator|SQL Writer|Critic/i').first(),
  ).toBeVisible();

  // Verify SQL
  await page
    .getByText(/View SQL Query/i)
    .first()
    .click();
  await expect(page.locator('code').first()).toContainText(/person/i);

  // Verify Plotly
  await expect(page.locator('.plotly')).toBeVisible({ timeout: 30000 });
});

test('E2E Test 3: Multi-agent + Fast mode - list people in Texas', async ({
  page,
}) => {
  await loginAsGuest(page);

  // Enable multi-agent mode
  await page.getByRole('radio', { name: /Multi-Agent/i }).click();

  // Send query
  const input = page.getByRole('textbox', { name: /Ask Mediquery/i });
  await input.fill('list people in Texas');
  await input.press('Enter');

  // Wait for 'Show thinking' button and click it
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });
  await thinkingBtn.click();

  // Verify multiple agents worked
  await expect(
    page.locator('text=/Navigator|SQL Writer|Critic/i').first(),
  ).toBeVisible();

  // Verify SQL and Plotly
  await page
    .getByText(/View SQL Query/i)
    .first()
    .click();
  await expect(page.locator('code').first()).toContainText(/person/i);
  await expect(page.locator('.plotly')).toBeVisible({ timeout: 30000 });
});

test('E2E Test 4: Complex Multi-agent Query - compare person count by state', async ({
  page,
}) => {
  await loginAsGuest(page);

  // Enable multi-agent mode
  await page.getByRole('radio', { name: /Multi-Agent/i }).click();

  // Send query
  const input = page.getByRole('textbox', { name: /Ask Mediquery/i });
  await input.fill('compare person count by state');
  await input.press('Enter');

  // Wait for 'Show thinking' button and click it
  const thinkingBtn = page.getByText(/Show thinking/i).first();
  await expect(thinkingBtn).toBeVisible({ timeout: 20000 });
  await thinkingBtn.click();

  // Verify multiple thoughts
  const thoughts = page.locator('.space-y-2 > div');
  const count = await thoughts.count();
  expect(count).toBeGreaterThan(1);

  // Check results
  await expect(page.locator('.plotly')).toBeVisible({ timeout: 45000 });
});
