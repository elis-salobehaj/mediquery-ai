import { useEffect, useState } from 'react';

// Theme type definition to match usage
export type ThemeMode = 'light' | 'dark' | 'clinical-slate' | 'system';

const resolveCssVariableColor = (varName: string) => {
  const temp = document.createElement('div');
  temp.style.display = 'none';
  temp.style.color = `var(${varName})`;
  document.body.appendChild(temp);
  const computed = getComputedStyle(temp).color;
  document.body.removeChild(temp);
  return computed;
};

const getColorsFromDOM = () => ({
  accent1: resolveCssVariableColor('--color-chart-accent-1'),
  accent2: resolveCssVariableColor('--color-chart-accent-2'),
  accent3: resolveCssVariableColor('--color-chart-accent-3'),
  accent4: resolveCssVariableColor('--color-chart-accent-4'),
  accent5: resolveCssVariableColor('--color-chart-accent-5'),
  accent6: resolveCssVariableColor('--color-chart-accent-6'),
  brand: resolveCssVariableColor('--color-brand'),
  surface: resolveCssVariableColor('--color-surface'),
  surfaceElevated: resolveCssVariableColor('--color-surface-elevated'),
  text: resolveCssVariableColor('--color-table-text'),
  textMuted: resolveCssVariableColor('--color-text-muted'),
  border: resolveCssVariableColor('--color-border'),
  borderSubtle: resolveCssVariableColor('--color-border-subtle'),
  success: resolveCssVariableColor('--color-success'),
  warning: resolveCssVariableColor('--color-warning'),
  error: resolveCssVariableColor('--color-error'),
  info: resolveCssVariableColor('--color-info'),
  accents: [
    resolveCssVariableColor('--color-chart-accent-1'),
    resolveCssVariableColor('--color-chart-accent-2'),
    resolveCssVariableColor('--color-chart-accent-3'),
    resolveCssVariableColor('--color-chart-accent-4'),
    resolveCssVariableColor('--color-chart-accent-5'),
    resolveCssVariableColor('--color-chart-accent-6'),
  ],
  mapLand: resolveCssVariableColor('--map-land'),
  mapOcean: resolveCssVariableColor('--map-ocean'),
  mapLake: resolveCssVariableColor('--map-lake'),
  mapBorder: resolveCssVariableColor('--map-border'),
  mapCoastline: resolveCssVariableColor('--map-coastline'),
  tableHeaderBg: resolveCssVariableColor('--table-header-bg'),
  tableCellRowOdd: resolveCssVariableColor('--table-cell-row-odd'),
  tableCellRowEven: resolveCssVariableColor('--table-cell-row-even'),
  tableBorderColor: resolveCssVariableColor('--table-border-color'),
});

export const useChartColors = () => {
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
          (mutation.attributeName === 'data-theme' || mutation.attributeName === 'class')
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
