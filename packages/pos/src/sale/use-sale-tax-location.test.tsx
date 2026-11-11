import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema, writeOrderDraft, type CustomerSummary, type Order } from '../order';
import { TaxProvider, saleTaxContexts } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { createDiscountCodes } from './woocommerce/discount-codes';
import type { SaleCoupon } from './woocommerce/coupons';
import { CUSTOMER_RETAX_REFUSED, useSale } from './use-sale';

const entries = catalogueEntries([
  { id: 10, name: 'Shirt', price: '10.00' },
  { id: 20, name: 'Mug', price: '25.00' },
], traits, { currency: 'AUD' });
const wooRate = (id: number, country: string, rate: string): woocommerceTax.WooTaxRate => ({
  id, country, state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name: 'GST',
  priority: 1, compound: false, shipping: true, order: id, class: 'standard',
});
const AU = { id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true };
const settings: StoreSettings = {
  currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 100000 }, taxRates: { standard: [AU] },
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false }, taxClassSlugs: ['standard'], shippingTaxClass: 'inherit',
  taxBasedOn: 'shipping', baseTaxAddress: { country: 'AU', state: 'NSW', city: 'Sydney', postcode: '2000' },
  taxRateTable: [wooRate(1, 'AU', '10.0000'), wooRate(2, 'NZ', '15.0000')],
};
const nzCustomer: CustomerSummary = { id: '7', name: 'Kiri', shipping: { country: 'NZ', city: 'Auckland', postcode: '1010' } };
// order.create 8 is what lets saleTaxContexts re-match by address (#722).
const contexts = (forSettings: StoreSettings) => saleTaxContexts(forSettings, { orderCreateVersion: 8 });
const auCustomer: CustomerSummary = { id: '9', name: 'Matt', shipping: { country: 'AU', state: 'VIC' } };
const coupon: SaleCoupon = { id: 101, code: 'ten', discount_type: 'percent', amount: '10' };
const source = { find: vi.fn(async (code: string) => code === 'ten' ? coupon : null), productCategories: vi.fn(async () => new Map()) };
type Sale = { current: ReturnType<typeof useSale> };

/** The order's money and shape, without the ids and times a second sale can't share. */
function money(order: Order) {
  return JSON.parse(JSON.stringify(order, (key, value) => ['id', 'lineId', 'discountId', 'createdAt', 'updatedAt'].includes(key) ? undefined : value));
}
const rateCodes = (order: Order) => order.lineItems.map((line) => line.taxLines.map((tax) => tax.code));

