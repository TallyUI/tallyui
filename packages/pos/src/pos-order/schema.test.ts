// @vitest-environment node
import { expect, it } from 'vitest';
import { createRxDatabase, normalizeMangoQuery, prepareQuery } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from './finalize';
import { addPosOrderCollection } from './open';
import { posOrderCollection, posOrderSchema } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

it('validates schema-19 carried coupon amounts and countedInClosureOf', async () => {
  expect(posOrderSchema.version).toBe(19);
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const plain = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 4 } });
    const order: PosOrder = { ...plain, countedInClosureOf: uuidv7(),
      coupons: [{ code: 'c', couponId: '1', carried: true, discountMinor: 10, discountTaxMinor: 0,
        lines: [{ lineId: plain.lines[0].id, discountMinor: 10, discountTaxMinor: 0, amountMinor: 10 }] }] };
    await pos_orders.insert(order);
    expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
  } finally { await db.remove(); }
});

it.each(['lines', 'fees', 'shipping'] as const)('refuses invalid netMicros on %s in v8', async (field) => {
  const db = await createRxDatabase({ name: `net${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 200000 } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addFee({ name: 'Bag', amountMinor: 20, taxClass: 'standard' });
    builder.addShipping({ name: 'Delivery', amountMinor: 30, taxClass: 'standard', methodId: 'flat_rate' });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 5 } });
    for (const netMicros of ['1.5', '1'.repeat(26)]) {
      await expect(pos_orders.insert({ ...order, id: uuidv7(), [field]: [{ ...order[field]![0], netMicros }] }))
        .rejects.toMatchObject({ code: 'VD2' });
    }
  } finally { await db.remove(); }
});

it("stores version 9's coupons, display coupons, line attributes and regular unit price, and refuses malformed ones", async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 3 } });
    expect(order.display).toBeDefined();
    const coupon = { code: 'save10', couponId: '42', discountMinor: 100, discountTaxMinor: 19 };
    const recorded = { ...order, id: uuidv7(), coupons: [coupon],
      display: { ...order.display!, coupons: [{ code: 'save10', amountMinor: 100 }] },
      lines: [{ ...order.lines[0], attributes: { Size: 'S', Colour: 'Blue' }, regularUnitPriceMinor: 1000 }] };
    await pos_orders.insert(recorded);
    expect((await pos_orders.findOne(recorded.id).exec())?.toJSON()).toStrictEqual(recorded);
    for (const malformed of [
      { coupons: [{ ...coupon, extra: 1 }] },
      { coupons: [{ code: 'save10', discountMinor: 100, discountTaxMinor: 19 }] },
      { coupons: [{ ...coupon, discountMinor: 1.5 }] },
      { coupons: [{ ...coupon, discountMinor: -1 }] },
      { coupons: [{ ...coupon, code: '' }] },
      { display: { ...order.display!, coupons: [{ code: 'save10', amountMinor: 100, extra: 1 }] } },
      { display: { ...order.display!, coupons: [{ code: 'save10' }] } },
      { lines: [{ ...order.lines[0], attributes: { Size: 1 } }] },
      { lines: [{ ...order.lines[0], regularUnitPriceMinor: 1.5 }] },
    ]) {
      await expect(pos_orders.insert({ ...order, id: uuidv7(), ...malformed } as unknown as typeof order)).rejects.toMatchObject({ code: 'VD2' });
    }
  } finally { await db.remove(); }
});

it("stores version 10's line anyAttributes, and refuses malformed ones (#495)", async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'EUR' }, attributes: { Logo: 'Cat' }, anyAttributes: ['Logo'] });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 6 } });
    expect(order.lines[0].anyAttributes).toEqual(['Logo']);
    await pos_orders.insert(order);
    expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    for (const anyAttributes of ['Logo', [''], [1], ['x'.repeat(256)]]) {
      const malformed = { ...order, id: uuidv7(), lines: [{ ...order.lines[0], anyAttributes }] };
      await expect(pos_orders.insert(malformed as unknown as typeof order)).rejects.toMatchObject({ code: 'VD2' });
    }
  } finally { await db.remove(); }
});

it('pos_orders keeps no local documents, so its migration has none to carry', () => {
  expect((posOrderCollection() as { localDocuments?: boolean }).localDocuments ?? false).toBe(false);
});

it('inserts a finalised WooCommerce coupon sale into the AJV-validated v9 collection', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
      pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
      getTaxRatePpm: () => 200000,
      getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
    }, couponContext: {
      configs: new Map([['ten', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
        product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
      couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
    } });
    builder.addLine({ productId: '1', name: 'Item', unitPrice: { amount: 800, currency: 'GBP' }, regularUnitPriceMinor: 1000 });
    builder.addLine({ productId: '2', name: 'Item 2', unitPrice: { amount: 500, currency: 'GBP' }, regularUnitPriceMinor: 500 });
    builder.setCoupons(['ten']);
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 6 } });
    expect(order.coupons).toEqual([{ code: 'ten', couponId: '303', discountMinor: 130, discountTaxMinor: 26 }]);
    const doc = await pos_orders.insert(order);
    expect(doc.toJSON()).toStrictEqual(order);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), coupons: [{ ...order.coupons![0], couponId: '' }] }))
      .rejects.toMatchObject({ code: 'VD2' });
  } finally {
    await db.remove();
  }
});

it('inserts a finalised order into an AJV-validated RxDB memory collection', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2,
      taxRates: [{ code: 'VAT', ratePpm: 190000 }] });
    builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
    builder.setNote('Sale note');
    const order = finalizeOrder(builder.getSnapshot(), { registerId: 'r1', cashierRef: 'staff1' });
    const doc = await pos_orders.insert(order);
    expect(doc.toJSON()).toStrictEqual(order);
    expect(order.saleId).toBe(builder.getSnapshot().id);
    const { saleId: _saleId, ...withoutSaleId } = { ...order, id: uuidv7() };
    expect((await pos_orders.insert(withoutSaleId)).toJSON()).toStrictEqual(withoutSaleId);
    const maxSaleId = { ...order, id: uuidv7(), saleId: 's'.repeat(36) };
    expect((await pos_orders.insert(maxSaleId)).toJSON()).toStrictEqual(maxSaleId);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), saleId: 's'.repeat(37) })).rejects.toMatchObject({ code: 'VD2' });
    await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'applied', customer: null,
      serverRefs: { orderId: 'server1', displayId: '301', totalMinor: 3451 },
      warnings: [{ code: 'total_mismatch', expectedMinor: 3451, serverMinor: 3452 }, { code: 'insufficient_stock', variantId: 'v1', quantity: 2 }],
    });
    await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'rejected', error: { code: 'invalid', message: 'Rejected' } });
    const warnings = [{ code: 'new_code', foo: 1, nested: { extra: ['accepted'] } }];
    const unknown = await pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'applied', warnings });
    expect(unknown.toJSON().warnings).toEqual(warnings);
    const v4 = { ...order, id: uuidv7(), localWarnings: [{ code: 'customer_omitted' as const, field: 'email' as const },
      { code: 'payment_reference_dropped' as const, paymentId: order.payments[0].id }], serverFailures: { since: 0, reason: 'server_error', isolated: true } };
    expect((await pos_orders.insert(v4)).toJSON()).toStrictEqual(v4);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), serverFailures: { since: 0, reason: 'server_error' } })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(),
      serverFailures: { count: 1, since: 0, reason: 'server_error', isolated: false } })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), warnings: [{ code: 'x'.repeat(65) }] })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), syncStatus: 'invalid' })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), extra: true })).rejects.toThrow();
    expect(posOrderSchema.indexes).toEqual(['createdAt', 'syncStatus', ['syncStatus', 'createdAt'], 'sessionId']);
    expect(posOrderSchema.properties.sessionId.maxLength).toBe(36);
  } finally {
    await db.remove();
  }
});

it("stores a line's taxInclusive (ADR-038 amendment) without a schema version bump, because lines.items already accepts unknown properties", async () => {
  // `taxInclusive` needed no version bump: the `lines` item schema never set additionalProperties to
  // false, so it already accepts (and round-trips) a property it does not declare — the same as
  // the `warnings` items above, which declare it explicitly. Adding `taxInclusive` to PosOrderLine
  // needs no matching schema edit, so there is nothing to migrate. (Version 1 is the top-level
  // `sessionId`, ADR-032; version 2 adds `lateSessionId`, `display` and `taxByRate`; version 3 indexes `sessionId`; see migration.test.ts.)
  expect(posOrderSchema.version).toBe(19);
  expect(posOrderSchema.properties.lines.items).not.toHaveProperty('additionalProperties');
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item 1', unitPrice: { amount: 850, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 2000 });
    const order = finalizeOrder(builder.getSnapshot());
    const withLineTaxMode = { ...order, lines: [{ ...order.lines[0], taxInclusive: true }] };
    const doc = await pos_orders.insert(withLineTaxMode);
    expect(doc.toJSON().lines[0].taxInclusive).toBe(true);
  } finally {
    await db.remove();
  }
});

it('stores sentVersion and downgradedFrom, and refuses values outside 1–12', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = { ...finalizeOrder(builder.getSnapshot()), sentVersion: 2 as const, downgradedFrom: 3 as const };
    await pos_orders.insert(order);
    expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    const v4 = { ...order, id: uuidv7(), sentVersion: 4 as const, downgradedFrom: 4 as const };
    await pos_orders.insert(v4);
    expect((await pos_orders.findOne(v4.id).exec())?.toJSON()).toStrictEqual(v4);
    const v6 = { ...order, id: uuidv7(), sentVersion: 6 as const, downgradedFrom: 6 as const };
    await pos_orders.insert(v6);
    expect((await pos_orders.findOne(v6.id).exec())?.toJSON()).toStrictEqual(v6);
    const v7 = { ...order, id: uuidv7(), sentVersion: 7 as const, downgradedFrom: 7 as const };
    await pos_orders.insert(v7);
    expect((await pos_orders.findOne(v7.id).exec())?.toJSON()).toStrictEqual(v7);
    const v8 = { ...order, id: uuidv7(), sentVersion: 8 as const, downgradedFrom: 8 as const };
    await pos_orders.insert(v8);
    expect((await pos_orders.findOne(v8.id).exec())?.toJSON()).toStrictEqual(v8);
    const v10 = { ...order, id: uuidv7(), sentVersion: 10 as const, downgradedFrom: 10 as const };
    await pos_orders.insert(v10);
    expect((await pos_orders.findOne(v10.id).exec())?.toJSON()).toStrictEqual(v10);
    const v11 = { ...order, id: uuidv7(), sentVersion: 11 as const, downgradedFrom: 11 as const };
    await pos_orders.insert(v11);
    expect((await pos_orders.findOne(v11.id).exec())?.toJSON()).toStrictEqual(v11);
    const v12 = { ...order, id: uuidv7(), sentVersion: 12 as const, downgradedFrom: 12 as const };
    await pos_orders.insert(v12);
    expect((await pos_orders.findOne(v12.id).exec())?.toJSON()).toStrictEqual(v12);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), sentVersion: 13 as 12 })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), downgradedFrom: 13 as 12 })).rejects.toThrow();
    await expect(pos_orders.insert({ ...order, id: uuidv7(), sentVersion: 0 as 1 })).rejects.toThrow();
  } finally {
    await db.remove();
  }
});

it("M2 stores schema-18 tax ids, meta, a line's catalogueSku and attentionHandledFor, closed (ADR-092)", async () => {
  expect(posOrderSchema.version).toBe(19);
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', sku: 'SKU-1', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const plain = finalizeOrder(builder.getSnapshot());
    const order: PosOrder = { ...plain, attentionHandledFor: plain.commandId,
      customer: { id: '7', taxIds: [{ type: 'eu_vat', value: 'DE123456789', country: 'DE', label: 'VAT number' }, { type: 'us_ein', value: '12-3456789' }] },
      meta: [{ key: 'po_number', value: 'PO-1' }], lines: plain.lines.map((line) => ({ ...line, sku: 'SKU-1-EDIT', catalogueSku: 'SKU-1' })) };
    await pos_orders.insert(order);
    expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    for (const bad of [{ customer: { taxIds: [{ type: 'eu_vat', value: 'x', extra: 1 }] } }, { customer: { taxIds: [{ type: 'eu_vat' }] } },
      { meta: [{ key: 'k', value: 'v', extra: 1 }] }, { meta: [{ key: 'k' }] }, { attentionHandledFor: 'x'.repeat(37) }]) {
      await expect(pos_orders.insert({ ...order, id: uuidv7(), ...bad } as PosOrder)).rejects.toThrow();
    }
  } finally {
    await db.remove();
  }
});

it('stores schema-13 coupon line shares and refuses malformed shares', async () => {
  const db = await createRxDatabase({ name: `couponlines${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = { ...finalizeOrder(builder.getSnapshot()), sentVersion: 9 as const, downgradedFrom: 9 as const };
    const share = { lineId: order.lines[0].id, discountMinor: 1, discountTaxMinor: 0 };
    const recorded = { ...order, coupons: [{ code: 'c', couponId: 'promo_1', discountMinor: 1, discountTaxMinor: 0, lines: [share] }] };
    await orders.insert(recorded);
    expect((await orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(recorded);
    for (const bad of [{ ...share, lineId: '' }, { ...share, lineId: 'x'.repeat(37) }, { ...share, discountMinor: -1 },
      { ...share, discountTaxMinor: 0.5 }, { ...share, extra: 1 }, { lineId: share.lineId, discountMinor: 1 }]) {
      await expect(orders.insert({ ...recorded, id: uuidv7(), coupons: [{ ...recorded.coupons[0], lines: [bad] }] } as typeof recorded))
        .rejects.toMatchObject({ code: 'VD2' });
    }
  } finally { await db.remove(); }
});

it("stores a reopened sale's store ids (schema 15) and refuses empty or over-long ones", async () => {
  const db = await createRxDatabase({ name: `storeids${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addFee({ name: 'Bag', amountMinor: 20, taxStatus: 'none' });
    builder.addShipping({ name: 'Delivery', amountMinor: 30, taxStatus: 'none', methodId: 'flat_rate' });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 5 } });
    const recorded = { ...order, storeOrderId: '4711', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298',
      lines: [{ ...order.lines[0], storeLineId: '11' }], fees: [{ ...order.fees![0], storeLineId: '12' }],
      shipping: [{ ...order.shipping![0], storeLineId: '13' }], payments: [{ ...order.payments[0], storePaymentId: '21' }] };
    await orders.insert(recorded);
    expect((await orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(recorded);
    await orders.insert({ ...recorded, id: uuidv7(), baseRevision: 'x'.repeat(128) });
    for (const baseRevision of ['', 'x'.repeat(129)]) {
      await expect(orders.insert({ ...recorded, id: uuidv7(), baseRevision })).rejects.toMatchObject({ code: 'VD2' });
    }
    for (const value of ['', 'x'.repeat(65)]) {
      for (const malformed of [
        { storeOrderId: value },
        { lines: [{ ...recorded.lines[0], storeLineId: value }] },
        { fees: [{ ...recorded.fees[0], storeLineId: value }] },
        { shipping: [{ ...recorded.shipping[0], storeLineId: value }] },
        { payments: [{ ...recorded.payments[0], storePaymentId: value }] },
      ]) await expect(orders.insert({ ...recorded, id: uuidv7(), ...malformed })).rejects.toMatchObject({ code: 'VD2' });
    }
  } finally { await db.remove(); }
});

it('stores refundDueMinor as a non-negative integer (schema 15)', async () => {
  const db = await createRxDatabase({ name: `refund${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    for (const refundDueMinor of [0, 250]) expect((await orders.insert({ ...order, id: uuidv7(), refundDueMinor })).refundDueMinor).toBe(refundDueMinor);
    for (const refundDueMinor of [-1, 2.5]) await expect(orders.insert({ ...order, id: uuidv7(), refundDueMinor })).rejects.toMatchObject({ code: 'VD2' });
  } finally { await db.remove(); }
});

it("stores the tax address and the customer's addresses (#722), and refuses another basis or an unknown address key", async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'USD' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    const customer = { id: '7', billing: { firstName: 'Ann', city: 'Albany', state: 'NY', country: 'US' }, shipping: { country: 'US', state: 'OR' } };
    const taxed = { ...order, taxAddress: 'shipping' as const, customer };
    await pos_orders.insert(taxed);
    expect((await pos_orders.findOne(taxed.id).exec())?.toJSON()).toStrictEqual(taxed);
    await expect(pos_orders.insert({ ...taxed, id: uuidv7(), taxAddress: 'base' as 'billing' })).rejects.toThrow();
    await expect(pos_orders.insert({ ...taxed, id: uuidv7(), customer: { billing: { country: 'US', email: 'a@b.c' } as never } })).rejects.toThrow();
  } finally {
    await db.remove();
  }
});

it('stores reopenedAt on a rejected order, and refuses a non-string', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = { ...finalizeOrder(builder.getSnapshot()), syncStatus: 'rejected' as const,
      error: { code: 'coupon_invalid', message: 'Refused' }, reopenedAt: '2026-10-07T10:00:00.000Z' };
    await pos_orders.insert(order);
    expect((await pos_orders.findOne(order.id).exec())?.toJSON()).toStrictEqual(order);
    await expect(pos_orders.insert({ ...order, id: uuidv7(), reopenedAt: 5 as unknown as string })).rejects.toThrow();
  } finally {
    await db.remove();
  }
});

it('requires taxRounding, and refuses an unknown granularity, an unknown mode and an extra key inside it (#287)', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const { pos_orders } = await db.addCollections({ pos_orders: posOrderCollection() });
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    for (const taxRounding of [{ granularity: 'custom' }, { granularity: 'per_rate_group_items', mode: 'half_up' }] as const) {
      const recorded = { ...order, id: uuidv7(), taxRounding };
      await pos_orders.insert(recorded);
      expect((await pos_orders.findOne(recorded.id).exec())?.toJSON()).toStrictEqual(recorded);
    }
    const { taxRounding: _rounding, ...unrecorded } = order;
    await expect(pos_orders.insert({ ...unrecorded, id: uuidv7() })).rejects.toMatchObject({ code: 'VD2' });
    for (const taxRounding of [{ granularity: 'per_line' }, { granularity: 'per_order', mode: 'half_even' },
      { granularity: 'per_order', mode: 'half_up', extra: 1 }]) {
      await expect(pos_orders.insert({ ...order, id: uuidv7(), taxRounding } as unknown as typeof order)).rejects.toMatchObject({ code: 'VD2' });
    }
  } finally {
    await db.remove();
  }
});

