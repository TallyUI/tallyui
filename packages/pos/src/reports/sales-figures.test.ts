import { expect, it } from 'vitest';
import { comparisonRange, daysOf, inRange, marginOf, salesFigures } from './sales-figures';
import type { DatePreset } from './presets';
import type { ReportLine, ReportOrder, ReportRefund } from './types';

const range = { from: '2026-11-10', to: '2026-11-10' };
const line = (overrides: Partial<ReportLine> = {}): ReportLine => ({
  key: 'p1', name: 'Coffee', quantity: 1, netMinor: 1000, taxMinor: 0, ...overrides,
});
const order = (overrides: Partial<ReportOrder> = {}): ReportOrder => ({
  id: 'o1', at: '2026-11-10T10:00:00.000Z', totalMinor: 1000, taxMinor: 0, discountMinor: 0,
  lines: [], payments: [], taxes: [], refunds: [], ...overrides,
});

it('counts a split sale once per method by its payments', () => {
  const result = salesFigures({ range, timezone: 'UTC', orders: [
    order({ payments: [{ method: 'cash', amountMinor: 400 }, { method: 'external', amountMinor: 600 }] }),
    order({ id: 'o2', totalMinor: 500, payments: [{ method: 'cash', amountMinor: 300 }, { method: 'cash', amountMinor: 200 }] }),
  ] });
  expect(result.payments).toEqual({ rows: [
    { method: 'cash', label: '', amountMinor: 900, orders: 2 },
    { method: 'external', label: '', amountMinor: 600, orders: 1 },
  ], takenMinor: 1500 });
});

it('names an unpaid or unknown remainder, and Taken leaves out the unpaid', () => {
  const result = salesFigures({ range, timezone: 'UTC', orders: [
    order({ totalMinor: 800, needsPayment: true }), order({ id: 'o2', totalMinor: 300 }),
  ] });
  expect(result.payments).toEqual({ rows: [
    { method: 'unpaid', label: '', amountMinor: 800, orders: 1 },
    { method: 'unknown', label: '', amountMinor: 300, orders: 1 },
  ], takenMinor: 300 });
});

it('counts a refund on the day it was made, not on its order\'s day', () => {
  const orders = [order({ at: '2026-11-02T10:00:00.000Z' })];
  const refunds: ReportRefund[] = [{ id: 'r1', orderId: 'o1', at: '2026-11-04T09:00:00.000Z', amountMinor: 250 }];
  const input = { orders, refunds, timezone: 'UTC' };
  const saleDay = salesFigures({ ...input, range: { from: '2026-11-02', to: '2026-11-02' } });
  expect(saleDay.totals).toMatchObject({ grossMinor: 1000, refundsMinor: 0 });
  const refundDay = salesFigures({ ...input, range: { from: '2026-11-04', to: '2026-11-04' } });
  expect(refundDay.totals).toMatchObject({ grossMinor: 0, orderCount: 0, refundsMinor: 250 });
  expect(refundDay.refunds).toEqual({ count: 1, amountMinor: 250, orders: 1 });
  expect(salesFigures({ ...input, range: { from: '2026-11-02', to: '2026-11-04' } }).series).toEqual([
    { day: '2026-11-02', grossMinor: 1000, orderCount: 1, refundsMinor: 0 },
    { day: '2026-11-03', grossMinor: 0, orderCount: 0, refundsMinor: 0 },
    { day: '2026-11-04', grossMinor: 0, orderCount: 0, refundsMinor: 250 },
  ]);
});

it('splits days at the store\'s midnight, not UTC\'s', () => {
  const orders = [
    order({ at: '2026-11-09T12:59:00.000Z', totalMinor: 1000 }),
    order({ id: 'o2', at: '2026-11-09T13:01:00.000Z', totalMinor: 500 }),
  ];
  const timezone = 'Australia/Sydney';
  expect(salesFigures({ orders, timezone, range: { from: '2026-11-09', to: '2026-11-09' } }).totals)
    .toMatchObject({ grossMinor: 1000, orderCount: 1 });
  expect(salesFigures({ orders, timezone, range }).totals).toMatchObject({ grossMinor: 500, orderCount: 1 });
  expect(salesFigures({ orders, timezone, range: { from: '2026-11-09', to: '2026-11-10' } }).series).toEqual([
    { day: '2026-11-09', grossMinor: 1000, orderCount: 1, refundsMinor: 0 },
    { day: '2026-11-10', grossMinor: 500, orderCount: 1, refundsMinor: 0 },
  ]);
  expect(inRange(orders[0].at, range, timezone)).toBe(false);
  expect(inRange(orders[1].at, range, timezone)).toBe(true);
  expect(salesFigures({ orders: [], timezone, range, refunds: [
    { id: 'r1', orderId: 'old', at: orders[0].at, amountMinor: 100 },
    { id: 'r2', orderId: 'old', at: orders[1].at, amountMinor: 200 },
  ] }).series).toEqual([{ day: '2026-11-10', grossMinor: 0, orderCount: 0, refundsMinor: 200 }]);
});

