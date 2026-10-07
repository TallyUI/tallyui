// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wooCouponSchema } from '@tallyui/connector-woocommerce';
import type { ReconcileFeedEntry } from '@tallyui/core';
import { posOrderCollection } from '../pos-order/schema';
import { uuidv7 } from '../pos-order';
import type { PosOrder } from '../pos-order/types';
import { APPLIED_USE_GRACE_MS } from './coupon-source';
import { startCouponUsageRefetch } from './coupon-refetch';
import { saleLogger } from './use-sale';

let db: RxDatabase<{ coupons: RxCollection; pos_orders: RxCollection<PosOrder> }>;
let runners: Array<{ stop(): void }>;
let enqueue = vi.fn<(entries: Array<ReconcileFeedEntry>) => void>();
let reSync = vi.fn<() => void>();
const coupon = { uuid: 'coupon-101', id: 101, code: 'save10', discount_type: 'percent', amount: '10' };
const coupon2 = { ...coupon, uuid: 'coupon-102', id: 102, code: 'save20' };
const appliedCoupon = { code: 'save10', couponId: '101', discountMinor: 10, discountTaxMinor: 0 };
const appliedCoupon2 = { ...appliedCoupon, code: 'save20', couponId: '102' };

// The order-outbox.test.ts fixture, with per-case coupon, customer and sync fields.
function order(extra: Partial<PosOrder> = {}): PosOrder {
  const createdAt = '2026-09-23T12:00:00.000Z';
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: 'product-0', name: 'Item 0', sku: 'SKU0', quantity: 1,
      unitPriceMinor: 100, discountMinor: 0, netMinor: 100, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 }], customer: null,
    subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 100, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...extra,
  };
}

beforeEach(async () => {
  db = await createRxDatabase({ name: `couponrefetch${uuidv7().replaceAll('-', '')}`,
    storage: getRxStorageMemory(), multiInstance: false });
  await db.addCollections({ coupons: { schema: wooCouponSchema }, pos_orders: posOrderCollection() });
  runners = [];
  enqueue = vi.fn<(entries: Array<ReconcileFeedEntry>) => void>();
  reSync = vi.fn<() => void>();
});
afterEach(async () => { runners.forEach((runner) => runner.stop()); await db.remove(); });

