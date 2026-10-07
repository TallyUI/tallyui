import { expect, it } from 'vitest';
import { deriveExpected, refundAmounts, type RefundRow } from './expected';

// Fixtures are minor units at exponent 2 (GBP-style): WCPOS's server four-decimal amount '50'
// (£50.00) becomes 5000; '100' (£100.00) becomes 10000. The numbers are kept real-world
// equivalent, not a literal digit copy of WCPOS's four-decimal fixtures.
//
// Dropped from this file — refund-attribution tests; refund attribution is deferred (see
// expected.ts and ADR-032 amendment 1):
//   - 'does not credit the drawer when the aggregate lags stamped allocations'
//   - 'keeps Monday cash sales in A and debits an unallocated Tuesday refund in B'
//   - 'moves succeeded split allocations to the refund session without moving legacy refunds'
//   - 'uses cash fallback when the only allocation is %s'
//   - 'debits the unallocated remainder to cash without adding a remainder to a fully allocated refund'

it('derives captured session cash and card net of refunds and non-voided movements', () => {
  // Refund attribution is deferred: this row carries no refund data, so cash nets only
  // against the paid-in/paid-out movements below (WCPOS's row also carried a
  // `refunded_amount` that debited the drawer through the now-removed `attributeRefunds`).
  const result = deriveExpected({
    session: { id: 'session', countedFloatMinor: 10000 },
    ledgerRowsBySession: [
      { session_id: 'session', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 5000 },
      { session_id: 'session', kind: 'card', method_id: 'card', status: 'captured', amountMinor: 3000 },
      { session_id: 'other', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 99900 },
      { session_id: 'session', kind: 'cash', method_id: 'cash', status: 'authorized', amountMinor: 99900 },
    ],
    movements: [
      { id: 'in', session_id: 'session', type: 'paid_in', amountMinor: 2000 },
      { id: 'out', session_id: 'session', type: 'paid_out', amountMinor: 500 },
      { id: 'voided', session_id: 'session', type: 'paid_out', amountMinor: 700, voided_by: 'void' },
      { id: 'void', session_id: 'session', type: 'void', amountMinor: 700, voids: 'voided' },
    ],
  });
  expect(result).toEqual({ cash: 16500, card: 3000 });
});

// TallyUI (registers a2): the test above sets both void markers at once, so either rule alone
// could be deleted unnoticed. Each marker alone must exclude the movement.
it.each([
  ['its own voided_by', [{ id: 'out', session_id: 'session', type: 'paid_out', amountMinor: 700, voided_by: 'gone' }]],
  ['a void row naming it', [
    { id: 'out', session_id: 'session', type: 'paid_out', amountMinor: 700 },
    { id: 'void', session_id: 'session', type: 'void', amountMinor: 700, voids: 'out' },
  ]],
])('excludes a movement voided by %s alone', (_, movements) => {
  const result = deriveExpected({ session: { id: 'session', countedFloatMinor: 10000 }, ledgerRowsBySession: [], movements });
  expect(result).toEqual({ cash: 10000 });
});

const refundFixture = {
  session: { id: 'session', countedFloatMinor: 10000 },
  ledgerRowsBySession: [
    { session_id: 'session', kind: 'cash', method_id: 'cash', status: 'captured', amountMinor: 5000 },
    { session_id: 'session', kind: 'card', method_id: 'card', status: 'captured', amountMinor: 3000 },
  ],
  movements: [{ id: 'out', session_id: 'session', type: 'paid_out', amountMinor: 500 }],
};
const refundRow = (byMethod: Record<string, number>, overrides: Partial<RefundRow> = {}): RefundRow => ({
  id: 'refund', sessionId: 'session', status: 'applied',
  result: { byMethod, totalMinor: 0, refunds: [] }, ...overrides,
});

it('applied session refunds lower cash and card expected', () => {
  expect(deriveExpected({ ...refundFixture, refunds: [refundRow({ cash: 1500 }), refundRow({ card: 700 })] }))
    .toStrictEqual({ cash: 13000, card: 2300 });
});

it('counts only applied refunds of this session with a result', () => {
  expect(deriveExpected({ ...refundFixture, refunds: [
    refundRow({ cash: 1000 }, { sessionId: 'other' }),
    ...(['pending', 'rejected', 'unsent'] as const).map((status) => refundRow({ cash: 1000 }, { status })),
    refundRow({ cash: 1000 }, { result: undefined }),
  ] })).toStrictEqual({ cash: 14500, card: 3000 });
});

it('a refunded method with no sales goes negative', () => {
  expect(deriveExpected({ ...refundFixture, refunds: [refundRow({ voucher: 300 })] }))
    .toStrictEqual({ cash: 14500, card: 3000, voucher: -300 });
});

const malformedMethods = [
  { cash: -5 }, { cash: 1.5 }, { cash: NaN }, { cash: '10' }, { '': 10 },
  null, Object.create({ inherited: 1 }),
  [10],
  Object.assign(Object.create({ inherited: 1 }), { cash: 10 }),
];
it('skips malformed refund amounts without changing any tender', () => {
  const refunds = malformedMethods.map((byMethod) => refundRow(byMethod as Record<string, number>));
  expect(deriveExpected({ ...refundFixture, refunds })).toStrictEqual({ cash: 14500, card: 3000 });
});

it('keeps the figures without a refunds argument', () => {
  expect(deriveExpected(refundFixture)).toStrictEqual({ cash: 14500, card: 3000 });
});

it.each(malformedMethods.map((byMethod) => [byMethod]))('refundAmounts skips malformed byMethod %s', (byMethod) => {
  expect(refundAmounts(refundRow(byMethod as Record<string, number>))).toStrictEqual([]);
});

it.each([undefined, null, 10, [], Object.create({ byMethod: { cash: 1 } })])(
  'refundAmounts skips a non-plain result %s', (result) => {
    expect(refundAmounts(refundRow({}, { result: result as RefundRow['result'] }))).toStrictEqual([]);
  },
);

it.each(['applied', 'pending', 'rejected', 'unsent'] as const)('refundAmounts ignores status %s and sessionId', (status) => {
  const byMethod = Object.assign(Object.create(null), { cash: 10, card: 0, bad: -5 });
  const result = Object.assign(Object.create(null), { byMethod, totalMinor: 10, refunds: [] });
  expect(refundAmounts(refundRow({}, { status, sessionId: 'other', result }))).toStrictEqual([['cash', 10], ['card', 0]]);
});
