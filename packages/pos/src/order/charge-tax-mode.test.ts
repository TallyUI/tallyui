import { describe, expect, it } from 'vitest';
import type { TaxContext, WooRate } from '../tax/types';
import { createOrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order } from './types';

// Copied from woocommerce-tax.test.ts.
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
function add(builder: ReturnType<typeof make>, amount: number, productId = 'p', quantity = 1, taxClass?: string) {
  return builder.addLine({ productId, name: productId, unitPrice: { amount, currency: builder.getSnapshot().currency }, quantity, taxClass });
}
function displayIdentity(order: Order) {
  const d = order.display;
  expect(d.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(d.subtotalMinor);
  expect(d.subtotalMinor - d.discountMinor + [...(d.fees ?? []), ...(d.shipping ?? [])].reduce((sum, row) => sum + row.amountMinor, 0)
    + (d.taxInclusive ? 0 : d.taxMinor)).toBe(order.totalMinor);
}

// Copied from charges.test.ts, at 10%.
const genericContext = (pricesIncludeTax: boolean): TaxContext => ({
  pricesIncludeTax,
  getTaxRatePpm: (taxClass) => taxClass === 'zero' ? 0 : 100000,
  getTaxRateCode: (taxClass) => taxClass === 'zero' ? 'Zero' : 'VAT',
});
const makeGeneric = (inclusive: boolean) => createOrderBuilder({ currency: 'EUR', taxContext: genericContext(inclusive) });
const product = (amount: number) => ({ productId: 'p', name: 'Product', unitPrice: { amount, currency: 'EUR' } });

/** W1: an exclusive WooCommerce store, a 10% fee of 11.00 entered with tax included. */
function w1() {
  const builder = make();
  const id = builder.addFee({ name: 'Fee', amountMinor: 1100, amountIncludesTax: true });
  return { builder, id };
}

describe('vendurepos gap 2.10: a charge in its own tax mode, WooCommerce', () => {
  it('W1 (a): an exclusive store backs the tax out of an inclusive fee', () => {
    const { builder, id } = w1();
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ id, amountMinor: 1100, amountIncludesTax: true, netMinor: 1000, netMicros: '1000000000',
      totalMinor: 1100, taxMicros: '100000000' });
    expect(order.display.fees).toEqual([{ id, name: 'Fee', amountMinor: 1000 }]);
    expect(order).toMatchObject({ taxMinor: 100, totalMinor: 1100 });
    displayIdentity(order);
  });

  it('W2 (b): an inclusive store adds tax to an exclusive fee, against the same fee without the key', () => {
    const builder = make([rate(1, '10.0000')], true);
    const id = builder.addFee({ name: 'Fee', amountMinor: 1000, amountIncludesTax: false });
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ netMinor: 1000, totalMinor: 1100, taxMicros: '100000000' });
    expect(order.display.fees).toEqual([{ id, name: 'Fee', amountMinor: 1100 }]);
    expect(order).toMatchObject({ taxMinor: 100, totalMinor: 1100 });
    displayIdentity(order);
    const plain = make([rate(1, '10.0000')], true);
    plain.addFee({ name: 'Fee', amountMinor: 1000 });
    expect(plain.getSnapshot().fees![0]).toMatchObject({ totalMinor: 1000, netMicros: '909090900' });
  });

  it('W3 (c): inclusive shipping at the shipping class keeps its mode when a product is added', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: { ...context({
      standard: [rate(1, '20.0000')], 'reduced-rate': [rate(2, '5.0000', { shipping: true })],
    }), shippingTaxClass: 'reduced-rate' } });
    const id = builder.addShipping({ name: 'Post', amountMinor: 2100, amountIncludesTax: true });
    let order = builder.getSnapshot();
    expect(order.shipping![0]).toMatchObject({ netMinor: 2000, totalMinor: 2100, taxMicros: '100000000' });
    expect(order.display.shipping).toEqual([{ id, name: 'Post', amountMinor: 2000 }]);
    add(builder, 1000);
    order = builder.getSnapshot();
    expect(order.shipping![0]).toMatchObject({ amountIncludesTax: true, amountMinor: 2100, netMinor: 2000 });
    expect(order.taxMinor).toBe(300);
    displayIdentity(order);
  });

  it('W4 (QUIRK): the rounding mode follows the store, not the charge', () => {
    const builder = make([rate(1, '20.0000')]);
    const id = builder.addFee({ name: 'Fee', amountMinor: 3, amountIncludesTax: true });
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ netMinor: 3, netMicros: '2500000', taxMicros: '500000', totalMinor: 4 });
    expect(order.display.fees).toEqual([{ id, name: 'Fee', amountMinor: 3 }]);
    expect(order).toMatchObject({ taxMinor: 1, totalMinor: 4 });
    displayIdentity(order);
  });

  it('W5 (e): a compound rate backs out compound first', () => {
    const builder = make([rate(1, '10.0000'), rate(2, '5.0000', { compound: true })]);
    const id = builder.addFee({ name: 'Fee', amountMinor: 1155, amountIncludesTax: true });
    const order = builder.getSnapshot();
    expect(order.fees![0].taxLines.map((tax) => [tax.rateId, tax.taxMicros])).toEqual([[1, '100000000'], [2, '55000000']]);
    expect(order.fees![0]).toMatchObject({ netMinor: 1000, totalMinor: 1155 });
    expect(order.display.fees).toEqual([{ id, name: 'Fee', amountMinor: 1000 }]);
    displayIdentity(order);
  });

  it('W6 (f): a product beside W1\'s fee keeps the display identity with zero residue', () => {
    const { builder } = w1();
    add(builder, 2000);
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ taxMinor: 300, totalMinor: 3300, subtotalMinor: 2000 });
    expect(order.display.fees![0].amountMinor).toBe(1000);
    expect(order.display.subtotalMinor).toBe(2000);
    expect(order.display.lines[0].amountMinor).toBe(2000);
    displayIdentity(order);
  });

  it('D1: a parked draft keeps the fee\'s mode', () => {
    const { builder } = w1();
    const saved = JSON.parse(JSON.stringify(builder.getSnapshot()));
    const restored = restoreOrderDraft(saved, { currency: 'GBP', taxContext: context({ standard: [rate(1, '10.0000')] }) }).getSnapshot();
    const { id: _id, ...fee } = builder.getSnapshot().fees![0];
    expect(restored.fees![0]).toEqual({ ...fee, id: restored.fees![0].id });
    expect(restored.fees![0].amountIncludesTax).toBe(true);
  });

  it('D2: an update keeps the mode until it is cleared', () => {
    const { builder, id } = w1();
    builder.updateFee(id, { amountMinor: 2200 });
    expect(builder.getSnapshot().fees![0]).toMatchObject({ amountIncludesTax: true, netMinor: 2000 });
    builder.updateFee(id, { amountIncludesTax: undefined });
    expect(builder.getSnapshot().fees![0]).not.toHaveProperty('amountIncludesTax');
    expect(builder.getSnapshot().fees![0].netMinor).toBe(2200);
  });
});

