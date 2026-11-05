/**
 * CSV for the admin's exports: RFC 4180 quoting, CRLF rows, and a guard
 * against spreadsheet formula injection (a cell that starts with =, +, -, @,
 * a tab or a return gets a leading apostrophe, so it opens as text).
 */
export type CsvValue = string | number | boolean | null | undefined;

export function csvCell(value: CsvValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(rows: CsvValue[][]): string {
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
