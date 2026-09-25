import { expect, it } from 'vitest';
import { deriveExpected } from './expected';

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
