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
const [entry] = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 200000, zero: 0 } };

describe('useSale ADR-075 charges', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salecharges${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    return renderHook(() => useSale(pricing, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 3 }, drafts: db.pos_drafts, ...overrides }), { wrapper: Wrapper });
  }

  it('returns the supplied capabilities unchanged', () => {
    const capabilities = { orderCreate: 5, lineTax: { none: true, classes: false } } as const;
    const { result } = renderSale({ capabilities });
    expect(result.current.capabilities).toBe(capabilities);
  });

  it('returns undefined capabilities when none are passed', () => {
    const wrapper = ({ children }: { children: ReactNode }) => <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    const { result } = renderHook(() => useSale(pricing, { registerId: 'register-1', cashierRef: 'cashier@store.test' }), { wrapper });
    expect(result.current.capabilities).toBeUndefined();
  });

  it('adds, updates and removes fees and shipping, returning their ids', () => {
    const { result } = renderSale();
    let fee!: { id: string } | string, shipping!: { id: string } | string;
    act(() => {
      fee = result.current.addFee({ name: 'Bag', amountMinor: 120 });
      shipping = result.current.addShipping({ name: 'Delivery', amountMinor: 240, methodId: 'post' });
    });
    expect(fee).toEqual({ id: expect.any(String) });
    expect(shipping).toEqual({ id: expect.any(String) });
    if (typeof fee === 'string' || typeof shipping === 'string') throw new Error('Charge refused');
    const feeId = fee.id, shippingId = shipping.id;
    expect(result.current.order.totalMinor).toBe(432);
    expect(result.current.idle).toBe(false);
    act(() => {
      expect(result.current.updateFee(feeId, { name: 'Service', amountMinor: 360 })).toBeNull();
      expect(result.current.updateShipping(shippingId, { taxStatus: 'none', methodId: 'courier' })).toBeNull();
    });
    expect(result.current.order).toMatchObject({ totalMinor: 672, taxMinor: 72,
      fees: [{ id: feeId, name: 'Service', amountMinor: 360 }],
      shipping: [{ id: shippingId, methodId: 'courier', taxStatus: 'none' }] });
    act(() => {
      expect(result.current.removeFee(feeId)).toBeNull();
      expect(result.current.removeShipping(shippingId)).toBeNull();
    });
    expect(result.current.order.totalMinor).toBe(0);
    expect(result.current.order).not.toHaveProperty('fees');
    expect(result.current.order).not.toHaveProperty('shipping');
  });

  it('adds distinct custom lines with synthetic product ids and their requested tax status', () => {
    const { result } = renderSale();
    act(() => {
      expect(result.current.addCustomLine({ name: 'Misc', priceMinor: 600, quantity: 2, taxStatus: 'none', sku: 'MISC' }))
        .toEqual({ id: expect.any(String) });
      result.current.addCustomLine({ name: 'Misc', priceMinor: 600, taxClass: 'zero' });
    });
    expect(result.current.order.lineItems).toMatchObject([
      { productId: expect.stringMatching(/^custom:/), custom: true, name: 'Misc', sku: 'MISC', quantity: 2, taxStatus: 'none', taxMicros: '0' },
      { productId: expect.stringMatching(/^custom:/), custom: true, taxMicros: '0' },
    ]);
    expect(result.current.order.lineItems[0].productId).not.toBe(result.current.order.lineItems[1].productId);
    expect(result.current.order.totalMinor).toBe(1800);
  });

  it('returns builder refusals as strings', () => {
    const { result } = renderSale();
    act(() => {
      expect(result.current.addFee({ name: 'Bag', amountMinor: -1 })).toBe('Amount must be >= 0');
      expect(result.current.addShipping({ name: '', amountMinor: 10 })).toBe('Name must not be empty');
      expect(result.current.updateFee('missing', {})).toBe('Unknown fee missing');
      expect(result.current.removeFee('missing')).toBe('Unknown fee missing');
      expect(result.current.updateShipping('missing', {})).toBe('Unknown shipping missing');
      expect(result.current.removeShipping('missing')).toBe('Unknown shipping missing');
      expect(result.current.addCustomLine({ name: 'Misc', priceMinor: 1.5 })).toBe('Price must be integer minor units');
    });
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order).not.toHaveProperty('fees');
    expect(result.current.order).not.toHaveProperty('shipping');
  });

  it('refuses every new mutator with SALE_SAVING while a save is pending', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { result } = renderSale({ onSaleCompleted: () => gate });
    act(() => {
      result.current.add(entry, traits);
      result.current.addTender({ method: 'cash', amountMinor: 1440 });
    });
    const before = result.current.order;
    let completion!: Promise<void>;
    act(() => { completion = result.current.complete(); });
    act(() => {
      expect(result.current.addFee({ name: 'Bag', amountMinor: 120 })).toBe(SALE_SAVING);
      expect(result.current.updateFee('missing', {})).toBe(SALE_SAVING);
      expect(result.current.removeFee('missing')).toBe(SALE_SAVING);
      expect(result.current.addShipping({ name: 'Post', amountMinor: 120 })).toBe(SALE_SAVING);
      expect(result.current.updateShipping('missing', {})).toBe(SALE_SAVING);
      expect(result.current.removeShipping('missing')).toBe(SALE_SAVING);
      expect(result.current.addCustomLine({ name: 'Misc', priceMinor: 600 })).toBe(SALE_SAVING);
    });
    expect(result.current.order).toEqual(before);
    await act(async () => { release(); await completion; });
  });

  it('parks and resumes fees, shipping and custom lines with identical totals and discounts', async () => {
    const { result } = renderSale();
    act(() => {
      result.current.add(entry, traits);
      const custom = result.current.addCustomLine({ name: 'Misc', priceMinor: 600, quantity: 2, taxStatus: 'none', sku: 'MISC' });
      if (typeof custom === 'string') throw new Error(custom);
      result.current.applyDiscount(custom.id, { type: 'fixed', value: 120 });
      result.current.addFee({ name: 'Service', amountMinor: 120, taxClass: 'zero' });
      result.current.addShipping({ name: 'Delivery', amountMinor: 240, methodId: 'post' });
      result.current.applyDiscount(null, { type: 'percentage', value: 10 });
    });
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    const doc = await db.pos_drafts.findOne(before.id).exec();
    expect(JSON.parse(doc!.toJSON().data)).toEqual(JSON.parse(JSON.stringify(before)));
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order).not.toHaveProperty('fees');
    expect(result.current.order).not.toHaveProperty('shipping');
    await act(async () => { expect(await result.current.resume(before.id)).toBeNull(); });
    const after = result.current.order;
    expect(after).toMatchObject({ subtotalMinor: before.subtotalMinor, discountMinor: before.discountMinor,
      taxMinor: before.taxMinor, totalMinor: before.totalMinor, balanceDueMinor: before.balanceDueMinor });
    expect(after.fees!.map(({ id: _id, ...charge }) => charge)).toEqual(before.fees!.map(({ id: _id, ...charge }) => charge));
    expect(after.shipping!.map(({ id: _id, ...charge }) => charge)).toEqual(before.shipping!.map(({ id: _id, ...charge }) => charge));
    expect(after.lineItems[1]).toMatchObject({ custom: true, taxStatus: 'none', productId: before.lineItems[1].productId,
      netMinor: before.lineItems[1].netMinor, taxMicros: '0', quantity: 2, sku: 'MISC' });
    expect(after.display).toMatchObject({ subtotalMinor: before.display.subtotalMinor,
      discountMinor: before.display.discountMinor, totalMinor: before.display.totalMinor });
    expect(await db.pos_drafts.findOne(before.id).exec()).toBeNull();
  });

  it('keeps a charge-only cart through park and resume and refuses to overwrite it', async () => {
    const { result } = renderSale();
    act(() => { result.current.addFee({ name: 'Service', amountMinor: 120 }); });
    const before = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    act(() => { result.current.addShipping({ name: 'Post', amountMinor: 240 }); });
    await act(async () => { expect(await result.current.resume(before.id)).toBe('Park or clear the current sale first'); });
    act(() => { result.current.newSale(); });
    await act(async () => { expect(await result.current.resume(before.id)).toBeNull(); });
    expect(result.current.order).toMatchObject({ fees: [{ name: 'Service', amountMinor: 120 }], totalMinor: before.totalMinor });
  });

  it('refuses completion with the finalize message and leaves the sale open', async () => {
    const onSaleCompleted = vi.fn();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      result.current.add(entry, traits);
      result.current.addFee({ name: 'Service', amountMinor: 120 });
      result.current.startTender('cash');
      result.current.addTender({ method: 'cash', amountMinor: 1584 });
    });
    const before = result.current.order;
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe("finalize: fees, shipping and custom lines need the store to accept order.create version 5; update the store's TallyUI plugin");
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
    expect(result.current.saving).toBe(false);
    expect(result.current.order).toEqual(before);
    expect(onSaleCompleted).not.toHaveBeenCalled();
    act(() => { expect(result.current.removeFee(before.fees![0].id)).toBeNull(); });
  });
});
