import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderReopenEnvelope, StoreOrder, StoreSettings } from '@tallyui/core';
import { createOrderBuilder, orderDraftSchema, restoreOrderDraft, writeOrderDraft } from '../order';
import { STORE_ORDER_REBUILD_REFUSALS } from '../order/from-store-order';
import type { CommandTransport } from '../outbox/types';
import { posOrderCollection, type PosOrder } from '../pos-order';
import { isReopenOffered, reopenStoreOrder } from '../reopen';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { SALE_PARTLY_PAID, useSale } from './use-sale';

const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
let db: RxDatabase | undefined;

async function resumeSale(covered = false) {
  db = await createRxDatabase({
    name: `lockedlegs${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  const { pos_drafts: drafts, pos_orders: orders } = await db.addCollections({
    pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection(),
  });
  const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
  builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.addPayment({
    method: 'external', amountMinor: covered ? builder.getSnapshot().totalMinor : 500,
    reference: 'Cash', storePaymentId: 'p1', locked: true,
  });
  const snapshot = builder.getSnapshot();
  await writeOrderDraft(drafts, snapshot);
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 5 }, drafts,
    onSaleCompleted: async (order) => { await orders.insert(order); },
  }), { wrapper: Wrapper });
  await act(async () => { expect(await hook.result.current.resume(snapshot.id)).toBeNull(); });
  const lockedLeg = hook.result.current.order.payments.find((payment) => payment.storePaymentId === 'p1')!;
  return { ...hook, lockedLeg, orders };
}

async function emptySale() {
  db = await createRxDatabase({
    name: `lockedlegs${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  const { pos_drafts: drafts, pos_orders: orders } = await db.addCollections({
    pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection(),
  });
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, drafts,
    onSaleCompleted: async (order) => { await orders.insert(order); },
  }), { wrapper: Wrapper });
  return { ...hook, drafts };
}

function reopenedBuilder(taxes = taxContext) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxes, storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' } });
  builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.addPayment({ method: 'external', amountMinor: 500, reference: 'Cash', storePaymentId: 'p1', locked: true });
  return builder;
}

afterEach(async () => {
  cleanup();
  if (db) await db.remove();
  db = undefined;
});

