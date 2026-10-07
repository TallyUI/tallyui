// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order/order-builder';
import { orderDraftSchema, restoreOrderDraft } from '../order/order-drafts';
import type { Order } from '../order/types';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import type { TaxContext } from '../tax/types';
import { finalizeOrder } from './finalize';
import { REOPENABLE_CODES, ReopenRefusedOrderError, reopenRefusedOrder, type ReopenRefusal } from './reopen';
import { posOrderCollection } from './schema';
import type { PosOrder } from './types';
import { uuidv7 } from './uuidv7';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>;
const now = new Date('2026-10-07T12:00:00.000Z');
const error = { code: 'coupon_invalid', message: 'Coupon "save10" does not exist' };
const taxContext: TaxContext = {
  pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
  getTaxRatePpm: (taxClass) => taxClass === 'reduced' ? 100000 : 200000,
  getTaxRates: (taxClass) => [{ id: taxClass === 'reduced' ? 2 : 1, code: taxClass === 'reduced' ? 'VAT10' : 'VAT20',
    label: 'VAT', rate: taxClass === 'reduced' ? '10.0000' : '20.0000', priority: 1, compound: false, shipping: true }],
};

beforeEach(async () => {
  db = await createRxDatabase({ name: `reopen${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema },
    register_sessions: registerSessionCreator() });
});
afterEach(async () => { vi.restoreAllMocks(); await db.remove(); });

function deps(context = taxContext) {
  return { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext: context, now: () => now };
}
function storedOrder(percentage = false): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext });
  const line = builder.addLine({ productId: '11', variantId: '12', name: 'Shirt', sku: 'SHIRT', taxClass: 'standard',
    unitPrice: { amount: 1200, currency: 'EUR' }, regularUnitPriceMinor: 1500, quantity: 2 });
  builder.applyLineDiscount(line, { type: 'fixed', value: 120, label: 'Staff' });
  builder.addLine({ productId: 'custom', name: 'Alteration', sku: 'ALTER', custom: true, taxClass: 'reduced',
    taxStatus: 'taxable', unitPrice: { amount: 700, currency: 'EUR' } });
  builder.applyOrderDiscount({ type: percentage ? 'percentage' : 'fixed', value: percentage ? 10 : 200 });
  builder.addFee({ name: 'Handling', amountMinor: 100, taxClass: 'standard', taxStatus: 'taxable' });
  builder.addShipping({ name: 'Delivery', amountMinor: 200, taxClass: 'reduced', taxStatus: 'taxable', methodId: 'flat_rate' });
  builder.addPayment({ method: 'cash', amountMinor: 5000 });
  builder.addPayment({ method: 'external', amountMinor: 500, reference: 'card-123' });
  builder.setCustomer({ id: '42', name: 'Buyer', email: 'buyer@example.com' });
  builder.setNote('Keep the receipt');
  return { ...finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 6 }, now: new Date('2026-10-06T12:00:00Z') }),
    syncStatus: 'rejected', error, coupons: [{ code: 'save10', couponId: '7', discountMinor: 100, discountTaxMinor: 0 }] };
}
async function draft(id: string): Promise<Order> {
  const row = await db.order_drafts.findOne(id).exec();
  expect(row).not.toBeNull();
  return JSON.parse(row!.data);
}
function totals(order: Order | PosOrder) {
  return { totalMinor: order.totalMinor, subtotalMinor: order.subtotalMinor, discountMinor: order.discountMinor, taxMinor: order.taxMinor };
}

it.each([
  ['coupon_invalid', false], ['total_mismatch', false], ['coupon_invalid', true],
] as const)('reopens %s with percentage order discount = %s and resumes with the stored totals', async (code, percentage) => {
  const order = storedOrder(percentage);
  order.error = { ...error, code };
  const document = await db.pos_orders.insert(order);
  const before = document.toJSON();
  const taxClassOf = vi.fn(() => undefined);
  const id = await reopenRefusedOrder(order.id, { ...deps(), taxClassOf });
  expect(id).toBe(order.id);
  const saved = await draft(id);
  expect(totals(saved)).toEqual(totals(order));
  expect(saved.coupons).toBeUndefined();
  expect(saved.payments.map(({ id: _id, ...payment }) => payment)).toEqual(order.payments.map(({ method, amountMinor, reference }) => ({
    method, amountMinor, ...(reference !== undefined ? { reference } : {}),
  })));
  expect(order.payments[0].changeMinor).toBeGreaterThan(0);
  expect(saved.note).toBe(`Refused by the store: ${error.message}\nKeep the receipt`);
  expect(saved.customer).toEqual(order.customer);
  expect(saved.lineItems[0]).toMatchObject({ productId: '11', variantId: '12', name: 'Shirt', sku: 'SHIRT',
    quantity: 2, unitPriceMinor: 1200, regularUnitPriceMinor: 1500, taxClass: 'standard' });
  expect(saved.lineItems[0].discounts).toEqual([expect.objectContaining({ type: 'fixed', value: 120, label: 'Staff' })]);
  expect(saved.lineItems[1]).toMatchObject({ custom: true, taxClass: 'reduced', name: 'Alteration', sku: 'ALTER' });
  expect(saved.fees?.map(({ id: _id, ...fee }) => fee)).toEqual(order.fees?.map(({ id: _id, ...fee }) => fee));
  expect(saved.shipping?.map(({ id: _id, ...shipping }) => shipping)).toEqual(order.shipping?.map(({ id: _id, ...shipping }) => shipping));
  expect(totals(restoreOrderDraft(saved, { currency: order.currency, taxContext }).getSnapshot())).toEqual(totals(order));
  expect(document.getLatest().toJSON()).toEqual({ ...before, reopenedAt: now.toISOString(), updatedAt: now.toISOString() });
  expect(taxClassOf).toHaveBeenCalledExactlyOnceWith('11', '12');
  await expect(reopenRefusedOrder(order.id, deps())).rejects.toMatchObject({ reason: 'already_reopened' });
  expect(await db.order_drafts.count().exec()).toBe(1);
});

it('the reopened sale finalizes and stores', async () => {
  const order = storedOrder();
  await db.pos_orders.insert(order);
  const saved = await draft(await reopenRefusedOrder(order.id, deps()));
  const restored = restoreOrderDraft(saved, { currency: order.currency, taxContext });
  const finalized = finalizeOrder(restored.getSnapshot(), { capabilities: { orderCreate: 6 } });
  const document = await db.pos_orders.insert(finalized);
  const stored = document.toJSON();
  expect(stored.id).toBe(finalized.id);
  expect(stored.saleId).toBe(order.id);
  expect(stored.saleId!.length).toBeLessThanOrEqual(36);
  expect(stored.id).not.toBe(order.id);
  expect(stored.payments.map(({ method, amountMinor, reference }) => ({ method, amountMinor, reference })))
    .toEqual(order.payments.map(({ method, amountMinor, reference }) => ({ method, amountMinor, reference })));
});

it.each<{ reason: ReopenRefusal; patch?: Partial<PosOrder>; session?: 'closed'; missing?: boolean }>([
  { reason: 'not_found', missing: true },
  { reason: 'not_rejected', patch: { syncStatus: 'applied' } },
  { reason: 'code_not_reopenable', patch: { error: { code: 'validation_failed', message: 'Invalid order' } } },
  { reason: 'already_reopened', patch: { reopenedAt: now.toISOString() } },
  { reason: 'session_closed', patch: { sessionId: 'closed-session' }, session: 'closed' },
  { reason: 'session_closed', patch: { sessionId: 'missing-session' } },
])('refuses $reason without writing a draft or changing the order', async ({ reason, patch, session, missing }) => {
  const order = { ...storedOrder(), ...patch };
  const document = missing ? undefined : await db.pos_orders.insert(order);
  const before = document?.toJSON();
  if (session) await db.register_sessions.insert({ id: order.sessionId!, register_id: 'register', status: session,
    opened_at_gmt: '2026-10-06T08:00:00Z', closed_at_gmt: '2026-10-06T18:00:00Z', counted_float_minor: 10000 });
  const result = reopenRefusedOrder(order.id, deps());
  await expect(result).rejects.toBeInstanceOf(ReopenRefusedOrderError);
  await expect(result).rejects.toMatchObject({ orderId: order.id, reason, message: expect.stringContaining(reason) });
  expect(await db.order_drafts.count().exec()).toBe(0);
  expect(document?.getLatest().toJSON()).toEqual(before);
  if (missing) expect(await db.pos_orders.count().exec()).toBe(0);
});

it.each(['open', 'absent', 'late'] as const)('allows an %s session association', async (kind) => {
  const order = storedOrder();
  if (kind !== 'absent') {
    await db.register_sessions.insert({ id: 'session', register_id: 'register', status: kind === 'open' ? 'open' : 'closed',
      opened_at_gmt: '2026-10-06T08:00:00Z', counted_float_minor: 10000 });
    if (kind === 'open') order.sessionId = 'session';
    else order.lateSessionId = 'session';
  }
  await db.pos_orders.insert(order);
  expect((await draft(await reopenRefusedOrder(order.id, deps()))).totalMinor).toBe(order.totalMinor);
});

it('uses stored line discounts without display and applies no order discount', async () => {
  const order = storedOrder();
  delete order.display;
  delete order.coupons;
  await db.pos_orders.insert(order);
  const saved = await draft(await reopenRefusedOrder(order.id, deps()));
  expect(totals(saved)).toEqual(totals(order));
  expect(saved.discounts).toEqual([]);
  for (const [i, line] of saved.lineItems.entries()) expect(line.discounts).toEqual([
    expect.objectContaining({ type: 'fixed', value: order.lines[i].discountMinor, label: 'Discount' }),
  ]);
});

it('uses own-mode stored figures for a converted line without coupons under default rounding', async () => {
  const context: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 200000 };
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: context });
  const lineId = builder.addLine({ productId: '11', name: 'Inclusive shirt',
    unitPrice: { amount: 1200, currency: 'EUR', taxInclusive: true }, quantity: 2 });
  builder.applyLineDiscount(lineId, { type: 'fixed', value: 120, label: 'Staff' });
  builder.applyOrderDiscount({ type: 'fixed', value: 240 });
  builder.addPayment({ method: 'cash', amountMinor: 3000 });
  const order: PosOrder = { ...finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 6 } }), syncStatus: 'rejected', error };
  expect(order.lines[0].taxInclusive).toBe(true);
  expect(order.display!.lines[0].discounts[0].amountMinor).toBe(100);
  await db.pos_orders.insert(order);
  const saved = await draft(await reopenRefusedOrder(order.id, deps(context)));
  expect(totals(saved)).toEqual(totals(order));
  expect(saved.discounts).toEqual([]);
  expect(saved.lineItems[0].discounts).toEqual([expect.objectContaining({ type: 'fixed', value: 360, label: 'Discount' })]);
});

it("keeps the stored tax rates when the store's rate has changed", async () => {
  const sold: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 200000 };
  const changed: TaxContext = { pricesIncludeTax: false, getTaxRatePpm: () => 250000 };
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: sold });
  builder.addLine({ productId: '11', name: 'Shirt', unitPrice: { amount: 1000, currency: 'EUR' }, quantity: 2 });
  builder.addPayment({ method: 'cash', amountMinor: 3000 });
  const order: PosOrder = { ...finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 6 } }), syncStatus: 'rejected', error };
  await db.pos_orders.insert(order);
  const saved = await draft(await reopenRefusedOrder(order.id, deps(changed)));
  expect(totals(saved)).toEqual(totals(order));
  expect(saved.lineItems[0].taxLines.map((tax) => tax.ratePpm)).toEqual([200000]);
});

it('does not mark the refused order when the draft write fails', async () => {
  const document = await db.pos_orders.insert(storedOrder());
  const before = document.toJSON();
  vi.spyOn(db.order_drafts, 'upsert').mockRejectedValueOnce(new Error('draft write failed'));
  await expect(reopenRefusedOrder(document.id, deps())).rejects.toThrow('draft write failed');
  expect(document.getLatest().toJSON()).toEqual(before);
  expect(await db.order_drafts.count().exec()).toBe(0);
});

it('writes the draft before it marks the order', async () => {
  const document = await db.pos_orders.insert(storedOrder());
  const upsert = db.order_drafts.upsert;
  let markedBeforeWrite: boolean | undefined;
  vi.spyOn(db.order_drafts, 'upsert').mockImplementation(async (...args) => {
    const stored = await db.pos_orders.findOne(document.id).exec();
    markedBeforeWrite = Boolean(stored!.reopenedAt);
    return upsert.apply(db.order_drafts, args);
  });
  await reopenRefusedOrder(document.id, deps());
  expect(markedBeforeWrite).toBe(false);
  expect((await db.pos_orders.findOne(document.id).exec())!.reopenedAt).toBe(now.toISOString());
});

it('keeps the first reopenedAt when the order is marked during the draft write', async () => {
  const document = await db.pos_orders.insert(storedOrder());
  const upsert = db.order_drafts.upsert;
  vi.spyOn(db.order_drafts, 'upsert').mockImplementation(async (...args) => {
    const stored = await db.pos_orders.findOne(document.id).exec();
    await stored!.incrementalModify((data) => {
      data.reopenedAt = '2026-10-07T11:00:00.000Z';
      return data;
    });
    return upsert.apply(db.order_drafts, args);
  });
  await expect(reopenRefusedOrder(document.id, deps())).resolves.toBe(document.id);
  expect((await db.pos_orders.findOne(document.id).exec())!.reopenedAt).toBe('2026-10-07T11:00:00.000Z');
});

it('a retry after an unmarked reopen rewrites the same draft', async () => {
  const document = await db.pos_orders.insert(storedOrder());
  const id = await reopenRefusedOrder(document.id, deps());
  const first = await draft(id);
  const stored = await db.pos_orders.findOne(document.id).exec();
  await stored!.incrementalModify((data) => {
    delete data.reopenedAt;
    return data;
  });
  expect(await reopenRefusedOrder(document.id, deps())).toBe(first.id);
  expect(await db.order_drafts.count().exec()).toBe(1);
  expect(totals(await draft(first.id))).toEqual(totals(first));
  expect((await db.pos_orders.findOne(document.id).exec())!.reopenedAt).toBe(now.toISOString());
});

it.each([null, { name: 'No id' }, { id: '42' }, { id: 'bad\u0000id', name: 'Bad id' },
  { id: '42', name: 'Bad email', email: 'bad\u0000email' }])('omits an incomplete or refused customer: %j', async (customer) => {
  const order = { ...storedOrder(), customer };
  await db.pos_orders.insert(order);
  expect((await draft(await reopenRefusedOrder(order.id, deps()))).customer).toBeNull();
});

it('exports only the two reopenable refusal codes', () => {
  expect(REOPENABLE_CODES).toEqual(['coupon_invalid', 'total_mismatch']);
});
