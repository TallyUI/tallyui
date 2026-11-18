import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import type { Order } from '../order/types';
import { countsTowardPaid } from '../tender/payment-legs';
import { finalizeOrder } from './finalize';
import { lockedRefundDueMinor, refundDueOf, tillLegsTheStoreRefuses } from './refund-due';

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

describe('tillLegsTheStoreRefuses (ADR-090 gate 36c)', () => {
  const storeOrder = { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' };
  const locked = { id: 'l', locked: true as const, amountMinor: 1000 };

  it('H1: the store holds the total, so every unlocked leg, voided or not, is refused', () => {
    const payments = [locked, { id: 'a', amountMinor: 500 }, { id: 'b', amountMinor: 200 }];
    expect(tillLegsTheStoreRefuses({ storeOrder, totalMinor: 800, payments })).toEqual(['a', 'b']);
  });

  it('H2: a part-paid reopened sale keeps its till legs for the remainder', () => {
    expect(tillLegsTheStoreRefuses({ storeOrder, totalMinor: 1500, payments: [locked, { id: 'a', amountMinor: 600 }] })).toEqual([]);
  });

  it('H3: a till sale with no store order refuses nothing, however overpaid', () => {
    expect(tillLegsTheStoreRefuses({ totalMinor: 800, payments: [{ id: 'a', amountMinor: 2000 }] })).toEqual([]);
    // A zero total is "covered" by no locked legs at all; only the store-order check keeps this till sale's leg.
    expect(tillLegsTheStoreRefuses({ totalMinor: 0, payments: [{ id: 'a', amountMinor: 500 }] })).toEqual([]);
  });

  it('H5: locked legs equal to the total already cover it', () => {
    expect(tillLegsTheStoreRefuses({ storeOrder, totalMinor: 1000, payments: [locked, { id: 'a', amountMinor: 300 }] })).toEqual(['a']);
  });

  /** H4: a reopened sale with one kept line at `priceMinor`, the store's locked €10 leg and `till` legs taken here. */
  function reopened(priceMinor: number, till: (builder: ReturnType<typeof createOrderBuilder>) => void) {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false }, storeOrder });
    builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: priceMinor, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'Cash', storePaymentId: 'p1', locked: true });
    till(builder);
    return builder.getSnapshot();
  }

  /** What useSale's complete hands finalizeOrder: the captured legs only (use-sale.ts, "only captured money is the sale's"). */
  const finalize = (order: Order) => finalizeOrder({ ...order, payments: order.payments.filter(countsTowardPaid) }, { capabilities: { orderCreate: 9 } });

  it('H4: finalizeOrder refuses the sale exactly when the helper names a leg', () => {
    const held = reopened(800, (builder) => {
      builder.addPayment({ method: 'cash', amountMinor: 500 });
      builder.setPaymentStatus(builder.addPayment({ method: 'external', amountMinor: 200 }), 'voided');
    });
    const partPaid = reopened(1500, (builder) => { builder.addPayment({ method: 'cash', amountMinor: 600 }); });
    expect(tillLegsTheStoreRefuses(held)).toHaveLength(2);
    expect(() => finalize(held)).toThrow('the store already holds the new total');
    expect(tillLegsTheStoreRefuses(partPaid)).toEqual([]);
    expect(() => finalize(partPaid)).not.toThrow();
  });
});
