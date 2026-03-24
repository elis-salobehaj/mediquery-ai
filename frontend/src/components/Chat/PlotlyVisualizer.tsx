import type { ColumnDef } from '@tanstack/react-table';
import type { Data, Layout } from 'plotly.js';
import React, { useMemo, useState } from 'react';
import Plot from 'react-plotly.js';
import { useChartColors } from '../../hooks/useChartColors';
import { DataTable } from '../ui/data-table';
import { DataTableColumnHeader } from '../ui/data-table-column-header';

type VisualizationValue = string | number | boolean | null;
type VisualizationRow = Record<string, VisualizationValue>;

interface VisualizationData {
  columns: string[];
  data: VisualizationRow[];
  row_count: number;
}

interface PlotlyVisualizerProps {
  data: VisualizationData;
  visualizationType: string;
  theme: 'light' | 'dark' | 'clinical-slate' | 'system';
  /** When true (inside the full-screen Dialog), uses a larger chart height */
  expandedMode?: boolean;
  /** Callback fired when selected chart type changes */
  onVisualizationTypeChange?: (type: string) => void;
  /**
   * Callback fired once compatible chart types are computed.
   * Parent can use this to render its own chart-type selector in a toolbar.
   * Receives: (compatibleTypes, currentType, setType)
   */
  onChartTypesReady?: (types: string[], current: string, setCurrent: (t: string) => void) => void;
}

// Helper function to determine compatible chart types based on data structure
const getCompatibleChartTypes = (
  columns: string[],
  rows: VisualizationRow[],
  rowCount: number,
): string[] => {
  const compatible: string[] = ['table']; // Table always works

  if (rowCount === 0) return compatible;

  // Helper to check if column is numeric
  const isNumeric = (col: string) => {
    try {
      return typeof rows[0][col] === 'number';
    } catch {
      return false;
    }
  };

  const numericCols = columns.filter(isNumeric);
  const categoricalCols = columns.filter((col) => !isNumeric(col));

  // Heuristic: Is this a "Metric" (Count/Amount) or "Dimension" (Age/Year)?
  // If we only have "Dimension" style numbers, we might prefer charts that can handle Counts (like Bar/Pie)
  // explicitly over those that require 3+ numbers.

  // Basic charts (need at least 2 columns)
  if (columns.length >= 2) {
    compatible.push('bar', 'scatter', 'area');

    // Pie/donut for categorical + numeric
    // OR just categorical (we can count)
    if (categoricalCols.length >= 1) {
      compatible.push('pie', 'donut');
    }
  }

  // Line chart (works with 2+ columns)
  if (columns.length >= 2) {
    compatible.push('line');
  }

  // Statistical charts (need numeric data)
  if (numericCols.length >= 1) {
    compatible.push('box', 'violin', 'histogram');
  }

  // Heatmap (need 2+ numeric columns)
  if (numericCols.length >= 2) {
    compatible.push('heatmap');
  }

  // Maps (need state/country column OR lat/lon)
  const hasLatLon =
    columns.some((col) => col.toLowerCase().includes('lat')) &&
    columns.some((col) => col.toLowerCase().includes('lon'));
  if (hasLatLon) {
    compatible.push('scattermapbox');
  }

  // 3D charts (need 3+ numeric columns)
  if (numericCols.length >= 3) {
    compatible.push('scatter3d', 'surface');
  }

  if (
    columns.some(
      (col) => col.toLowerCase().includes('state') || col.toLowerCase().includes('country'),
    )
  ) {
    compatible.push('choropleth');
  }

  // Hierarchical (need 2+ categorical columns)
  if (categoricalCols.length >= 2) {
    compatible.push('sunburst', 'treemap');
  }

  // Specialized
  if (numericCols.length >= 1) {
    compatible.push('indicator', 'gauge');
  }

  if (numericCols.length >= 4) {
    compatible.push('parcoords', 'splom');
  }

  // Financial
  if (columns.length >= 2) {
    compatible.push('waterfall', 'funnel');
  }

  return compatible;
};

// Utils for smart column selection
const METRIC_KEYWORDS = [
  'count',
  'total',
  'sum',
  'amount',
  'revenue',
  'profit',
  'sales',
  'val',
  'cost',
  'bill',
  'avg',
  'average',
  'score',
  'rating',
  'rate',
  'percent',
  'min',
  'max',
];
const DIMENSION_KEYWORDS = ['age', 'year', 'month', 'day', 'id', 'zip', 'code', 'lat', 'lon'];

