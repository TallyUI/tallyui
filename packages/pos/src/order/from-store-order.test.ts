import { describe, expect, it } from 'vitest';
import type { StoreOrder } from '@tallyui/core';
import {
  orderBuilderFromStoreOrder, StoreOrderRebuildError, STORE_ORDER_REBUILD_REFUSALS, type StoreOrderRebuildReason,
} from './from-store-order';

const taxContext = { getTaxRatePpm: () => 100000, pricesIncludeTax: false };
const options = { currency: 'EUR', taxContext };

function storeOrder(): StoreOrder {
  return {
    id: '41', reference: '41', clientOrderId: 'u-1', revision: 'sha256:a', status: 'completed',
    placedAt: '2026-11-17T10:00:00.000Z', currency: 'EUR', pricesIncludeTax: false,
    customer: { id: '5', name: 'Jane', email: 'jane@example.test' },
    lines: [
      { id: '7', productId: 'coffee', name: 'Coffee', quantity: 2,
        subtotalMinor: 2000, totalMinor: 2000, subtotalTaxMinor: 200, taxMinor: 200 },
      { id: '8', productId: 'coffee', name: 'Coffee', quantity: 1,
        subtotalMinor: 1000, totalMinor: 1000, subtotalTaxMinor: 100, taxMinor: 100 },
      { id: '9', productId: 'tea', name: 'Tea', quantity: 1,
        subtotalMinor: 600, totalMinor: 600, subtotalTaxMinor: 60, taxMinor: 60 },
    ],
    fees: [{ id: 'f1', name: 'Handling', totalMinor: 500, taxMinor: 50, taxStatus: 'taxable' }],
    shipping: [{ id: 's1', name: 'Delivery', totalMinor: 800, taxMinor: 80, taxStatus: 'taxable', methodId: 'flat_rate' }],
    coupons: [], refunds: [], discountMinor: 0, discountTaxMinor: 0, taxLines: [],
    taxMinor: 490, totalMinor: 5390,
    payments: [{ id: 'p1', method: 'pos_cash', title: 'Cash', amountMinor: 1000 }],
  };
}

