import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { firstValueFrom } from 'rxjs';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { orderDraftSchema, parkedOrderSummaries$ } from '../order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { isPartlyPaid, openSales } from './open-sales';
import { SALE_IN_TENDER, SALE_PARTLY_PAID, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };

describe('useSale open sales (tabs)', () => {
  let db: RxDatabase;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `saletabs${Math.random().toString(36).slice(2)}`,
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
  const tabs = async (order: ReturnType<typeof useSale>['order']) => openSales(order, await firstValueFrom(parkedOrderSummaries$(db.pos_drafts)));
  const draftIds = async () => (await db.pos_drafts.find().exec()).map((doc) => doc.toJSON().id);

  it('switches between open sales, parking the current one and restoring the chosen one', async () => {
    const { result } = renderSale();
    act(() => {
      result.current.add(entries[0], traits);
      result.current.add(entries[1], traits);
      result.current.setCustomer({ id: 'c1', name: 'Alice' });
    });
    const a = result.current.order;
    await act(async () => { expect(await result.current.switchSale(null)).toBeNull(); });
    expect(result.current.order.lineItems).toEqual([]);
    expect(await draftIds()).toEqual([a.id]);
    act(() => result.current.add(entries[1], traits));
    const b = result.current.order;
    expect((await tabs(b)).map(({ id, current, customerName, itemCount, firstItem, totalMinor }) => ({ id, current, customerName, itemCount, firstItem, totalMinor }))).toEqual([
      { id: a.id, current: false, customerName: 'Alice', itemCount: 2, firstItem: a.lineItems[0].name, totalMinor: 2250 },
      { id: b.id, current: true, customerName: undefined, itemCount: 1, firstItem: b.lineItems[0].name, totalMinor: 1000 },
    ]);
    await act(async () => { expect(await result.current.switchSale(a.id)).toBeNull(); });
    expect(result.current.order.id).toBe(a.id);
    expect(result.current.order.customer).toEqual({ id: 'c1', name: 'Alice' });
    expect(result.current.order.lineItems.map((line) => line.variantId)).toEqual(['blue', 'red']);
    expect(await draftIds()).toEqual([b.id]);
    expect((await tabs(result.current.order)).map(({ id, current }) => ({ id, current }))).toEqual([
      { id: a.id, current: true }, { id: b.id, current: false },
    ]);
    await act(async () => { expect(await result.current.switchSale(a.id)).toBeNull(); });
    expect(await draftIds()).toEqual([b.id]);
  });

  it('starts a new sale from an empty cart without writing a draft', async () => {
    const { result } = renderSale();
    const before = result.current.order;
    await act(async () => { expect(await result.current.switchSale(null)).toBeNull(); });
    expect(await draftIds()).toEqual([]);
    expect(result.current.order.lineItems).toEqual([]);
    expect(await tabs(result.current.order)).toEqual([]);
    expect(result.current.order.id).not.toBe(before.id);
  });

  it('closes the current sale without parking it', async () => {
    const { result } = renderSale();
    act(() => result.current.add(entries[0], traits));
    const before = result.current.order;
    act(() => { expect(result.current.closeSale()).toBeNull(); });
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.id).not.toBe(before.id);
    expect(await draftIds()).toEqual([]);
  });

  it('keeps a partly paid sale on the till with its legs: switch and close are refused', async () => {
    const { result } = renderSale();
    act(() => {
      result.current.add(entries[0], traits);
      result.current.add(entries[1], traits);
    });
    act(() => result.current.startTender('external'));
    await act(async () => { expect(await result.current.switchSale(null)).toBe(SALE_IN_TENDER); });
    act(() => {
      result.current.setTender(null);
      expect(result.current.addTender({ method: 'external', amountMinor: 1000 })).toEqual(expect.any(String));
    });
    const before = result.current.order;
    const [tab] = await tabs(before);
    expect(tab).toMatchObject({ id: before.id, current: true, paidMinor: 1000, balanceDueMinor: 1250 });
    expect(isPartlyPaid(tab)).toBe(true);
    await act(async () => { expect(await result.current.switchSale(null)).toBe(SALE_PARTLY_PAID); });
    act(() => { expect(result.current.closeSale()).toBe(SALE_PARTLY_PAID); });
    expect(result.current.order).toEqual(before);
    expect(result.current.order.payments).toMatchObject([{ method: 'external', amountMinor: 1000 }]);
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
    expect(await draftIds()).toEqual([]);
  });

  it('resumes a draft whose legs took money at its parked prices, legs kept, and lists it partly paid', async () => {
    const prices = new Map([['blue', 1250]]);
    const { result } = renderSale({ currentPrice: (id) => prices.get(id) });
    act(() => result.current.add(entries[0], traits));
    act(() => { result.current.addTender({ method: 'external', amountMinor: 500 }); });
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const [parked] = await tabs(result.current.order);
    expect(parked).toMatchObject({ id: before.id, current: false, paidMinor: 500, balanceDueMinor: 750, firstItem: before.lineItems[0].name });
    expect(isPartlyPaid(parked)).toBe(true);
    prices.set('blue', 1500);
    await act(async () => { expect(await result.current.resume(before.id)).toBeNull(); });
    expect(result.current.order.lineItems).toMatchObject([{ variantId: 'blue', unitPriceMinor: 1250 }]);
    expect(result.current.order.payments).toMatchObject([{ method: 'external', amountMinor: 500 }]);
    expect(result.current.order).toMatchObject({ paidMinor: 500, balanceDueMinor: 750 });
    expect(result.current.error).toBeNull();
  });
});
