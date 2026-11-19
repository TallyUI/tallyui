import { describe, expect, it } from 'vitest';
import type { TaxContext } from '../tax/types';
import { createOrderBuilder, type OrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order } from './types';

const taxContext: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 100000, getTaxRateCode: () => 'VAT' };
const product = (productId: string) => ({ productId, name: `Product ${productId}`, unitPrice: { amount: 1000, currency: 'EUR' } });
const later = () => new Promise((resolve) => setTimeout(resolve, 5)); // the clock moves on before a restore

/** Every id on the order, by kind, in order. */
function ids(order: Order) {
  return {
    lines: order.lineItems.map((line) => line.id),
    lineDiscounts: order.lineItems.flatMap((line) => line.discounts.map((d) => d.id)),
    fees: (order.fees ?? []).map((fee) => fee.id),
    shipping: (order.shipping ?? []).map((charge) => charge.id),
    orderDiscounts: order.discounts.map((d) => d.id),
    payments: order.payments.map((payment) => payment.id),
  };
}
const allIds = (order: Order) => Object.values(ids(order)).flat();

/** Two lines of one product kept apart, a line discount, a fee, shipping, an order discount and a cash payment. */
function sale(): OrderBuilder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext });
  const first = builder.addLine({ ...product('p'), separate: true });
  builder.addLine({ ...product('p'), separate: true, quantity: 2 });
  builder.applyLineDiscount(first, { type: 'percentage', value: 10 });
  builder.addFee({ name: 'Bag', amountMinor: 50 });
  builder.addShipping({ name: 'Post', amountMinor: 700, methodId: 'flat_rate' });
  builder.applyOrderDiscount({ type: 'fixed', value: 300 });
  builder.addPayment({ method: 'cash', amountMinor: 500 });
  return builder;
}

describe('restoreOrderDraft keeps every id and createdAt (#742)', () => {
  it('T3a: keeps the ids of every line, discount, fee, shipping line and payment, and createdAt', async () => {
    const saved = sale().getSnapshot();
    expect(new Set(allIds(saved)).size).toBe(7);
    await later();
    const restored = restoreOrderDraft(saved, { currency: 'EUR', taxContext }).getSnapshot();
    expect(ids(restored)).toEqual(ids(saved));
    expect(restored.createdAt).toBe(saved.createdAt);
    expect(restored.totalMinor).toBe(saved.totalMinor);
  });

  it('T3b: a line added after the restore gets an id not in the restored set', () => {
    const builder = restoreOrderDraft(sale().getSnapshot(), { currency: 'EUR', taxContext });
    const kept = allIds(builder.getSnapshot());
    const added = builder.addLine(product('q'));
    expect(kept).not.toContain(added);
    expect(builder.getSnapshot().lineItems.map((line) => line.id)).toContain(added);
  });

  const adds: Array<[string, (builder: OrderBuilder, id: string) => unknown]> = [
    ['addLine', (builder, id) => builder.addLine({ ...product('q'), id })],
    ['addFee', (builder, id) => builder.addFee({ name: 'Tip', amountMinor: 100, id })],
    ['addShipping', (builder, id) => builder.addShipping({ name: 'Courier', amountMinor: 900, id })],
    ['applyLineDiscount', (builder, id) => builder.applyLineDiscount(builder.getSnapshot().lineItems[1].id, { type: 'fixed', value: 100, id })],
    ['applyOrderDiscount', (builder, id) => builder.applyOrderDiscount({ type: 'percentage', value: 5, id })],
    ['addPayment', (builder, id) => builder.addPayment({ method: 'cash', amountMinor: 100, id })],
  ];
  it.each(adds)('T3c: %s with an id already on the order throws and changes nothing', (_name, add) => {
    const builder = sale();
    const before = builder.getSnapshot();
    for (const id of allIds(before)) {
      expect(() => add(builder, id)).toThrow(new RangeError(`Id ${id} is already on the order`));
      expect(builder.getSnapshot()).toEqual(before);
    }
  });

  it('T3d: a saved order without createdAt restores with a fresh one', async () => {
    const { createdAt: _createdAt, ...rest } = sale().getSnapshot();
    const startedAt = Date.now();
    await later();
    const restored = restoreOrderDraft(rest as Order, { currency: 'EUR', taxContext }).getSnapshot();
    expect(Date.parse(restored.createdAt)).toBeGreaterThan(startedAt);
    expect(ids(restored).lines).toHaveLength(2);
  });
});