const isMetricColumn = (colName: string) =>
  METRIC_KEYWORDS.some((kw) => colName.toLowerCase().includes(kw));
const isDimensionColumn = (colName: string) =>
  DIMENSION_KEYWORDS.some((kw) => colName.toLowerCase().includes(kw));

const getBestValueColumn = (columns: string[], rows: VisualizationRow[]): string | null => {
  const numericCols = columns.filter((col) => typeof rows[0][col] === 'number');
  if (numericCols.length === 0) return null;

  // Prefer metric columns
  const metricCols = numericCols.filter(isMetricColumn);
  if (metricCols.length > 0) return metricCols[0];

  // Fallback to first numeric column that's not a dimension
  const nonDimensionCols = numericCols.filter((col) => !isDimensionColumn(col));
  return nonDimensionCols.length > 0 ? nonDimensionCols[0] : numericCols[0];
};

const shouldUseRowCount = (valueCol: string | null): boolean => {
  if (!valueCol) return true;
  return isDimensionColumn(valueCol) && !isMetricColumn(valueCol);
};

const PlotlyVisualizer: React.FC<PlotlyVisualizerProps> = ({
  data,
  visualizationType,
  theme,
  expandedMode = false,
  onVisualizationTypeChange,
  onChartTypesReady,
}) => {
  const [selectedChartType, setSelectedChartType] = useState<string>(visualizationType);

  // Get theme-aware colors from CSS variables
  const colors = useChartColors();

  // Determine compatible chart types based on data
  const compatibleChartTypes = useMemo(() => {
    if (!data || !data.columns || !data.data) return ['table'];
    return getCompatibleChartTypes(data.columns, data.data, data.data.length);
  }, [data]);

  // Synchronize local state with prop changes.
  // Using a ref to track if the change originated from local state or prop.
  const prevTypeProp = React.useRef(visualizationType);
  React.useEffect(() => {
    if (visualizationType !== prevTypeProp.current) {
      prevTypeProp.current = visualizationType;
      setSelectedChartType(visualizationType);
    }
  }, [visualizationType]);

  // Notify parent of available chart types so they can render the selector
  // in their own header/toolbar — must be above the early return (Rules of Hooks).
  const prevTypesRef = React.useRef<string>('');
  React.useEffect(() => {
    const key = `${compatibleChartTypes.join(',')}:${selectedChartType}`;
    if (onChartTypesReady && key !== prevTypesRef.current) {
      prevTypesRef.current = key;
      onChartTypesReady(compatibleChartTypes, selectedChartType, (t) => {
        setSelectedChartType(t);
        onVisualizationTypeChange?.(t);
      });
    }
  }, [compatibleChartTypes, selectedChartType, onChartTypesReady, onVisualizationTypeChange]);

  // Map-type charts: disable scrollZoom in expanded mode so the user can
  // drag/pan the map without page-scroll interference.
  const isMapChart = ['scattermapbox', 'choropleth', 'map', 'scattergeo'].includes(
    selectedChartType,
  );

  const { plotData, layout, isTable, tableColumns } = useMemo(() => {
    if (!data || !data.columns || !data.data || data.data.length === 0) {
      return { plotData: [], layout: {}, isTable: false };
    }

    const columns = data.columns;
    const rows = data.data;

    // Theme Configuration using OKLCH colors from hook
    const baseLayout = {
      // Re-layout/Preserve Zoom on updates
      uirevision: 'true', // Keeps zoom state when data/theme updates
      paper_bgcolor: 'transparent', // Let CSS handle background
      plot_bgcolor: 'transparent',
      font: {
        bordercolor: colors.border,
      },
      xaxis: {
        gridcolor: colors.borderSubtle,
        zerolinecolor: colors.border,
        tickcolor: colors.textMuted,
        color: colors.text,
      },
      yaxis: {
        gridcolor: colors.borderSubtle,
        zerolinecolor: colors.border,
        tickcolor: colors.textMuted,
        color: colors.text,
      },
    };

    // Helper to extract column data

    const getColumn = (colName: string): VisualizationValue[] =>
      rows.map((row: VisualizationRow) => row[colName]);
    const getNumericColumn = (colName: string): number[] =>
      rows.map((row: VisualizationRow) => Number(row[colName]) || 0);
    const getStringColumn = (colName: string): string[] =>
      rows.map((row: VisualizationRow) => String(row[colName] ?? ''));

    // Determine chart type and generate appropriate data
    switch (selectedChartType) {
      // ===== BASIC CHARTS =====
      case 'bar': {
        const xCol = columns[0];
        const yCol = columns[1];

        // Smart Value Detection
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        // Aggregate if X is not unique implies grouping needed
        const uniqueX = new Set(getColumn(xCol));

        if (uniqueX.size < rows.length) {
          const aggMap = new Map<string, number>();
          rows.forEach((row: VisualizationRow) => {
            const key = String(row[xCol]);
            const val = useCount ? 1 : Number(row[bestValueCol]) || 0;
            aggMap.set(key, (aggMap.get(key) || 0) + val);
          });

          return {
            plotData: [
              {
                type: 'bar',
                x: Array.from(aggMap.keys()),
                y: Array.from(aggMap.values()),
                marker: {
                  color: colors.brand,
                  line: { color: colors.brand, width: 1 },
                },
              },
            ],
            layout: {
              ...baseLayout,
              title: `Bar Chart (${useCount ? 'Count' : bestValueCol})`,
              xaxis: { ...baseLayout.xaxis, title: xCol },
              yaxis: {
                ...baseLayout.yaxis,
                title: useCount ? 'Count' : bestValueCol,
              },
            },
          };
        }

        return {
          plotData: [
            {
              type: 'bar',
              x: getColumn(xCol),
              y: getColumn(yCol),
              marker: {
                color: colors.brand,
                line: { color: colors.brand, width: 1 },
              },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Bar Chart',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      case 'pie':
      case 'donut': {
        const labelCol = columns[0];
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        const aggMap = new Map<string, number>();
        rows.forEach((row: VisualizationRow) => {
          const key = String(row[labelCol]);
          const val = useCount ? 1 : Number(row[bestValueCol]) || 0;
          aggMap.set(key, (aggMap.get(key) || 0) + val);
        });

        const labels = Array.from(aggMap.keys());
        const values = Array.from(aggMap.values());

        return {
          plotData: [
            {
              type: 'pie',
              labels: labels,
              values: values,
              hole: selectedChartType === 'donut' ? 0.4 : 0,
              marker: { colors: colors.accents },
              textfont: { color: colors.text },
              textinfo: 'label+percent',
              hoverinfo: 'label+value+percent',
            },
          ],
          layout: {
            ...baseLayout,
            title: `${selectedChartType === 'donut' ? 'Donut' : 'Pie'} Chart (${useCount ? 'Count' : bestValueCol})`,
          },
        };
      }

      case 'line': {
        const xCol = columns[0];
        const yCol = columns[1];
        return {
          plotData: [
            {
              type: 'scatter',
              mode: 'lines',
              x: getColumn(xCol),
              y: getColumn(yCol),
              line: { color: colors.brand, width: 2 },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Line Chart',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      case 'scatter': {
        const xCol = columns[0];
        const yCol = columns[1];
        return {
          plotData: [
            {
              type: 'scatter',
              mode: 'markers',
              x: getColumn(xCol),
              y: getColumn(yCol),
              marker: {
                color: colors.brand,
                size: 8,
                line: { color: colors.surface, width: 0.5 },
              },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Scatter Plot',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      case 'area': {
        const xCol = columns[0];
        const yCol = columns[1];
        return {
          plotData: [
            {
              type: 'scatter',
              mode: 'lines',
              fill: 'tozeroy',
              x: getColumn(xCol),
              y: getColumn(yCol),
              fillcolor: `${colors.accent1}33`, // 33 = 20% opacity in hex
              line: { color: colors.brand, width: 2 },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Area Chart',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      // ===== STATISTICAL CHARTS =====
      case 'box': {
        const yCol = columns.find((col: string) => typeof rows[0][col] === 'number') || columns[0];
        return {
          plotData: [
            {
              type: 'box',
              y: getColumn(yCol),
              marker: { color: colors.brand },
              line: { color: colors.brand },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Box Plot',
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      case 'violin': {
        const yCol = columns.find((col: string) => typeof rows[0][col] === 'number') || columns[0];
        return {
          plotData: [
            {
              type: 'violin',
              y: getColumn(yCol),
              marker: { color: colors.brand },
              line: { color: colors.brand },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Violin Plot',
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      case 'histogram': {
        const xCol = columns.find((col: string) => typeof rows[0][col] === 'number') || columns[0];
        return {
          plotData: [
            {
              type: 'histogram',
              x: getColumn(xCol),
              marker: {
                color: colors.brand,
                line: { color: colors.surface, width: 0.5 },
              },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Histogram',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: 'Frequency' },
          },
        };
      }

      case 'heatmap': {
        const numericCols = columns.filter((col: string) => typeof rows[0][col] === 'number');
        const matrix = numericCols.map((col1: string) =>
          numericCols.map((col2: string) => {
            const data1 = getNumericColumn(col1);
            const data2 = getNumericColumn(col2);
            const mean1 = data1.reduce((a: number, b: number) => a + b, 0) / data1.length;
            const mean2 = data2.reduce((a: number, b: number) => a + b, 0) / data2.length;
            const num = data1.reduce(
              (sum: number, val: number, i: number) => sum + (val - mean1) * (data2[i] - mean2),
              0,
            );
            const den1 = Math.sqrt(
              data1.reduce((sum: number, val: number) => sum + (val - mean1) ** 2, 0),
            );
            const den2 = Math.sqrt(
              data2.reduce((sum: number, val: number) => sum + (val - mean2) ** 2, 0),
            );
            return num / (den1 * den2);
          }),
        );
        return {
          plotData: [
            {
              type: 'heatmap',
              z: matrix,
              x: numericCols,
              y: numericCols,
              colorscale: [
                [0, colors.surface],
                [0.5, colors.accent1],
                [1, colors.accent3],
              ],
              showscale: true,
            },
          ],
          layout: { ...baseLayout, title: 'Correlation Heatmap' },
        };
      }

      case 'contour': {
        const xCol = columns[0];
        const yCol = columns[1];
        const zCol = columns[2] || columns[1];
        return {
          plotData: [
            {
              type: 'contour',
              x: getColumn(xCol),
              y: getColumn(yCol),
              z: getColumn(zCol),
              colorscale: [
                [0, colors.surface],
                [0.5, colors.brand],
                [1, colors.accent3],
              ],
              contours: { coloring: 'heatmap' },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Contour Plot',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      // ===== FINANCIAL CHARTS =====
      case 'waterfall': {
        const xCol = columns[0];
        const yCol = columns[1];
        return {
          plotData: [
            {
              type: 'waterfall',
              x: getColumn(xCol),
              y: getColumn(yCol),
              connector: { line: { color: colors.brand } },
              increasing: { marker: { color: colors.success } },
              decreasing: { marker: { color: colors.error } },
              totals: { marker: { color: colors.warning } },
            },
          ],
          layout: {
            ...baseLayout,
            title: 'Waterfall Chart',
            xaxis: { ...baseLayout.xaxis, title: xCol },
            yaxis: { ...baseLayout.yaxis, title: yCol },
          },
        };
      }

      case 'funnel': {
        const xCol = columns[0];
        const yCol = columns[1];
        return {
          plotData: [
            {
              type: 'funnel',
              y: getColumn(xCol),
              x: getColumn(yCol),
              marker: { color: colors.brand },
            },
          ],
          layout: { ...baseLayout, title: 'Funnel Chart' },
        };
      }

      // ===== 3D CHARTS =====
      case 'scatter3d': {
        const xCol = columns[0];
        const yCol = columns[1];
        const zCol = columns[2] || columns[1];
        return {
          plotData: [
            {
              type: 'scatter3d',
              mode: 'markers',
              x: getColumn(xCol),
              y: getColumn(yCol),
              z: getColumn(zCol),
              marker: {
                color: colors.brand,
                size: 5,
                line: { color: colors.surface, width: 0.5 },
              },
            },
          ],
          layout: {
            ...baseLayout,
            title: '3D Scatter Plot',
            scene: {
              xaxis: { title: xCol, gridcolor: colors.borderSubtle },
              yaxis: { title: yCol, gridcolor: colors.borderSubtle },
              zaxis: { title: zCol, gridcolor: colors.borderSubtle },
              bgcolor: 'transparent',
            },
          },
        };
      }

      case 'surface': {
        const xCol = columns[0];
        const yCol = columns[1];
        const zCol = columns[2] || columns[1];
        return {
          plotData: [
            {
              type: 'surface',
              x: getColumn(xCol),
              y: getColumn(yCol),
              z: [getColumn(zCol)],
              colorscale: [
                [0, colors.surface],
                [0.5, colors.brand],
                [1, colors.accent3],
              ],
            },
          ],
          layout: {
            ...baseLayout,
            title: '3D Surface Plot',
            scene: {
              xaxis: { title: xCol, gridcolor: colors.borderSubtle },
              yaxis: { title: yCol, gridcolor: colors.borderSubtle },
              zaxis: { title: zCol, gridcolor: colors.borderSubtle },
              bgcolor: 'transparent',
            },
          },
        };
      }

      // ===== HIERARCHICAL CHARTS =====
      case 'sunburst': {
        const categoricalCols = columns.filter((col) => typeof rows[0][col] === 'string');
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        const getValue = (row: VisualizationRow) =>
          useCount ? 1 : Number(row[bestValueCol ?? columns[0]]) || 1;

        if (categoricalCols.length >= 2) {
          const labels: string[] = ['Total'];
          const parents: string[] = [''];
          const values: number[] = [rows.reduce((sum, row) => sum + getValue(row), 0)];

          const level1Map = new Map<string, number>();
          rows.forEach((row) => {
            const key = String(row[categoricalCols[0]]);
            level1Map.set(key, (level1Map.get(key) || 0) + getValue(row));
          });

          level1Map.forEach((value, key) => {
            labels.push(key);
            parents.push('Total');
            values.push(value);
          });

          rows.forEach((row) => {
            const parent = String(row[categoricalCols[0]]);
            const child = String(row[categoricalCols[1]]);
            const label = `${parent} - ${child}`;
            const value = getValue(row);
            if (!labels.includes(label)) {
              labels.push(label);
              parents.push(parent);
              values.push(value);
            }
          });

          return {
            plotData: [
              {
                type: 'sunburst',
                labels: labels,
                parents: parents,
                values: values,
                marker: { colors: colors.accents },
                textfont: { color: colors.text },
                branchvalues: 'total',
              },
            ],
            layout: {
              ...baseLayout,
              title: `Sunburst Chart (${useCount ? 'Count' : bestValueCol})`,
            },
          };
        } else {
          const labelCol = categoricalCols[0] || columns[0];
          return {
            plotData: [
              {
                type: 'sunburst',
                labels: getColumn(labelCol),
                parents: Array(rows.length).fill(''),
                values: rows.map(getValue),
                marker: { colors: colors.accents },
                textfont: { color: colors.text },
              },
            ],
            layout: {
              ...baseLayout,
              title: `Sunburst Chart (${useCount ? 'Count' : bestValueCol})`,
            },
          };
        }
      }

      case 'treemap': {
        const categoricalCols = columns.filter((col) => typeof rows[0][col] === 'string');
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        const getValue = (row: VisualizationRow) =>
          useCount ? 1 : Number(row[bestValueCol ?? columns[0]]) || 1;

        if (categoricalCols.length >= 2) {
          const labels: string[] = ['Total'];
          const parents: string[] = [''];
          const values: number[] = [rows.reduce((sum, row) => sum + getValue(row), 0)];

          const level1Map = new Map<string, number>();
          rows.forEach((row) => {
            const key = String(row[categoricalCols[0]]);
            level1Map.set(key, (level1Map.get(key) || 0) + getValue(row));
          });

          level1Map.forEach((value, key) => {
            labels.push(key);
            parents.push('Total');
            values.push(value);
          });

          rows.forEach((row) => {
            const parent = String(row[categoricalCols[0]]);
            const child = String(row[categoricalCols[1]]);
            const label = `${parent} - ${child}`;
            const value = getValue(row);
            if (!labels.includes(label)) {
              labels.push(label);
              parents.push(parent);
              values.push(value);
            }
          });

          return {
            plotData: [
              {
                type: 'treemap',
                labels: labels,
                parents: parents,
                values: values,
                marker: { colors: colors.accents },
                textfont: { color: colors.text },
                branchvalues: 'total',
              },
            ],
            layout: {
              ...baseLayout,
              title: `Treemap (${useCount ? 'Count' : bestValueCol})`,
            },
          };
        } else {
          const labelCol = categoricalCols[0] || columns[0];
          return {
            plotData: [
              {
                type: 'treemap',
                labels: getColumn(labelCol),
                parents: Array(rows.length).fill(''),
                values: rows.map(getValue),
                marker: { colors: colors.accents },
                textfont: { color: colors.text },
              },
            ],
            layout: {
              ...baseLayout,
              title: `Treemap (${useCount ? 'Count' : bestValueCol})`,
            },
          };
        }
      }

      case 'sankey': {
        const sourceCol = columns[0];
        const targetCol = columns[1];
        const valueCol = columns[2] || columns[1];
        return {
          plotData: [
            {
              type: 'sankey',
              node: {
                label: [...new Set([...getColumn(sourceCol), ...getColumn(targetCol)])],
                color: colors.brand,
                pad: 15,
                thickness: 20,
                line: { color: colors.surface, width: 0.5 },
              },
              link: {
                source: getColumn(sourceCol).map((s: string) =>
                  [...new Set([...getColumn(sourceCol), ...getColumn(targetCol)])].indexOf(s),
                ),
                target: getColumn(targetCol).map((t: string) =>
                  [...new Set([...getColumn(sourceCol), ...getColumn(targetCol)])].indexOf(t),
                ),
                value: getColumn(valueCol),
                color: `${colors.accent2}66`, // 66 = 40% opacity
              },
            },
          ],
          layout: { ...baseLayout, title: 'Sankey Diagram' },
        };
      }

      // ===== SPECIALIZED CHARTS =====
      case 'indicator': {
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        // Helper to check if we should average or sum
        const IS_AVG_KEYWORD = [
          'avg',
          'average',
          'rate',
          'percent',
          'score',
          'min',
          'max',
          'mean',
          'median',
        ];
        const shouldAverage =
          bestValueCol && IS_AVG_KEYWORD.some((kw) => bestValueCol.toLowerCase().includes(kw));

        let value = 0;
        let prefix = '';

        if (useCount) {
          value = rows.length;
          prefix = 'Total Count';
        } else {
          // Calculate Sum first
          const sum = rows.reduce(
            (a: number, r: VisualizationRow) => a + (Number(r[bestValueCol ?? columns[0]]) || 0),
            0,
          );

          if (shouldAverage && rows.length > 0) {
            value = sum / rows.length;
            prefix = `Avg ${bestValueCol}`;
          } else {
            value = sum;
            prefix = `Total ${bestValueCol}`;
          }
        }

        return {
          plotData: [
            {
              type: 'indicator',
              mode: 'number',
              value: value,
              domain: { x: [0, 1], y: [0, 1] },
              title: { text: prefix, font: { color: colors.brand } },
              number: {
                font: { color: colors.brand, size: 60 },
                valueformat: shouldAverage ? '.1f' : 'd',
              },
            },
          ],
          layout: { ...baseLayout, title: 'KPI Indicator' },
        };
      }

      case 'gauge': {
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        let value = 0;
        let axisRange = 100;

        if (useCount) {
          value = rows.length;
          axisRange = value * 1.5;
        } else {
          const values = getNumericColumn(bestValueCol ?? columns[0]);
          value = values.reduce((a: number, b: number) => a + b, 0) / values.length;
          axisRange = Math.max(...values);
        }

        return {
          plotData: [
            {
              type: 'indicator',
              mode: 'gauge+number',
              value: value,
              gauge: {
                axis: { range: [null, axisRange], tickcolor: colors.brand },
                bar: { color: colors.brand },
                bgcolor: 'transparent',
                borderwidth: 2,
                bordercolor: colors.brand,
                steps: [
                  { range: [0, axisRange * 0.5], color: `${colors.brand}33` },
                  {
                    range: [axisRange * 0.5, axisRange],
                    color: `${colors.brand}66`,
                  },
                ],
              },
              title: {
                text: useCount ? 'Count' : `Avg ${bestValueCol}`,
                font: { color: colors.brand },
              },
            },
          ],
          layout: { ...baseLayout, title: 'Gauge Chart' },
        };
      }

      case 'parcoords': {
        const numericCols = columns.filter((col: string) => typeof rows[0][col] === 'number');
        const dimensions = numericCols.map((col: string) => ({
          label: col,
          values: getColumn(col),
        }));
        return {
          plotData: [
            {
              type: 'parcoords',
              line: {
                color: colors.brand,
                colorscale: [
                  [0, colors.surface],
                  [0.5, colors.brand],
                  [1, colors.accent3],
                ],
              },
              dimensions: dimensions,
            },
          ],
          layout: { ...baseLayout, title: 'Parallel Coordinates' },
        };
      }

      case 'splom': {
        const numericCols = columns
          .filter((col: string) => typeof rows[0][col] === 'number')
          .slice(0, 4);
        const dimensions = numericCols.map((col: string) => ({
          label: col,
          values: getColumn(col),
        }));
        return {
          plotData: [
            {
              type: 'splom',
              dimensions: dimensions,
              marker: {
                color: colors.brand,
                size: 5,
                line: { color: colors.surface, width: 0.5 },
              },
            },
          ],
          layout: { ...baseLayout, title: 'Scatter Plot Matrix (SPLOM)' },
        };
      }

      // ===== MAPS =====
      case 'choropleth':
      case 'map': {
        const locationCol =
          columns.find((col: string) => col.toLowerCase().includes('state')) || columns[0];
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);

        const stateMap = new Map<string, number>();
        rows.forEach((row: VisualizationRow) => {
          const loc = String(row[locationCol] ?? '');
          const val = useCount ? 1 : Number(row[bestValueCol ?? columns[0]]) || 0;
          stateMap.set(loc, (stateMap.get(loc) || 0) + val);
        });

        const locations = Array.from(stateMap.keys());
        const z = Array.from(stateMap.values());

        return {
          plotData: [
            {
              type: 'choropleth',
              locationmode: 'country names',
              locations: locations,
              z: z,
              colorscale: [
                [0, colors.surface],
                [0.5, colors.accent1],
                [1, colors.accent3],
              ],
              colorbar: {
                title: useCount ? 'Count' : bestValueCol,
                tickfont: { color: colors.text },
              },
              marker: { line: { color: colors.brand, width: 1 } },
            },
          ],
          layout: {
            ...baseLayout,
            title: `Choropleth Map (${useCount ? 'Patient Count' : bestValueCol})`,
            geo: {
              scope: 'world',
              projection: { type: 'equirectangular' },
              showland: true,
              landcolor: colors.mapLand,
              showlakes: true,
              lakecolor: colors.mapLake,
              showocean: true,
              oceancolor: colors.mapOcean,
              bgcolor: 'transparent',
              countrycolor: colors.mapBorder,
              coastlinecolor: colors.mapCoastline,
            },
          },
        };
      }

      case 'scattermapbox': {
        const latCol = columns.find((col) => col.toLowerCase().includes('lat'));
        const lonCol = columns.find((col) => col.toLowerCase().includes('lon'));

        if (latCol && lonCol) {
          // Lat/Lon based map (scattermapbox for Raster Tiles)
          const nameCol =
            columns.find(
              (col) => col.toLowerCase().includes('patient') || col.toLowerCase().includes('name'),
            ) || columns[0];

          return {
            plotData: [
              {
                type: 'scattermapbox', // Use Mapbox/Tile maps
                mode: 'markers',
                lat: getColumn(latCol),
                lon: getColumn(lonCol),
                text: getColumn(nameCol),
                marker: {
                  size: 9,
                  color: colors.brand,
                  opacity: 0.8,
                },
              },
            ],
            layout: {
              ...baseLayout,
              title: 'Global Patient Locations',
              margin: { r: 0, t: 40, b: 0, l: 0 },
              mapbox: {
                style:
                  theme === 'dark' || theme === 'clinical-slate'
                    ? 'carto-darkmatter'
                    : 'carto-positron',
                zoom: 3,
                // Auto-center will happen if center is undefined, Plotly handles this patient
              },
            },
          };
        }

        // State/Country based map fallback
        const locationCol =
          columns.find((col: string) => col.toLowerCase().includes('state')) || columns[0];
        const bestValueCol = getBestValueColumn(columns, rows);
        const useCount = shouldUseRowCount(bestValueCol);
        const numericCols = columns.filter((col: string) => typeof rows[0][col] === 'number');

        if (numericCols.length > 0) {
          return {
            plotData: [
              {
                type: 'choropleth',
                locations: getStringColumn(locationCol),
                z: getNumericColumn(numericCols[0]),
                locationmode: 'country names',
                colorscale: 'Viridis',
                colorbar: {
                  title: numericCols[0],
                  thickness: 10,
                  len: 0.5,
                },
              },
            ],
            layout: {
              ...baseLayout,
              title: `${numericCols[0]} by ${locationCol}`,
              geo: {
                scope: 'world',
                showland: true,
                landcolor: colors.mapLand,
                countrycolor: colors.mapBorder,
                showocean: true,
                oceancolor: colors.mapOcean,
                bgcolor: 'transparent',
                coastlinecolor: colors.mapCoastline,
              },
            },
          };
        }

        const stateMap = new Map<string, number>();
        rows.forEach((row: VisualizationRow) => {
          const loc = String(row[locationCol] ?? '');
          const val = useCount ? 1 : Number(row[bestValueCol ?? columns[0]]) || 0;
          stateMap.set(loc, (stateMap.get(loc) || 0) + val);
        });

        const locations = Array.from(stateMap.keys());
        const sizes = Array.from(stateMap.values());

        const maxSize = Math.max(...sizes);
        const markerSizes = sizes.map((s) => (s / maxSize) * 30 + 5);

        return {
          plotData: [
            {
              type: 'scattergeo',
              locationmode: 'country names',
              locations: locations,
              text: sizes.map((v, i) => `${locations[i]}: ${v}`),
              marker: {
                size: markerSizes,
                color: colors.brand,
                line: { color: colors.surface, width: 1 },
              },
            },
          ],
          layout: {
            ...baseLayout,
            title: `Scatter Geo Map (${useCount ? 'Patient Count' : bestValueCol})`,
            geo: {
              scope: 'world',
              projection: { type: 'equirectangular' },
              showland: true,
              landcolor: colors.mapLand,
              showlakes: true,
              lakecolor: colors.mapLake,
              showocean: true,
              oceancolor: colors.mapOcean,
              bgcolor: 'transparent',
              countrycolor: colors.mapBorder,
              coastlinecolor: colors.mapCoastline,
            },
          },
        };
      }

      // ===== TABLE (Shadcn + TanStack) =====
      default: {
        const dynamicColumns: ColumnDef<VisualizationRow>[] = columns.map((col) => ({
          id: col, // Use id to avoid issues with dots in accessorKey
          accessorFn: (row) => row[col],
          header: ({ column }) => <DataTableColumnHeader column={column} title={col} />,
          cell: ({ row }) => {
            const value = row.getValue(col);
            if (value === null || value === undefined) return '';
            if (typeof value === 'number') {
              if (Number.isInteger(value)) return value.toLocaleString();
              return value.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              });
            }
            return String(value);
          },
        }));

        return {
          plotData: [],
          layout: { ...baseLayout, title: 'Data Table' },
          isTable: true,
          tableColumns: dynamicColumns,
        };
      }
    }
  }, [data, selectedChartType, theme, colors]);

  if (!isTable && (!plotData || plotData.length === 0)) {
    return (
      <div
        className="rounded border p-4 text-center"
        style={{ color: colors.brand, borderColor: `${colors.brand}4D` }}
      >
        No data available for visualization
      </div>
    );
  }

  return (
    <div className="w-full">
      {isTable && tableColumns ? (
        <DataTable
          key={`table-${data.columns.join('-')}`}
          columns={tableColumns}
          data={data.data}
        />
      ) : (
        <Plot
          key={`${theme}-${selectedChartType}`}
          data={plotData as Data[]}
          layout={{
            ...(layout as Partial<Layout>),
            autosize: true,
            height: expandedMode ? Math.floor(window.innerHeight * 0.75) : 500,
            modebar: { bgcolor: 'transparent' },
          }}
          config={{
            responsive: true,
            displayModeBar: true,
            scrollZoom: isMapChart,
            displaylogo: false,
          }}
          style={{ width: '100%', backgroundColor: 'transparent' }}
          useResizeHandler={true}
        />
      )}
    </div>
  );
};

export default PlotlyVisualizer;
