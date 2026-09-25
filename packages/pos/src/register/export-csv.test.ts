// Ported from WCPOS `next` `3b5331b5c` `export-csv.test.ts` (ADR-032 amendment 1). `createTestT`
// is replaced with a local stub that echoes the key, so assertions below expect the raw
// translation keys rather than WCPOS's English test strings. Money is minor units at exponent 2,
// formatted back to decimal by `exportCsv`'s own `exponent` parameter: WCPOS's '100.0000'
// (£100.00) becomes 10000 in, '100.00' out.
import { expect, it } from 'vitest';
import { exportCsv } from './export-csv';
import type { Closure } from './schemas';

const t = (key: string) => key;
const row = {
  id: 'c',
  session_id: 's',
  business_day: '2026-09-17',
  number: 4,
  register_id: 'r',
  store_key: '3',
  closed_by: null,
  opened_at: '2026-09-17T08:00:00Z',
  closed_at: '2026-09-17T17:00:00Z',
  breakdowns: { register_name: 'Front,"desk"\n二', closed_by_name: '=1+1' },
  expected: { cash: 10000, card: 800 },
  counted: { cash: 9900, card: 1000 },
  variance: { cash: -100, card: 200 },
  corrections_count: 1,
  unsynced_count: 1,
} as unknown as Closure;
it('exports the shown rows with stable columns, all tenders, direction, badge precedence and UTF-8 names', () => {
  const csv = exportCsv([row], 2, t, {}, 'Café');
  expect(csv.split('\r\n')[0]).toBe(
    '"reports.csv_business_day","reports.csv_closure","reports.csv_register","reports.csv_store","reports.csv_opened","reports.csv_closed","reports.csv_closer","reports.document.expected (cash)","register.counted (cash)","register.variance (cash)","reports.document.expected (card)","register.counted (card)","register.variance (card)","reports.csv_status"',
  );
  expect(csv).toContain('"2026-09-17","4","Front,""desk""\n二","Café"');
  expect(csv).toContain(
    '"\'=1+1","100.00","99.00","1.00 register.short","8.00","10.00","2.00 register.over","register.unsynced"',
  );
  expect(exportCsv([{ ...row, unsynced_count: 0 }], 2, t)).toContain('"reports.corrected"');
  expect(exportCsv([], 2, t)).not.toContain('2026-09-17');
});
it.each(['=cmd', '+cmd', '-cmd', '@cmd'])('neutralizes text starting with %s', (name) => {
  expect(exportCsv([{ ...row, breakdowns: { closed_by_name: name } }], 2, t)).toContain(`"'${name}"`);
});

// Revert: guard only a formula marker at byte zero.
it.each(['\tname', '\rname', '\nname', ' =cmd', '\u0000+cmd', '\t\r\n @cmd', ' -cmd'])(
  'neutralizes control/whitespace prefixes: %j',
  (name) => {
    expect(exportCsv([{ ...row, breakdowns: { closed_by_name: name } }], 2, t)).toContain(`"'${name}"`);
  },
);

// Revert: discover columns only from submitted counts/variance, hiding an omitted tender.
it('exports an expected-only tender with zero counted and its shortage', () => {
  const csv = exportCsv([{ ...row, expected: { voucher: 4000 }, counted: {}, variance: {} }], 2, t);
  expect(csv.split('\r\n')[0]).toContain('"reports.document.expected (voucher)","register.counted (voucher)","register.variance (voucher)"');
  expect(csv).toContain('"40.00","0.00","40.00 register.short"');
});

// TallyUI-only: WCPOS assumed the server's own four-decimal strings; exportCsv's own `exponent`
// must format a currency with no minor unit (JPY-style) and one with three (KWD-style) too.
it('formats money cells at exponent 0 and exponent 3, not just exponent 2 (TallyUI-only)', () => {
  const yen = { ...row, expected: { cash: 1500 }, counted: { cash: 1500 }, variance: { cash: 0 } };
  expect(exportCsv([yen], 0, t)).toContain('"1500","1500","0 reports.exact"');
  const dinar = { ...row, expected: { cash: 12345 }, counted: { cash: 12345 }, variance: { cash: -1 } };
  expect(exportCsv([dinar], 3, t)).toContain('"12.345","12.345","0.001 register.short"');
});
