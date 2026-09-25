// Ported from WCPOS `next` `3b5331b5c` `closure-document.test.ts` (ADR-032 amendment 1). Money is
// minor units at exponent 2; `ClosureContext.exponent` formats it back to the decimal strings the
// envelope carries, the same way b1's `exportCsv` does.
//
// Deferred until the receipt renderer is copied in (ADR-032, backlog 48) — they need
// `@wcpos/receipt-renderer` and the shipped closure template, neither ported here:
// - "renders the shipped closure template financial sections and matches the fixture field tree"
// - "keeps the closure envelope through printer normalization and formatting"
// - "matches the local-row fixture to the server fixture key-for-key at every template section"
// - "renders the X-report fixture through the shipped template without a closure number or copy"
// - "renders the offline X-report transaction count %s through the shipped template" (it.each)
// The spec's own count ("2 of 6, 4 deferred") undercounts by one: the source file has 7 `it`
// declarations, not 6, so 5 are deferred here, not 4.
import { expect, it } from 'vitest';
import { buildClosureDocument, buildXReportDocument, type ClosureContext } from './closure-document';
import closureFixture from './__fixtures__/closure.json';
import type { Closure, RegisterSession } from './schemas';

const dateKeys = [
  'datetime', 'date', 'time', 'datetime_short', 'datetime_long', 'datetime_full', 'date_short',
  'date_long', 'date_full', 'date_ymd', 'date_dmy', 'date_mdy', 'weekday_short', 'weekday_long',
  'day', 'month', 'month_short', 'month_long', 'year',
];
const row: Closure = {
  id: 'c',
  session_id: 's',
  register_id: 'r',
  store_key: '1',
  number: 42,
  opened_at: '2026-09-11T08:00:00Z',
  closed_at: '2026-09-11T17:00:00Z',
  till_expected: { cash: 18000, card: 12000 },
  expected: { cash: 18000, card: 12000 },
  counted: { cash: 17800, card: 12000 },
  variance: { cash: -200, card: 0 },
  period_sales_total_minor: 25000,
  period_refunds_total_minor: 5000,
  perpetual_sales_total_minor: 525000,
  perpetual_refunds_total_minor: 25000,
  unsynced_count: 2,
  unsynced_total_minor: 1200,
  software_version: 'preview',
  breakdowns: {
    currency: 'USD',
    register_name: 'Main register',
    opened_by_name: 'Alex',
    closed_by_name: 'Alex',
    payment_methods: { cash: { method: 'cash', name: 'Cash', sales: '130.00', refunds: '50.00' } },
    tax_rates: { vat: { name: 'VAT 20%', net: '166.67', tax: '33.33', gross: '200.00' } },
    opening_float: { expected: '100.00', counted: '100.00', variance: '0.00' },
    movements: [
      { type: 'paid_out', amount: '5.00', reason: 'Petty cash', voided_by: 'sample-void', created_at_gmt: '2026-09-11 10:00:00' },
    ],
    cashiers: ['1'],
    transaction_count: 12,
    refund_count: 2,
  },
  order_ids: [],
  movement_ids: [],
  print_count: 0,
};
const context: ClosureContext = {
  store: { name: 'Shop' },
  currency: 'USD',
  timezone: 'Europe/Madrid',
  locale: 'en-US',
  printedAt: '2026-09-12T09:00:00Z',
  exponent: 2,
  formatMoney: (v) =>
    v === '' ? '' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v)),
  // Reuses the fixture's own i18n so the key-tree tests below don't manufacture an `i18n` gap
  // that's really just this test's translations being a hand-picked subset.
  i18n: closureFixture.i18n as Record<string, string>,
};
// Revert: pass local maps/ISO dates directly to Mustache, omit money companions, or mutate recorded data.
it('maps a local snapshot into the server closure envelope and display companions', () => {
  const before = JSON.stringify(row);
  const doc = buildClosureDocument(row, context);
  expect(Object.keys(doc).sort()).toEqual(['closure', 'fiscal', 'i18n', 'order', 'register', 'software', 'store']);
  expect(Object.keys(doc.closure.opened_at).sort()).toEqual([...dateKeys].sort());
  expect(doc.closure.opened_at.time).toBe('10:00');
  expect(doc.closure.opened_at.date_ymd).toBe('2026-09-11');
  expect(doc.closure.tenders[0]).toMatchObject({
    name: 'cash',
    label: 'Cash',
    expected: '180.00',
    expected_display: '$180.00',
    counted_display: '$178.00',
    variance_display: '-$2.00',
    has_variance: true,
    variance_label: 'Short',
    variance_absolute_display: '$2.00',
  });
  expect(doc.closure).toMatchObject({
    has_sales: true,
    has_perpetual: true,
    has_movements: true,
    has_payment_methods: true,
    has_tax_rates: true,
  });
  expect(doc.closure.period_sales_total_display).toBe('$250.00');
  expect(doc.closure.breakdowns.payment_methods).toEqual([
    { method: 'cash', name: 'Cash', sales: '130.00', refunds: '50.00', sales_display: '$130.00', refunds_display: '$50.00' },
  ]);
  expect(doc.closure.breakdowns.tax_rates[0]).toMatchObject({
    net_display: '$166.67',
    tax_display: '$33.33',
    gross_display: '$200.00',
  });
  expect(doc.closure.breakdowns.movements[0]).toMatchObject({
    type_label: 'Paid out',
    voided: true,
    amount_display: '$5.00',
  });
  expect(doc.closure.breakdowns.labels).toMatchObject({ opened_by_name: 'Alex', closed_by_name: 'Alex' });
  expect(doc.fiscal).toMatchObject({
    document_type: 'closure',
    receipt_number: '42',
    is_closure_document: true,
    is_x_report: false,
    is_reprint: false,
    reprint_count: 0,
  });
  expect(doc.register.name).toBe('Main register');
  expect(doc.order).toMatchObject({ currency: 'USD', printed: { time: '11:00' } });
  expect(JSON.stringify(row)).toBe(before);
});
// Revert: omit local copy marking or number the X-report.
it('marks local copies but never numbers or persists an X-report', () => {
  expect(buildClosureDocument({ ...row, print_count: 2 }, context).fiscal).toMatchObject({
    is_reprint: true,
    reprint_count: 2,
  });
  const session: RegisterSession = {
    id: 's',
    register_id: 'r',
    status: 'open',
    opened_at_gmt: row.opened_at,
    counted_float_minor: 10000,
  };
  const doc = buildXReportDocument(session, { ...context, expected: { cash: 11000 } });
  expect(doc.closure).not.toHaveProperty('number');
  expect(doc.fiscal).toMatchObject({
    document_type: 'xreport',
    is_closure_document: true,
    receipt_number: '',
    is_x_report: true,
    is_reprint: false,
  });
  expect(doc.closure.tenders[0].expected).toBe('110.00');
});

