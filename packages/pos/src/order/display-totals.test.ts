import { describe, it, expect } from 'vitest';
import { createOrderBuilder } from './order-builder';
import type { TaxContext } from '../tax/types';
import type { Discount, Order } from './types';

const store = (pricesIncludeTax: boolean, ratePpm = 200000): TaxContext => ({ getTaxRatePpm: () => ratePpm, pricesIncludeTax });

/** Asserts the display row adds up in its mode: Subtotal − Discount (+ Tax when exclusive) = Total (ADR-063). */
function expectAddsUp(order: Order, context = '') {
  const d = order.display;
  expect(d, context).toMatchObject({ taxInclusive: order.pricesIncludeTax, taxMinor: order.taxMinor, totalMinor: order.totalMinor });
  expect(d.subtotalMinor - d.discountMinor + (d.taxInclusive ? 0 : d.taxMinor), `${context} subtotal − discount (+ tax) = total`).toBe(d.totalMinor);
  expect(d.discountMinor, context).toBeGreaterThanOrEqual(0);
}

// ADR-062's mixed-mode fixture: A is inclusive (3 × €10.00), B exclusive (€10.00), at 19%.
function mixed(pricesIncludeTax: boolean) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(pricesIncludeTax, 190000) });
  builder.addLine({ productId: 'a', name: 'Inclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: true }, quantity: 3 });
  builder.addLine({ productId: 'b', name: 'Exclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false } });
  return builder;
}

describe('display totals (ADR-063)', () => {
  it('all exclusive, 20%: €100.00 with 10% off the order shows 10000 − 1000 + 1800 = 10800', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(false) });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 10000, currency: 'EUR' } });
    expect(builder.getSnapshot().display.discountMinor).toBe(0);
    expect(builder.getSnapshot().display.subtotalMinor).toBe(builder.getSnapshot().subtotalMinor);
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: false, subtotalMinor: 10000, discountMinor: 1000, taxMinor: 1800, totalMinor: 10800 });
  });

  it('all inclusive, 20%: €120.00 with €12.00 off shows 12000 − 1200 = 10800, including 1800 tax', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(true) });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 12000, currency: 'EUR' } });
    expect(builder.getSnapshot().display.discountMinor).toBe(0);
    builder.applyOrderDiscount({ type: 'fixed', value: 1200 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: true, subtotalMinor: 12000, discountMinor: 1200, taxMinor: 1800, totalMinor: 10800 });
  });

  it('mixed, exclusive display: adds up exactly, and the settlement figures are unchanged', () => {
    const builder = mixed(false);
    let order = builder.getSnapshot();
    expect(order.display.discountMinor).toBe(0);
    expect(order.display.subtotalMinor).toBe(order.subtotalMinor);
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    order = builder.getSnapshot();
    expect(order).toMatchObject({ totalMinor: 4085, taxMinor: 652, subtotalMinor: 3433, discountMinor: 100 });
    // Settlement discountMinor (100) mixes A's gross share (75) with B's net share (25); the display's is net: 3521 − 3433.
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: false, subtotalMinor: 3521, discountMinor: 88, taxMinor: 652, totalMinor: 4085 });
  });

  it('mixed, inclusive display: adds up exactly', () => {
    const builder = mixed(true);
    expect(builder.getSnapshot().display.discountMinor).toBe(0);
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ totalMinor: 4085, taxMinor: 652, subtotalMinor: 3433, discountMinor: 100 });
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: true, subtotalMinor: 4190, discountMinor: 105, taxMinor: 652, totalMinor: 4085 });
  });

  it.each([
    { pricesIncludeTax: false, display: { subtotalMinor: 1000, discountMinor: 200, taxMinor: 80, totalMinor: 880 } },
    { pricesIncludeTax: true, display: { subtotalMinor: 1000, discountMinor: 200, taxMinor: 73, totalMinor: 800 } },
  ])('stacks a line and an order discount on one line (inclusive display: $pricesIncludeTax)', (row) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: store(row.pricesIncludeTax, 100000) });
    const lineId = builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' } });
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const order = builder.getSnapshot();
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: row.pricesIncludeTax, ...row.display });
  });

  it('the medusapos cart: settlement 310 + 78 tax with 90 off shows 400 − 90 + 78 = 388, not 3.88 as 310 + 78 − 90', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(false, 250000) });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 400, currency: 'EUR' } });
    builder.applyOrderDiscount({ type: 'fixed', value: 90 });
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ subtotalMinor: 310, taxMinor: 78, discountMinor: 90, totalMinor: 388 });
    expectAddsUp(order);
    expect(order.display).toEqual({ taxInclusive: false, subtotalMinor: 400, discountMinor: 90, taxMinor: 78, totalMinor: 388 });
  });

  it('adds up for 200 seeded random carts in both display modes, with no discount shown when there is none', () => {
    // mulberry32: a small deterministic PRNG, so a failure reproduces.
    let seed = 0x7a11;
    const random = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
    const pick = <T>(items: T[]): T => items[int(0, items.length - 1)];
    const discount = (max: number): Discount => random() < 0.5
      ? { type: 'percentage', value: int(1, 60) }
      : { type: 'fixed', value: int(1, max) };

    for (let cart = 0; cart < 200; cart++) {
      const discounted = random() < 2 / 3;
      const lines = Array.from({ length: int(1, 4) }, (_, index) => ({
        productId: `p${index}`, name: `Item ${index}`, quantity: int(1, 3),
        unitPrice: { amount: int(1, 20000), currency: 'EUR', taxInclusive: random() < 0.5 },
        taxRates: [{ ratePpm: pick([0, 50000, 100000, 200000]) }],
        lineDiscount: discounted && random() < 0.4 ? discount(20000) : undefined,
      }));
      const orderDiscount = discounted && random() < 0.6 ? discount(40000) : undefined;
      for (const pricesIncludeTax of [false, true]) {
        const builder = createOrderBuilder({ currency: 'EUR', taxContext: store(pricesIncludeTax) });
        for (const { lineDiscount, ...line } of lines) {
          const lineId = builder.addLine(line);
          if (lineDiscount) builder.applyLineDiscount(lineId, lineDiscount);
        }
        if (orderDiscount) builder.applyOrderDiscount(orderDiscount);
        const order = builder.getSnapshot();
        const context = `cart ${cart}, inclusive display ${pricesIncludeTax}`;
        expectAddsUp(order, context);
        if (order.discountMinor === 0) {
          expect(order.display.discountMinor, `${context}: no discount, so none shown`).toBe(0);
          if (!pricesIncludeTax) expect(order.display.subtotalMinor, `${context}: no discount, same subtotal`).toBe(order.subtotalMinor);
        }
      }
    }
  });
});
