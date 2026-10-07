// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wooCouponSchema, wooProductSchema } from '@tallyui/connector-woocommerce';
import { posOrderCollection } from '../pos-order/schema';
import { uuidv7 } from '../pos-order';
import type { PosOrder } from '../pos-order/types';
import type { SaleCouponSource } from './coupons';
import { createSaleCouponSource } from './coupon-source';

let db: RxDatabase<{ coupons: RxCollection; products: RxCollection; pos_orders: RxCollection<PosOrder> }>;
let source: SaleCouponSource;
const coupon = { uuid: 'coupon-101', id: 101, code: 'save10', discount_type: 'percent', amount: '10' };
const appliedCoupon = { code: 'save10', couponId: '101', discountMinor: 10, discountTaxMinor: 0 };

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
  db = await createRxDatabase({ name: `couponsource${uuidv7().replaceAll('-', '')}`,
    storage: getRxStorageMemory(), multiInstance: false });
  const collections = await db.addCollections({ coupons: { schema: wooCouponSchema },
    products: { schema: wooProductSchema }, pos_orders: posOrderCollection() });
  source = createSaleCouponSource({ coupons: collections.coupons, products: collections.products, orders: collections.pos_orders });
});
afterEach(async () => { await db.remove(); });

describe('createSaleCouponSource', () => {
  it('copies only CouponInput fields present on the document, with defaults for usage', async () => {
    await db.coupons.insert({ ...coupon, description: 'Not a CouponInput field' });
    expect(await source.find('save10')).toEqual({ id: 101, code: 'save10', discount_type: 'percent', amount: '10',
      usage_count: 0, used_by: [] });
  });

  it.each(['percent', 'fixed_cart', 'fixed_product'])('copies all supplied CouponInput fields for %s', async (discount_type) => {
    const fields = { discount_type, amount: '10', limit_usage_to_x_items: 2, product_ids: [10], excluded_product_ids: [11],
      product_categories: [7], excluded_product_categories: [8], exclude_sale_items: false, individual_use: true,
      date_expires_gmt: null, usage_limit: 5, usage_limit_per_user: 1, minimum_amount: '20', maximum_amount: '100',
      email_restrictions: ['a@b.c'], usage_count: 1, used_by: ['5'] };
    await db.coupons.insert({ ...coupon, ...fields });
    expect(await source.find('save10')).toEqual({ id: 101, code: 'save10', ...fields });
  });

  it('finds an uppercase WooCommerce code and returns the lower-case code', async () => {
    await db.coupons.insert({ ...coupon, code: 'SAVE10' });
    expect(await source.find('save10')).toEqual({ id: 101, code: 'save10', discount_type: 'percent', amount: '10',
      usage_count: 0, used_by: [] });
  });

  it('prefers the exact indexed code over a case-insensitive match', async () => {
    await db.coupons.insert({ ...coupon, uuid: 'uppercase', id: 102, code: 'SAVE10' });
    await db.coupons.insert(coupon);
    expect((await source.find('save10'))?.id).toBe(101);
  });

  it('returns null for an unknown code', async () => {
    await db.coupons.insert(coupon);
    expect(await source.find('missing')).toBeNull();
  });

  it('returns null for an unsupported discount type', async () => {
    await db.coupons.insert({ ...coupon, discount_type: 'gift' });
    expect(await source.find('save10')).toBeNull();
  });

  it.each([undefined, 1.5, '101'])('returns null without an integer id: %s', async (id) => {
    const { id: _id, ...withoutId } = coupon;
    await db.coupons.insert({ ...withoutId, ...(id === undefined ? {} : { id }) });
    expect(await source.find('save10')).toBeNull();
  });

  it('counts pending uses, preferring customer id to email, and ignores rejected and unrelated orders', async () => {
    await db.coupons.insert({ ...coupon, usage_count: 1, used_by: ['5'] });
    await db.pos_orders.bulkInsert([
      order({ coupons: [appliedCoupon], customer: { id: '7', email: 'ignored@b.c' } }),
      order({ coupons: [appliedCoupon], customer: { email: 'a@b.c' } }),
      order({ coupons: [appliedCoupon], syncStatus: 'rejected', customer: { id: '8' } }),
      order({ customer: { id: '9' } }),
      order({ coupons: [{ ...appliedCoupon, code: 'other' }], customer: { id: '10' } }),
    ]);
    expect(await source.find('save10')).toMatchObject({ usage_count: 3, used_by: ['5', '7', 'a@b.c'] });
  });

  it('counts each order once and adds no used_by entry without a customer id or email', async () => {
    await db.coupons.insert(coupon);
    await db.pos_orders.bulkInsert([
      order({ coupons: [appliedCoupon, appliedCoupon] }),
      order({ coupons: [appliedCoupon], customer: { name: 'Guest' } }),
    ]);
    expect(await source.find('save10')).toMatchObject({ usage_count: 2, used_by: [] });
  });

  it('counts an applied order until a later pull rewrites the coupon', async () => {
    const doc = await db.coupons.insert({ ...coupon, usage_count: 1 });
    const lwt = doc.toJSON(true)._meta.lwt;
    await db.pos_orders.insert(order({ coupons: [appliedCoupon], syncStatus: 'applied', customer: { id: '7' },
      updatedAt: new Date(Math.ceil(lwt) + 1).toISOString() }));
    expect(await source.find('save10')).toMatchObject({ usage_count: 2, used_by: ['7'] });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await db.coupons.upsert({ ...coupon, usage_count: 2, used_by: ['7'] });
    expect(await source.find('save10')).toMatchObject({ usage_count: 2, used_by: ['7'] });
  });

  it('returns category ids for found products, including a product without categories', async () => {
    await db.products.bulkInsert([
      { uuid: 'product-10', id: 10, categories: [{ id: 7, name: 'Clothes' }, { id: 8, slug: 'summer' }] },
      { uuid: 'product-11', id: 11 },
      { uuid: 'product-12', id: 12, categories: [{ id: 9 }] },
    ]);
    expect(await source.productCategories([10, 11, 99])).toEqual(new Map([[10, [{ id: 7 }, { id: 8 }]], [11, []]]));
  });

  it('changes no document in any collection', async () => {
    await db.coupons.insert({ ...coupon, code: 'SAVE10', usage_count: 1, used_by: ['5'] });
    await db.products.insert({ uuid: 'product-10', id: 10, categories: [{ id: 7, name: 'Clothes' }] });
    await db.pos_orders.insert(order({ coupons: [appliedCoupon], customer: { id: '7' } }));
    const snapshot = async () => Promise.all([db.coupons, db.products, db.pos_orders].map(async (collection) =>
      (await collection.find().exec()).map((doc) => doc.toJSON(true))));
    const before = await snapshot();
    await source.find('save10');
    await source.find('missing');
    await source.productCategories([10, 11, 99]);
    expect(await snapshot()).toEqual(before);
  });
});
