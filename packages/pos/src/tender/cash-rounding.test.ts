import { describe, it, expect } from 'vitest';
import { paymentMethodOf, type PaymentRounding } from '@tallyui/core';
import { cashVoidRefusal, nearestPayableCash, roundToIncrement, roundedDue, roundedRemainder, settlesAtRoundedDue, tenderRounding } from './cash-rounding';

describe('nearestPayableCash', () => {
  it.each([
    [501, 5, { belowMinor: 500, aboveMinor: 505 }],
    [500, 5, null],
    [3, 5, { belowMinor: 0, aboveMinor: 5 }],
    [501, 1, null],
    [501, 2.5, null],
  ] as const)('%s at increment %s', (amountMinor, incrementMinor, expected) => {
    expect(nearestPayableCash(amountMinor, incrementMinor)).toEqual(expected);
  });
});

describe('cashVoidRefusal', () => {
  it('a leg with no entry is not refused', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash', status: 'captured' }] }, 'a')).toBeUndefined();
  });
  it('a later captured leg with an entry refuses the void', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash' }, { id: 'b', method: 'cash', status: 'captured' }], cashRoundings: [{ paymentId: 'a', minor: -2 }, { paymentId: 'b', minor: 4 }] }, 'a')).toBe('later_cash_rounding');
  });
  it('a later voided leg with an entry does not refuse the void', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash' }, { id: 'b', method: 'cash', status: 'voided' }], cashRoundings: [{ paymentId: 'a', minor: -2 }, { paymentId: 'b', minor: 4 }] }, 'a')).toBeUndefined();
  });
  it('a later leg with a zero entry does not refuse the void', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash' }, { id: 'b', method: 'cash', status: 'captured' }], cashRoundings: [{ paymentId: 'a', minor: -2 }, { paymentId: 'b', minor: 0 }] }, 'a')).toBeUndefined();
  });
  it('an entry only on an earlier leg does not refuse the later void', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash' }, { id: 'b', method: 'cash', status: 'captured' }], cashRoundings: [{ paymentId: 'a', minor: -2 }] }, 'b')).toBeUndefined();
  });
  it('an unknown payment id is not refused', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash' }], cashRoundings: [{ paymentId: 'a', minor: -2 }] }, 'unknown')).toBeUndefined();
  });
  it('the last of one to four captured entry-carrying legs is never refused', () => {
    for (let count = 1; count <= 4; count++) {
      const payments = Array.from({ length: count }, (_, i) => ({ id: String(i), method: 'cash', status: 'captured' as const }));
      expect(cashVoidRefusal({ payments, cashRoundings: payments.map((leg) => ({ paymentId: leg.id, minor: 1 })) }, String(count - 1))).toBeUndefined();
    }
  });
  it('a later card leg with an entry does not refuse the void', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash' }, { id: 'b', method: 'external', status: 'captured' }], cashRoundings: [{ paymentId: 'a', minor: -2 }, { paymentId: 'b', minor: -3 }] }, 'a')).toBeUndefined();
  });
  it('a later cash leg refuses even when a card leg sits between', () => {
    expect(cashVoidRefusal({ payments: [{ id: 'a', method: 'cash', status: 'captured' }, { id: 'c', method: 'external', status: 'captured' }, { id: 'b', method: 'cash', status: 'captured' }], cashRoundings: [{ paymentId: 'a', minor: -2 }, { paymentId: 'c', minor: -1 }, { paymentId: 'b', minor: 4 }] }, 'a')).toBe('later_cash_rounding');
  });
});

const cash = (rounding: PaymentRounding) => ({
  ...paymentMethodOf('cash'),
  defaults: { ...paymentMethodOf('cash').defaults, rounding },
});

describe('roundToIncrement', () => {
  it.each([
    // minor, increment, nearest, up, down
    [1002, 5, 1000, 1005, 1000],
    [1003, 5, 1005, 1005, 1000],
    [1025, 10, 1030, 1030, 1020], // half-up: the midpoint goes up
    [1024, 10, 1020, 1030, 1020],
    [1000, 5, 1000, 1000, 1000],
    [2, 5, 0, 5, 0],
  ])('%i to %i: nearest %i, up %i, down %i', (minor, increment, nearest, up, down) => {
    expect(roundToIncrement(minor, increment, 'nearest')).toBe(nearest);
    expect(roundToIncrement(minor, increment, 'up')).toBe(up);
    expect(roundToIncrement(minor, increment, 'down')).toBe(down);
  });

  it('rounds nothing for an increment of one minor unit, zero, or a non-integer', () => {
    expect(roundToIncrement(1003, 1, 'up')).toBe(1003);
    expect(roundToIncrement(1003, 0, 'nearest')).toBe(1003);
    expect(roundToIncrement(1003, 2.5, 'nearest')).toBe(1003);
  });
});

