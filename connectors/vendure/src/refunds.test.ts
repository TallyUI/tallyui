import { describe, expect, it } from 'vitest';
import type { VendureOrder } from './orders';
import { vendureRefundable } from './refunds';

const line: VendureOrder['lines'][number] = {
  id: 'line-1', quantity: 3, orderPlacedQuantity: 3, proratedUnitPrice: 80, proratedUnitPriceWithTax: 100,
  taxRate: 25, productVariant: { id: 'variant-1', name: 'Coffee', sku: 'COFFEE' },
  unitPrice: 100, unitPriceWithTax: 125, linePrice: 300, linePriceWithTax: 375,
  discountedLinePrice: 240, discountedLinePriceWithTax: 300, discounts: [],
};
const refund = {
  id: 'refund-1', total: 120, items: 100, shipping: 20, adjustment: 0,
  state: 'Settled', reason: 'Return', metadata: {}, lines: [{ orderLineId: 'line-1', quantity: 1 }],
};
const payment = {
  id: 'payment-1', method: 'cash', amount: 360, state: 'Settled',
  transactionId: '', createdAt: '2026-01-02T10:00:00.000Z', metadata: {}, refunds: [refund],
};
const order = { lines: [line], shippingWithTax: 60 };

describe('vendureRefundable', () => {
  it('leaves everything refundable with no payments, but has no refundable money', () => {
    expect(vendureRefundable(order)).toStrictEqual({
      lines: [{
        orderLineId: 'line-1', quantity: 3, refundedQuantity: 0, cancelledQuantity: 0,
        refundableQuantity: 3, unitRefundWithTax: 100,
      }],
      shippingWithTax: 60, moneyWithTax: 0,
    });
  });

  it('subtracts a settled partial refund from quantities, shipping and money', () => {
    expect(vendureRefundable({ ...order, payments: [payment] })).toStrictEqual({
      lines: [{
        orderLineId: 'line-1', quantity: 3, refundedQuantity: 1, cancelledQuantity: 0,
        refundableQuantity: 2, unitRefundWithTax: 100,
      }],
      shippingWithTax: 40, moneyWithTax: 240,
    });
  });

  it('counts Pending and custom Manual refunds but excludes Failed refunds', () => {
    const result = vendureRefundable({ ...order, payments: [{ ...payment, refunds: [
      { ...refund, state: 'Pending' },
      { ...refund, id: 'refund-2', state: 'Failed' },
      { ...refund, id: 'refund-3', state: 'Manual' },
    ] }] });
    expect(result.lines[0]).toMatchObject({ refundedQuantity: 2, refundableQuantity: 1 });
    expect(result.shippingWithTax).toBe(20);
    expect(result.moneyWithTax).toBe(120);
  });

  it('only adds Settled payments to money while counting refunds from a Declined payment', () => {
    const result = vendureRefundable({ ...order, payments: [
      { ...payment, refunds: [] },
      { ...payment, id: 'payment-2', state: 'Declined', amount: 200 },
    ] });
    expect(result.moneyWithTax).toBe(360);
    expect(result.shippingWithTax).toBe(40);
    expect(result.lines[0]).toMatchObject({ refundedQuantity: 1, refundableQuantity: 2 });
  });

  it('clamps each over-refunded payment and over-refunded shipping at zero', () => {
    const result = vendureRefundable({ ...order, shippingWithTax: 10, payments: [
      { ...payment, amount: 100 },
      { ...payment, id: 'payment-2', amount: 200, refunds: [] },
    ] });
    expect(result.moneyWithTax).toBe(200);
    expect(result.shippingWithTax).toBe(0);
  });

  it('reports cancelled quantity separately from the current refundable quantity', () => {
    expect(vendureRefundable({ ...order, lines: [{ ...line, quantity: 1 }] }).lines).toStrictEqual([{
      orderLineId: 'line-1', quantity: 1, refundedQuantity: 0, cancelledQuantity: 2,
      refundableQuantity: 1, unitRefundWithTax: 100,
    }]);
  });

  it('reports no cancelled quantity when the line grew after placement', () => {
    expect(vendureRefundable({ ...order, lines: [{ ...line, quantity: 5, orderPlacedQuantity: 3 }] }).lines).toStrictEqual([{
      orderLineId: 'line-1', quantity: 5, refundedQuantity: 0, cancelledQuantity: 0,
      refundableQuantity: 5, unitRefundWithTax: 100,
    }]);
  });

  it('ignores unknown refund line ids and preserves the order of the order lines', () => {
    const result = vendureRefundable({ ...order, lines: [{ ...line, id: 'line-2' }, line], payments: [
      { ...payment, refunds: [{ ...refund, lines: [
        { orderLineId: 'unknown', quantity: 100 }, ...refund.lines,
      ] }] },
    ] });
    expect(result.lines).toStrictEqual([
      { orderLineId: 'line-2', quantity: 3, refundedQuantity: 0, cancelledQuantity: 0, refundableQuantity: 3, unitRefundWithTax: 100 },
      { orderLineId: 'line-1', quantity: 3, refundedQuantity: 1, cancelledQuantity: 0, refundableQuantity: 2, unitRefundWithTax: 100 },
    ]);
  });

  it('handles missing orderPlacedQuantity, missing refunds and a NaN payment amount', () => {
    const { orderPlacedQuantity, ...readLine } = line;
    const { refunds, ...readPayment } = payment;
    const malformed = { ...order, lines: [readLine], payments: [{ ...readPayment, amount: NaN }] };
    const result = vendureRefundable(malformed as unknown as Parameters<typeof vendureRefundable>[0]);
    expect(result.lines[0]).toMatchObject({ cancelledQuantity: 0, refundedQuantity: 0, refundableQuantity: 3 });
    expect(result.moneyWithTax).toBe(0);
    expect(result.shippingWithTax).toBe(60);
  });

  it.each([undefined, NaN, Infinity, -Infinity])('counts malformed numeric fields (%s) as zero', value => {
    const malformed = {
      lines: [{ ...line, quantity: value, orderPlacedQuantity: value, proratedUnitPriceWithTax: value }],
      shippingWithTax: value,
      payments: [{ ...payment, amount: value, refunds: [{
        ...refund, total: value, shipping: value, lines: [{ orderLineId: 'line-1', quantity: value }],
      }] }],
    };
    expect(vendureRefundable(malformed as unknown as Parameters<typeof vendureRefundable>[0])).toStrictEqual({
      lines: [{
        orderLineId: 'line-1', quantity: 0, refundedQuantity: 0, cancelledQuantity: 0,
        refundableQuantity: 0, unitRefundWithTax: 0,
      }],
      shippingWithTax: 0, moneyWithTax: 0,
    });
  });

  it('adds refunds for the same line across two payments and clamps refundable quantity at zero', () => {
    const result = vendureRefundable({ ...order, lines: [{ ...line, quantity: 1 }], payments: [
      { ...payment, amount: 180 },
      { ...payment, id: 'payment-2', amount: 180, refunds: [{ ...refund, id: 'refund-2' }] },
    ] });
    expect(result.lines[0]).toMatchObject({ quantity: 1, refundedQuantity: 2, refundableQuantity: 0 });
    expect(result.shippingWithTax).toBe(20);
    expect(result.moneyWithTax).toBe(120);
  });
});
