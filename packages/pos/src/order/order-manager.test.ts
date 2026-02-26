import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createRxDatabase, addRxPlugin, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderManager } from './order-manager';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

const traits: ProductTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: () => '',
  getPrice: (doc) => String(doc.price),
  getRegularPrice: (doc) => String(doc.price),
  getSalePrice: () => undefined,
  isOnSale: () => false,
  getImageUrl: () => undefined,
  getImageUrls: () => [],
  getDescription: () => undefined,
  getStockStatus: () => 'instock',
  getStockQuantity: () => null,
  hasVariants: () => false,
  getType: () => 'simple',
  getBarcode: () => undefined,
  getCategoryNames: () => [],
};

const taxContext: TaxContext = { getTaxRate: () => 0, pricesIncludeTax: false };
const product = { id: 'p1', name: 'Coffee', price: 5 };

const draftsSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    data: { type: 'string' },
    customerName: { type: 'string' },
    itemCount: { type: 'integer', minimum: 0, maximum: 2147483647, multipleOf: 1 },
    total: { type: 'number' },
    parkedAt: { type: 'string' },
  },
  required: ['id', 'data'] as const,
};

describe('OrderManager', () => {
  let db: RxDatabase;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `test_mgr_${Date.now()}`,
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });
    await db.addCollections({ pos_drafts: { schema: draftsSchema } });
  });

  afterEach(async () => {
    await db?.close();
  });

  it('starts with an active order', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });
    const builder = await firstValueFrom(mgr.activeOrder$);
    expect(builder).toBeDefined();

    const order = await firstValueFrom(builder.order$);
    expect(order.status).toBe('draft');
  });

  it('creates a new order and switches to it', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const first = await firstValueFrom(mgr.activeOrder$);
    const firstOrder = await firstValueFrom(first.order$);

    mgr.newOrder();
    const second = await firstValueFrom(mgr.activeOrder$);
    const secondOrder = await firstValueFrom(second.order$);

    expect(firstOrder.id).not.toBe(secondOrder.id);
  });

  it('parks an order to local storage and lists it', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    builder.setCustomer({ id: 'c1', name: 'Alice' });

    await mgr.parkCurrentOrder();

    const parked = await firstValueFrom(mgr.parkedOrders$);
    expect(parked).toHaveLength(1);
    expect(parked[0].customerName).toBe('Alice');
    expect(parked[0].itemCount).toBe(1);
    expect(parked[0].source).toBe('local');
  });

  it('resumes a parked order', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    const orderId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();
    await mgr.resumeOrder(orderId);

    const resumed = await firstValueFrom(mgr.activeOrder$);
    const order = await firstValueFrom(resumed.order$);
    expect(order.id).toBe(orderId);
    expect(order.lineItems).toHaveLength(1);
  });

  it('deletes a parked order', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    const orderId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();
    await mgr.deleteParkedOrder(orderId);

    const parked = await firstValueFrom(mgr.parkedOrders$);
    expect(parked).toHaveLength(0);
  });

  it('preserves line-level discounts through park/resume', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    const lineId = builder.addProduct(product, traits);
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10, label: '10% off' });
    const orderId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();
    await mgr.resumeOrder(orderId);

    const resumed = await firstValueFrom(mgr.activeOrder$);
    const order = await firstValueFrom(resumed.order$);
    expect(order.lineItems[0].discounts).toHaveLength(1);
    expect(order.lineItems[0].discounts[0].label).toBe('10% off');
    expect(order.lineItems[0].discountAmount).toBeCloseTo(0.50); // 10% of $5
  });

  it('preserves order-level discounts through park/resume', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    builder.applyOrderDiscount({ type: 'fixed', value: 1, label: 'Loyalty' });
    const orderId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();
    await mgr.resumeOrder(orderId);

    const resumed = await firstValueFrom(mgr.activeOrder$);
    const order = await firstValueFrom(resumed.order$);
    expect(order.discounts).toHaveLength(1);
    expect(order.discounts[0].label).toBe('Loyalty');
  });

  it('preserves payments through park/resume', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    builder.addPayment({ method: 'cash', amount: 3 });
    const orderId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();
    await mgr.resumeOrder(orderId);

    const resumed = await firstValueFrom(mgr.activeOrder$);
    const order = await firstValueFrom(resumed.order$);
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0].method).toBe('cash');
    expect(order.payments[0].amount).toBe(3);
  });

  it('throws when resuming non-existent order', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });
    await expect(mgr.resumeOrder('nonexistent')).rejects.toThrow('Parked order nonexistent not found');
  });

  it('parking creates a fresh active order', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    const oldId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();

    const newBuilder = await firstValueFrom(mgr.activeOrder$);
    const newOrder = await firstValueFrom(newBuilder.order$);
    expect(newOrder.id).not.toBe(oldId);
    expect(newOrder.lineItems).toHaveLength(0);
  });
});
