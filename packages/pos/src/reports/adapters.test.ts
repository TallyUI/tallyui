import { expect, it } from 'vitest';
import type { StoreOrder, TaxRounding } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from '../pos-order/finalize';
import type { PosRefund } from '../refund/pos-refund';
import { roundMicrosToMinor } from '../tax/exact';
import { reportOrderFromPosOrder, reportOrderFromStoreOrder, reportRefundFromPosRefund } from './adapters';

function finalizedSale(pricesIncludeTax: boolean, rounding?: TaxRounding, charges = false) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax, rounding } });
  const lineId = builder.addLine({ productId: 'p1', name: 'Espresso', sku: 'ESP-001', unitPrice: { amount: 450, currency: 'USD' }, quantity: 2 });
  builder.addLine({ productId: 'p2', name: 'Muffin', sku: 'MUF-001', unitPrice: { amount: 300, currency: 'USD' } });
  builder.applyLineDiscount(lineId, { type: 'fixed', value: 50, label: 'Regular' });
  builder.applyOrderDiscount({ type: 'percentage', value: 10, label: 'Staff' });
  if (charges) {
    builder.addLine({ productId: 'p3', name: 'Bag', sku: 'BAG', unitPrice: { amount: 110, currency: 'USD', taxInclusive: !pricesIncludeTax } });
    builder.addFee({ name: 'Handling', amountMinor: 23 });
    builder.addShipping({ name: 'Courier', amountMinor: 650 });
  }
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor + 37 });
  const order = builder.getSnapshot();
  let next = 0;
  const posOrder = finalizeOrder(order, {
    capabilities: { orderCreate: 6 }, now: new Date('2026-10-14T09:30:00.000Z'), newId: () => `id-${++next}`,
  });
  return { order, posOrder };
}

it.each([false, true])('maps a finalized PosOrder', (pricesIncludeTax) => {
  const { order, posOrder } = finalizedSale(pricesIncludeTax);
  const result = reportOrderFromPosOrder(posOrder);
  expect(result).toMatchObject({
    id: posOrder.id, at: posOrder.createdAt, totalMinor: posOrder.totalMinor, taxMinor: posOrder.taxMinor,
    discountMinor: posOrder.discountMinor, needsPayment: false, refunds: [],
  });
  expect(result.payments).toEqual([{ method: 'cash', amountMinor: posOrder.totalMinor }]);
  expect(result.payments.reduce((sum, payment) => sum + payment.amountMinor, 0)).toBe(posOrder.totalMinor);
  expect(posOrder.payments[0].tenderedMinor).toBe(posOrder.totalMinor + 37);
  expect(result.lines).toHaveLength(2);
  result.lines.forEach((line, index) => {
    const source = order.lineItems[index];
    const tax = roundMicrosToMinor(BigInt(source.taxMicros));
    const gross = source.netMinor + (source.taxInclusive ? 0 : tax);
    expect(line.netMinor + line.taxMinor).toBe(gross);
    expect(line.taxMinor).toBe(tax);
    expect(line).toMatchObject({ key: source.productId, name: source.name, quantity: source.quantity });
    if (!pricesIncludeTax) expect(line.netMinor).toBe(posOrder.lines[index].netMinor);
  });
  expect(result.taxes.reduce((sum, tax) => sum + tax.taxMinor, 0)).toBe(posOrder.taxMinor);
});

it('takes a WooCommerce line net as already exclusive of tax', () => {
  for (const pricesIncludeTax of [false, true]) {
    for (const roundAtSubtotal of [false, true]) {
      const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
        pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal }, getTaxRatePpm: () => 200000,
        getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
      } });
      builder.addLine({ productId: '11', name: 'Tea', sku: 'TEA', unitPrice: { amount: 333, currency: 'GBP' }, quantity: 3 });
      builder.addLine({ productId: '12', name: 'Cake', sku: 'CAKE', unitPrice: { amount: 457, currency: 'GBP' } });
      builder.applyOrderDiscount({ type: 'percentage', value: 10, label: 'Staff' });
      builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
      const order = builder.getSnapshot();
      const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 6 } });
      expect(posOrder.lines.every((line) => line.netMicros !== undefined)).toBe(true);
      const result = reportOrderFromPosOrder(posOrder);
      result.lines.forEach((line, index) => {
        expect(line.netMinor).toBe(posOrder.lines[index].netMinor);
        expect(Math.abs(line.netMinor + line.taxMinor - order.lineItems[index].totalMinor)).toBeLessThanOrEqual(1);
      });
    }
  }
});