it('gives no margin for a missing cost, never 0', () => {
  for (const missing of [line(), line({ costMinor: null }), line({ costMinor: NaN }), line({ costMinor: Infinity })]) {
    expect(marginOf([missing])).toEqual({
      costedNetMinor: 0, costMinor: 0, profitMinor: 0, marginPct: null, missingLines: 1, missingQuantity: 1,
    });
  }
  expect(marginOf([line({ costMinor: 600 }), line({ netMinor: 500 })])).toEqual({
    costedNetMinor: 1000, costMinor: 600, profitMinor: 400, marginPct: 0.4, missingLines: 1, missingQuantity: 1,
  });
  expect(marginOf([line({ netMinor: 500, costMinor: 0 })]).marginPct).toBe(1);
  expect(marginOf([line({ netMinor: 0, costMinor: 0 })]).marginPct).toBeNull();
  expect(marginOf([line({ quantity: -2 }), line({ quantity: Infinity })]).missingQuantity).toBe(2);
  expect(salesFigures({ orders: [order({ lines: [line()] })], range, timezone: 'UTC' }).products[0].margin.marginPct).toBeNull();
});

it('computes the comparison range on the same orders', () => {
  const orders = [order({ at: '2026-11-09T10:00:00.000Z', totalMinor: 700 }), order({ id: 'o2' })];
  const refunds = [{ id: 'r1', orderId: 'o1', at: orders[0].at, amountMinor: 200 }];
  const result = salesFigures({ orders, refunds, range, compare: comparisonRange(range, 'previous'), timezone: 'UTC' });
  expect(result.totals.grossMinor).toBe(1000);
  expect(result.comparison?.range).toEqual({ from: '2026-11-09', to: '2026-11-09' });
  expect(result.comparison?.totals).toMatchObject({ grossMinor: 700, refundsMinor: 200 });
  expect(result.comparison?.series).toEqual([{ day: '2026-11-09', grossMinor: 700, orderCount: 1, refundsMinor: 200 }]);
  expect('comparison' in salesFigures({ orders, range, timezone: 'UTC' })).toBe(false);
});

