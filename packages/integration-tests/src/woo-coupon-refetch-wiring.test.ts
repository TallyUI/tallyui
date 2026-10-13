// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { createWooCouponFeed, wooCouponReconcile, wooCouponSchema } from '@tallyui/connector-woocommerce';
import { posOrderCollection, woocommerceDiscountCodes, uuidv7, type PosOrder } from '@tallyui/pos';

let db: RxDatabase<{ coupons: RxCollection; pos_orders: RxCollection<PosOrder> }>;
let runner: { stop(): void } | undefined;

beforeEach(async () => {
  db = await createRxDatabase({ name: `couponwiring${uuidv7().replaceAll('-', '')}`,
    storage: getRxStorageMemory(), multiInstance: false });
  await db.addCollections({ coupons: { schema: wooCouponSchema }, pos_orders: posOrderCollection() });
});
afterEach(async () => { runner?.stop(); await db.remove(); });

it('wires coupon refetch through the WooCommerce adapter with refreshOnly', async () => {
  const feed = createWooCouponFeed();
  const enqueueSpy = vi.spyOn(feed, 'enqueue');
  const reSync = vi.fn<() => void>();
  const { pos_orders: orders, coupons } = db;
  runner = woocommerceDiscountCodes.startCouponUsageRefetch({ orders, coupons, enqueue: wooCouponReconcile(feed).enqueue, reSync });
  await coupons.insert({ uuid: 'coupon-101', id: 101, code: 'save10', discount_type: 'percent', amount: '10' });
  const createdAt = new Date().toISOString();
  const order = await orders.insert({
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: 'product-0', name: 'Item 0', sku: 'SKU0', quantity: 1,
      unitPriceMinor: 100, discountMinor: 0, netMinor: 100, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 }], customer: null,
    subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 100, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    coupons: [{ code: 'save10', couponId: '101', discountMinor: 10, discountTaxMinor: 0 }],
  });
  await order.patch({ syncStatus: 'applied', updatedAt: new Date().toISOString() });
  await vi.waitFor(() => expect(enqueueSpy).toHaveBeenCalledTimes(1));
  expect(enqueueSpy).toHaveBeenCalledWith([
    { key: 'coupon-101', local: expect.objectContaining({ id: 101 }), refreshOnly: true },
  ]);
  expect(reSync).toHaveBeenCalledTimes(1);
});
