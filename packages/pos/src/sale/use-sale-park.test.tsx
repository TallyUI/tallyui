import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreOrder, StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { createOrderBuilder, orderDraftSchema, writeOrderDraft, type Order } from '../order';
import { orderBuilderFromStoreOrder } from '../order/from-store-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { SALE_SAVING, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };

describe('useSale park and resume', () => {
  let db: RxDatabase;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `salepark${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
      multiInstance: false,
    });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });

  afterEach(async () => {
    cleanup();
    await db.remove();
  });

  function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    return renderHook(() => useSale(pricing, {
      registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 },
      drafts: db.pos_drafts, ...overrides,
    }), { wrapper: Wrapper });
  }

  function addSaleLines(result: { current: ReturnType<typeof useSale> }) {
    act(() => {
      result.current.add(entries[0], traits);
      result.current.add(entries[1], traits);
      result.current.add(entries[0], traits);
    });
  }

  it('stores one draft with the cart figures and leaves an empty cart', async () => {
    const { result } = renderSale();
    addSaleLines(result);
    act(() => result.current.setCustomer({ id: 'c1', name: 'Alice' }));
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const drafts = await db.pos_drafts.find().exec();
    expect(drafts).toHaveLength(1);
    expect(drafts[0].toJSON()).toMatchObject({
      id: before.id, customerName: 'Alice', itemCount: before.lineItems.length, total: before.totalMinor,
    });
    expect(JSON.parse(drafts[0].toJSON().data)).toEqual(JSON.parse(JSON.stringify(before)));
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.customer).toBeNull();
    expect(result.current.order.id).not.toBe(before.id);
    expect(result.current.stage).toEqual({ kind: 'cart' });
  });

  it('refuses to clear a cart that changed while parking', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const upsert = db.pos_drafts.upsert.bind(db.pos_drafts);
    vi.spyOn(db.pos_drafts, 'upsert').mockImplementation(async (draft) => {
      await gate;
      return upsert(draft);
    });
    const { result } = renderSale();
    act(() => result.current.add(entries[0], traits));
    const before = result.current.order;
    let parking!: Promise<string | null>;
    act(() => { parking = result.current.park(); });
    act(() => result.current.add(entries[1], traits));
    await act(async () => {
      release();
      expect(await parking).toBe('The sale changed while it was being parked; park it again');
    });
    expect(result.current.order.id).toBe(before.id);
    expect(result.current.order.lineItems.map((line) => line.variantId)).toEqual(['blue', 'red']);
    const drafts = await db.pos_drafts.find().exec();
    expect(drafts).toHaveLength(1);
    expect(JSON.parse(drafts[0].toJSON().data)).toEqual(JSON.parse(JSON.stringify(before)));
  });

  it('refuses to replace a cart that changed while resuming', async () => {
    const { result } = renderSale();
    act(() => result.current.add(entries[0], traits));
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const findOne = db.pos_drafts.findOne.bind(db.pos_drafts);
    vi.spyOn(db.pos_drafts, 'findOne').mockImplementation(((id: string) => {
      const query = findOne(id);
      const exec = query.exec.bind(query);
      query.exec = (async () => {
        await gate;
        return exec();
      }) as typeof query.exec;
      return query;
    }) as typeof findOne);
    let resuming!: Promise<string | null>;
    act(() => { resuming = result.current.resume(before.id); });
    act(() => result.current.add(entries[1], traits));
    await act(async () => {
      release();
      expect(await resuming).toBe('The sale changed while it was being resumed; resume it again');
    });
    expect(result.current.order.lineItems.map((line) => line.variantId)).toEqual(['red']);
    const draft = await db.pos_drafts.findOne(before.id).exec();
    expect(draft).not.toBeNull();
    expect(draft!.toJSON().id).toBe(before.id);
    expect(JSON.parse(draft!.toJSON().data)).toEqual(JSON.parse(JSON.stringify(before)));
  });

  it('restores the order id, lines, quantities, prices and discounts, and removes the draft', async () => {
    const { result } = renderSale();
    addSaleLines(result);
    act(() => {
      const lineId = result.current.order.lineItems[0].id;
      result.current.setQuantity(lineId, 3);
      expect(result.current.setUnitPrice(lineId, 800)).toBeNull();
      expect(result.current.applyDiscount(lineId, { type: 'percentage', value: 10, label: 'Line offer' })).toBeNull();
      expect(result.current.applyDiscount(null, { type: 'fixed', value: 100, label: 'Loyalty' })).toBeNull();
      result.current.setCustomer({ id: 'c1', name: 'Alice' });
    });
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    await act(async () => { expect(await result.current.resume(before.id)).toBeNull(); });
    expect(result.current.order.id).toBe(before.id);
    // OrderManager re-adds lines and discounts, giving them new ids.
    expect(result.current.order.lineItems).toMatchObject(before.lineItems.map(({ id: _, discounts, ...line }) => ({
      ...line, discounts: discounts.map(({ id: __, ...discount }) => discount),
    })));
    expect(result.current.order.discounts).toMatchObject(before.discounts.map(({ id: _, ...discount }) => discount));
    expect(result.current.order.customer).toEqual(before.customer);
    expect(result.current.order.totalMinor).toBe(before.totalMinor);
    expect(result.current.stage).toEqual({ kind: 'cart' });
    expect(await db.pos_drafts.find().exec()).toHaveLength(0);
  });

  it('re-prices from the current catalogue on resume and reports the changed line', async () => {
    const prices = new Map([['blue', 1250], ['red', 1000]]);
    const { result } = renderSale({ currentPrice: (id) => prices.get(id) });
    addSaleLines(result);
    const draftId = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    prices.set('blue', 1500);
    await act(async () => { expect(await result.current.resume(draftId)).toBeNull(); });
    expect(result.current.order.lineItems).toMatchObject([
      { variantId: 'blue', unitPriceMinor: 1500, quantity: 2, netMinor: 3000 },
      { variantId: 'red', unitPriceMinor: 1000, quantity: 1, netMinor: 1000 },
    ]);
    expect(result.current.order.totalMinor).toBe(5000);
    expect(result.current.error).toBe("Prices changed since this sale was parked: 1 line updated to today's price.");
    expect(await db.pos_drafts.findOne(draftId).exec()).toBeNull();
  });

  it("a parked reopened store order keeps the store's prices on resume", async () => {
    const read: StoreOrder = {
      id: '41', reference: '41', clientOrderId: 'u-1', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', status: 'completed',
      placedAt: '2026-11-17T10:00:00.000Z', currency: pricing.currency, pricesIncludeTax: false, customer: null,
      lines: [{ id: '7', productId: 'shirt', variantId: 'blue', name: 'Shirt', quantity: 1,
        subtotalMinor: 1000, totalMinor: 1000, subtotalTaxMinor: 250, taxMinor: 250 }],
      fees: [], shipping: [], coupons: [], refunds: [], taxLines: [], payments: [],
      discountMinor: 0, discountTaxMinor: 0, taxMinor: 250, totalMinor: 1250,
    };
    const snapshot = orderBuilderFromStoreOrder(read, {
      currency: pricing.currency, taxContext: { getTaxRatePpm: () => 250000, pricesIncludeTax: false },
    }).getSnapshot();
    await writeOrderDraft(db.pos_drafts, snapshot);
    const prices = new Map([['blue', 1250]]);
    const { result } = renderSale({ currentPrice: (id) => prices.get(id) });
    await act(async () => { expect(await result.current.resume(snapshot.id)).toBeNull(); });
    expect(result.current.order.lineItems).toMatchObject([{ variantId: 'blue', unitPriceMinor: 1000 }]);
    expect(result.current.error).toBeNull();
    expect(result.current.order.storeOrder).toEqual({ id: '41', revision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', uuid: 'u-1' });
  });

  it.each(['keepParkedPrices', 'without currentPrice', 'unknown variant'])(
    'keeps the parked prices without a message: %s', async (mode) => {
      const prices = new Map([['blue', 1250], ['red', 1000]]);
      const { result } = renderSale({ currentPrice: mode === 'without currentPrice' ? undefined : (id) => prices.get(id) });
      addSaleLines(result);
      const before = result.current.order;
      await act(async () => { expect(await result.current.park()).toBeNull(); });
      prices.set('blue', 1500);
      if (mode === 'unknown variant') prices.delete('blue');
      await act(async () => {
        expect(await result.current.resume(before.id, mode === 'keepParkedPrices' ? { keepParkedPrices: true } : undefined)).toBeNull();
      });
      expect(result.current.order.lineItems).toMatchObject([
        { variantId: 'blue', unitPriceMinor: 1250, quantity: 2 },
        { variantId: 'red', unitPriceMinor: 1000, quantity: 1 },
      ]);
      expect(result.current.order.totalMinor).toBe(before.totalMinor);
      expect(result.current.error).toBeNull();
    },
  );

  it('refuses to park an empty cart or a sale during tender', async () => {
    const { result } = renderSale();
    await act(async () => { expect(await result.current.park()).toBe('There is nothing to park'); });
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    const before = result.current.order;
    await act(async () => {
      expect(await result.current.park()).toBe('Finish or cancel the payment before parking the sale');
    });
    expect(result.current.order).toEqual(before);
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
    expect(await db.pos_drafts.find().exec()).toHaveLength(0);
  });

  it('refuses to resume over a cart with lines or a missing draft', async () => {
    const { result } = renderSale();
    addSaleLines(result);
    const draftId = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    addSaleLines(result);
    const before = result.current.order;
    await act(async () => { expect(await result.current.resume(draftId)).toBe('Park or clear the current sale first'); });
    expect(result.current.order).toEqual(before);
    expect(await db.pos_drafts.find().exec()).toHaveLength(1);
    act(() => result.current.newSale());
    const empty = result.current.order;
    await act(async () => { expect(await result.current.resume('missing')).toBe('That parked sale is no longer there'); });
    expect(result.current.order).toEqual(empty);
    expect(await db.pos_drafts.find().exec()).toHaveLength(1);
  });

  it('returns SALE_SAVING for park and resume while a completion is pending', async () => {
    const completed = vi.fn().mockRejectedValueOnce(new Error('Storage full')).mockResolvedValue(undefined);
    const { result } = renderSale({ onSaleCompleted: completed });
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); });
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBe(SALE_SAVING); });
    expect(result.current.error).toBe(SALE_SAVING);
    await act(async () => { expect(await result.current.resume('missing')).toBe(SALE_SAVING); });
    expect(result.current.error).toBe(SALE_SAVING);
    expect(result.current.order).toEqual(before);
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
    expect(await db.pos_drafts.find().exec()).toHaveLength(0);
    await act(async () => { await result.current.complete(); });
    expect(completed.mock.calls[1][0]).toBe(completed.mock.calls[0][0]);
    expect(result.current.stage.kind).toBe('receipt');
  });
});

// 5.2 F3: a resumed or re-taxed sale re-derives each class-taxed line from the current context; a paid draft keeps its rates.
describe('useSale re-derives class-taxed line rates (5.2 F3)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salerederive${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  const reducedTraits = { ...traits, getTaxClass: () => 'reduced' };
  const red = entries[1]; // 10.00
  const at = (ratePpm: number): StoreSettings => ({ currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0, reduced: ratePpm } });
  const figures = (order: Order) => ({ taxMinor: order.taxMinor, totalMinor: order.totalMinor, ratePpm: order.lineItems[0].taxLines[0].ratePpm });

  function renderSale(settings: StoreSettings, overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
    const state = { settings };
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(state.settings)}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale(state.settings, {
      registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, drafts: db.pos_drafts, ...overrides,
    }), { wrapper: Wrapper });
    return { ...hook, state };
  }
  function addTwo(result: { current: ReturnType<typeof useSale> }) {
    act(() => { result.current.add(red, reducedTraits); result.current.add(red, reducedTraits); });
    expect(result.current.order.lineItems.map((line) => line.quantity)).toEqual([2]);
  }

  it('US1: a cart parked at 10% resumes at the store\'s new 20%', async () => {
    const { result, rerender, state } = renderSale(at(100000));
    addTwo(result);
    expect(figures(result.current.order)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
    const draftId = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    state.settings = at(200000);
    rerender();
    await act(async () => { expect(await result.current.resume(draftId)).toBeNull(); });
    expect(figures(result.current.order)).toEqual({ taxMinor: 400, totalMinor: 2400, ratePpm: 200000 });
  });

  it('US2: a parked draft with a captured leg keeps the rate it was paid against', async () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: (c) => c === 'reduced' ? 100000 : 0 } });
    builder.addLine({ productId: 'shirt', variantId: 'red', name: 'Shirt', taxClass: 'reduced', unitPrice: { amount: 1000, currency: 'EUR' }, quantity: 2 });
    builder.addPayment({ method: 'cash', amountMinor: 500 });
    const draft = builder.getSnapshot();
    expect(draft.lineItems[0]).toHaveProperty('taxFromClass', true);
    await writeOrderDraft(db.pos_drafts, draft);
    const { result } = renderSale(at(200000));
    await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
    expect(result.current.order.paidMinor).toBe(500);
    expect(figures(result.current.order)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
  });

  it('US3: setCustomer re-taxes a class-taxed cart to the customer\'s 20%', () => {
    const settings = at(100000);
    const base = { pricesIncludeTax: false, getTaxRatePpm: (c?: string) => c === 'reduced' ? 100000 : 0 };
    const picked = { pricesIncludeTax: false, getTaxRatePpm: (c?: string) => c === 'reduced' ? 200000 : 0 };
    const location = { taxBasedOn: 'base', location: { country: '', state: '', city: '', postcode: '' }, addressUsed: 'base' } as const;
    const taxContextFor = (customer: unknown) => ({ taxContext: customer ? picked : base, location });
    const { result } = renderSale(settings, { taxContextFor });
    addTwo(result);
    expect(figures(result.current.order)).toEqual({ taxMinor: 200, totalMinor: 2200, ratePpm: 100000 });
    act(() => result.current.setCustomer({ id: 'c1', name: 'Alice' }));
    expect(result.current.order.customer).toMatchObject({ id: 'c1' });
    expect(figures(result.current.order)).toEqual({ taxMinor: 400, totalMinor: 2400, ratePpm: 200000 });
  });
});
