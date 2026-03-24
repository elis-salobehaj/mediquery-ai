import { expect, test } from '@playwright/experimental-ct-react';
import ChatBox from './ChatBox';

test.use({ viewport: { width: 500, height: 500 } });

test('fetches and displays models from backend on mount', async ({ mount, page }) => {
  // Mock the API call
  await page.route('**/config/models', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([{ id: 'test-model-1', name: 'Test Model 1' }]),
    });
  });

  const component = await mount(<ChatBox messages={[]} setMessages={() => {}} />);

  // Expect the model to be displayed (Playwright locators are smart)
  await expect(component.getByText('Test Model 1')).toBeVisible();
});

test('handles fetch error by using fallback defaults', async ({ mount, page }) => {
  // Mock API failure
  await page.route('**/config/models', async (route) => {
    await route.abort();
  });

  const component = await mount(<ChatBox messages={[]} setMessages={() => {}} />);

  // Expect fallback default model (Qwen 2.5 Coder is now first in fallback list)
  await expect(component.getByText(/Qwen 2.5 Coder/i)).toBeVisible();
});

test('renders thinking process steps when provided', async ({ mount }) => {
  const messagesWithThoughts = [
    {
      id: '1',
      sender: 'bot' as const,
      text: 'Here is the answer.',
      thoughts: ['Step 1: Analyzed query', 'Step 2: Generated SQL'],
    },
  ];

  // @ts-expect-error - bypassing strict type check for test convenience if Types clash
  const component = await mount(<ChatBox messages={messagesWithThoughts} setMessages={() => {}} />);

  // Check for the summary detail
  await expect(component.getByText('SYSTEM_THOUGHT_PROCESS')).toBeVisible();

  // Verify steps are present (even if hidden in details, they exist in DOM, check visibility logic)
  // Details element content is usually visible to getByText unless "hidden" CSS is applied.
  // But let's click to be sure.
  await component.getByText('SYSTEM_THOUGHT_PROCESS').click();

  await expect(component.getByText('Step 1: Analyzed query')).toBeVisible();
  await expect(component.getByText('Step 2: Generated SQL')).toBeVisible();
});
