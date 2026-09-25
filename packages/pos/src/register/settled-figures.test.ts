// Ported from WCPOS `next` `3b5331b5c` `settled-figures.test.ts` (ADR-032 amendment 1). Money is
// minor units at exponent 2: WCPOS's '100.0000' (£100.00) becomes 10000. Fixtures are kept
// real-world equivalent, not a literal digit copy of WCPOS's four-decimal fixtures.
import { expect, it } from 'vitest';
import { type Correction, deriveSettled } from './settled-figures';
import closureLocalRow from './__fixtures__/closure-local-row.json';
import correctionsDst from './__fixtures__/corrections-dst.json';

const recorded = {
  expected: { cash: 10000, card: 2000 },
  counted: { cash: 9800, card: 2000 },
  variance: { cash: -200, card: 0 },
  period_sales_total_minor: 12000,
  period_refunds_total_minor: 500,
  perpetual_sales_total_minor: 100000,
  perpetual_refunds_total_minor: 5000,
};
const correction = (
  id: number,
  type: Correction['type'],
  figures: Correction['figures'],
  created_at = '2026-09-17 12:00:00',
): Correction => ({
  id,
  type,
  figures,
  created_at,
  actor: { id: '1', name: 'Pat' },
  approver: null,
  reason: 'Audit',
});
// Revert: mutate the recorded baseline or emit unchanged comparison fields.
it('preserves the baseline and omits untouched figures', () => {
  const result = deriveSettled(recorded, []);
  expect(result.settled).toEqual(recorded);
  expect([...result.touched]).toEqual([]);
});
// Revert: omit late activity deltas or update only period, not perpetual totals.
it('adds late cash/card sales and refund deltas to both total pairs', () => {
  const result = deriveSettled(recorded, [
    correction(1, 'late_sale', {
      expected_delta: { cash: 1, card: 210 },
      sales_delta: 220,
      refunds_delta: 10,
    }),
  ]);
  expect(result.settled.expected).toEqual({ cash: 10001, card: 2210 });
  expect(result.settled.variance).toEqual({ cash: -201, card: -210 });
  expect(result.settled.period_sales_total_minor).toBe(12220);
  expect(result.settled.perpetual_sales_total_minor).toBe(100220);
  expect(result.settled.period_refunds_total_minor).toBe(510);
  expect(result.settled.perpetual_refunds_total_minor).toBe(5010);
  expect(result.touched.has('counted.cash')).toBe(false);
  expect(recorded.expected.cash).toBe(10000);
});
// Revert: infer movement signs from raw amounts instead of applying server-normalized cash_delta.
it.each([
  ['paid in', 300, 10300],
  ['paid out', -300, 9700],
  ['void paid out', 300, 10300],
])('%s uses the signed cash delta', (_, delta, expected) => {
  expect(deriveSettled(recorded, [correction(1, 'late_movement', { cash_delta: delta })]).settled.expected.cash).toBe(
    expected,
  );
});
// Revert: add recounts, trust their stale variance, process duplicates, or retain arrival order.
it('orders by timestamp/id, deduplicates, replaces supplied counts and recomputes variance once', () => {
  const recount = correction(2, 'recount', { counted: { cash: 10500 }, variance: { cash: 99900 } });
  const result = deriveSettled(recorded, [
    correction(3, 'late_movement', { cash_delta: 2 }, '2026-09-17 13:00:00'),
    recount,
    correction(1, 'recount', { counted: { cash: 10100 } }),
    recount,
  ]);
  expect(result.settled.counted).toEqual({ cash: 10500, card: 2000 });
  expect(result.settled.variance.cash).toBe(498);
  expect([...result.touched].sort()).toEqual(['counted.cash', 'expected.cash', 'variance.cash']);
});
// Revert: flag every correction field rather than only final changes.
it('omits figures whose corrections cancel', () => {
  expect([
    ...deriveSettled(recorded, [
      correction(1, 'late_movement', { cash_delta: 10 }),
      correction(2, 'late_movement', { cash_delta: -10 }),
    ]).touched,
  ]).toEqual([]);
});
// Revert: enumerate the whole server/local row instead of only financial fields (nullable metadata crashes).
it('accepts a complete closure row without inspecting nonfinancial metadata', () => {
  const row = { ...recorded, server_closure_id: null, printed_at: null, order_ids: [], movement_ids: [] };
  expect([...deriveSettled(row, []).touched]).toEqual([]);
});

// Revert: apply the recount as a delta, trust its own stale variance, or mutate the recorded document.
// WCPOS's fixture carries four-decimal sub-cent deltas (0.0001), which have no minor-unit
// equivalent at exponent 2; they were mapped to 1 minor unit each, real-world-equivalent but not
// a literal copy. So this test checks how corrections order, dedupe and cancel against a full
// closure row, not sub-cent precision.
it('projects the overnight corrections fixture without changing the recorded document', () => {
  const before = JSON.stringify(closureLocalRow);
  const result = deriveSettled(closureLocalRow, correctionsDst.corrections as Correction[]);
  expect(result.settled).toMatchObject(correctionsDst.settled);
  expect([...result.touched].sort()).toEqual(correctionsDst.touched);
  expect(JSON.stringify(closureLocalRow)).toBe(before);
});

// Revert: recalculate variance only for counted tenders.
it('reports a shortfall for a tender introduced after counting', () => {
  const result = deriveSettled(recorded, [correction(1, 'late_sale', { expected_delta: { voucher: 1234 } })]);
  expect(result.settled.variance.voucher).toBe(-1234);
  expect(result.touched.has('variance.voucher')).toBe(true);
});
