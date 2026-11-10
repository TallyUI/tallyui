import { expect, it } from 'vitest';
import { csvCell, csvFromCells, toCsv, type CsvColumn } from './index';

// Revert: quote only some cells, omit quote doubling, or alter embedded line breaks.
it('quotes every cell and preserves commas, quotes and line breaks', () => {
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell('a\nb')).toBe('"a\nb"');
  expect(csvCell('a\r\nb')).toBe('"a\r\nb"');
  expect(csvCell('plain')).toBe('"plain"');
});

// Revert: omit the formula/control prefix guard.
it.each(['=', '+', '-', '@', '\t', '\r'])('guards a leading %j', (c) => {
  expect(csvCell(c + 'x')).toBe(`"'${c}x"`);
});

// Revert: ignore LF or guard formula markers only at byte zero.
it('guards LF and a formula after leading whitespace', () => {
  expect(csvCell('\nx')).toBe('"\'\nx"');
  expect(csvCell(' =x')).toBe('"\' =x"');
});

// Revert: guard formula markers anywhere in a cell.
it('leaves embedded formula characters alone', () => {
  expect(csvCell('a=b')).toBe('"a=b"');
  expect(csvCell('1-2')).toBe('"1-2"');
});

// Revert: exempt numeric inputs from the formula guard.
it('guards negative numbers after string conversion', () => {
  expect(csvCell(-5)).toBe('"\'-5"');
  expect(csvCell(-1.5)).toBe('"\'-1.5"');
  expect(csvCell(5)).toBe('"5"');
  expect(csvCell(0)).toBe('"0"');
});

// Revert: stringify missing values without the empty-string default.
it('quotes empty and missing values as empty cells', () => {
  expect(csvCell('')).toBe('""');
  expect(csvCell(undefined)).toBe('""');
  expect(csvCell(null)).toBe('""');
});

// Revert: change CRLF separators or add a BOM or trailing line ending.
it('joins cell rows with CRLF and no extra bytes', () => {
  const csv = csvFromCells([['a', 'b'], ['1', undefined]]);
  expect(csv).toBe('"a","b"\r\n"1",""');
  expect(csv[0]).toBe('"');
});

// Revert: omit headers, reorder columns, or drop key/accessor support or missing fields.
it('writes key and accessor columns, including a header with no rows', () => {
  type Row = { name?: string; count: number };
  const columns: readonly CsvColumn<Row>[] = [
    { header: 'Name', key: 'name' },
    { header: 'Double', value: (row) => row.count * 2 },
  ];
  const rows: readonly Row[] = [{ name: 'Ada', count: 2 }, { count: 3 }];
  expect(toCsv(rows, columns)).toBe('"Name","Double"\r\n"Ada","4"\r\n"","6"');
  expect(toCsv([], columns)).toBe('"Name","Double"');
});
