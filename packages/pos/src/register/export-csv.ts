/**
 * A CSV export of the closures currently shown: one column per tender the visible rows use, an
 * expected-only tender kept as a zero-counted shortage, quoting and formula guarding from
 * `../csv`, and CRLF between lines (LEDGER.md #26, #27).
 * Port provenance (ADR-032 amendment 1): WCPOS `next` `3b5331b5c`
 * `export-csv.ts`. Money is a2's integer minor units: an `exponent` parameter (as in a1's
 * `parseMinor`/`varianceText`) formats each cell back to the decimal string WCPOS's server sent,
 * e.g. `1250` at exponent 2 becomes `'12.50'`.
 */
import { toCsv, type CsvColumn } from '../csv';
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
  const columns: CsvColumn<Closure>[] = [
    { header: t('reports.csv_business_day'), value: (row) => row.business_day },
    { header: t('reports.csv_closure'), value: (row) => row.number },
    { header: t('reports.csv_register'), value: (row) => row.breakdowns.register_name || names[row.register_id] || row.register_id.slice(0, 8) },
    { header: t('reports.csv_store'), value: (row) => row.breakdowns.store_name || storeName || row.store_key },
    { header: t('reports.csv_opened'), value: (row) => row.opened_at },
    { header: t('reports.csv_closed'), value: (row) => row.closed_at },
    { header: t('reports.csv_closer'), value: (row) => row.breakdowns.closed_by_name || t('register.unknown_cashier') },
    ...tenders.flatMap((method): CsvColumn<Closure>[] => {
      const values = (row: Closure) => {
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
      };
      return [
        { header: `${t('reports.document.expected')} (${method})`, value: (row) => values(row)[0] },
        { header: `${t('register.counted')} (${method})`, value: (row) => values(row)[1] },
        { header: `${t('register.variance')} (${method})`, value: (row) => values(row)[2] },
      ];
    }),
    { header: t('reports.csv_status'), value: (row) => row.unsynced_count > 0 ? t('register.unsynced') : row.corrections_count ? t('reports.corrected') : '' },
  ];
  return toCsv(rows, columns);
}
