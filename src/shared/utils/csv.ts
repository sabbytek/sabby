// Escapes a cell value for CSV: wraps in quotes if it contains comma, quote, or newline.
export function csvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// Serialises a 2D array of strings to a CSV string (CRLF line endings per RFC 4180).
export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