it('shifts comparison ranges by day, week and month', () => {
  expect(comparisonRange(range, 'previous')).toEqual({ from: '2026-11-09', to: '2026-11-09' });
  expect(comparisonRange({ from: '2026-11-03', to: '2026-11-09' }, 'previous')).toEqual({ from: '2026-10-27', to: '2026-11-02' });
  expect(comparisonRange({ from: '2026-10-01', to: '2026-10-31' }, 'previous')).toEqual({ from: '2026-09-01', to: '2026-09-30' });
  expect(comparisonRange(range, 'week')).toEqual({ from: '2026-11-03', to: '2026-11-03' });
  expect(comparisonRange({ from: '2024-03-01', to: '2024-03-31' }, 'previous')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
  expect(comparisonRange({ from: '2026-01-01', to: '2026-01-31' }, 'previous')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
});

// [from, to] → [from, to] of the comparison, as `YYYY-MM-DD` pairs.
const compared = (pairs: [string, string, string, string][], mode: 'previous' | 'week', preset?: DatePreset) => {
  for (const [from, to, expectedFrom, expectedTo] of pairs) {
    expect(comparisonRange({ from, to }, mode, preset), `${from}…${to}`).toEqual({ from: expectedFrom, to: expectedTo });
  }
};

it('compares a running week with the same weekdays of the week before', () => {
  compared([
    ['2026-11-09', '2026-11-11', '2026-11-02', '2026-11-04'],
    ['2026-11-09', '2026-11-15', '2026-11-02', '2026-11-08'],
    ['2026-11-09', '2026-11-09', '2026-11-02', '2026-11-02'],
    ['2024-02-26', '2024-02-29', '2024-02-19', '2024-02-22'],
  ], 'previous', 'thisWeek');
});

it('compares a running month with the same days of the month before', () => {
  compared([
    ['2026-11-01', '2026-11-10', '2026-10-01', '2026-10-10'],
    ['2026-11-01', '2026-11-01', '2026-10-01', '2026-10-01'],
    ['2026-04-01', '2026-04-03', '2026-03-01', '2026-03-03'],
    ['2026-10-01', '2026-10-31', '2026-09-01', '2026-09-30'],
    ['2024-03-01', '2024-03-31', '2024-02-01', '2024-02-29'],
    ['2024-02-01', '2024-02-29', '2024-01-01', '2024-01-31'],
    ['2026-03-01', '2026-03-30', '2026-02-01', '2026-03-02'],
  ], 'previous', 'thisMonth');
  compared([['2026-12-01', '2026-12-31', '2026-11-01', '2026-11-30']], 'previous', 'lastMonth');
});

it('compares a custom range by its length', () => {
  compared([
    ['2026-11-04', '2026-11-06', '2026-10-28', '2026-10-30'],
    ['2026-01-15', '2026-02-28', '2025-12-15', '2026-01-28'],
    ['2026-01-02', '2026-03-01', '2025-12-02', '2026-01-29'],
    ['2024-03-31', '2024-04-10', '2024-02-29', '2024-03-10'],
    ['2026-09-01', '2026-09-30', '2026-08-01', '2026-08-31'],
  ], 'previous');
});

it('compares today and yesterday with the day before or the same weekday last week', () => {
  compared([['2026-11-10', '2026-11-10', '2026-11-09', '2026-11-09'], ['2024-03-01', '2024-03-01', '2024-02-29', '2024-02-29']], 'previous', 'today');
  compared([['2026-11-10', '2026-11-10', '2026-11-03', '2026-11-03']], 'week', 'today');
  compared([['2026-11-09', '2026-11-09', '2026-11-08', '2026-11-08']], 'previous', 'yesterday');
  compared([['2026-11-09', '2026-11-09', '2026-11-02', '2026-11-02']], 'week', 'yesterday');
});

it('groups products, categories and taxes', () => {
  const tax = { ratePpm: 100000, code: 'vat', label: 'VAT', taxMinor: 100, netMinor: 1000 };
  const result = salesFigures({ range, timezone: 'UTC', orders: [
    order({ lines: [line({ category: { id: 'c1', name: 'Drinks' }, costMinor: 600 }),
      line({ key: 'p2', name: 'Bag', quantity: 2, netMinor: 200 })], taxes: [tax,
      { ratePpm: 50000, label: 'Reduced', taxMinor: 10, netMinor: 200 }] }),
    order({ id: 'o2', lines: [line({ name: 'Renamed', quantity: 2, netMinor: 500, costMinor: 300 })], taxes: [
      { ...tax, label: 'New label', taxMinor: 50, netMinor: 500 },
      { ratePpm: 50000, label: 'Reduced', taxMinor: 5, netMinor: null },
    ] }),
  ] });
  expect(result.products.map(({ key, name, quantity, netMinor }) => ({ key, name, quantity, netMinor }))).toEqual([
    { key: 'p1', name: 'Coffee', quantity: 3, netMinor: 1500 }, { key: 'p2', name: 'Bag', quantity: 2, netMinor: 200 },
  ]);
  expect(result.products[0].margin).toMatchObject({ costMinor: 900, costedNetMinor: 1500, marginPct: 0.4 });
  expect(result.categories.map(({ key, name, quantity, netMinor }) => ({ key, name, quantity, netMinor }))).toEqual([
    { key: 'c1', name: 'Drinks', quantity: 1, netMinor: 1000 }, { key: '', name: '', quantity: 4, netMinor: 700 },
  ]);
  expect(result.categories[1].margin).toMatchObject({ costMinor: 300, costedNetMinor: 500, missingLines: 1, missingQuantity: 2 });
  expect(result.taxes).toEqual([
    { key: JSON.stringify([100000, 'vat']), ...tax, taxMinor: 150, netMinor: 1500 },
    { key: JSON.stringify([50000, 'Reduced']), ratePpm: 50000, label: 'Reduced', taxMinor: 15, netMinor: null },
  ]);
});

it('counts a non-finite quantity as zero items', () => {
  const result = salesFigures({ range, timezone: 'UTC', orders: [order({
    lines: [line({ quantity: NaN }), line({ quantity: 0 }), line({ quantity: 2 })],
  })] });
  expect(result.totals.items).toBe(2);
  expect(result.products[0].quantity).toBe(2);
  expect(result.categories[0].quantity).toBe(2);
});

it('lists inclusive calendar days and returns zeros for an empty period', () => {
  expect(daysOf({ from: '2024-02-28', to: '2024-03-01' })).toEqual(['2024-02-28', '2024-02-29', '2024-03-01']);
  expect(daysOf({ from: '2026-11-11', to: '2026-11-10' })).toEqual([]);
  const result = salesFigures({ orders: [], range, timezone: 'UTC' });
  expect(result.totals).toEqual({
    grossMinor: 0, netMinor: 0, taxMinor: 0, discountMinor: 0, refundsMinor: 0, embeddedRefundsMinor: 0,
    orderCount: 0, averageMinor: 0, items: 0,
    margin: { costedNetMinor: 0, costMinor: 0, profitMinor: 0, marginPct: null, missingLines: 0, missingQuantity: 0 },
  });
  expect(result.series).toEqual([{ day: range.from, grossMinor: 0, orderCount: 0, refundsMinor: 0 }]);
  expect(result.payments).toEqual({ rows: [], takenMinor: 0 });
});

it('keeps gross separate from dated and embedded refunds', () => {
  const result = salesFigures({ range, timezone: 'UTC', orders: [
    order({ totalMinor: 1000, taxMinor: 100, discountMinor: 50, lines: [line({ netMinor: 900, costMinor: 600 })],
      refunds: [{ id: 'embedded', amountMinor: -200 }] }),
    order({ id: 'o2', totalMinor: 501, taxMinor: 50, discountMinor: 25 }),
    order({ id: 'excluded', at: '2026-11-11T00:00:00.000Z', refunds: [{ id: 'other', amountMinor: 999 }] }),
  ], refunds: [
    { id: 'r1', orderId: 'o1', at: '2026-11-10T10:00:00.000Z', amountMinor: -100 },
    { id: 'r2', orderId: 'o1', at: '2026-11-10T11:00:00.000Z', amountMinor: 150 },
  ] });
  expect(result.totals).toEqual({
    grossMinor: 1501, netMinor: 1351, taxMinor: 150, discountMinor: 75, refundsMinor: 250, embeddedRefundsMinor: 200,
    orderCount: 2, averageMinor: 751, items: 1,
    margin: { costedNetMinor: 900, costMinor: 600, profitMinor: 300, marginPct: 1 / 3, missingLines: 0, missingQuantity: 0 },
  });
  expect(result.refunds).toEqual({ count: 2, amountMinor: 250, orders: 1 });
});

it('keeps the first non-empty payment label and sorts ties by method', () => {
  const result = salesFigures({ range, timezone: 'UTC', orders: [order({ totalMinor: 600, payments: [
    { method: 'external', label: 'Card', amountMinor: 300 }, { method: 'cash', label: '', amountMinor: 100 },
    { method: 'cash', label: 'Cash', amountMinor: 100 }, { method: 'cash', label: 'Changed', amountMinor: 100 },
  ] })] });
  expect(result.payments.rows).toEqual([
    { method: 'cash', label: 'Cash', amountMinor: 300, orders: 1 },
    { method: 'external', label: 'Card', amountMinor: 300, orders: 1 },
  ]);
});

it('sorts product and category ties by quantity then name', () => {
  const lines = [
    line({ key: 'z', name: 'Zebra', quantity: 1 }), line({ key: 'b', name: 'Bag', quantity: 2 }),
    line({ key: 'a', name: 'Apple', quantity: 2 }),
  ].map((item) => ({ ...item, category: { id: item.key, name: item.name } }));
  const result = salesFigures({ range, timezone: 'UTC', orders: [order({ lines })] });
  expect(result.products.map((row) => row.key)).toEqual(['a', 'b', 'z']);
  expect(result.categories.map((row) => row.key)).toEqual(['a', 'b', 'z']);
});
