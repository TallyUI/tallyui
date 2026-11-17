import { describe, it, expect, vi } from 'vitest';
import { createOrderBuilder, LOCKED_PAYMENT } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order, StoreOrderRef } from './types';

const taxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false };
const options = { currency: 'EUR', taxContext };
const storeOrder: StoreOrderRef = { id: '41', revision: 'sha256:a', uuid: 'u-1' };
const line = { productId: 'coffee', name: 'Coffee', unitPrice: { amount: 1000, currency: 'EUR' } };

describe('store ids on reopened carts', () => {
  it('a reopened cart carries its store order on every snapshot until clear()', () => {
    const builder = createOrderBuilder({ ...options, storeOrder });
    const snapshots: Order[] = [];
    const subscription = builder.order$.subscribe((snap) => snapshots.push(snap));
    expect(builder.getSnapshot().storeOrder).toEqual(storeOrder);
    builder.addLine(line);
    builder.setNote('Reopened');
    builder.addPayment({ method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true });
    expect(snapshots).toHaveLength(4);
    for (const snap of snapshots) expect(snap.storeOrder).toEqual(storeOrder);

    builder.clear();
    const snap = builder.getSnapshot();
    expect('storeOrder' in snap).toBe(false);
    expect(snap.payments).toEqual([]);
    builder.addLine(line);
    expect('storeOrder' in builder.getSnapshot()).toBe(false);
    expect('storeOrder' in createOrderBuilder(options).getSnapshot()).toBe(false);
    subscription.unsubscribe();
  });

  it('a line with a store id is never merged, and keeps its id', () => {
    const builder = createOrderBuilder(options);
    const firstId = builder.addLine({ ...line, storeLineId: '7' });
    const secondId = builder.addLine({ ...line, storeLineId: '8' });
    expect(builder.getSnapshot().lineItems).toMatchObject([
      { id: firstId, quantity: 1, storeLineId: '7' },
      { id: secondId, quantity: 1, storeLineId: '8' },
    ]);
    expect(builder.addLine(line)).toBe(firstId);
    expect(builder.getSnapshot().lineItems).toHaveLength(2);
    expect(builder.getSnapshot().lineItems).toMatchObject([
      { id: firstId, quantity: 2, storeLineId: '7' },
      { id: secondId, quantity: 1, storeLineId: '8' },
    ]);
  });

  it('splitting a kept line leaves the store id on the source only', () => {
    const builder = createOrderBuilder(options);
    const sourceId = builder.addLine({ ...line, quantity: 3, storeLineId: '9' });
    const copyIds = builder.splitLine(sourceId);
    const lines = builder.getSnapshot().lineItems;
    expect(copyIds).toHaveLength(2);
    expect(lines).toHaveLength(3);
    expect(lines.filter((item) => item.storeLineId === '9')).toMatchObject([{ id: sourceId, quantity: 1 }]);
    for (const copyId of copyIds) {
      const copy = lines.find((item) => item.id === copyId)!;
      expect(copy.quantity).toBe(1);
      expect('storeLineId' in copy).toBe(false);
    }
  });

  it('fees and shipping keep their store ids through add and update', () => {
    const builder = createOrderBuilder(options);
    const feeId = builder.addFee({ name: 'Handling', amountMinor: 500, storeLineId: '31' });
    const shippingId = builder.addShipping({ name: 'Delivery', amountMinor: 800, methodId: 'flat_rate', storeLineId: '32' });
    expect(builder.getSnapshot().fees).toMatchObject([{ id: feeId, storeLineId: '31' }]);
    expect(builder.getSnapshot().shipping).toMatchObject([{ id: shippingId, storeLineId: '32' }]);
    builder.updateFee(feeId, { amountMinor: 700 });
    builder.updateShipping(shippingId, { name: 'Courier' });
    expect(builder.getSnapshot().fees).toMatchObject([{ id: feeId, amountMinor: 700, storeLineId: '31' }]);
    expect(builder.getSnapshot().shipping).toMatchObject([{ id: shippingId, name: 'Courier', methodId: 'flat_rate', storeLineId: '32' }]);
    const plainId = builder.addFee({ name: 'Gift wrap', amountMinor: 100 });
    expect('storeLineId' in builder.getSnapshot().fees!.find((fee) => fee.id === plainId)!).toBe(false);
  });

  it('charge patches cannot set, change or clear store ids', () => {
    const builder = createOrderBuilder(options);
    const feeId = builder.addFee({ name: 'Handling', amountMinor: 500, storeLineId: 'f1' });
    const shippingId = builder.addShipping({ name: 'Delivery', amountMinor: 800, storeLineId: 's1' });
    builder.updateFee(feeId, { amountMinor: 700, storeLineId: 'other' });
    builder.updateShipping(shippingId, { amountMinor: 900, storeLineId: 'other' });
    expect(builder.getSnapshot().fees).toMatchObject([{ id: feeId, amountMinor: 700, storeLineId: 'f1' }]);
    expect(builder.getSnapshot().shipping).toMatchObject([{ id: shippingId, amountMinor: 900, storeLineId: 's1' }]);
    builder.updateFee(feeId, { storeLineId: undefined });
    builder.updateShipping(shippingId, { storeLineId: undefined });
    expect(builder.getSnapshot().fees).toMatchObject([{ id: feeId, storeLineId: 'f1' }]);
    expect(builder.getSnapshot().shipping).toMatchObject([{ id: shippingId, storeLineId: 's1' }]);
    const plainId = builder.addFee({ name: 'Gift wrap', amountMinor: 100 });
    builder.updateFee(plainId, { storeLineId: 'x' });
    expect(builder.getSnapshot().fees!.find((fee) => fee.id === plainId)).not.toHaveProperty('storeLineId');
  });

  it('a locked payment cannot be removed or moved', () => {
    const builder = createOrderBuilder(options);
    builder.addLine(line);
    const lockedId = builder.addPayment({ method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true });
    const plainId = builder.addPayment({ method: 'cash', amountMinor: 100 });
    const before = builder.getSnapshot();
    expect(() => builder.removePayment(lockedId)).toThrow(new RangeError(LOCKED_PAYMENT));
    expect(builder.getSnapshot().payments).toEqual(before.payments);
    expect(builder.getSnapshot().payments).toHaveLength(2);
    const emitted = vi.fn();
    const subscription = builder.order$.subscribe(emitted);
    emitted.mockClear();
    expect(builder.setPaymentStatus(lockedId, 'voided')).toBe(false);
    expect(emitted).not.toHaveBeenCalled();
    expect('status' in builder.getSnapshot().payments[0]).toBe(false);
    expect(builder.getSnapshot().paidMinor).toBe(600);
    builder.removePayment(plainId);
    expect(builder.getSnapshot().payments).toEqual([
      { id: lockedId, method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true },
    ]);
    expect(builder.getSnapshot().paidMinor).toBe(500);
    subscription.unsubscribe();
  });

  it('restoring a draft keeps every store id', () => {
    const builder = createOrderBuilder({ ...options, storeOrder });
    builder.addLine({ ...line, name: 'First coffee', storeLineId: '7' });
    builder.addLine({ ...line, name: 'Second coffee', storeLineId: '8' });
    builder.addLine({ ...line, productId: 'tea', name: 'Tea' });
    builder.addFee({ name: 'Handling', amountMinor: 500, storeLineId: '31' });
    builder.addShipping({ name: 'Delivery', amountMinor: 800, methodId: 'flat_rate', storeLineId: '32' });
    builder.addPayment({ method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const saved: Order = JSON.parse(JSON.stringify(builder.getSnapshot()));
    const restored = restoreOrderDraft(saved, options).getSnapshot();

    expect(restored.storeOrder).toEqual(saved.storeOrder);
    expect(restored.lineItems).toHaveLength(3);
    expect(restored.lineItems).toMatchObject([
      { productId: 'coffee', name: 'First coffee', quantity: 1, storeLineId: '7' },
      { productId: 'coffee', name: 'Second coffee', quantity: 1, storeLineId: '8' },
      { productId: 'tea', name: 'Tea', quantity: 1 },
    ]);
    expect('storeLineId' in restored.lineItems[2]).toBe(false);
    expect(restored.fees).toMatchObject([{ name: 'Handling', storeLineId: '31' }]);
    expect(restored.shipping).toMatchObject([{ name: 'Delivery', methodId: 'flat_rate', storeLineId: '32' }]);
    expect(restored.payments).toHaveLength(2);
    expect(restored.payments).toMatchObject([
      { method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true },
      { method: 'cash', amountMinor: 100 },
    ]);
    expect('storePaymentId' in restored.payments[1]).toBe(false);
    expect('locked' in restored.payments[1]).toBe(false);
  });

  it('re-taxing a reopened cart keeps every store id', () => {
    const builder = createOrderBuilder({ ...options, storeOrder });
    builder.addLine({ ...line, name: 'First coffee', storeLineId: '7' });
    builder.addLine({ ...line, name: 'Second coffee', storeLineId: '8' });
    builder.addLine({ ...line, productId: 'tea', name: 'Tea' });
    builder.addFee({ name: 'Handling', amountMinor: 500, storeLineId: '31' });
    builder.addShipping({ name: 'Delivery', amountMinor: 800, methodId: 'flat_rate', storeLineId: '32' });
    builder.addPayment({ method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const saved: Order = JSON.parse(JSON.stringify(builder.getSnapshot()));
    const restored = restoreOrderDraft(saved, {
      currency: 'EUR', taxContext: { getTaxRatePpm: () => 200000, pricesIncludeTax: false },
    }).getSnapshot();

    expect(restored.storeOrder).toEqual(saved.storeOrder);
    expect(restored.lineItems).toHaveLength(3);
    expect(restored.lineItems).toMatchObject([
      { productId: 'coffee', name: 'First coffee', quantity: 1, storeLineId: '7' },
      { productId: 'coffee', name: 'Second coffee', quantity: 1, storeLineId: '8' },
      { productId: 'tea', name: 'Tea', quantity: 1 },
    ]);
    expect('storeLineId' in restored.lineItems[2]).toBe(false);
    expect(restored.fees).toMatchObject([{ name: 'Handling', storeLineId: '31' }]);
    expect(restored.shipping).toMatchObject([{ name: 'Delivery', methodId: 'flat_rate', storeLineId: '32' }]);
    expect(restored.payments).toHaveLength(2);
    expect(restored.payments).toMatchObject([
      { method: 'external', amountMinor: 500, storePaymentId: 'p-1', locked: true },
      { method: 'cash', amountMinor: 100 },
    ]);
    expect('storePaymentId' in restored.payments[1]).toBe(false);
    expect('locked' in restored.payments[1]).toBe(false);
  });

  it('a cart with no store ids restores exactly as before', () => {
    const builder = createOrderBuilder(options);
    builder.addLine(line);
    builder.addFee({ name: 'Handling', amountMinor: 500 });
    builder.addShipping({ name: 'Delivery', amountMinor: 800, methodId: 'flat_rate' });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const saved: Order = JSON.parse(JSON.stringify(builder.getSnapshot()));
    const restored = restoreOrderDraft(saved, options).getSnapshot();
    JSON.stringify(restored, (key, value) => {
      expect(['storeOrder', 'storeLineId', 'storePaymentId', 'locked']).not.toContain(key);
      return value;
    });
    expect(restored.lineItems).toHaveLength(1);
    expect(restored.fees).toHaveLength(1);
    expect(restored.shipping).toHaveLength(1);
    expect(restored.payments).toHaveLength(1);
    expect(restored.totalMinor).toBe(saved.totalMinor);
    expect(restored.paidMinor).toBe(saved.paidMinor);
    expect(restored.balanceDueMinor).toBe(saved.balanceDueMinor);
  });
});
