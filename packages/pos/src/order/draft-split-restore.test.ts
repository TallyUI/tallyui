import { describe, expect, it } from 'vitest';
import type { TaxContext, WooRate } from '../tax/types';
import { createOrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order } from './types';

// make, genericContext, makeGeneric, product and displayIdentity are copied from charge-tax-mode.test.ts.
const rate = (id: number, percent: string, extra: Partial<WooRate> = {}): WooRate => ({
  id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound: false, shipping: true, ...extra,
});
function context(rates: Record<string, WooRate[]>, pricesIncludeTax = false, roundAtSubtotal = false): TaxContext {
  return {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal },
    getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
    getTaxRates: (taxClass, options) => (rates[taxClass || 'standard'] ?? []).filter((rate) => !options?.shipping || rate.shipping),
  };
}
function make(rates = [rate(1, '10.0000')], inclusive = false, subtotal = false, currency = 'GBP') {
  return createOrderBuilder({ currency, taxContext: context({ standard: rates }, inclusive, subtotal) });
}
function displayIdentity(order: Order) {
  const d = order.display;
  expect(d.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(d.subtotalMinor);
  expect(d.subtotalMinor - d.discountMinor + [...(d.fees ?? []), ...(d.shipping ?? [])].reduce((sum, row) => sum + row.amountMinor, 0)
    + (d.taxInclusive ? 0 : d.taxMinor)).toBe(order.totalMinor);
}
const genericContext = (pricesIncludeTax: boolean): TaxContext => ({
  pricesIncludeTax,
  getTaxRatePpm: (taxClass) => taxClass === 'zero' ? 0 : 100000,
  getTaxRateCode: (taxClass) => taxClass === 'zero' ? 'Zero' : 'VAT',
});
const makeGeneric = (inclusive: boolean) => createOrderBuilder({ currency: 'EUR', taxContext: genericContext(inclusive) });
const product = (amount: number) => ({ productId: 'p', name: 'Product', unitPrice: { amount, currency: 'EUR' } });

describe('a split sale keeps its lines through a draft restore', () => {
  it('R1: a generic exclusive store restores a three-way split as three lines', () => {
    const builder = makeGeneric(false);
    const id = builder.addLine({ ...product(1000), quantity: 3 });
    builder.splitLine(id);
    const snapshot = builder.getSnapshot();
    expect(snapshot.lineItems).toHaveLength(3);
    const restored = restoreOrderDraft(snapshot, { currency: 'EUR', taxContext: genericContext(false) }).getSnapshot();
    expect(restored.lineItems).toHaveLength(3);
    expect(restored.lineItems.map((line) => line.quantity)).toEqual([1, 1, 1]);
    expect(restored.totalMinor).toBe(snapshot.totalMinor);
    expect(restored.taxMinor).toBe(snapshot.taxMinor);
    displayIdentity(restored);
  });

  it('R2: a line discount on the second copy stays on the second copy', () => {
    const builder = makeGeneric(false);
    const id = builder.addLine({ ...product(1000), quantity: 3 });
    builder.splitLine(id);
    builder.applyLineDiscount(builder.getSnapshot().lineItems[1].id, { type: 'percentage', value: 10 });
    const snapshot = builder.getSnapshot();
    const restored = restoreOrderDraft(snapshot, { currency: 'EUR', taxContext: genericContext(false) }).getSnapshot();
    expect(restored.lineItems).toHaveLength(3);
    expect(restored.lineItems.map((line) => line.discounts.map(({ type, value }) => ({ type, value }))))
      .toEqual([[], [{ type: 'percentage', value: 10 }], []]);
    expect(restored.totalMinor).toBe(snapshot.totalMinor);
    displayIdentity(restored);
  });

  it('R3: a WooCommerce store restores a three-way split as three lines', () => {
    const builder = make();
    const id = builder.addLine({ productId: 'p', name: 'p', unitPrice: { amount: 1000, currency: 'GBP' }, quantity: 3 });
    builder.splitLine(id);
    const snapshot = builder.getSnapshot();
    expect(snapshot.lineItems).toHaveLength(3);
    const restored = restoreOrderDraft(snapshot, { currency: 'GBP', taxContext: context({ standard: [rate(1, '10.0000')] }) }).getSnapshot();
    expect(restored.lineItems).toHaveLength(3);
    expect(restored.lineItems.map((line) => line.quantity)).toEqual([1, 1, 1]);
    expect(restored.totalMinor).toBe(snapshot.totalMinor);
    expect(restored.taxMinor).toBe(snapshot.taxMinor);
    displayIdentity(restored);
  });

  it('R4: without separate, an equal input merges into one line', () => {
    const builder = makeGeneric(false);
    builder.addLine(product(1000));
    builder.addLine(product(1000));
    const order = builder.getSnapshot();
    expect(order.lineItems.map((line) => line.quantity)).toEqual([2]);
    displayIdentity(order);
  });

  it('R5: with separate, an equal input is its own line', () => {
    const builder = makeGeneric(false);
    builder.addLine({ ...product(1000), separate: true });
    builder.addLine({ ...product(1000), separate: true });
    const order = builder.getSnapshot();
    expect(order.lineItems.map((line) => line.quantity)).toEqual([1, 1]);
    displayIdentity(order);
  });

  it('R6: a line of quantity 2 that was never split restores as one line', () => {
    const builder = makeGeneric(false);
    builder.addLine({ ...product(1000), quantity: 2 });
    const snapshot = builder.getSnapshot();
    const restored = restoreOrderDraft(snapshot, { currency: 'EUR', taxContext: genericContext(false) }).getSnapshot();
    expect(restored.lineItems.map((line) => line.quantity)).toEqual([2]);
    displayIdentity(restored);
  });
});
