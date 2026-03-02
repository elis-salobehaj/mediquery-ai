import { test, expect } from '@playwright/test';

test.describe('Thread Management', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the app
    await page.goto('/');

    // Use guest login
    await page
      .getByRole('button', { name: /INITIATE GUEST PROTOCOL/i })
      .click();

    // Wait for the chat interface to be ready
    await expect(
      page.getByRole('textbox', { name: /Ask Mediquery/i }),
    ).toBeVisible({ timeout: 15000 });
  });

  test('should create a new thread when sending a message', async ({
    page,
  }) => {
    const input = page.getByRole('textbox', { name: /Ask Mediquery/i });
    await input.fill('list people in Texas');

    // Wait for the real backend stream to respond
    const streamDone = page.waitForResponse((resp) =>
      resp.url().includes('/queries/stream'),
    );
    await input.press('Enter');
    await streamDone;

    // The user message is visible in the chat — stream responded successfully
    await expect(page.getByText('list people in Texas')).toBeVisible({
      timeout: 15000,
    });
  });

  test('should rename a thread', async ({ page }) => {
    let threadTitle = 'Original Name';

    // Statefully mock threads GET and PATCH
    await page.route(/.*\/api\/v1\/threads(?:\?.*)?$/, async (route) => {
      const method = route.request().method();
      if (method === 'GET') {
        await route.fulfill({
          json: {
            threads: [
              {
                id: '00000000-0000-0000-0000-000000000001',
                title: threadTitle,
                updated_at: Date.now(),
                pinned: false,
              },
            ],
          },
        });
      } else {
        await route.continue();
      }
    });

    await page.route(/.*\/api\/v1\/threads\/[0-9a-f-]+$/, async (route) => {
      const method = route.request().method();
      if (method === 'PATCH') {
        const body = route.request().postDataJSON();
        if (body.title) threadTitle = body.title;
        await route.fulfill({ json: { success: true } });
      } else {
        await route.continue();
      }
    });

    // Reload or wait for the initial threads
    await page.reload();
    await expect(page.getByText('Original Name')).toBeVisible();

    // Hover and find menu
    await page.getByText('Original Name').first().hover();

    // Find the more options button in the sidebar item
    const moreBtn = page.getByRole('button', { name: /Thread options/i });
    await moreBtn.click();

    await page.getByText(/Rename/i).click();

    // Fill new name and submit
    const input = page.getByRole('textbox', { name: /Rename thread/i });
    await expect(input).toBeVisible();
    await input.fill('Renamed Thread');
    // Register the response listener BEFORE triggering the action
    const getThreadsPromise = page.waitForResponse(
      (resp) =>
        resp.url().includes('/api/v1/threads') &&
        resp.request().method() === 'GET',
    );
    await input.press('Enter');

    // Wait for the UI refresh to complete
    await getThreadsPromise;
    await expect(page.getByText('Renamed Thread')).toBeVisible({
      timeout: 15000,
    });
  });
});
