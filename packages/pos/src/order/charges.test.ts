import { describe, expect, it } from 'vitest';
import type { TaxContext } from '../tax/types';
import { finalizeOrder } from '../pos-order/finalize';
import { createOrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';

const context = (pricesIncludeTax: boolean): TaxContext => ({
  pricesIncludeTax,
  getTaxRatePpm: (taxClass) => taxClass === 'zero' ? 0 : 200000,
  getTaxRateCode: (taxClass) => taxClass === 'zero' ? 'Zero' : 'VAT',
});
const product = { productId: 'p', name: 'Product', unitPrice: { amount: 1200, currency: 'EUR' } };

describe.each([false, true])('ADR-075 charges (inclusive: %s)', (inclusive) => {
  const make = () => createOrderBuilder({ currency: 'EUR', taxContext: context(inclusive) });

  it.each(['addFee', 'addShipping'] as const)('%s adds net and tax, leaving the product subtotal alone', (add) => {
    const builder = make();
    builder.addLine(product);
    const before = builder.getSnapshot();
    const id = builder[add]({ name: 'Charge', amountMinor: 120 });
    const order = builder.getSnapshot();
    expect(order.subtotalMinor).toBe(before.subtotalMinor);
    expect(order.discountMinor).toBe(0);
    expect(order.taxMinor).toBe(inclusive ? 220 : 264);
    expect(order.totalMinor).toBe(inclusive ? 1320 : 1584);
    expect([...(order.fees ?? []), ...(order.shipping ?? [])]).toEqual([{
      id, name: 'Charge', amountMinor: 120, taxClass: undefined, taxStatus: 'taxable',
      ...(add === 'addShipping' ? { methodId: undefined } : {}),
      netMinor: 120, taxMicros: inclusive ? 20000000 : 24000000,
      taxLines: [{ code: 'VAT', ratePpm: 200000, taxMicros: inclusive ? '20000000' : '24000000' }],
    }]);
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    expect(builder.getSnapshot().balanceDueMinor).toBe(order.totalMinor - 100);
    builder.addPayment({ method: 'cash', amountMinor: order.totalMinor });
    expect(builder.getSnapshot()).toMatchObject({ paidMinor: order.totalMinor + 100, balanceDueMinor: 0, changeDueMinor: 100 });
  });

  it.each(['addFee', 'addShipping'] as const)('%s respects tax status and class', (add) => {
    const builder = make();
    builder[add]({ name: 'Untaxed', amountMinor: 120, taxStatus: 'none' });
    builder[add]({ name: 'Zero class', amountMinor: 240, taxClass: 'zero' });
    expect(builder.getSnapshot()).toMatchObject({ subtotalMinor: 0, totalMinor: 360, taxMinor: 0 });
    const charges = [...(builder.getSnapshot().fees ?? []), ...(builder.getSnapshot().shipping ?? [])];
    expect(charges.map((charge) => charge.taxLines)).toEqual([
      [{ code: 'VAT', ratePpm: 0, taxMicros: '0' }], [{ code: 'Zero', ratePpm: 0, taxMicros: '0' }],
    ]);
  });

  it('allocates a 10% discount only over product lines and keeps the exact display identity', () => {
    const builder = make();
    builder.addLine(product);
    builder.addLine({ ...product, productId: 'p2', unitPrice: { amount: 600, currency: 'EUR' } });
    const fee = builder.addFee({ name: 'Bag', amountMinor: 120 });
    const shipping = builder.addShipping({ name: 'Delivery', amountMinor: 240, methodId: 'post' });
    const before = builder.getSnapshot();
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    const order = builder.getSnapshot();
    expect(order.fees).toEqual(before.fees);
    expect(order.shipping).toEqual(before.shipping);
    expect(order.lineItems.map((line) => line.orderDiscountMinor)).toEqual([120, 60]);
    expect(order).toMatchObject({ subtotalMinor: inclusive ? 1350 : 1620, discountMinor: 180,
      taxMinor: inclusive ? 330 : 396, totalMinor: inclusive ? 1980 : 2376 });
    expect(order.display).toEqual({
      taxInclusive: inclusive, subtotalMinor: 1800, discountMinor: 180,
      taxMinor: inclusive ? 330 : 396, totalMinor: inclusive ? 1980 : 2376, orderDiscountMinor: 180,
      lines: order.lineItems.map((line) => ({ lineId: line.id, amountMinor: line.unitPriceMinor, discounts: [] })),
      fees: [{ id: fee, name: 'Bag', amountMinor: 120 }], shipping: [{ id: shipping, name: 'Delivery', amountMinor: 240 }],
    });
    const d = order.display;
    expect(d.subtotalMinor - d.discountMinor + d.fees![0].amountMinor + d.shipping![0].amountMinor
      + (inclusive ? 0 : d.taxMinor)).toBe(d.totalMinor);
  });

  it('recomputes after updates and removals, retaining shipping method metadata', () => {
    const builder = make();
    const fee = builder.addFee({ name: 'Bag', amountMinor: 120 });
    const shipping = builder.addShipping({ name: 'Delivery', amountMinor: 240, methodId: 'post' });
    builder.updateFee(fee, { name: 'Service', amountMinor: 360, taxClass: 'zero' });
    builder.updateShipping(shipping, { amountMinor: 120, methodId: 'courier', taxStatus: 'none' });
    expect(builder.getSnapshot()).toMatchObject({ totalMinor: 480, taxMinor: 0,
      fees: [{ id: fee, name: 'Service', amountMinor: 360, taxClass: 'zero' }],
      shipping: [{ id: shipping, methodId: 'courier', taxStatus: 'none' }] });
    builder.updateFee(fee, { taxClass: undefined });
    builder.updateShipping(shipping, { taxStatus: 'taxable' });
    expect(builder.getSnapshot()).toMatchObject({ totalMinor: inclusive ? 480 : 576, taxMinor: inclusive ? 80 : 96 });
    builder.removeFee(fee);
    builder.removeShipping(shipping);
    expect(builder.getSnapshot()).toMatchObject({ totalMinor: 0, taxMinor: 0 });
    expect(builder.getSnapshot()).not.toHaveProperty('fees');
    expect(builder.getSnapshot()).not.toHaveProperty('shipping');
  });

  it.each([{ amountMinor: -1 }, { amountMinor: 1.5 }, { name: '' }])('refuses invalid adds and updates: %j', (patch) => {
    const builder = make();
    const valid = { name: 'Charge', amountMinor: 120 };
    const fee = builder.addFee(valid), shipping = builder.addShipping(valid);
    const before = builder.getSnapshot();
    expect(() => builder.addFee({ ...valid, ...patch })).toThrow(RangeError);
    expect(() => builder.addShipping({ ...valid, ...patch })).toThrow(RangeError);
    expect(() => builder.updateFee(fee, patch)).toThrow(RangeError);
    expect(() => builder.updateShipping(shipping, patch)).toThrow(RangeError);
    expect(builder.getSnapshot()).toEqual(before);
  });

  it('refuses unknown ids and clears both charge arrays', () => {
    const builder = make();
    expect(() => builder.updateFee('missing', {})).toThrow('Unknown fee missing');
    expect(() => builder.removeFee('missing')).toThrow('Unknown fee missing');
    expect(() => builder.updateShipping('missing', {})).toThrow('Unknown shipping missing');
    expect(() => builder.removeShipping('missing')).toThrow('Unknown shipping missing');
    builder.addFee({ name: 'Bag', amountMinor: 120 });
    builder.addShipping({ name: 'Delivery', amountMinor: 240 });
    builder.clear();
    const cleared = builder.getSnapshot();
    expect(cleared).toMatchObject({ totalMinor: 0, taxMinor: 0, display: { totalMinor: 0 } });
    for (const key of ['fees', 'shipping']) {
      expect(cleared).not.toHaveProperty(key);
      expect(cleared.display).not.toHaveProperty(key);
    }
  });

  it('never merges custom lines and discounts a tax-free custom line like any product', () => {
    const builder = make();
    const first = builder.addLine({ ...product, custom: true, taxStatus: 'none' });
    const second = builder.addLine({ ...product, custom: true, taxStatus: 'none' });
    builder.addLine({ ...product, taxStatus: 'none' });
    builder.addLine({ ...product, custom: true, taxStatus: 'none' });
    expect(first).not.toBe(second);
    expect(builder.getSnapshot().lineItems).toHaveLength(4);
    builder.applyLineDiscount(first, { type: 'fixed', value: 200 });
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    expect(builder.getSnapshot()).toMatchObject({ totalMinor: 4140, taxMinor: 0,
      lineItems: [{ custom: true, productId: 'p', taxStatus: 'none', netMinor: 900, orderDiscountMinor: 100, taxMicros: '0' },
        { custom: true, netMinor: 1080 }, { netMinor: 1080 }, { custom: true, netMinor: 1080 }] });
  });

  it('restores a legacy draft without charges', () => {
    const builder = make();
    builder.addLine(product);
    const saved = JSON.parse(JSON.stringify(builder.getSnapshot()));
    delete saved.fees; delete saved.shipping;
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext: context(inclusive) }).getSnapshot();
    expect(restored).toMatchObject({ totalMinor: saved.totalMinor, taxMinor: saved.taxMinor });
    for (const key of ['fees', 'shipping']) {
      expect(restored).not.toHaveProperty(key);
      expect(restored.display).not.toHaveProperty(key);
    }
  });

  it('omits empty charge keys and restores the original serialized shape after removal', () => {
    const builder = make();
    builder.addLine(product);
    const before = builder.getSnapshot();
    for (const key of ['fees', 'shipping']) {
      expect(before).not.toHaveProperty(key);
      expect(before.display).not.toHaveProperty(key);
    }
    const fee = builder.addFee({ name: 'Bag', amountMinor: 0 });
    expect(builder.getSnapshot().fees).toHaveLength(1);
    expect(builder.getSnapshot().display.fees).toHaveLength(1);
    expect(builder.getSnapshot()).not.toHaveProperty('shipping');
    expect(builder.getSnapshot().display).not.toHaveProperty('shipping');
    const shipping = builder.addShipping({ name: 'Delivery', amountMinor: 120 });
    builder.removeFee(fee);
    expect(builder.getSnapshot()).not.toHaveProperty('fees');
    expect(builder.getSnapshot().display).not.toHaveProperty('fees');
    expect(builder.getSnapshot().shipping).toHaveLength(1);
    expect(builder.getSnapshot().display.shipping).toHaveLength(1);
    builder.removeShipping(shipping);
    expect(JSON.stringify({ ...builder.getSnapshot(), updatedAt: before.updatedAt })).toBe(JSON.stringify(before));
  });
});

