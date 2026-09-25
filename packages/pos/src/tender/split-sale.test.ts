import { describe, it, expect } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { appliedMinor, changeMinor, evenSplitShareMinor, planLegs } from './tender-state';

describe('a split sale through finalizeOrder', () => {
  it('takes an even 2-way split as an external leg and a tendered cash leg, and lands two correct payment rows', () => {
    const builder = createOrderBuilder({
      currency: 'EUR',
      taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false },
    });
    builder.addLine({
      productId: 'p1',
      name: 'Item',
      unitPrice: { amount: 2500, currency: 'EUR' },
    });
    const total = builder.getSnapshot().totalMinor;
    expect(total).toBe(2500);

    const plan = { kind: 'even' as const, ways: 2, from: 0 };
    const firstShare = evenSplitShareMinor(total, plan.ways);
    expect(firstShare).toBe(1250);

    // First leg: external, for its planned share.
    builder.addPayment({ method: 'external', amountMinor: firstShare, reference: 'terminal-1' });

    const secondLeg = planLegs(
      plan,
      [{ minor: firstShare, title: 'external' }],
      builder.getSnapshot().balanceDueMinor,
    );
    expect(secondLeg.thisPaymentMinor).toBe(1250);

    // Second leg: cash, tendered above the remaining share.
    const tenderedMinor = 2000;
    const applied = appliedMinor(tenderedMinor, secondLeg.thisPaymentMinor);
    const change = changeMinor(tenderedMinor, applied, true);
    expect(applied).toBe(1250);
    expect(change).toBe(750);

    // finalizeOrder derives the cash row's applied amount and change itself, from the
    // full tendered amount: it caps `amountMinor` at the balance and writes the original
    // amount out as `tenderedMinor`. So the cash payment is recorded with `amountMinor`
    // set to what was tendered (2,000), not the already-capped `applied` (1,250) — the
    // builder's own balance math (paidMinor, balanceDueMinor) also depends on the
    // uncapped tendered amount being on the row until finalize adjusts it.
    builder.addPayment({ method: 'cash', amountMinor: tenderedMinor });

    const order = finalizeOrder(builder.getSnapshot());
    const envelope = toOrderCreateEnvelope(order, 'device1');

    expect(envelope.payload.payments).toEqual([
      {
        clientPaymentId: order.payments[0].id,
        method: 'external',
        amountMinor: 1250,
        reference: 'terminal-1',
      },
      {
        clientPaymentId: order.payments[1].id,
        method: 'cash',
        amountMinor: 1250,
        tenderedMinor: 2000,
        changeMinor: 750,
      },
    ]);
    expect(envelope.payload.payments.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(total);
  });
});
