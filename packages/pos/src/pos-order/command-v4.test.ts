// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { MICROS_PER_MINOR, roundMicrosToMinor, taxMicros } from '../tax/exact';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

// #285's probe: 10% (ratePpm 100000), AUD. Line a is 2 × 12.50 with a 10% line discount, line b 1 × 9.99,
// and a fixed 5.00 order discount: line a's discount is 250 + a 346 share, line b's a 154 share.
function probe(pricesIncludeTax: boolean, lineBInclusive: boolean): PosOrder {
  const builder = createOrderBuilder({ currency: 'AUD', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 100000 } });
  const a = builder.addLine({ productId: 'a', name: 'Line a', sku: 'A', quantity: 2, taxRates: [{ ratePpm: 100000 }],
    unitPrice: { amount: 1250, currency: 'AUD', taxInclusive: pricesIncludeTax } });
  builder.addLine({ productId: 'b', name: 'Line b', sku: 'B', quantity: 1, taxRates: [{ ratePpm: 100000 }],
    unitPrice: { amount: 999, currency: 'AUD', taxInclusive: lineBInclusive } });
  builder.applyLineDiscount(a, { type: 'percentage', value: 10 });
  builder.applyOrderDiscount({ type: 'fixed', value: 500 });
  builder.addPayment({ method: 'cash', amountMinor: 5000 });
  return finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 3 } });
}

// [case, order, v4 line discounts, subtotalMinor], field-kinds.md's worked examples; v3 sends 596 and 154, 750 in all.
const cases = [
  ['G, exclusive', probe(false, false), [596, 154], 2749],
  ['H, inclusive', probe(true, true), [542, 140], 2499],
  ['I, mixed: inclusive order, exclusive line b', probe(true, false), [542, 154], 2576],
  ['mixed: exclusive order, inclusive line b', probe(false, true), [596, 140], 2672],
] as const;

/** Σ net(A) over the lines, exact in micro-units and rounded once, half away from zero. */
function netAmountsMinor(order: PosOrder): number {
  return roundMicrosToMinor(order.lines.reduce((sum, line) => {
    const amount = line.unitPriceMinor * line.quantity;
    const tax = line.taxInclusive ?? order.pricesIncludeTax
      ? taxMicros(amount, line.taxLines.reduce((rate, tax) => rate + tax.ratePpm, 0), true) : 0n;
    return sum + BigInt(amount) * MICROS_PER_MINOR - tax;
  }, 0n));
}

describe('order.create version 4 (#286): every discountMinor is tax-exclusive', () => {
  it.each(cases)('case %s, the server advertising 4: net line discounts, their sum, and the rest as v3', (_name, order, net, subtotal) => {
    const v3 = toOrderCreateEnvelope(order, 'device1');
    const v4 = toOrderCreateEnvelope(order, 'device1', 1, { maxVersion: 4 });
    const sum = net[0] + net[1];
    expect(v4.version).toBe(4);
    expect(v4.payload.lines.map((line) => line.discountMinor)).toStrictEqual(net);
    expect(v4.payload.discountMinor).toBe(sum);
    expect(v4).toStrictEqual({ ...v3, version: 4, payload: { ...v3.payload, discountMinor: sum,
      lines: v3.payload.lines.map((line, i) => ({ ...line, discountMinor: net[i] })) } });
    expect(payloadShapeErrors(v4.payload)).toStrictEqual([]);
    expect(precheckCommand(v4, { orderCreate: [1, 2, 3, 4], register: [1] })).toBeUndefined();
    // The subtotal identity: Σ net(A) − payload.discountMinor = subtotalMinor.
    expect(v4.payload.subtotalMinor).toBe(subtotal);
    expect(netAmountsMinor(order) - sum).toBe(subtotal);
  });

  it('case G, exclusive: the v4 discounts equal v3\'s', () => {
    const [, order] = cases[0];
    const v3 = toOrderCreateEnvelope(order, 'device1', 1, { maxVersion: 3 });
    const v4 = toOrderCreateEnvelope(order, 'device1', 1, { maxVersion: 4 });
    expect(v4.payload.lines.map((line) => line.discountMinor)).toStrictEqual(v3.payload.lines.map((line) => line.discountMinor));
    expect(v4.payload.discountMinor).toBe(v3.payload.discountMinor);
  });

  it.each(cases)('case %s, the server advertising 3 or nothing: v3 with today\'s figures, byte-identical', (_name, order) => {
    const today = JSON.stringify(toOrderCreateEnvelope(order, 'device1'));
    for (const options of [{ maxVersion: 3 }, {}, undefined]) {
      const v3 = toOrderCreateEnvelope(order, 'device1', 1, options);
      expect(v3.version).toBe(3);
      expect(v3.payload.lines.map((line) => line.discountMinor)).toStrictEqual([596, 154]);
      expect(v3.payload.discountMinor).toBe(750);
      expect(JSON.stringify(v3)).toBe(today);
    }
  });

  it.each(cases)('case %s stored with sentVersion 3 resends at v3 though the server now advertises 4', (_name, order) => {
    const sent = { ...order, sentVersion: 3 as const };
    const resend = toOrderCreateEnvelope(sent, 'device1', 2, { maxVersion: 4 });
    expect(resend.version).toBe(3);
    expect(JSON.stringify(resend)).toBe(JSON.stringify(toOrderCreateEnvelope(order, 'device1', 2)));
  });
});
