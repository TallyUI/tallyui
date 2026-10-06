import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { orderDraftSchema } from '../order';
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
