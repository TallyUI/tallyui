/**
 * A CSV export of the closures currently shown: one column per tender the visible rows use, an
 * expected-only tender kept as a zero-counted shortage, quoted/escaped cells with a CRLF line
 * ending, and a leading `'` on formula- or control-prefixed text so a spreadsheet reads it as
 * text (LEDGER.md #26, #27). Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`
 * `export-csv.ts`. Money is a2's integer minor units: an `exponent` parameter (as in a1's
 * `parseMinor`/`varianceText`) formats each cell back to the decimal string WCPOS's server sent,
 * e.g. `1250` at exponent 2 becomes `'12.50'`.
 */
import { minorToDecimal } from './money';
import type { Closure } from './schemas';

/** Widens a tender-map lookup back to `number | undefined`: a method absent from the map. */
const at = (map: Record<string, number>, key: string): number | undefined => map[key];

export function exportCsv(
  rows: readonly Closure[],
  exponent: number,
  t: (key: string) => string,
  names: Record<string, string> = {},
  storeName = '',
) {
  const tenders = [
    ...new Set(
      rows.flatMap((row) => [
        ...Object.keys(row.expected),
        ...Object.keys(row.counted),
        ...Object.keys(row.variance),
      ]),
    ),
  ];
  const cell = (value: unknown) => {
    const text = String(value ?? '');
    return `"${(/^(?:[\t\r\n]|[\s\x00-\x1f\x7f-\x9f]*[=+\-@])/.test(text) ? "'" + text : text).replace(/"/g, '""')}"`;
  };
  const header = ['business_day', 'closure', 'register', 'store', 'opened', 'closed', 'closer'].map((key) =>
    t(`reports.csv_${key}`),
  );
  header.push(
    ...tenders.flatMap((method) => [
      `${t('reports.document.expected')} (${method})`,
      `${t('register.counted')} (${method})`,
      `${t('register.variance')} (${method})`,
    ]),
    t('reports.csv_status'),
  );
  return [
    header,
    ...rows.map((row) => [
      row.business_day,
      row.number,
      row.breakdowns.register_name || names[row.register_id] || row.register_id.slice(0, 8),
      row.breakdowns.store_name || storeName || row.store_key,
      row.opened_at,
      row.closed_at,
      row.breakdowns.closed_by_name || t('register.unknown_cashier'),
      ...tenders.flatMap((method) => {
        const expected = at(row.expected, method);
        const counted = at(row.counted, method) ?? (expected === undefined ? undefined : 0);
        const value = at(row.variance, method) ?? (expected === undefined ? undefined : (counted ?? 0) - expected);
        return [
          expected === undefined ? '' : minorToDecimal(expected, exponent),
          counted === undefined ? '' : minorToDecimal(counted, exponent),
          value === undefined
            ? ''
            : `${minorToDecimal(Math.abs(value), exponent)} ${t(value < 0 ? 'register.short' : value > 0 ? 'register.over' : 'reports.exact')}`,
        ];
      }),
      row.unsynced_count > 0 ? t('register.unsynced') : row.corrections_count ? t('reports.corrected') : '',
    ]),
  ]
    .map((row) => row.map(cell).join(','))
    .join('\r\n');
}
