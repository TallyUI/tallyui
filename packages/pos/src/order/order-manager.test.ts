import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createRxDatabase, addRxPlugin, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderManager } from './order-manager';
import type { ProductTraits } from '@tallyui/core';
import type { TaxContext } from '../tax/types';
import type { DisplayTotals } from './types';

addRxPlugin(RxDBDevModePlugin);

/** Resume re-adds each line, so line and discount ids are new; every display figure must still match (ADR-063). */
const withoutIds = (display: DisplayTotals) => ({
  ...display,
  lines: display.lines.map(({ lineId: _, ...line }) => ({ ...line, discounts: line.discounts.map(({ discountId: __, ...row }) => row) })),
});

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });

const traits: ProductTraits = {
  getId: (doc) => doc.id,
  getName: (doc) => doc.name,
  getSku: () => '',
  getPrices: (doc, context) => [{ amount: doc.price, currency: context?.currency ?? 'USD', kind: 'base' }],
  getStock: () => ({ status: 'in_stock' }),
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
  isSellable: () => true,
  getVariantCount: () => 1,
  getType: () => 'simple',
  getBarcode: () => undefined,
  getCategoryNames: () => [],
};

const taxContext: TaxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
const product = { id: 'p1', name: 'Coffee', price: 500 };

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

  it('preserves two lines, their taxes, discounts and payments through JSON park/resume', async () => {
    const mgr = createOrderManager({ currency: 'usd', taxContext, draftsCollection: db.pos_drafts });
    const builder = await firstValueFrom(mgr.activeOrder$);
    const lineId = builder.addLine({
      productId: 'p1', variantId: 'v1', name: 'Item', sku: 'ITEM', imageUrl: 'item.png',
      unitPrice: { amount: 850, currency: 'USD' }, quantity: 2,
      taxRates: [{ code: 'STATE', ratePpm: 60000 }, { code: 'CITY', ratePpm: 25000 }],
    });
    const secondId = builder.addLine({
      productId: 'p1', variantId: 'v1', name: 'Item',
      unitPrice: { amount: 1200, currency: 'USD' }, taxRates: [{ ratePpm: 190000 }],
    });
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 100, label: 'Line offer' });
    builder.applyLineDiscount(secondId, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'fixed', value: 50 });
    builder.addPayment({ method: 'cash', amountMinor: 3000, tenderedMinor: 3100, changeMinor: 100, reference: 'cash-1' });
    builder.setCustomer({ id: 'c1', name: 'Alice' });
    builder.setNote('Keep this note');
    const parked = builder.getSnapshot();
    await mgr.parkCurrentOrder();
    const summaries = await firstValueFrom(mgr.parkedOrders$);
    expect(summaries[0].totalMinor).toBe(parked.totalMinor);
    const stored = await db.pos_drafts.findOne(parked.id).exec();
    expect(stored.toJSON().total).toBe(parked.totalMinor);
    expect(JSON.parse(stored.toJSON().data)).toEqual(parked);
    const resumed = (await mgr.resumeOrder(parked.id)).getSnapshot();
    expect(resumed).toMatchObject({
      subtotalMinor: parked.subtotalMinor, taxMinor: parked.taxMinor, totalMinor: parked.totalMinor,
      discountMinor: parked.discountMinor, paidMinor: parked.paidMinor,
      balanceDueMinor: parked.balanceDueMinor, changeDueMinor: parked.changeDueMinor,
      customer: parked.customer, note: parked.note,
    });
    expect(resumed.lineItems).toHaveLength(2);
    resumed.lineItems.forEach((line, index) => {
      const { id, discounts, ...savedLine } = parked.lineItems[index];
      expect(line).toMatchObject(savedLine);
      expect(line.discounts.map(({ id, ...discount }) => discount)).toEqual(discounts.map(({ id, ...discount }) => discount));
    });
    const { id, ...payment } = parked.payments[0];
    expect(resumed.payments[0]).toMatchObject(payment);
  });

  it('keeps a mixed cart\'s per-line tax mode through park/resume (ADR-062 fixture, plus a line discount)', async () => {
    const mixedTaxContext: TaxContext = { getTaxRatePpm: () => 190000, pricesIncludeTax: false };
    const mgr = createOrderManager({ currency: 'EUR', taxContext: mixedTaxContext, draftsCollection: db.pos_drafts });
    const builder = await firstValueFrom(mgr.activeOrder$);
    const aId = builder.addLine({
      productId: 'a', name: 'Inclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: true }, quantity: 3,
    });
    builder.addLine({ productId: 'b', name: 'Store mode', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.applyLineDiscount(aId, { type: 'fixed', value: 100, label: 'Line offer' });
    builder.applyOrderDiscount({ type: 'fixed', value: 50 });
    const parked = builder.getSnapshot();

    await mgr.parkCurrentOrder();
    const resumed = (await mgr.resumeOrder(parked.id)).getSnapshot();

    expect(resumed).toMatchObject({
      subtotalMinor: parked.subtotalMinor, discountMinor: parked.discountMinor,
      taxMinor: parked.taxMinor, totalMinor: parked.totalMinor,
    });
    expect(withoutIds(resumed.display)).toEqual(withoutIds(parked.display));
    resumed.lineItems.forEach((line, index) => {
      expect(line.taxInclusive).toBe(parked.lineItems[index].taxInclusive);
      expect(line.priceTaxModeConverted).toBe(parked.lineItems[index].priceTaxModeConverted);
    });
  });

  it.each([
    { taxInclusive: true, label: 'all-inclusive' },
    { taxInclusive: false, label: 'all-exclusive' },
  ])('keeps a $label cart identical through park/resume', async ({ taxInclusive }) => {
    const singleModeTaxContext: TaxContext = { getTaxRatePpm: () => 190000, pricesIncludeTax: taxInclusive };
    const mgr = createOrderManager({ currency: 'EUR', taxContext: singleModeTaxContext, draftsCollection: db.pos_drafts });
    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addLine({ productId: 'a', name: 'Item A', unitPrice: { amount: 1000, currency: 'EUR' }, quantity: 3 });
    builder.addLine({ productId: 'b', name: 'Item B', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.applyOrderDiscount({ type: 'fixed', value: 50 });
    const parked = builder.getSnapshot();

    await mgr.parkCurrentOrder();
    const resumed = (await mgr.resumeOrder(parked.id)).getSnapshot();

    expect(resumed).toMatchObject({
      subtotalMinor: parked.subtotalMinor, discountMinor: parked.discountMinor,
      taxMinor: parked.taxMinor, totalMinor: parked.totalMinor,
    });
    expect(withoutIds(resumed.display)).toEqual(withoutIds(parked.display));
    resumed.lineItems.forEach((line, index) => {
      expect(line.taxInclusive).toBe(parked.lineItems[index].taxInclusive);
    });
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
    expect(order.lineItems[0].discountMinor).toBe(50); // 10% of $5
  });

  it('preserves order-level discounts through park/resume', async () => {
    const mgr = createOrderManager({ currency: 'USD', taxContext, draftsCollection: db.pos_drafts });

    const builder = await firstValueFrom(mgr.activeOrder$);
    builder.addProduct(product, traits);
    builder.applyOrderDiscount({ type: 'fixed', value: 100, label: 'Loyalty' });
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
    builder.addPayment({ method: 'cash', amountMinor: 300 });
    const orderId = (await firstValueFrom(builder.order$)).id;

    await mgr.parkCurrentOrder();
    await mgr.resumeOrder(orderId);

    const resumed = await firstValueFrom(mgr.activeOrder$);
    const order = await firstValueFrom(resumed.order$);
    expect(order.payments).toHaveLength(1);
    expect(order.payments[0].method).toBe('cash');
    expect(order.payments[0].amountMinor).toBe(300);
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
