import { describe, expect, it, vi } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from './finalize';
import { uuidv7 } from './uuidv7';

function sale() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2 });
  builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
  return builder;
}

describe('finalizeOrder', () => {
  it('copies a cash sale into a pending document without mutating or sharing input objects', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000, reference: 'drawer' });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
    builder.setNote('Sale note');
    const input = builder.getSnapshot();
    const before = structuredClone(input);
    const now = new Date('2026-09-23T12:00:00.000Z');
    const order = finalizeOrder(input, { now, registerId: 'r1', cashierRef: 'staff1' });
    expect(input).toStrictEqual(before);
    expect(order).toMatchObject({
      currency: 'EUR', pricesIncludeTax: false, subtotalMinor: 2900, discountMinor: 0,
      taxMinor: 551, totalMinor: 3451, syncStatus: 'pending', createdAt: now.toISOString(), updatedAt: now.toISOString(),
      registerId: 'r1', cashierRef: 'staff1', note: 'Sale note', customer: input.customer,
      payments: [{ method: 'cash', amountMinor: 3451, tenderedMinor: 5000, changeMinor: 1549, reference: 'drawer' }],
    });
    expect(order.lines[0]).toMatchObject({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', quantity: 2,
      unitPriceMinor: 850, discountMinor: 0, netMinor: 1700, taxLines: input.lineItems[0].taxLines });
    const ids = [order.id, ...order.lines.map((line) => line.id), ...order.payments.map((payment) => payment.id), order.commandId];
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
    expect(order.customer).not.toBe(input.customer);
    expect(order.lines[0].taxLines[0]).not.toBe(input.lineItems[0].taxLines[0]);
    expect(order.payments[0]).not.toBe(input.payments[0]);
  });

  it('allocates mixed payment change to cash and omits empty metadata', () => {
    const builder = sale();
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    const newId = vi.fn(() => uuidv7());
    const order = finalizeOrder(builder.getSnapshot(), { newId });
    expect(newId).toHaveBeenCalledTimes(6);
    expect([order.id, ...order.lines.map((l) => l.id), ...order.payments.map((p) => p.id), order.commandId])
      .toEqual(newId.mock.results.map((result) => result.value));
    expect(order.payments).toEqual([
      { id: order.payments[0].id, method: 'external', amountMinor: 1000, reference: 'terminal' },
      { id: order.payments[1].id, method: 'cash', amountMinor: 2451, tenderedMinor: 3000, changeMinor: 549 },
    ]);
    expect(order.payments.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(3451);
    expect(order.customer).toBeNull();
    for (const key of ['note', 'registerId', 'cashierRef']) expect(order).not.toHaveProperty(key);
  });

  it('allocates change backwards across cash payments, skipping external payments', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    builder.addPayment({ method: 'external', amountMinor: 1000 });
    builder.addPayment({ method: 'cash', amountMinor: 1000 });
    const order = finalizeOrder(builder.getSnapshot());
    expect(order.payments.map(({ amountMinor, changeMinor }) => [amountMinor, changeMinor])).toEqual([[2451, 549], [1000, undefined], [0, 1000]]);
  });

  it('records zero change when paid exactly', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 3451 });
    expect(finalizeOrder(builder.getSnapshot()).payments[0]).toMatchObject({ amountMinor: 3451, tenderedMinor: 3451, changeMinor: 0 });
  });

  it.each(['no lines', 'underpaid', 'unsupported payment method voucher', 'change exceeds cash', 'discounts not supported yet', 'payments do not reconcile'])(
    'rejects %s', (reason) => {
      const builder = sale();
      if (reason === 'no lines') builder.clear();
      else if (reason === 'unsupported payment method voucher') builder.addPayment({ method: 'voucher', amountMinor: 3451 });
      else if (reason === 'change exceeds cash') {
        builder.addPayment({ method: 'external', amountMinor: 4000 });
        builder.addPayment({ method: 'cash', amountMinor: 0 });
      } else if (reason === 'discounts not supported yet') {
        builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'fixed', value: 100 });
        builder.addPayment({ method: 'cash', amountMinor: 5000 });
      }
      const order = builder.getSnapshot();
      if (reason === 'payments do not reconcile') order.paidMinor = order.totalMinor;
      expect(() => finalizeOrder(order)).toThrow(`finalize: ${reason}`);
    },
  );
});