// TallyUI-only: the pinned key-tree snapshot (ADR-032). The WCPOS fixture is a hand-authored
// preview payload for the shipped closure template, not `buildClosureDocument`'s own output, so
// its key tree differs from ours in specific, listed ways rather than matching byte for byte.
type Json = Record<string, unknown> | unknown[] | string | number | boolean | null;
function keyPaths(value: Json, prefix = ''): string[] {
  if (Array.isArray(value)) return value.length ? keyPaths(value[0] as Json, `${prefix}[]`) : [`${prefix}[]`];
  if (value && typeof value === 'object')
    return Object.keys(value)
      .sort()
      .flatMap((key) => keyPaths((value as Record<string, Json>)[key], prefix ? `${prefix}.${key}` : key));
  return [prefix];
}
const fixtureTree = new Set(keyPaths(closureFixture as Json));

// Local-only: a2's own row fields with no server-template counterpart (id/session metadata,
// sync/print bookkeeping, `till_expected`), the `store`/`register.id` context TallyUI always
// carries, `order.printed`'s date keys (the fixture's `order` has no `printed` field at all) and
// `fiscal`'s server-issuance fields (immutable id, hash, QR payload, tax-agency code, signature,
// document label, sequence, signed-at, extra fields — none of which a local document can carry).
// `breakdowns.register_name`/`opened_by_name`/`closed_by_name` (and, through the `_name` filter,
// `labels.register_name`) are WCPOS's own `envelope()` behaviour, not a TallyUI change: the
// fixture's hand-authored `breakdowns`/`labels` just don't happen to carry them.
const closureLocalOnly = [
  'closure.breakdowns.closed_by_name',
  'closure.breakdowns.labels.register_name',
  'closure.breakdowns.opened_by_name',
  'closure.breakdowns.register_name',
  'closure.id',
  'closure.movement_ids[]',
  'closure.order_ids[]',
  'closure.print_count',
  'closure.register_id',
  'closure.session_id',
  'closure.software_version',
  'closure.till_expected.card',
  'closure.till_expected.cash',
  'fiscal.document_label',
  'fiscal.extra_fields[]',
  'fiscal.hash',
  'fiscal.immutable_id',
  'fiscal.qr_payload',
  'fiscal.sequence',
  'fiscal.signature_excerpt',
  'fiscal.signed_at',
  'fiscal.tax_agency_code',
  'order.printed.date',
  'order.printed.date_dmy',
  'order.printed.date_full',
  'order.printed.date_long',
  'order.printed.date_mdy',
  'order.printed.date_short',
  'order.printed.date_ymd',
  'order.printed.datetime',
  'order.printed.datetime_full',
  'order.printed.datetime_long',
  'order.printed.datetime_short',
  'order.printed.day',
  'order.printed.month',
  'order.printed.month_long',
  'order.printed.month_short',
  'order.printed.time',
  'order.printed.weekday_long',
  'order.printed.weekday_short',
  'order.printed.year',
  'register.id',
  'store.name',
].sort();
// Server-only: none — a2's `store_id` (sourced from `store_key`) already carries the fixture's
// only closure-level key ours didn't otherwise have.
const closureServerOnly: string[] = [];
it("matches the WCPOS closure fixture's key tree for buildClosureDocument, apart from the listed differences", () => {
  const docTree = new Set(keyPaths(buildClosureDocument(row, context) as unknown as Json));
  expect([...docTree].filter((key) => !fixtureTree.has(key)).sort()).toEqual(closureLocalOnly);
  expect([...fixtureTree].filter((key) => !docTree.has(key)).sort()).toEqual(closureServerOnly);
});