it('finds orders by sessionId through its index, and never returns an unstamped order', async () => {
  const db = await createRxDatabase({ name: `posorder${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    const orders = await addPosOrderCollection(db);
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const order = finalizeOrder(builder.getSnapshot());
    const inserted = await orders.bulkInsert([
      { ...order, id: 'stamped-a', sessionId: 'a' }, { ...order, id: 'stamped-b', sessionId: 'b' },
      { ...order, id: 'unstamped' }, { ...order, id: 'late', lateSessionId: 'a' },
    ]);
    expect(inserted.error).toEqual([]);
    const queries: Array<[string | { $in: string[] }, string[], string[]]> = [
      ['a', ['stamped-a'], ['_deleted', 'sessionId', 'id']],
      // RxDB 17's planner uses a field's index for `$in` too (rxdb#8631).
      [{ $in: ['a', 'b'] }, ['stamped-a', 'stamped-b'], ['_deleted', 'sessionId', 'id']],
    ];
    for (const [sessionId, ids, index] of queries) {
      const query = orders.find({ selector: { sessionId } });
      expect((await query.exec()).map((doc) => doc.id).sort()).toEqual(ids);
      const schema = orders.schema.jsonSchema;
      expect(prepareQuery(schema, normalizeMangoQuery(schema, query.getPreparedQuery().query)).queryPlan.index).toEqual(index);
    }
  } finally {
    await db.remove();
  }
});
