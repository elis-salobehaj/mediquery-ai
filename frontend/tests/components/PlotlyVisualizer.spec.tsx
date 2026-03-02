import { test, expect } from '@playwright/experimental-ct-react';
import PlotlyVisualizer from '@/components/Chat/PlotlyVisualizer';

test.use({ viewport: { width: 500, height: 500 } });

test('renders no data message when empty', async ({ mount }) => {
  const component = await mount(
    <PlotlyVisualizer data={null} visualizationType="table" theme="light" />,
  );
  await expect(
    component.getByText('No data available for visualization'),
  ).toBeVisible();
});

test('identifies compatible chart types and notifies parent', async ({
  mount,
}) => {
  const data = {
    columns: ['Category', 'Value'],
    data: [
      { Category: 'A', Value: 10 },
      { Category: 'B', Value: 20 },
    ],
    row_count: 2,
  };

  let receivedTypes: string[] = [];
  const onChartTypesReady = (types: string[]) => {
    receivedTypes = types;
  };

  await mount(
    <PlotlyVisualizer
      data={data}
      visualizationType="bar"
      theme="light"
      onChartTypesReady={onChartTypesReady}
    />,
  );

  // Use poll because useEffect runs asynchronously after initial mount
  await expect
    .poll(() => receivedTypes, {
      message: 'Wait for onChartTypesReady to be called',
      timeout: 5000,
    })
    .toContain('bar');

  expect(receivedTypes).toContain('table');
});
