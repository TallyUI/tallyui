import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { orderDraftSchema, type CustomerSummary, type Order } from '../order';
import { TaxProvider, type SaleTaxContext, type TaxContext } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { RESTORE_STALE, SALE_FINISHED, SALE_HAS_PAYMENT, useSale, type SaleRemoval } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries(['a', 'b', 'c'].map((id, i) => ({
  id, title: id.toUpperCase(), status: 'published', variants: [{ id: `${id}-v`, title: 'One', sku: id, prices: [{ amount: 10 * (i + 1), currency_code: 'eur' }] }],
})), traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 200000, zero: 0 } };
const totals = (order: Order) => ({ subtotalMinor: order.subtotalMinor, taxMinor: order.taxMinor, totalMinor: order.totalMinor });
type Sale = { current: ReturnType<typeof useSale> };

describe('useSale removal and restore (#1095)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `salerestore${Math.random().toString(36).slice(2)}`,
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
  function addThree(result: Sale) {
    act(() => { for (const entry of entries) result.current.add(entry, traits); });
    return result.current.order.lineItems.map((line) => line.id);
  }
  /** Takes the removal, then removes the line. */
  function removeLine(result: Sale, id: string): SaleRemoval {
    let removal: SaleRemoval | null = null;
    act(() => { removal = result.current.removal('line', id); result.current.remove(id); });
    expect(removal).not.toBeNull();
    return removal!;
  }
  function restore(result: Sale, removal: SaleRemoval) {
    let refusal: string | null = 'not run';
    act(() => { refusal = result.current.restore(removal); });
    return refusal;
  }

  it('T1: puts the middle line back where it was, with the totals as before the remove', () => {
    const { result } = renderSale();
    const ids = addThree(result);
    // An order discount: its base is each line's own net, so a restored line must carry none of its old share.
    act(() => { expect(result.current.applyDiscount(null, { type: 'percentage', value: 10 })).toBeNull(); });
    const before = result.current.order;
    const removal = removeLine(result, ids[1]);
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual([ids[0], ids[2]]);
    expect(restore(result, removal)).toBeNull();
    expect(result.current.order.lineItems).toEqual(before.lineItems);
    expect(totals(result.current.order)).toEqual(totals(before));
  });

  it('T2: an edited unit price, a percent discount, an edited SKU and quantity 3 survive the round trip', () => {
    const { result } = renderSale();
    const ids = addThree(result);
    act(() => {
      result.current.setQuantity(ids[1], 3);
      expect(result.current.setUnitPrice(ids[1], 1750)).toBeNull();
      expect(result.current.applyDiscount(ids[1], { type: 'percentage', value: 15 })).toBeNull();
      expect(result.current.updateLine(ids[1], { sku: 'EDITED' })).toBeNull();
    });
    const line = result.current.order.lineItems[1];
    expect(line).toMatchObject({ quantity: 3, unitPriceMinor: 1750, sku: 'EDITED', catalogueSku: 'b', discounts: [{ type: 'percentage', value: 15 }] });
    expect(restore(result, removeLine(result, ids[1]))).toBeNull();
    expect(result.current.order.lineItems[1]).toEqual(line);
  });

  it('T3: a restored line goes back at its old index, clamped to the end of a shorter cart', () => {
    const { result } = renderSale();
    let ids = addThree(result);
    const first = removeLine(result, ids[0]);
    removeLine(result, ids[2]);
    expect(restore(result, first)).toBeNull();
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual([ids[0], ids[1]]);
    act(() => { result.current.newSale(); });
    ids = addThree(result);
    const last = removeLine(result, ids[2]);
    removeLine(result, ids[0]);
    expect(restore(result, last)).toBeNull();
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual([ids[1], ids[2]]);
  });

  it('T4: refuses, changing nothing, after a reset, after park then a new sale, and once the sale completed', async () => {
    const { result } = renderSale();
    const unchanged = (removal: SaleRemoval, refusal: string) => {
      const before = result.current.order;
      expect(restore(result, removal)).toBe(refusal);
      expect(result.current.order).toEqual(before);
    };
    let removal = removeLine(result, addThree(result)[1]);
    act(() => { result.current.newSale(); });
    unchanged(removal, RESTORE_STALE);
    removal = removeLine(result, addThree(result)[1]);
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    act(() => { result.current.newSale(); });
    unchanged(removal, RESTORE_STALE);
    removal = removeLine(result, addThree(result)[1]);
    act(() => {
      result.current.startTender('cash');
      result.current.addTender({ method: 'cash', amountMinor: result.current.order.totalMinor });
    });
    await act(async () => { await result.current.complete(); });
    expect(result.current.stage.kind).toBe('receipt');
    unchanged(removal, SALE_FINISHED);
    act(() => { result.current.newSale(); });
    unchanged(removal, RESTORE_STALE);
  });

  it('T4b: refuses, changing nothing, after park then a resume of that same draft', async () => {
    const { result } = renderSale();
    const removal = removeLine(result, addThree(result)[1]);
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    await act(async () => { expect(await result.current.resume(removal.orderId)).toBeNull(); });
    expect(result.current.order.id).toBe(removal.orderId);
    const before = result.current.order;
    expect(restore(result, removal)).toBe(RESTORE_STALE);
    expect(result.current.order).toEqual(before);
  });

  it('T5: a second restore of the same removal refuses and leaves one copy', () => {
    const { result } = renderSale();
    const ids = addThree(result);
    const removal = removeLine(result, ids[1]);
    expect(restore(result, removal)).toBeNull();
    const before = result.current.order;
    expect(restore(result, removal)).toBe(RESTORE_STALE);
    expect(result.current.order).toEqual(before);
    expect(result.current.order.lineItems.filter((line) => line.id === ids[1])).toHaveLength(1);
  });

  it('T6: a fee and a shipping line each go back at their old index, with their totals', () => {
    const { result } = renderSale({ capabilities: { orderCreate: 5 } });
    addThree(result);
    act(() => {
      result.current.addFee({ name: 'Bag', amountMinor: 120 });
      result.current.addFee({ name: 'Service', amountMinor: 300, taxStatus: 'none' });
      result.current.addShipping({ name: 'Courier', amountMinor: 900, methodId: 'courier' });
      result.current.addShipping({ name: 'Post', amountMinor: 450, methodId: 'post' });
    });
    const before = result.current.order;
    let fee: SaleRemoval | null = null, shipping: SaleRemoval | null = null;
    act(() => {
      fee = result.current.removal('fee', before.fees![0].id);
      shipping = result.current.removal('shipping', before.shipping![0].id);
      expect(result.current.removeFee(before.fees![0].id)).toBeNull();
      expect(result.current.removeShipping(before.shipping![0].id)).toBeNull();
    });
    expect(result.current.order.totalMinor).toBeLessThan(before.totalMinor);
    expect(restore(result, fee!)).toBeNull();
    expect(restore(result, shipping!)).toBeNull();
    expect(result.current.order.fees).toEqual(before.fees);
    expect(result.current.order.shipping).toEqual(before.shipping);
    expect(totals(result.current.order)).toEqual(totals(before));
    expect(result.current.order.display).toEqual(before.display);
  });

  const rate = (ratePpm: number): TaxContext => ({ pricesIncludeTax: false, getTaxRatePpm: () => ratePpm });
  const location = {} as SaleTaxContext['location'];
  const A: CustomerSummary = { id: 'A', name: 'Ana' }, B: CustomerSummary = { id: 'B', name: 'Ben' };
  /** restore() refuses with RESTORE_STALE and the order is the snapshot taken just before it. */
  function voided(result: Sale, removal: SaleRemoval) {
    const before = result.current.order;
    expect(restore(result, removal)).toBe(RESTORE_STALE);
    expect(result.current.order).toEqual(before);
  }

  it('T7: a removal is voided by a customer change that moves the rates (desk ruling, 22 Nov)', () => {
    const contexts = { A: rate(100000), B: rate(250000) };
    const taxContextFor = (customer: CustomerSummary | null): SaleTaxContext => ({ taxContext: customer?.id === 'B' ? contexts.B : contexts.A, location });
    const test = renderSale({ taxContextFor }).result;
    act(() => { test.current.setCustomer(A); test.current.add(entries[0], traits); test.current.add(entries[1], traits); });
    expect(test.current.order.lineItems.every((line) => line.taxFromClass)).toBe(true);
    const ids = test.current.order.lineItems.map((line) => line.id);
    const removal = removeLine(test, ids[1]);
    act(() => { test.current.setCustomer(B); });
    expect(test.current.error).toBeNull();
    voided(test, removal);
    expect(test.current.order.lineItems).toHaveLength(1);
  });

  it('T10: a same-rates customer change voids it, and so does going back to Guest', () => {
    const { result } = renderSale();
    let removal = removeLine(result, addThree(result)[1]);
    act(() => { result.current.setCustomer({ id: 'A', name: 'Ana' }); });
    voided(result, removal);
    act(() => { result.current.newSale(); });
    act(() => { result.current.setCustomer(A); });
    removal = removeLine(result, addThree(result)[1]);
    act(() => { result.current.setCustomer(null); });
    expect(result.current.order.customer).toBeNull();
    voided(result, removal);
  });

  it('T11: setAddresses voids it', () => {
    const { result } = renderSale();
    act(() => { result.current.setCustomer(A); });
    const removal = removeLine(result, addThree(result)[1]);
    act(() => { expect(result.current.setAddresses({ country: 'AU', state: 'VIC' }, undefined)).toBe(true); });
    voided(result, removal);
  });

  it('T12: setTaxIds voids it', () => {
    const { result } = renderSale();
    act(() => { result.current.setCustomer(A); });
    const removal = removeLine(result, addThree(result)[1]);
    act(() => { expect(result.current.setTaxIds([{ type: 'eu_vat', value: 'DE123', country: 'DE', label: 'VAT' }])).toBe(true); });
    voided(result, removal);
  });

  it('T13: refused or no-op customer calls keep it', () => {
    const { result } = renderSale();
    const ids = addThree(result);
    const removal = removeLine(result, ids[1]);
    act(() => {
      expect(result.current.setAddresses({ country: 'AU', state: 'VIC' }, undefined)).toBe(false);
      expect(result.current.setTaxIds([{ type: 'eu_vat', value: 'DE123', country: 'DE', label: 'VAT' }])).toBe(false);
    });
    act(() => { result.current.setCustomer({ id: 'A', name: 'Ana', email: 'a'.repeat(250) + '@store.test' }); });
    expect(result.current.error).not.toBeNull();
    expect(result.current.order.customer).toBeNull();
    expect(restore(result, removal)).toBeNull();
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual(ids);
  });

  it('T14: a re-tax on cancelTender voids it; a cancelTender with no re-tax keeps it', () => {
    const contexts = { A: rate(100000), B: rate(250000) };
    const fnA = (): SaleTaxContext => ({ taxContext: contexts.A, location });
    const fnB = (): SaleTaxContext => ({ taxContext: contexts.B, location });
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    type Options = Parameters<typeof useSale>[1];
    const options: Options = { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 3 }, drafts: db.pos_drafts, taxContextFor: fnA };
    const render = () => renderHook((opts: Options) => useSale(pricing, opts), { wrapper: Wrapper, initialProps: options });
    // Sale 1: a newer taxContextFor mid-sale, then cancelTender re-taxes the cart on it.
    const first = render();
    const removal = removeLine(first.result, addThree(first.result)[1]);
    const old = first.result.current.order.lineItems.map((line) => line.taxLines);
    first.rerender({ ...options, taxContextFor: fnB });
    act(() => { first.result.current.startTender('cash'); });
    act(() => { first.result.current.cancelTender(); });
    expect(first.result.current.order.lineItems.map((line) => line.taxLines)).not.toEqual(old);
    voided(first.result, removal);
    // Sale 2: the same with no new function; cancelTender does not re-tax and the undo works.
    const second = render();
    const ids = addThree(second.result);
    const kept = removeLine(second.result, ids[1]);
    act(() => { second.result.current.startTender('cash'); });
    act(() => { second.result.current.cancelTender(); });
    expect(restore(second.result, kept)).toBeNull();
    expect(second.result.current.order.lineItems.map((line) => line.id)).toEqual(ids);
    expect(second.result.current.order.lineItems[1].id).toBe(ids[1]);
  });

  it('T8: with a live leg taken after the remove, restore refuses with SALE_HAS_PAYMENT and changes nothing', () => {
    const { result } = renderSale();
    const removal = removeLine(result, addThree(result)[1]);
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toEqual(expect.any(String)); });
    const before = result.current.order;
    expect(restore(result, removal)).toBe(SALE_HAS_PAYMENT);
    expect(result.current.order).toEqual(before);
  });
});