describe('roundedDue', () => {
  it('rounds the unrounded remainder after a void, accounting for live entries', () => {
    expect(roundedDue(501, cash({ incrementMinor: 5, mode: 'nearest' }), -2)).toStrictEqual({ dueMinor: 505, roundingMinor: 4 });
  });

  it('clamps a nonpositive unrounded remainder and leaves a zero balance unchanged', () => {
    expect(roundedDue(1, cash({ incrementMinor: 5, mode: 'up' }), 3)).toStrictEqual({ dueMinor: 0, roundingMinor: -1 });
    expect(roundedDue(0, cash({ incrementMinor: 5, mode: 'up' }), -2)).toStrictEqual({ dueMinor: 0, roundingMinor: 0 });
  });

  it('does not round a non-cash method (#1277)', () => {
    const card = paymentMethodOf('external');
    card.defaults.rounding = { incrementMinor: 5, mode: 'nearest' };
    expect(roundedDue(1002, card)).toEqual({ dueMinor: 1002, roundingMinor: 0 });
  });

  it('is the identity without a method or rounding', () => {
    expect(roundedDue(1003, null)).toEqual({ dueMinor: 1003, roundingMinor: 0 });
    expect(roundedDue(1003, paymentMethodOf('cash'))).toEqual({ dueMinor: 1003, roundingMinor: 0 });
  });

  it('reports the signed difference in integer minor units', () => {
    const method = cash({ incrementMinor: 5, mode: 'nearest' });
    expect(roundedDue(1003, method)).toEqual({ dueMinor: 1005, roundingMinor: 2 });
    expect(roundedDue(1002, method)).toEqual({ dueMinor: 1000, roundingMinor: -2 });
    expect(roundedDue(1002, cash({ incrementMinor: 1, mode: 'up' }))).toEqual({
      dueMinor: 1002,
      roundingMinor: 0,
    });
  });

  it('rounds a currency with no decimals (HUF to the 5)', () => {
    expect(roundedDue(1233, cash({ incrementMinor: 5, mode: 'nearest' }))).toEqual({
      dueMinor: 1235,
      roundingMinor: 2,
    });
    expect(roundedDue(1232, cash({ incrementMinor: 5, mode: 'down' }))).toEqual({
      dueMinor: 1230,
      roundingMinor: -2,
    });
  });

  it('does not round a device capture method', () => {
    const method = cash({ incrementMinor: 5, mode: 'nearest' });
    expect(roundedDue(1003, { ...method, capture: { ...method.capture, mode: 'device' } })).toEqual({
      dueMinor: 1003,
      roundingMinor: 0,
    });
  });
});

describe('settlesAtRoundedDue', () => {
  it.each([
    // amount, tendered, balance, due, settles
    [1003, 1005, 1003, 1005, true],
    [1003, 1003, 1003, 1005, false],
    [1000, 1000, 1002, 1000, true],
    [1001, 2000, 1002, 1000, true],
    [500, 2000, 1003, 1005, false],
  ])('amount %i, tendered %i on %i due %i: %s', (amountMinor, tenderedMinor, balanceMinor, dueMinor, settles) => {
    expect(settlesAtRoundedDue({ amountMinor, tenderedMinor, balanceMinor, dueMinor })).toBe(settles);
  });
});

describe('tenderRounding', () => {
  it('prefills and applies the sale\'s single rounding after a void', () => {
    expect(tenderRounding({ entryMinor: 501, entryDirty: false }, 501, cash({ incrementMinor: 5, mode: 'nearest' }), -2)).toStrictEqual({
      roundedDueMinor: 505, roundingMinor: 4, entryMinor: 505, appliedMinor: 505,
    });
  });

  it('keeps an untouched prefill at the exact due for a non-cash method (#1277)', () => {
    const card = paymentMethodOf('external');
    card.defaults.rounding = { incrementMinor: 5, mode: 'nearest' };
    expect(tenderRounding({ entryMinor: 1002, entryDirty: false }, 1002, card)).toEqual({
      roundedDueMinor: 1002,
      roundingMinor: 0,
      entryMinor: 1002,
      appliedMinor: 1002,
    });
  });

  it.each([
    ['untouched prefill rounds up', 1003, false, 1003, 1005, 2, 1005, 1005],
    ['untouched prefill rounds down', 1002, false, 1002, 1000, -2, 1000, 1000],
    ['exact unrounded entry', 1003, true, 1003, 1005, 0, 1003, 1003],
    ['notes over the due', 2000, true, 1003, 1005, 2, 2000, 1005],
    ['partial entry', 500, true, 1003, 1005, 0, 500, 500],
    ['balance under half the increment', 2, false, 2, 0, -2, 0, 0],
  ] as const)('%s', (_name, entryMinor, entryDirty, balanceMinor, due, rounding, entry, applied) => {
    expect(tenderRounding({ entryMinor, entryDirty }, balanceMinor, cash({ incrementMinor: 5, mode: 'nearest' }))).toEqual({
      roundedDueMinor: due,
      roundingMinor: rounding,
      entryMinor: entry,
      appliedMinor: applied,
    });
  });

  it('keeps an untouched prefill when the method has no rounding', () => {
    expect(tenderRounding({ entryMinor: 1003, entryDirty: false }, 1003, paymentMethodOf('cash'))).toEqual({
      roundedDueMinor: 1003,
      roundingMinor: 0,
      entryMinor: 1003,
      appliedMinor: 1003,
    });
  });
});

describe('roundedRemainder', () => {
  it('keeps cash payable and the sale rounding bounded across live entries', () => {
    for (const mode of ['nearest', 'up', 'down'] as const) {
      for (let unrounded = -6; unrounded <= 30; unrounded++) {
        for (let entries = -4; entries <= 4; entries++) {
          const balance = unrounded + entries;
          if (balance <= 0) continue;
          const due = roundedRemainder(balance, entries, { incrementMinor: 5, mode });
          expect(due % 5).toBe(0);
          if (unrounded <= 0) {
            expect(due).toBe(0);
          } else {
            expect(due).toBe(roundToIncrement(unrounded, 5, mode));
            if (mode === 'nearest') {
              expect(Math.abs(due - unrounded)).toBeLessThanOrEqual(2);
            } else if (mode === 'up') {
              expect(due - unrounded).toBeGreaterThanOrEqual(0);
              expect(due - unrounded).toBeLessThan(5);
            } else {
              expect(due - unrounded).toBeGreaterThan(-5);
              expect(due - unrounded).toBeLessThanOrEqual(0);
            }
          }
        }
      }
    }
  });
});