describe('useSale locked legs', () => {
  it('holds a store order in the live sale and after parking it', async () => {
    const { result } = await emptySale();
    expect(await result.current.holdsStoreOrder('41')).toBe(false);
    act(() => { expect(result.current.openStoreOrder(reopenedBuilder().getSnapshot())).toBeNull(); });
    expect(await result.current.holdsStoreOrder('41')).toBe(true);
    expect(await result.current.holdsStoreOrder('42')).toBe(false);
    await act(async () => { expect(await result.current.switchSale(null)).toBeNull(); });
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.storeOrder).toBeUndefined();
    expect(await result.current.holdsStoreOrder('41')).toBe(true);
  });

  it('does not hold another store order that is parked', async () => {
    const { result } = await emptySale();
    act(() => { expect(result.current.openStoreOrder(reopenedBuilder().getSnapshot())).toBeNull(); });
    await act(async () => { expect(await result.current.switchSale(null)).toBeNull(); });
    expect(await result.current.holdsStoreOrder('42')).toBe(false);
    expect(await result.current.holdsStoreOrder('41')).toBe(true);
  });

  it('ignores a draft whose data does not parse', async () => {
    const { result, drafts } = await emptySale();
    await drafts.insert({ id: 'bad-data', data: 'not json' });
    expect(await result.current.holdsStoreOrder('41')).toBe(false);
  });

  it('openStoreOrder loads the kept line, locked leg and totals into an empty cart', async () => {
    const { result } = await emptySale();
    const order = reopenedBuilder().getSnapshot();
    act(() => { expect(result.current.openStoreOrder(order)).toBeNull(); });
    expect(result.current.order.storeOrder).toEqual(order.storeOrder);
    expect(result.current.order.lineItems).toMatchObject([{ storeLineId: '7' }]);
    expect(result.current.order.payments).toEqual([{ ...order.payments[0], id: expect.any(String) }]);
    expect(result.current.order.totalMinor).toBe(order.totalMinor);
    expect(result.current.order.taxMinor).toBe(order.taxMinor);
    expect(result.current.stage).toEqual({ kind: 'cart' });
  });

  it('openStoreOrder refuses a non-empty cart without changing it', async () => {
    const { result } = await emptySale();
    act(() => { expect(result.current.addCustomLine({ name: 'Cake', priceMinor: 200 })).toEqual({ id: expect.any(String) }); });
    const before = result.current.order;
    act(() => { expect(result.current.openStoreOrder(reopenedBuilder().getSnapshot())).toBe('Park or clear the current sale first'); });
    expect(result.current.order).toBe(before);
  });

  it('openStoreOrder refuses another currency', async () => {
    const { result } = await emptySale();
    const before = result.current.order;
    act(() => {
      expect(result.current.openStoreOrder({ ...reopenedBuilder().getSnapshot(), currency: 'USD' })).toBe('That order is in another currency');
    });
    expect(result.current.order).toBe(before);
  });

  it('openStoreOrder refuses totals changed by taxing a fee in the sale context', async () => {
    const { result } = await emptySale();
    const builder = reopenedBuilder({ getTaxRatePpm: () => 100000, pricesIncludeTax: false });
    builder.addFee({ name: 'Handling', amountMinor: 500, taxStatus: 'taxable', storeLineId: 'f1' });
    const order = builder.getSnapshot();
    expect(order.taxMinor).toBe(150);
    expect(order.totalMinor).toBe(1650);
    const before = result.current.order;
    act(() => { expect(result.current.openStoreOrder(order)).toBe(STORE_ORDER_REBUILD_REFUSALS.totals); });
    expect(result.current.order).toBe(before);
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.payments).toEqual([]);
  });

  it('openStoreOrder refuses a matching total whose tax differs', async () => {
    const { result } = await emptySale();
    const builder = createOrderBuilder({
      currency: 'EUR', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax: true },
      storeOrder: { id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' },
    });
    builder.addLine({
      productId: 'coffee', name: 'Coffee', storeLineId: '7',
      unitPrice: { amount: 1100, currency: 'EUR', taxInclusive: true },
    });
    builder.addFee({ name: 'Handling', amountMinor: 550, taxStatus: 'taxable', storeLineId: 'f1' });
    builder.addPayment({ method: 'external', amountMinor: 500, reference: 'Cash', storePaymentId: 'p1', locked: true });
    const order = builder.getSnapshot();
    const rebuilt = restoreOrderDraft(order, { currency: 'EUR', taxContext }).getSnapshot();
    expect(rebuilt.totalMinor).toBe(order.totalMinor);
    expect(rebuilt.taxMinor).not.toBe(order.taxMinor);
    const before = result.current.order;
    act(() => { expect(result.current.openStoreOrder(order)).toBe(STORE_ORDER_REBUILD_REFUSALS.totals); });
    expect(result.current.order).toBe(before);
    expect(result.current.order.lineItems).toEqual([]);
  });

  it('openStoreOrder throws for an order without storeOrder', async () => {
    const { result } = await emptySale();
    const order = createOrderBuilder({ currency: 'EUR', taxContext }).getSnapshot();
    expect(() => result.current.openStoreOrder(order)).toThrow('useSale: openStoreOrder() takes a reopened store order');
  });

  it('closeSale clears a reopened cart whose only paid legs are locked', async () => {
    const { result } = await emptySale();
    act(() => { expect(result.current.openStoreOrder(reopenedBuilder().getSnapshot())).toBeNull(); });
    act(() => { expect(result.current.closeSale()).toBeNull(); });
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.payments).toEqual([]);
    expect(result.current.order.storeOrder).toBeUndefined();
  });

  it('a reopened sale closed with closeSale can be reopened again', async () => {
    const revision = 'sha256:0dde575797fdab13e429b1132686c07af48e46096a03ea7adc6c3027082b8d2a';
    const read: StoreOrder = {
      id: '41', reference: '41', revision, status: 'pos-open', placedAt: '2026-11-17T10:00:00.000Z', currency: 'EUR',
      pricesIncludeTax: false, customer: null,
      lines: [{ id: '7', productId: 'coffee', name: 'Coffee', quantity: 1, subtotalMinor: 1000, totalMinor: 1000, subtotalTaxMinor: 0, taxMinor: 0 }],
      fees: [], shipping: [], coupons: [], refunds: [], discountMinor: 0, discountTaxMinor: 0, taxLines: [],
      taxMinor: 0, totalMinor: 1000, payments: [{ id: 'p1', method: 'pos_cash', amountMinor: 500 }],
    };
    const transport: CommandTransport<OrderReopenEnvelope> = {
      send: async ([envelope]) => ({
        kind: 'results', results: [{ id: envelope!.id, status: 'applied', reopen: { orderId: '41', status: 'pos-open', revision } }],
      }),
    };
    const { result } = await emptySale();
    const reopen = () => reopenStoreOrder(read, {
      transport, getOrders: async () => [read], openHere: result.current.holdsStoreOrder,
      identity: { cashierRef: '7', registerId: 'register-1', deviceId: 'till-1' },
      currency: 'EUR', taxContext, catalogue: () => ({}),
    });
    const first = await reopen();
    if (first.kind !== 'reopened') throw new Error(`Expected reopened, got ${first.kind}`);
    act(() => { expect(result.current.openStoreOrder(first.order)).toBeNull(); });
    act(() => { expect(result.current.closeSale()).toBeNull(); });
    expect(await result.current.holdsStoreOrder('41')).toBe(false);
    expect(isReopenOffered({ orderReopen: 1, orderCreate: 5, online: true, storageDegraded: false, orderId: '41' })).toBe(true);
    const second = await reopen();
    if (second.kind !== 'reopened') throw new Error(`Expected reopened, got ${second.kind}`);
    act(() => { expect(result.current.openStoreOrder(second.order)).toBeNull(); });
    expect(result.current.order.storeOrder).toMatchObject({ id: '41', revision });
  });

  it('closeSale refuses after an unlocked captured leg is added', async () => {
    const { result } = await emptySale();
    act(() => { expect(result.current.openStoreOrder(reopenedBuilder().getSnapshot())).toBeNull(); });
    act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 100, status: 'captured' })).toEqual(expect.any(String)); });
    expect(result.current.order.payments[1]).toMatchObject({ amountMinor: 100, status: 'captured' });
    expect(result.current.order.payments[1].locked).toBeUndefined();
    expect(result.current.stage).toEqual({ kind: 'cart' });
    const before = result.current.order;
    act(() => { expect(result.current.closeSale()).toBe(SALE_PARTLY_PAID); });
    expect(result.current.order).toBe(before);
  });

  it('switchSale parks a reopened cart with a balance due and only locked legs', async () => {
    const { result, drafts } = await emptySale();
    const order = reopenedBuilder().getSnapshot();
    act(() => { expect(result.current.openStoreOrder(order)).toBeNull(); });
    expect(result.current.order.balanceDueMinor).toBeGreaterThan(0);
    await act(async () => { expect(await result.current.switchSale(null)).toBeNull(); });
    const parked = await drafts.find().exec();
    expect(parked).toHaveLength(1);
    expect(JSON.parse(parked[0].toJSON().data).storeOrder).toEqual(order.storeOrder);
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.payments).toEqual([]);
    expect(result.current.order.storeOrder).toBeUndefined();
  });

  it('switchSale refuses an unlocked captured leg with a balance due', async () => {
    const { result, drafts } = await emptySale();
    act(() => { expect(result.current.openStoreOrder(reopenedBuilder().getSnapshot())).toBeNull(); });
    act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 100, status: 'captured' })).toEqual(expect.any(String)); });
    expect(result.current.order.payments[1]).toMatchObject({ amountMinor: 100, status: 'captured' });
    expect(result.current.order.payments[1].locked).toBeUndefined();
    expect(result.current.order.balanceDueMinor).toBeGreaterThan(0);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    const before = result.current.order;
    await act(async () => { expect(await result.current.switchSale(null)).toBe(SALE_PARTLY_PAID); });
    expect(result.current.order).toBe(before);
    expect(await drafts.find().exec()).toEqual([]);
  });

  it('resume keeps the store order, the kept line id and the locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    expect(result.current.order.storeOrder).toEqual({ id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298' });
    expect(result.current.order.lineItems).toMatchObject([{ storeLineId: '7' }]);
    expect(lockedLeg).toEqual({
      id: expect.any(String), method: 'external', amountMinor: 500,
      reference: 'Cash', storePaymentId: 'p1', locked: true,
    });
    expect(result.current.order.payments).toEqual([lockedLeg]);
  });

  it('removeTender leaves a locked leg on the sale', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { expect(() => result.current.removeTender(lockedLeg.id)).not.toThrow(); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    expect(result.current.error).toBeNull();
  });

  it('voidTender refuses a locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { expect(result.current.voidTender(lockedLeg.id)).toBe(false); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    expect(result.current.order.payments[0]).not.toHaveProperty('status');
  });

  it('an external tender takes only the balance after the locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.payments).toEqual([
      lockedLeg, { id: expect.any(String), method: 'external', amountMinor: result.current.order.totalMinor - 500 },
    ]);
    expect(result.current.order.payments[1]).not.toHaveProperty('storePaymentId');
    expect(result.current.order.payments[1]).not.toHaveProperty('locked');
  });

  it.each([
    ['addFee', 'fees', 'f9'], ['addShipping', 'shipping', 's9'],
  ] as const)('%s drops a caller-supplied store id', async (add, collection, storeLineId) => {
    const { result } = await resumeSale();
    act(() => {
      expect(result.current[add]({ name: 'Handling', amountMinor: 100, storeLineId })).toEqual({ id: expect.any(String) });
    });
    expect(result.current.order[collection]).toHaveLength(1);
    expect(result.current.order[collection]![0]).not.toHaveProperty('storeLineId');
  });

  it('complete finalizes a fully tendered reopened cart as the store order', async () => {
    const { result, orders } = await resumeSale();
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.balanceDueMinor).toBe(0);
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    const rows = await orders.find().exec();
    expect(rows).toHaveLength(1);
    const row = rows[0].toJSON() as PosOrder;
    expect(row).toMatchObject({
      storeOrderId: '41', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', refundDueMinor: 0,
    });
    expect(row.lines.find((line) => line.productId === 'coffee')?.storeLineId).toBe('7');
    // The stored row marks the store's locked leg by its storePaymentId (finalize-reopened.test.ts T1); it has no `locked` field.
    expect(row.payments).toEqual([
      { id: expect.any(String), storePaymentId: 'p1', method: 'external', amountMinor: 500, reference: 'Cash' },
      { id: expect.any(String), method: 'external', amountMinor: 500 },
    ]);
    expect(row.payments.reduce((sum, payment) => sum + payment.amountMinor, 0)).toBe(row.totalMinor);
  });

  it('a cash tender and a cancelled tender keep the locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.payments).toHaveLength(2);
    act(() => { result.current.startTender('cash'); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 100 }); });
    expect(result.current.order.payments).toHaveLength(2);
    act(() => { result.current.cancelTender(); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    expect(result.current.stage.kind).toBe('cart');
  });

  it('a locked leg that covers the total adds no external leg', async () => {
    const { result, lockedLeg } = await resumeSale(true);
    expect(lockedLeg.amountMinor).toBe(result.current.order.totalMinor);
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
  });
});
