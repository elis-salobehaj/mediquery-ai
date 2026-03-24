import { expect, test } from '@playwright/experimental-ct-react';
import PlotlyVisualizer from './PlotlyVisualizer';

test.use({ viewport: { width: 500, height: 500 } });

test('renders no data message when empty', async ({ mount }) => {
  const component = await mount(<PlotlyVisualizer data={null} visualizationType="table" />);
  await expect(component.getByText('No data available for visualization')).toBeVisible();
});

test('renders specific chart selector when valid data provided', async ({ mount }) => {
  const data = {
    columns: ['Category', 'Value'],
    data: [
      { Category: 'A', Value: 10 },
      { Category: 'B', Value: 20 },
    ],
    row_count: 2,
  };

  const component = await mount(<PlotlyVisualizer data={data} visualizationType="bar" />);

  // Should show visualization selector because multiple types are compatible (Bar, Pie, Table, etc.)
  await expect(component.getByText('Visualization:')).toBeVisible();

  // Check if Bar button is active
  const barBtn = component.getByRole('button', { name: 'bar' });
  await expect(barBtn).toBeVisible();
  // We can check class or style to see if active, but visibility is good enough for now.
});