it('falls back to taxLinesByRate when a PosOrder has no taxByRate', () => {
  for (const pricesIncludeTax of [false, true]) {
    const { posOrder } = finalizedSale(pricesIncludeTax);
    const { taxByRate: _taxByRate, ...legacy } = posOrder;
    const result = reportOrderFromPosOrder(legacy);
    expect(result.taxes.reduce((sum, tax) => sum + tax.taxMinor, 0)).toBe(posOrder.taxMinor);
    expect(result.taxes).toEqual(reportOrderFromPosOrder(posOrder).taxes);
  }
});

it('includes fees and shipping in fallback taxes and respects each line tax mode', () => {
  const roundings: TaxRounding[] = [
    { granularity: 'per_order', mode: 'half_away_from_zero' },
    { granularity: 'woocommerce', roundAtSubtotal: false },
    { granularity: 'woocommerce', roundAtSubtotal: true },
  ];
  for (const pricesIncludeTax of [false, true]) {
    for (const rounding of roundings) {
      const { posOrder } = finalizedSale(pricesIncludeTax, rounding, true);
      const { taxByRate: _taxByRate, ...legacy } = posOrder;
      const result = reportOrderFromPosOrder(legacy);
      expect(result.lines).toHaveLength(3);
      expect(result.taxes).toEqual(reportOrderFromPosOrder(posOrder).taxes);
      expect(result.taxes.reduce((sum, tax) => sum + tax.taxMinor, 0)).toBe(posOrder.taxMinor);
      result.lines.forEach((line, index) => {
        const source = posOrder.lines[index];
        expect(line.netMinor).toBe(posOrder.taxRounding.granularity === 'woocommerce' && source.netMicros !== undefined
          ? source.netMinor
          : (source.taxInclusive ?? pricesIncludeTax) ? source.netMinor - line.taxMinor : source.netMinor);
      });
    }
  }
});

it('joins a unit cost and category, and leaves a missing cost absent', () => {
  const { posOrder } = finalizedSale(false);
  const seen: Array<{ productId?: string; variantId?: string }> = [];
  const result = reportOrderFromPosOrder(posOrder, (ids) => {
    seen.push(ids);
    return ids.productId === 'p1' ? { unitCostMinor: 100, category: { id: 'c1', name: 'Coffee' } } : undefined;
  });
  expect(seen).toEqual([{ productId: 'p1' }, { productId: 'p2' }]);
  expect(result.lines[0]).toMatchObject({ costMinor: 100 * posOrder.lines[0].quantity, category: { id: 'c1', name: 'Coffee' } });
  expect('costMinor' in result.lines[1]).toBe(false);
  expect('category' in result.lines[1]).toBe(false);
  for (const unitCostMinor of [undefined, null, NaN, Infinity]) {
    expect('costMinor' in reportOrderFromPosOrder(posOrder, () => ({ unitCostMinor })).lines[0]).toBe(false);
  }
  expect(reportOrderFromPosOrder(posOrder, () => ({ unitCostMinor: 0 })).lines[0].costMinor).toBe(0);
  expect(reportOrderFromPosOrder(posOrder, () => ({ unitCostMinor: 100.3 })).lines[0].costMinor).toBe(201);
});