const xSession: RegisterSession = {
  id: 's',
  register_id: 'r',
  store_key: '1',
  status: 'open',
  opened_at_gmt: row.opened_at,
  counted_float_minor: 17800,
  expected_float_minor: 18000,
  counted: { cash: 17800, card: 12000 },
};
// Reuses `row.breakdowns` so the X-report's key tree is compared like-for-like with the closure's,
// rather than against near-empty arrays this fixture never had.
const xContext: ClosureContext = { ...context, breakdowns: row.breakdowns, expected: { cash: 18000, card: 12000 } };
// Local-only for the X-report: same as the closure's, minus the fields a session never carries
// (`session_id`, `till_expected`, `print_count`, `software_version`, the sync id lists).
// Server-only: a closure's own `number`, its four period/perpetual totals and `unsynced_total`
// (and their `_display` companions) and `unsynced_count` — none of which an open X-report has.
const xreportLocalOnly = closureLocalOnly.filter(
  (key) =>
    ![
      'closure.session_id',
      'closure.till_expected.cash',
      'closure.till_expected.card',
      'closure.print_count',
      'closure.software_version',
      'closure.movement_ids[]',
      'closure.order_ids[]',
    ].includes(key),
);
// `_display` companions for these totals are still present (they're `undefined` inputs to
// `formatMoney`, which returns `''`, not an absent key), so only the bare totals are missing.
const xreportServerOnly = [
  'closure.number',
  'closure.period_sales_total',
  'closure.period_refunds_total',
  'closure.perpetual_sales_total',
  'closure.perpetual_refunds_total',
  'closure.unsynced_total',
  'closure.unsynced_count',
].sort();
it("matches the WCPOS closure fixture's key tree for buildXReportDocument, apart from the listed differences", () => {
  const docTree = new Set(keyPaths(buildXReportDocument(xSession, xContext) as unknown as Json));
  expect([...docTree].filter((key) => !fixtureTree.has(key)).sort()).toEqual([...xreportLocalOnly].sort());
  expect([...fixtureTree].filter((key) => !docTree.has(key)).sort()).toEqual(xreportServerOnly);
});
