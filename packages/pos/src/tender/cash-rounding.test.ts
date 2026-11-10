import { describe, it, expect } from 'vitest';
import { paymentMethodOf, type PaymentRounding } from '@tallyui/core';
import { roundToIncrement, roundedDue, settlesAtRoundedDue, tenderRounding } from './cash-rounding';

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
