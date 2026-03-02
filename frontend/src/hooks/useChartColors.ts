import { useState, useEffect } from 'react';

// Theme type definition to match usage
export type ThemeMode = 'light' | 'dark' | 'clinical-slate' | 'system';

export const useChartColors = () => {
  // Helper: Resolve CSS variable to RGB using browser's native computation
  // This is required because Plotly/SVG doesn't fully support 'oklch()' strings yet
  const getColorsFromDOM = () => {
    const getColor = (varName: string) => {
      const temp = document.createElement('div');
      temp.style.display = 'none';
      temp.style.color = `var(${varName})`;
      document.body.appendChild(temp);
      const computed = getComputedStyle(temp).color;
      document.body.removeChild(temp);
      return computed;
    };

    return {
      // Chart accent colors (6-color palette)
      accent1: getColor('--color-chart-accent-1'),
      accent2: getColor('--color-chart-accent-2'),
      accent3: getColor('--color-chart-accent-3'),
      accent4: getColor('--color-chart-accent-4'),
      accent5: getColor('--color-chart-accent-5'),
      accent6: getColor('--color-chart-accent-6'),

      // Semantic colors
      brand: getColor('--color-brand'),
      surface: getColor('--color-surface'),
      surfaceElevated: getColor('--color-surface-elevated'),
      text: getColor('--color-table-text'),
      textMuted: getColor('--color-text-muted'),
      border: getColor('--color-border'),
      borderSubtle: getColor('--color-border-subtle'),

      // Status colors
      success: getColor('--color-success'),
      warning: getColor('--color-warning'),
      error: getColor('--color-error'),
      info: getColor('--color-info'),

      // Helper: Get all accent colors as array
      accents: [
        getColor('--color-chart-accent-1'),
        getColor('--color-chart-accent-2'),
        getColor('--color-chart-accent-3'),
        getColor('--color-chart-accent-4'),
        getColor('--color-chart-accent-5'),
        getColor('--color-chart-accent-6'),
      ],

      // Map Palette
      mapLand: getColor('--map-land'),
      mapOcean: getColor('--map-ocean'),
      mapLake: getColor('--map-lake'),
      mapBorder: getColor('--map-border'),
      mapCoastline: getColor('--map-coastline'),

      // Table Palette
      tableHeaderBg: getColor('--table-header-bg'),
      tableCellRowOdd: getColor('--table-cell-row-odd'),
      tableCellRowEven: getColor('--table-cell-row-even'),
      tableBorderColor: getColor('--table-border-color'),
    };
  };

  // Initialize with current state of DOM
  const [colors, setColors] = useState(getColorsFromDOM);

  useEffect(() => {
    // Function to update state based on current DOM
    const update = () => setColors(getColorsFromDOM());

    // Observe changes to the 'data-theme' attribute on <html>
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (
          mutation.type === 'attributes' &&
          (mutation.attributeName === 'data-theme' ||
            mutation.attributeName === 'class')
        ) {
          update();
        }
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'class'],
    });

    // Also update immediately in case of race conditions or layout thrashing updates
    update();

    return () => observer.disconnect();
  }, []); // Run once on mount

  return colors;
};