describe('startCouponUsageRefetch', () => {
  it('enqueues a pending order only once it applies', async () => {
    await db.coupons.insert(coupon);
    const doc = await db.pos_orders.insert(order({ coupons: [appliedCoupon] }));
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync }));
    await doc.patch({ syncStatus: 'applied', updatedAt: new Date().toISOString() });
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue).toHaveBeenCalledWith([{ key: 'coupon-101',
      local: expect.objectContaining({ id: 101, uuid: 'coupon-101' }), refreshOnly: true }]);
    expect(reSync).toHaveBeenCalledTimes(1);
  });

  it('refetches a fresh pending order only after it applies', async () => {
    await db.coupons.bulkInsert([coupon, coupon2]);
    const updatedAt = new Date().toISOString();
    const doc = await db.pos_orders.insert(order({ syncStatus: 'pending', updatedAt, coupons: [appliedCoupon] }));
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt, coupons: [appliedCoupon2] }));
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0][0]).toEqual([
      { key: 'coupon-102', local: expect.objectContaining({ id: 102 }), refreshOnly: true },
    ]);
    await doc.patch({ syncStatus: 'applied', updatedAt: new Date().toISOString() });
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    expect(enqueue.mock.calls[1][0]).toEqual([
      { key: 'coupon-101', local: expect.objectContaining({ id: 101 }), refreshOnly: true },
    ]);
  });

  it('enqueues both coupons of one order in one call', async () => {
    await db.coupons.bulkInsert([coupon, coupon2]);
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt: new Date().toISOString(),
      coupons: [appliedCoupon, appliedCoupon2] }));
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0][0]).toHaveLength(2);
    expect(enqueue.mock.calls[0][0]).toEqual(expect.arrayContaining([
      { key: 'coupon-101', local: expect.objectContaining({ id: 101 }), refreshOnly: true },
      { key: 'coupon-102', local: expect.objectContaining({ id: 102 }), refreshOnly: true },
    ]));
    expect(reSync).toHaveBeenCalledTimes(1);
  });

  it('does not handle an order again on later emissions', async () => {
    await db.coupons.bulkInsert([coupon, coupon2]);
    const updatedAt = new Date().toISOString();
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt, coupons: [appliedCoupon] }));
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt }));
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt, coupons: [appliedCoupon2] }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(2));
    expect(enqueue.mock.calls[1][0]).toEqual([
      { key: 'coupon-102', local: expect.objectContaining({ id: 102 }), refreshOnly: true },
    ]);
    expect(reSync).toHaveBeenCalledTimes(2);
  });

  it('skips orders at the grace window boundary', async () => {
    await db.coupons.bulkInsert([coupon, coupon2]);
    const old = order({ syncStatus: 'applied', coupons: [appliedCoupon] });
    await db.pos_orders.insert(old);
    const now = () => Date.parse(old.updatedAt) + APPLIED_USE_GRACE_MS;
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync, now }));
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt: new Date(now()).toISOString(),
      coupons: [appliedCoupon2] }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0][0]).toEqual([
      { key: 'coupon-102', local: expect.objectContaining({ id: 102 }), refreshOnly: true },
    ]);
    expect(reSync).toHaveBeenCalledTimes(1);
  });

  it('skips missing local coupons and non-integer coupon ids', async () => {
    const find = vi.spyOn(db.coupons, 'find');
    await db.coupons.insert(coupon);
    const updatedAt = new Date().toISOString();
    await db.pos_orders.bulkInsert(['999', 'abc'].map((couponId) => order({ syncStatus: 'applied', updatedAt,
      coupons: [{ ...appliedCoupon, couponId }] })));
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync }));
    await vi.waitFor(() => expect(find).toHaveBeenCalledTimes(1));
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt, coupons: [appliedCoupon] }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect(enqueue.mock.calls[0][0]).toEqual([
      { key: 'coupon-101', local: expect.objectContaining({ id: 101 }), refreshOnly: true },
    ]);
    expect(reSync).toHaveBeenCalledTimes(1);
    find.mockRestore();
  });

  it('stops watching; a second runner handles an order applied after stop', async () => {
    await db.coupons.insert(coupon);
    const doc = await db.pos_orders.insert(order({ coupons: [appliedCoupon] }));
    const first = startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync });
    runners.push(first);
    first.stop();
    await doc.patch({ syncStatus: 'applied', updatedAt: new Date().toISOString() });
    const secondEnqueue = vi.fn<(entries: Array<ReconcileFeedEntry>) => void>();
    const secondReSync = vi.fn<() => void>();
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons,
      enqueue: secondEnqueue, reSync: secondReSync }));
    await vi.waitFor(() => expect(secondEnqueue).toHaveBeenCalledTimes(1));
    expect(secondEnqueue.mock.calls[0][0]).toEqual([
      { key: 'coupon-101', local: expect.objectContaining({ id: 101 }), refreshOnly: true },
    ]);
    expect(secondReSync).toHaveBeenCalledTimes(1);
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
  });

  it('enqueues nothing when stopped during an in-flight coupon read', async () => {
    let resolveRead!: (docs: unknown[]) => void;
    const pending = new Promise<unknown[]>((resolve) => { resolveRead = resolve; });
    const find = vi.fn(() => ({ exec: () => pending }));
    const coupons = { find } as unknown as RxCollection;
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt: new Date().toISOString(),
      coupons: [appliedCoupon] }));
    const runner = startCouponUsageRefetch({ orders: db.pos_orders, coupons, enqueue, reSync });
    runners.push(runner);
    await vi.waitFor(() => expect(find).toHaveBeenCalled());
    runner.stop();
    resolveRead([{ uuid: 'coupon-101', toJSON: () => ({ id: 101, uuid: 'coupon-101' }) }]);
    await new Promise((resolve) => setImmediate(resolve));
    expect(enqueue).not.toHaveBeenCalled();
    expect(reSync).not.toHaveBeenCalled();
  });

  it('logs a failed coupon read and never throws', async () => {
    const coupons = { find: () => ({ exec: () => Promise.reject(new Error('boom')) }) } as unknown as RxCollection;
    const warn = vi.spyOn(saleLogger, 'warn');
    try {
      await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt: new Date().toISOString(),
        coupons: [appliedCoupon] }));
      runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons, enqueue, reSync }));
      await vi.waitFor(() => {
        expect(warn).toHaveBeenCalledTimes(1);
        expect(warn).toHaveBeenCalledWith('coupon refetch: reading local coupons failed',
          expect.objectContaining({ couponIds: [101] }));
      });
      expect(enqueue).not.toHaveBeenCalled();
      expect(reSync).not.toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });

  it('writes nothing to either collection', async () => {
    await db.coupons.insert(coupon);
    await db.pos_orders.insert(order({ syncStatus: 'applied', updatedAt: new Date().toISOString(),
      coupons: [appliedCoupon] }));
    const beforeCoupons = (await db.coupons.find().exec()).map((doc) => doc.toJSON(true));
    const beforeOrders = (await db.pos_orders.find().exec()).map((doc) => doc.toJSON(true));
    runners.push(startCouponUsageRefetch({ orders: db.pos_orders, coupons: db.coupons, enqueue, reSync }));
    await vi.waitFor(() => expect(enqueue).toHaveBeenCalledTimes(1));
    expect((await db.coupons.find().exec()).map((doc) => doc.toJSON(true))).toEqual(beforeCoupons);
    expect((await db.pos_orders.find().exec()).map((doc) => doc.toJSON(true))).toEqual(beforeOrders);
    expect(reSync).toHaveBeenCalledTimes(1);
  });
});
