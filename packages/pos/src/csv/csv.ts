/**
 * Every cell is quoted (RFC 4180 style, so commas, quotes, CR and LF are safe). Lines use
 * CRLF, with no BOM or trailing line ending, matching the register export. The formula guard
 * prefixes `'` to text starting with `=`, `+`, `-`, `@`, tab, CR or LF, including formula
 * markers after leading whitespace/control characters, as WCPOS v2's `csvCell` in the monorepo
 * `reports/closures/export-csv.ts`. Numbers are NOT exempt: -5 exports as `'-5`, matching v2,
 * which runs the guard on `String(value)`.
 */

/** One CSV column: a header and either a row key or an accessor. */
export type CsvColumn<Row> =
  | { header: string; key: keyof Row & string }
  | { header: string; value: (row: Row) => unknown };

/** One cell, quoted and formula-guarded. */
export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  // eslint-disable-next-line no-control-regex -- Control prefixes are intentional CSV-injection guards.
  return `"${(/^(?:[\t\r\n]|[\s\x00-\x1f\x7f-\x9f]*[=+\-@])/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
}

/** Rows of already-ordered cells (the first row is usually the header) to a CSV string. */
export function csvFromCells(lines: readonly (readonly unknown[])[]): string {
  return lines.map((line) => line.map(csvCell).join(',')).join('\r\n');
}

/** Header row from `columns`, then one line per row. */
export function toCsv<Row>(rows: readonly Row[], columns: readonly CsvColumn<Row>[]): string {
  return csvFromCells([
    columns.map((c) => c.header),
    ...rows.map((row) => columns.map((c) => 'key' in c ? row[c.key] : c.value(row))),
  ]);
}
