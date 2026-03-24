/**
 * Utility functions for exporting data
 */

/**
 * Escapes a CSV field value by:
 * - Wrapping in quotes if it contains comma, newline, or quote
 * - Doubling any quotes inside the value
 */
function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const stringValue = String(value);

  // If the value contains comma, newline, or quote, wrap it in quotes
  if (stringValue.includes(',') || stringValue.includes('\n') || stringValue.includes('"')) {
    // Double any quotes and wrap in quotes
    return `"${stringValue.replace(/"/g, '""')}"`;
  }

  return stringValue;
}

/**
 * Converts an array of objects to CSV format and triggers download
 * @param data - Array of objects to export
 * @param columns - Column names in desired order
 * @param filename - Name of the file to download (without extension)
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  columns: string[],
  filename: string = `mediquery-export-${Date.now()}`,
): void {
  // Handle empty data
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  // Handle missing columns - fall back to keys from first object
  const csvColumns = columns && columns.length > 0 ? columns : Object.keys(data[0]);

  // Create CSV header row
  const headerRow = csvColumns.map((col) => escapeCsvField(col)).join(',');

  // Create CSV data rows
  const dataRows = data.map((row) => {
    return csvColumns.map((col) => escapeCsvField(row[col])).join(',');
  });

  // Combine header and data
  const csvContent = [headerRow, ...dataRows].join('\n');

  // Create blob and trigger download
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  link.style.visibility = 'hidden';

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Clean up the URL object
  URL.revokeObjectURL(url);
}
