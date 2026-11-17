import { describe, expect, it } from 'vitest';
import { lockedRefundDueMinor, refundDueOf } from './refund-due';

describe('refund-due', () => {
  it('uses the stored refundDueMinor over the payments', () => {
    const order = { totalMinor: 4200, payments: [{ id: 'p1', method: 'cash' as const, amountMinor: 5100 }] };
    expect(refundDueOf({ ...order, refundDueMinor: 250 })).toBe(250);
    expect(refundDueOf({ ...order, refundDueMinor: 0 })).toBe(0);
  });

  it('computes sum(payments) minus total for a row without the stored value, never below 0', () => {
    const payments = [{ id: 'p1', method: 'cash' as const, amountMinor: 3000 }, { id: 'p2', method: 'external' as const, amountMinor: 2000 }];
    expect(refundDueOf({ payments, totalMinor: 4200 })).toBe(800);
    expect(refundDueOf({ payments, totalMinor: 5000 })).toBe(0);
    expect(refundDueOf({ payments, totalMinor: 6000 })).toBe(0);
  });

  it('counts only locked legs in a builder sale: a cash overpayment is not refund-due', () => {
    expect(lockedRefundDueMinor({ payments: [{ locked: true, amountMinor: 5000 }], totalMinor: 4200 })).toBe(800);
    expect(lockedRefundDueMinor({ payments: [{ locked: true, amountMinor: 3000 }, { amountMinor: 2000 }], totalMinor: 4200 })).toBe(0);
    expect(lockedRefundDueMinor({ payments: [{ amountMinor: 5000 }], totalMinor: 4200 })).toBe(0);
  });
});