describe('useSale taxContextFor (#722)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saletax${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale(withContexts = true) {
    const state = { settings, taxContextFor: withContexts ? contexts(settings) : undefined };
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(state.settings)}>{children}</TaxProvider>;
    }
    const hook = renderHook(() => useSale(state.settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 8, coupons: true }, drafts: db.pos_drafts, discountCodes: createDiscountCodes(source),
      taxContextFor: state.taxContextFor }), { wrapper: Wrapper });
    return { ...hook, state };
  }
  function addLines(result: Sale) {
    act(() => { result.current.add(entries[0], traits); result.current.add(entries[1], traits); result.current.add(entries[0], traits); });
    act(() => { expect(result.current.applyDiscount(result.current.order.lineItems[1].id, { type: 'percentage', value: 20 })).toBeNull(); });
  }
  function addCharges(result: Sale) {
    act(() => {
      result.current.addFee({ name: 'Bag', amountMinor: 50 });
      result.current.addShipping({ name: 'Post', amountMinor: 700, methodId: 'flat_rate' });
      result.current.applyDiscount(null, { type: 'fixed', value: 300 });
      result.current.setNote('Gift wrap');
    });
  }

  it('re-taxes the cart to the new customer exactly as a sale started on that customer', () => {
    const { result } = renderSale();
    addLines(result);
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1'], ['AU-GST-1']]);
    act(() => result.current.setCustomer(nzCustomer));
    const fresh = renderSale().result;
    act(() => fresh.current.setCustomer(nzCustomer));
    addLines(fresh);
    const retaxed = result.current.order, built = fresh.current.order;
    expect(rateCodes(retaxed)).toEqual([['NZ-GST-1'], ['NZ-GST-1']]);
    retaxed.lineItems.forEach((line, index) => expect(line.taxLines).toEqual(built.lineItems[index].taxLines));
    expect(retaxed.taxMinor).toBe(built.taxMinor);
    expect(retaxed.totalMinor).toBe(built.totalMinor);
    expect(retaxed.taxMinor).toBe(600); // 15% of 2 × 10.00, and of 25.00 less 20%
    expect(money(retaxed)).toEqual(money(built));
  });

  it('keeps the equivalence with fees, shipping, an order discount and a coupon on the sale', async () => {
    const { result } = renderSale();
    addLines(result); addCharges(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    act(() => result.current.setCustomer(nzCustomer));
    const fresh = renderSale().result;
    act(() => fresh.current.setCustomer(nzCustomer));
    addLines(fresh); addCharges(fresh);
    await act(async () => { expect(await fresh.current.applyCoupon('ten')).toBeNull(); });
    expect(result.current.order.shipping?.[0].taxLines.map((tax) => tax.code)).toEqual(['NZ-GST-1']);
    expect(money(result.current.order)).toEqual(money(fresh.current.order));
  });

  it('keeps the builder when the new customer matches the same rates', () => {
    const { result } = renderSale();
    addLines(result);
    const before = result.current.order;
    act(() => result.current.setCustomer(auCustomer));
    expect(result.current.order.customer).toBe(auCustomer);
    expect(result.current.order.id).toBe(before.id);
    // A rebuild gives every line a new id; the same builder keeps them.
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual(before.lineItems.map((line) => line.id));
    expect(money(result.current.order)).toEqual(money({ ...before, customer: auCustomer }));
  });

  it('keeps the order id, note, fees and coupon codes through a re-tax', async () => {
    const { result } = renderSale();
    addLines(result); addCharges(result);
    await act(async () => { expect(await result.current.applyCoupon('ten')).toBeNull(); });
    const before = result.current.order;
    act(() => result.current.setCustomer(nzCustomer));
    const after = result.current.order;
    expect(rateCodes(after)).toEqual([['NZ-GST-1'], ['NZ-GST-1']]);
    expect(after).toMatchObject({ id: before.id, note: 'Gift wrap', customer: nzCustomer });
    expect(after.fees?.map(({ name, amountMinor }) => ({ name, amountMinor }))).toEqual([{ name: 'Bag', amountMinor: 50 }]);
    expect(after.shipping?.map(({ name, methodId }) => ({ name, methodId }))).toEqual([{ name: 'Post', methodId: 'flat_rate' }]);
    expect(after.coupons?.map((entry) => entry.code)).toEqual(['ten']);
    expect(after.coupons?.[0].discountMinor).toBeGreaterThan(0);
    expect(after.discounts).toHaveLength(1);
    // The coupon stays applied for the next change: removing it is the sale's own removal.
    act(() => { expect(result.current.removeCoupon('ten')).toBeNull(); });
    expect(result.current.order.coupons).toBeUndefined();
  });

  it('refuses a customer with other rates in tender, keeping the lines\' taxes and the customer', () => {
    const { result } = renderSale();
    addLines(result);
    act(() => result.current.startTender('cash'));
    const before = result.current.order;
    act(() => result.current.setCustomer(nzCustomer));
    expect(result.current.error).toBe(CUSTOMER_RETAX_REFUSED);
    expect(result.current.stage.kind).toBe('tender');
    expect(result.current.order.customer).toBeNull();
    expect(result.current.order.lineItems).toEqual(before.lineItems);
    expect(result.current.order.taxMinor).toBe(before.taxMinor);
  });

  it('sets a customer with the same rates in tender, and clears the refusal', () => {
    const { result } = renderSale();
    addLines(result);
    act(() => result.current.startTender('cash'));
    const before = result.current.order;
    act(() => result.current.setCustomer(nzCustomer));
    act(() => result.current.setCustomer(auCustomer));
    expect(result.current.error).toBeNull();
    expect(result.current.order.customer).toBe(auCustomer);
    expect(result.current.order.lineItems).toEqual(before.lineItems);
  });

  it('refuses a customer with other rates in tender, and re-taxes for them once the tender is cancelled', () => {
    const { result } = renderSale();
    addLines(result);
    act(() => result.current.startTender('cash'));
    act(() => result.current.setCustomer(nzCustomer));
    expect(result.current.error).toBe(CUSTOMER_RETAX_REFUSED);
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1'], ['AU-GST-1']]);
    act(() => result.current.cancelTender());
    expect(result.current.order.customer).toBeNull();
    act(() => result.current.setCustomer(nzCustomer));
    const fresh = renderSale().result;
    act(() => fresh.current.setCustomer(nzCustomer));
    addLines(fresh);
    const retaxed = result.current.order, built = fresh.current.order;
    expect(result.current.stage.kind).toBe('cart');
    expect(rateCodes(retaxed)).toEqual([['NZ-GST-1'], ['NZ-GST-1']]);
    retaxed.lineItems.forEach((line, index) => expect(line.taxLines).toEqual(built.lineItems[index].taxLines));
    expect(retaxed.taxMinor).toBe(built.taxMinor);
    expect(retaxed.totalMinor).toBe(built.totalMinor);
    expect(money(retaxed)).toEqual(money(built));
  });

  it('refuses a customer with other rates once cash is taken, and re-taxes after the tender is cancelled, as cancelTender drops every leg', () => {
    const { result } = renderSale();
    addLines(result);
    act(() => result.current.startTender('cash'));
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 500 }); });
    expect(result.current.order.paidMinor).toBe(500);
    act(() => result.current.setCustomer(nzCustomer));
    expect(result.current.error).toBe(CUSTOMER_RETAX_REFUSED);
    expect(result.current.order.customer).toBeNull();
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1'], ['AU-GST-1']]);
    act(() => result.current.cancelTender());
    expect(result.current.order.payments).toEqual([]);
    act(() => result.current.setCustomer(nzCustomer));
    expect(rateCodes(result.current.order)).toEqual([['NZ-GST-1'], ['NZ-GST-1']]);
  });

  it('keeps the rates and the customer of a cart holding captured money (a resumed draft paid in part)', async () => {
    const paid = renderSale().result;
    addLines(paid);
    act(() => paid.current.startTender('cash'));
    act(() => { paid.current.addTender({ method: 'cash', amountMinor: 500 }); });
    const draft = paid.current.order;
    await writeOrderDraft(db.pos_drafts, draft);
    const { result } = renderSale();
    await act(async () => { expect(await result.current.resume(draft.id)).toBeNull(); });
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.order.paidMinor).toBe(500);
    act(() => result.current.setCustomer(nzCustomer));
    expect(result.current.error).toBe(CUSTOMER_RETAX_REFUSED);
    expect(result.current.order.customer).toBeNull();
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1'], ['AU-GST-1']]);
    expect(result.current.order.taxMinor).toBe(draft.taxMinor);
  });

  it('re-taxes back to the shop base when the customer is taken off', () => {
    const { result } = renderSale();
    addLines(result);
    const au = result.current.order;
    act(() => result.current.setCustomer(nzCustomer));
    act(() => result.current.setCustomer(null));
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1'], ['AU-GST-1']]);
    expect(money(result.current.order)).toEqual(money(au));
  });

  it('reports the tax location, memoized on the customer', () => {
    const { result, rerender } = renderSale();
    expect(result.current.taxLocation).toEqual({ taxBasedOn: 'shipping', addressUsed: 'base', location: settings.baseTaxAddress, hasCustomer: false });
    const first = result.current.taxLocation;
    rerender();
    expect(result.current.taxLocation).toBe(first);
    act(() => result.current.setCustomer(nzCustomer));
    expect(result.current.taxLocation).toEqual({ taxBasedOn: 'shipping', addressUsed: 'shipping', hasCustomer: true,
      location: { country: 'NZ', state: '', city: 'Auckland', postcode: '1010' } });
  });

  it('keeps the builder and reports no location without taxContextFor', () => {
    const { result } = renderSale(false);
    addLines(result);
    const before = result.current.order;
    act(() => result.current.setCustomer(nzCustomer));
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual(before.lineItems.map((line) => line.id));
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1'], ['AU-GST-1']]);
    expect(result.current.taxLocation).toBeUndefined();
  });

  it.each([true, false])('restarts an idle sale on new store settings, keeping its customer (taxContextFor: %s)', (withContexts) => {
    const { result, rerender, state } = renderSale(withContexts);
    act(() => result.current.setCustomer(nzCustomer));
    const id = result.current.order.id;
    rerender();
    expect(result.current.order.id).toBe(id);
    state.settings = { ...settings, pricesIncludeTax: true };
    if (withContexts) state.taxContextFor = contexts(state.settings);
    rerender();
    expect(result.current.order).toMatchObject({ pricesIncludeTax: true, customer: nzCustomer });
    expect(result.current.order.id).not.toBe(id);
    act(() => { result.current.add(entries[0], traits); });
    expect(rateCodes(result.current.order)).toEqual([[withContexts ? 'NZ-GST-1' : 'AU-GST-1']]);
    if (!withContexts) return;
    // A new taxContextFor alone, from the same settings, counts as new settings too.
    act(() => result.current.remove(result.current.order.lineItems[0].id));
    const idle = result.current.order.id;
    state.taxContextFor = contexts(state.settings);
    rerender();
    expect(result.current.order.id).not.toBe(idle);
    expect(result.current.order.customer).toBe(nzCustomer);
  });

  it.each([
    ['taxed on their shipping address', { ...nzCustomer, email: 'kiri@example.com', billing: { firstName: 'Kiri', country: 'AU', state: '', email: 'b@example.com' } }],
    ['at the shop base', null],
  ] as const)('finalizes a sale %s with what order.create 8 sends', async (_label, customer) => {
    const completed: unknown[] = [];
    const state = { settings, taxContextFor: contexts(settings) };
    const { result } = renderHook(() => useSale(state.settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 8, coupons: true }, drafts: db.pos_drafts, taxContextFor: state.taxContextFor,
      onSaleCompleted: (order) => { completed.push(order); } }),
    { wrapper: ({ children }: { children: ReactNode }) => <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider> });
    if (customer) act(() => result.current.setCustomer(customer));
    addLines(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); });
    expect(completed).toHaveLength(1);
    const posOrder = completed[0] as Record<string, unknown>;
    if (!customer) {
      expect(posOrder).not.toHaveProperty('taxAddress');
      expect(posOrder.customer).toBeNull();
      return;
    }
    expect(posOrder.taxAddress).toBe('shipping');
    expect(posOrder.customer).toStrictEqual({ id: '7', name: 'Kiri', email: 'kiri@example.com',
      billing: { firstName: 'Kiri', country: 'AU' }, shipping: { city: 'Auckland', postcode: '1010', country: 'NZ' } });
  });

  /** A sale for `customer` started on `startAt`'s function, given `endAt`'s mid-sale (not idle), then completed. */
  async function finishAcross(startAt: number, endAt: number, customer: CustomerSummary | null = nzCustomer, after?: (result: Sale) => void) {
    const completed: Record<string, unknown>[] = [];
    const state = { taxContextFor: saleTaxContexts(settings, { orderCreateVersion: startAt }) };
    const { result, rerender } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 8, coupons: true }, drafts: db.pos_drafts, taxContextFor: state.taxContextFor,
      onSaleCompleted: (order) => { completed.push(order as unknown as Record<string, unknown>); } }),
    { wrapper: ({ children }: { children: ReactNode }) => <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider> });
    if (customer) act(() => result.current.setCustomer(customer));
    addLines(result);
    const id = result.current.order.id;
    state.taxContextFor = saleTaxContexts(settings, { orderCreateVersion: endAt });
    rerender();
    expect(result.current.order.id).toBe(id);
    after?.(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBeNull();
    expect(completed).toHaveLength(1);
    return completed[0];
  }

  it('completes a sale started at order.create 7 on the base, with no tax address, when a function at 8 arrives mid-sale', async () => {
    const [atBase, across, reMatched] = [await finishAcross(7, 7), await finishAcross(7, 8), await finishAcross(8, 8)];
    expect(across).not.toHaveProperty('taxAddress');
    expect(across.customer).toStrictEqual({ id: '7', name: 'Kiri' });
    expect(across.taxMinor).toBe(atBase.taxMinor);
    expect(across.taxMinor).not.toBe(reMatched.taxMinor);
  });

  it('keeps the tax address and the re-matched figure of a sale started at 8 when a function at 7 arrives mid-sale', async () => {
    const [reMatched, across] = [await finishAcross(8, 8), await finishAcross(8, 7)];
    expect(across.taxAddress).toBe('shipping');
    expect(across.customer).toStrictEqual({ id: '7', name: 'Kiri', shipping: { city: 'Auckland', postcode: '1010', country: 'NZ' } });
    expect(across.taxMinor).toBe(reMatched.taxMinor);
  });

  it('names no address once the customer is taken off a sale on the base rates (taxNow follows a same-rates customer)', async () => {
    // NZ re-taxes; AU re-taxes back to the base rates on its shipping address; a guest keeps those rates and the builder.
    const order = await finishAcross(8, 8, nzCustomer, (result) => {
      act(() => result.current.setCustomer(auCustomer));
      act(() => result.current.setCustomer(null));
    });
    expect(order).not.toHaveProperty('taxAddress');
    expect(order.customer).toBeNull();
  });

  it('resumes a parked sale with an NZ customer taxed at NZ', async () => {
    const { result } = renderSale();
    act(() => result.current.setCustomer(nzCustomer));
    addLines(result);
    const parked = result.current.order;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    expect(result.current.order.customer).toBeNull();
    await act(async () => { expect(await result.current.resume(parked.id)).toBeNull(); });
    expect(result.current.order.customer).toEqual(nzCustomer);
    expect(rateCodes(result.current.order)).toEqual([['NZ-GST-1'], ['NZ-GST-1']]);
    expect(money(result.current.order)).toEqual(money(parked));
    expect(result.current.taxLocation).toMatchObject({ addressUsed: 'shipping', hasCustomer: true });
  });
});