describe('vendurepos gap 2.10: a charge in its own tax mode, generic', () => {
  it('G1 (f\'): an exclusive store taxes an inclusive fee inside its amount', () => {
    const builder = makeGeneric(false);
    builder.addLine(product(2000));
    const id = builder.addFee({ name: 'Fee', amountMinor: 1100, amountIncludesTax: true });
    const order = builder.getSnapshot();
    expect(order.fees![0]).toMatchObject({ netMinor: 1100, taxMicros: '100000000' });
    expect(order).toMatchObject({ taxMinor: 300, totalMinor: 3300 });
    expect(order.display.fees).toEqual([{ id, name: 'Fee', amountMinor: 1000 }]);
    displayIdentity(order);
  });

  it('G2: an inclusive store adds tax to an exclusive fee', () => {
    const builder = makeGeneric(true);
    const id = builder.addFee({ name: 'Fee', amountMinor: 1000, amountIncludesTax: false });
    const order = builder.getSnapshot();
    expect(order.fees![0].taxMicros).toBe('100000000');
    expect(order.display.fees).toEqual([{ id, name: 'Fee', amountMinor: 1100 }]);
    expect(order.totalMinor).toBe(1100);
    displayIdentity(order);
  });

  it('G3 (f\'\'): the last converted charge takes the display residue', () => {
    const builder = makeGeneric(false);
    builder.addLine(product(1000));
    builder.addFee({ name: 'Fee 1', amountMinor: 5, amountIncludesTax: true });
    builder.addFee({ name: 'Fee 2', amountMinor: 5, amountIncludesTax: true });
    const order = builder.getSnapshot();
    expect(order.fees!.map((fee) => fee.taxMicros)).toEqual(['454545', '454545']);
    expect(order.totalMinor).toBe(1110);
    expect(order.taxMinor).toBe(101);
    expect(order.display.fees!.map((f) => f.amountMinor)).toEqual([5, 4]);
    expect(order.display.subtotalMinor).toBe(1000);
    expect(order.display.subtotalMinor + 9 + order.taxMinor).toBe(order.totalMinor);
    displayIdentity(order);
  });

  it('V1: a mode that is not a boolean is refused', () => {
    expect(() => makeGeneric(false).addFee({ name: 'Fee', amountMinor: 1, amountIncludesTax: 'yes' as never })).toThrow(RangeError);
  });
});

describe('vendurepos gap 2.10: a charge without the key', () => {
  it.each([
    ['WooCommerce', () => make()],
    ['generic', () => makeGeneric(false)],
  ] as const)('A1 (%s): adds no amountIncludesTax', (_path, builder) => {
    const b = builder();
    b.addFee({ name: 'Fee', amountMinor: 1000 });
    expect(b.getSnapshot().fees![0]).not.toHaveProperty('amountIncludesTax');
  });
});