const storeOrder: StoreOrder = {
  id: 's1', reference: '1001', status: 'refunded', placedAt: '2026-11-02T10:00:00.000Z',
  currency: 'USD', pricesIncludeTax: true, customer: null,
  lines: [
    { id: 'l1', productId: 'p1', variantId: 'v1', name: 'Coffee', quantity: 2, subtotalMinor: 1000,
      subtotalTaxMinor: 100, totalMinor: 900, taxMinor: 90 },
    { id: 'l2', name: 'Muffin', quantity: 1, subtotalMinor: 500, subtotalTaxMinor: 50, totalMinor: 500, taxMinor: 50 },
  ],
  fees: [], shipping: [], coupons: [], discountMinor: 100, discountTaxMinor: 10, taxMinor: 140, totalMinor: 1540,
  payments: [{ method: 'cash', title: 'Cash', amountMinor: 1000 }, { method: 'card', amountMinor: 540 }],
  taxLines: [{ ratePpm: 100000, code: 'vat', label: 'VAT', amountMinor: 140 }],
  refunds: [{ id: 'r1', amountMinor: 250, reason: 'Returned' }],
};

it('maps a StoreOrder', () => {
  const result = reportOrderFromStoreOrder(storeOrder);
  expect(result).toStrictEqual({
    id: 's1', at: storeOrder.placedAt, totalMinor: 1540, taxMinor: 140, discountMinor: 100,
    lines: [
      { key: 'v1', name: 'Coffee', quantity: 2, netMinor: 900, taxMinor: 90 },
      { key: 'Muffin', name: 'Muffin', quantity: 1, netMinor: 500, taxMinor: 50 },
    ],
    payments: [{ method: 'cash', label: 'Cash', amountMinor: 1000 }, { method: 'card', amountMinor: 540 }],
    taxes: [{ ratePpm: 100000, code: 'vat', label: 'VAT', taxMinor: 140, netMinor: null }],
    refunds: [{ id: 'r1', amountMinor: 250 }],
  });
  expect('needsPayment' in result).toBe(false);
  const seen: Array<{ productId?: string; variantId?: string }> = [];
  const joined = reportOrderFromStoreOrder(storeOrder, (ids) => {
    seen.push(ids);
    return ids.variantId === 'v1' ? { unitCostMinor: 100, category: { id: 'c1', name: 'Coffee' } } : undefined;
  });
  expect(seen).toEqual([{ productId: 'p1', variantId: 'v1' }, {}]);
  expect(joined.lines[0]).toMatchObject({ costMinor: 200, category: { id: 'c1', name: 'Coffee' } });
  expect('costMinor' in joined.lines[1]).toBe(false);
});

it('maps only an applied PosRefund, dated when it was made', () => {
  const refund: PosRefund = {
    id: 'r1', commandId: 'cmd1', orderId: 'o1', sessionId: 's1', registerId: 't1', status: 'applied',
    createdAt: '2026-11-04T09:00:00.000Z', updatedAt: '2026-11-04T10:00:00.000Z',
    envelope: {
      id: 'cmd1', type: 'order.refund', version: 1, deviceId: 'd1', attempt: 1, createdAt: '2026-11-04T09:00:00.000Z',
      payload: {
        clientRefundId: 'r1', orderId: 'o1', lines: [], shippingMinor: 0, adjustmentMinor: 500, totalMinor: 500,
        destination: 'cash', reason: 'Return', registerId: 't1', sessionId: 's1', createdAt: '2026-11-04T08:59:00.000Z',
      },
    },
    result: { totalMinor: 450, byMethod: { cash: 450 }, refunds: [] },
  };
  expect(reportRefundFromPosRefund(refund)).toEqual({ id: 'r1', orderId: 'o1', at: refund.envelope.payload.createdAt, amountMinor: 450 });
  for (const status of ['pending', 'rejected', 'unsent'] as const) expect(reportRefundFromPosRefund({ ...refund, status })).toBeUndefined();
  const { result: _result, ...withoutResult } = refund;
  expect(reportRefundFromPosRefund(withoutResult)?.amountMinor).toBe(500);
  for (const totalMinor of [NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    expect(reportRefundFromPosRefund({ ...refund, result: { totalMinor, byMethod: {}, refunds: [] } })?.amountMinor).toBe(500);
  }
  expect(reportRefundFromPosRefund({ ...refund, envelope: { ...refund.envelope, payload: { ...refund.envelope.payload, createdAt: '' } } })?.at)
    .toBe(refund.createdAt);
});