it.each(['per_order', 'per_line_items', 'per_rate_group_items'] as const)('rounds charges with products using %s', (granularity) => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: {
    ...context(false), rounding: { granularity, mode: 'half_away_from_zero' },
  } });
  builder.addLine({ ...product, unitPrice: { amount: 2, currency: 'EUR' } });
  builder.addFee({ name: 'Bag', amountMinor: 2 });
  builder.addShipping({ name: 'Delivery', amountMinor: 2 });
  expect(builder.getSnapshot()).toMatchObject({ subtotalMinor: 2, taxMinor: granularity === 'per_line_items' ? 0 : 1,
    totalMinor: granularity === 'per_line_items' ? 6 : 7 });
});

it('assigns converted-line residue with charges present', () => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: context(false) });
  builder.addLine({ ...product, unitPrice: { amount: 3, currency: 'EUR', taxInclusive: true } });
  builder.addFee({ name: 'Bag', amountMinor: 3 });
  builder.addShipping({ name: 'Delivery', amountMinor: 3 });
  expect(builder.getSnapshot().display).toMatchObject({ subtotalMinor: 2, discountMinor: 0, taxMinor: 2, totalMinor: 10,
    lines: [{ amountMinor: 2 }], fees: [{ amountMinor: 3 }], shipping: [{ amountMinor: 3 }] });
});

it.each(['fee', 'shipping', 'custom'])('refuses to finalize a %s before any other validation', (kind) => {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: context(false) });
  if (kind === 'fee') builder.addFee({ name: 'Bag', amountMinor: 0 });
  if (kind === 'shipping') builder.addShipping({ name: 'Delivery', amountMinor: 0 });
  if (kind === 'custom') builder.addLine({ ...product, custom: true });
  expect(() => finalizeOrder(builder.getSnapshot())).toThrow(
    'finalize: fees, shipping and custom lines need order.create version 5, which this release does not send yet');
});