describe('orderBuilderFromStoreOrder', () => {
  it("rebuilds a store order as a reopened cart with its ids and the store's prices", () => {
    const read = storeOrder();
    const snapshot = orderBuilderFromStoreOrder(read, options).getSnapshot();
    expect(snapshot.storeOrder).toEqual({ id: '41', revision: 'sha256:a', uuid: 'u-1' });
    expect(snapshot.id).not.toBe('41');
    expect(snapshot.id).not.toBe('u-1');
    expect(snapshot.lineItems).toHaveLength(3);
    expect(snapshot.lineItems).toMatchObject(read.lines.map((line) => ({
      storeLineId: line.id, productId: line.productId, name: line.name, quantity: line.quantity,
      unitPriceMinor: line.subtotalMinor / line.quantity,
    })));
    expect(snapshot.fees).toMatchObject([{ storeLineId: 'f1' }]);
    expect(snapshot.shipping).toMatchObject([{ storeLineId: 's1', methodId: 'flat_rate' }]);
    expect(snapshot.customer).toEqual({ id: '5', name: 'Jane', email: 'jane@example.test' });
    expect(snapshot.totalMinor).toBe(read.totalMinor);
    expect(snapshot.taxMinor).toBe(read.taxMinor);
  });

  it("every store payment is a locked external leg with the store's method in its reference, ignoring its title", () => {
    const read = storeOrder();
    const snapshot = orderBuilderFromStoreOrder(read, options).getSnapshot();
    expect(snapshot.payments).toEqual([
      { id: expect.any(String), method: 'external', amountMinor: 1000, reference: 'pos_cash', storePaymentId: 'p1', locked: true },
    ]);
    expect(snapshot.payments[0]).not.toHaveProperty('status');
    expect(snapshot.paidMinor).toBe(1000);
    expect(snapshot.balanceDueMinor).toBe(read.totalMinor - 1000);
    read.payments[0].title = 'Something else';
    expect(orderBuilderFromStoreOrder(read, options).getSnapshot().payments[0].reference).toBe('pos_cash');
  });

  it('a read without a till uuid has no uuid on its store order', () => {
    const read = storeOrder();
    delete read.clientOrderId;
    const snapshot = orderBuilderFromStoreOrder(read, options).getSnapshot();
    expect('uuid' in snapshot.storeOrder!).toBe(false);
  });

  it('an inclusive order rebuilds at its gross unit price', () => {
    const read = storeOrder();
    read.pricesIncludeTax = true;
    read.lines = [read.lines[0]];
    read.taxMinor = 330;
    read.totalMinor = 3630;
    const snapshot = orderBuilderFromStoreOrder(read, {
      ...options, taxContext: { ...taxContext, pricesIncludeTax: true },
    }).getSnapshot();
    expect(snapshot.lineItems[0].unitPriceMinor).toBe((read.lines[0].subtotalMinor + read.lines[0].subtotalTaxMinor) / 2);
    expect(snapshot.fees![0].amountMinor).toBe(read.fees[0].totalMinor + read.fees[0].taxMinor);
    expect(snapshot.totalMinor).toBe(read.totalMinor);
    expect(snapshot.taxMinor).toBe(read.taxMinor);
  });

  it("the catalogue's tax status reaches the rebuilt line", () => {
    const read = storeOrder();
    read.lines[2].subtotalTaxMinor = 0;
    read.lines[2].taxMinor = 0;
    read.taxMinor -= 60;
    read.totalMinor -= 60;
    const snapshot = orderBuilderFromStoreOrder(read, {
      ...options, lineTax: (line) => line.productId === 'tea' ? { taxStatus: 'none' } : undefined,
    }).getSnapshot();
    expect(snapshot.lineItems[2].taxStatus).toBe('none');
    expect(snapshot.totalMinor).toBe(read.totalMinor);
    expect(snapshot.taxMinor).toBe(read.taxMinor);
  });

  it("a guest's billing name does not become a customer", () => {
    const read = storeOrder();
    read.customer = { name: 'Walk in', email: 'w@example.test' };
    expect(orderBuilderFromStoreOrder(read, options).getSnapshot().customer).toBeNull();
  });

  it.each<{ reason: StoreOrderRebuildReason; change: (read: StoreOrder) => void; inclusiveContext?: boolean }>([
    { reason: 'currency', change: (read) => { read.currency = 'USD'; } },
    { reason: 'tax_mode', change: () => {}, inclusiveContext: true },
    { reason: 'revision', change: (read) => { delete read.revision; } },
    { reason: 'revision', change: (read) => { read.revision = ''; } },
    { reason: 'store_id', change: (read) => { read.lines[0].id = '😀'.repeat(33); } },
    { reason: 'store_id', change: (read) => { read.payments[0].id = 'a\u0000b'; } },
    { reason: 'store_id', change: (read) => { delete read.fees[0].id; } },
    { reason: 'store_id', change: (read) => { delete read.shipping[0].id; } },
    { reason: 'store_id', change: (read) => { delete read.payments[0].id; } },
    { reason: 'store_id', change: (read) => { read.clientOrderId = 'x'.repeat(65); } },
    { reason: 'store_id', change: (read) => { read.id = 'x'.repeat(65); } },
    { reason: 'store_id', change: (read) => { read.lines.push({ ...read.lines[0] }); } },
    { reason: 'store_id', change: (read) => { read.fees[0].id = read.lines[0].id; } },
    { reason: 'store_id', change: (read) => { read.shipping[0].id = read.fees[0].id; } },
    { reason: 'store_id', change: (read) => { read.payments.push({ ...read.payments[0] }); } },
    { reason: 'refund', change: (read) => { read.refunds = [{ id: 'r1', amountMinor: 100 }]; } },
    { reason: 'payment_record', change: (read) => { read.paymentRecordUnreadable = true; } },
    { reason: 'coupon', change: (read) => { read.coupons = [{ code: 'ten', discountMinor: 100, discountTaxMinor: 10 }]; } },
    { reason: 'discount', change: (read) => { read.discountMinor = 100; } },
    { reason: 'discount', change: (read) => { read.lines[0].totalMinor -= 100; } },
    { reason: 'product', change: (read) => { delete read.lines[0].productId; } },
    { reason: 'quantity', change: (read) => { read.lines[0].quantity = 0; } },
    { reason: 'quantity', change: (read) => { read.lines[0].quantity = 1.5; } },
    { reason: 'unit_price', change: (read) => { read.lines[0].subtotalMinor = 2001; read.lines[0].totalMinor = 2001; } },
    { reason: 'charge', change: (read) => { read.fees[0].totalMinor = -100; } },
    { reason: 'charge', change: (read) => { delete read.fees[0].taxStatus; } },
    { reason: 'charge', change: (read) => { delete read.shipping[0].taxStatus; } },
    { reason: 'customer', change: (read) => { read.customer = { id: '5', name: 'Jane', email: 'x'.repeat(255) }; } },
    { reason: 'payment', change: (read) => { read.payments[0].amountMinor = 0; } },
    { reason: 'payment', change: (read) => { read.payments[0].method = 'x'.repeat(256); } },
    { reason: 'totals', change: (read) => { read.totalMinor += 1; } },
    { reason: 'totals', change: (read) => { read.taxMinor += 1; } },
  ])('refuses what the till cannot rebuild', ({ reason, change, inclusiveContext }) => {
    const read = storeOrder();
    change(read);
    let refusal: unknown;
    try {
      orderBuilderFromStoreOrder(read, { ...options, taxContext: { ...taxContext, pricesIncludeTax: inclusiveContext ?? false } });
    } catch (error) {
      refusal = error;
    }
    expect(refusal).toBeInstanceOf(StoreOrderRebuildError);
    expect(refusal).toMatchObject({ reason, message: STORE_ORDER_REBUILD_REFUSALS[reason] });
  });
});
