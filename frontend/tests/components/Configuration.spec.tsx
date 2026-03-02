import { test, expect } from '@playwright/experimental-ct-react';
import Configuration from '@/components/Configuration';

test.use({ viewport: { width: 500, height: 500 } });

test('renders configuration form with api key', async ({ mount }) => {
  const component = await mount(
    <Configuration apiKey="test-key" setApiKey={() => {}} />,
  );

  // Use heading locator
  await expect(
    component.getByRole('heading', { name: 'Configuration' }),
  ).toBeVisible();

  // Check password input directly
  const input = component.locator('input[type="password"]');
  await expect(input).toBeVisible();
  await expect(input).toHaveValue('test-key');
});

test('updates api key check', async ({ mount }) => {
  const component = await mount(
    <Configuration apiKey="" setApiKey={() => {}} />,
  );
  const input = component.locator('input[type="password"]');
  await expect(input).toBeVisible();
});
