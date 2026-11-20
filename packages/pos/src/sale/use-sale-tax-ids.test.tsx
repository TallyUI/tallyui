import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { woocommerceTax, type CustomerTaxId, type StoreSettings } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema, type CustomerSummary, type Order } from '../order';
import { CUSTOMER_REFUSALS, toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { TaxProvider, saleTaxContexts } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { TAX_IDS_CHANGE_REFUSED, TAX_IDS_INVALID, useSale } from './use-sale';

const entries = catalogueEntries([{ id: 10, name: 'Shirt', price: '10.00' }], traits, { currency: 'AUD' });
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
const auCustomer: CustomerSummary = { id: '9', name: 'Matt', shipping: { country: 'AU', state: 'VIC' } };
const vat: CustomerTaxId[] = [{ type: 'eu_vat', value: ' DE123 ', country: 'DE', label: 'VAT' }];
const stored: CustomerTaxId[] = [{ type: 'eu_vat', value: 'DE123', country: 'DE', label: 'VAT' }];
type Sale = { current: ReturnType<typeof useSale> };

/** The order's lines and totals. */
const money = ({ lineItems, subtotalMinor, discountMinor, taxMinor, totalMinor }: Order) => ({ lineItems, subtotalMinor, discountMinor, taxMinor, totalMinor });

describe('useSale setTaxIds (ADR-092 6a)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saletaxids${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function saleOn(customer: CustomerSummary | null, extra: Partial<Parameters<typeof useSale>[1]> = {}) {
    const taxContextFor = saleTaxContexts(settings, { orderCreateVersion: 8 });
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider>;
    }
    const { result } = renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 12 }, drafts: db.pos_drafts, taxContextFor, ...extra }), { wrapper: Wrapper });
    if (customer) act(() => result.current.setCustomer(customer));
    act(() => { result.current.add(entries[0], traits); });
    return result;
  }
  function setTaxIds(result: Sale, taxIds: CustomerTaxId[]) {
    let done: boolean | undefined;
    act(() => { done = result.current.setTaxIds(taxIds); });
    return done;
  }
  /** T1's sale: Matt with one VAT number. */
  function withVat() {
    const result = saleOn(auCustomer);
    expect(setTaxIds(result, vat)).toBe(true);
    return result;
  }
  /** The sale paid in cash and finalized as the till's own order. */
  function finalized(result: Sale) {
    act(() => result.current.startTender('cash'));
    act(() => { result.current.addTender({ method: 'cash', amountMinor: result.current.order.totalMinor }); });
    return finalizeOrder(result.current.order, { capabilities: { orderCreate: 12 } });
  }

  it('T1: trims and sets the tax ids, keeping the lines and totals', () => {
    const result = saleOn(auCustomer);
    const before = money(result.current.order);
    expect(setTaxIds(result, vat)).toBe(true);
    expect(result.current.order.customer?.taxIds).toEqual(stored);
    expect(result.current.order.customer).toEqual({ ...auCustomer, taxIds: stored });
    expect(money(result.current.order)).toEqual(before);
  });

  it('T2: [] removes the key', () => {
    const result = withVat();
    expect(setTaxIds(result, [])).toBe(true);
    expect('taxIds' in result.current.order.customer!).toBe(false);
    expect(result.current.order.customer).toStrictEqual(auCustomer);
  });

  it('T3: returns false for a guest sale, with no error', () => {
    const result = saleOn(null);
    expect(setTaxIds(result, vat)).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.order.customer).toBeNull();
  });

  it('T4: refuses in tender, and sets them once the tender is cancelled, clearing the refusal', () => {
    const result = withVat();
    act(() => result.current.startTender('cash'));
    expect(setTaxIds(result, [{ type: 'au_abn', value: '51824753556' }])).toBe(false);
    expect(result.current.error).toBe(TAX_IDS_CHANGE_REFUSED);
    expect(result.current.order.customer?.taxIds).toEqual(stored);
    act(() => result.current.cancelTender());
    expect(setTaxIds(result, [{ type: 'au_abn', value: '51824753556' }])).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.order.customer?.taxIds).toEqual([{ type: 'au_abn', value: '51824753556' }]);
  });

  it.each<[string, CustomerTaxId[]]>([
    ['11 entries', Array.from({ length: 11 }, (_, i) => ({ type: 'other', value: `ID${i}` }))],
    ['an empty type', [{ type: '', value: 'DE123' }]],
    ['a whitespace-only value', [{ type: 'eu_vat', value: '   ' }]],
    ['a country with a digit', [{ type: 'eu_vat', value: 'DE123', country: 'D1' }]],
    ['a three-letter country', [{ type: 'eu_vat', value: 'DE123', country: 'DEU' }]],
  ])('T5: refuses %s, keeping the stored ids, and a valid call clears the refusal', (_name, invalid) => {
    const result = withVat();
    expect(setTaxIds(result, invalid)).toBe(false);
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.order.customer?.taxIds).toEqual(stored);
    expect(setTaxIds(result, [{ type: 'gb_vat', value: 'GB1', country: 'GB' }])).toBe(true);
    expect(result.current.error).toBeNull();
  });

  it('T6: keeps an unrelated error', () => {
    // cancelTender() clears ADDRESS_CHANGE_REFUSED itself, so the other error is setCustomer's refusal (as setAddresses' A7).
    const result = saleOn(auCustomer);
    act(() => result.current.setCustomer({ id: '5', name: 'Long', email: `${'a'.repeat(250)}@example.com` }));
    expect(result.current.error).toBe(CUSTOMER_REFUSALS[0]);
    expect(setTaxIds(result, vat)).toBe(true);
    expect(result.current.order.customer?.taxIds).toEqual(stored);
    expect(result.current.error).toBe(CUSTOMER_REFUSALS[0]);
  });

  it('T7: parks and resumes with the tax ids', async () => {
    const result = withVat();
    const id = result.current.order.id;
    await act(async () => { expect(await result.current.park()).toBeNull(); });
    expect(result.current.order.customer).toBeNull();
    await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
    expect(result.current.order.customer?.taxIds).toEqual(stored);
  });

  it('T8: finalize stores the tax ids with the label', () => {
    expect(finalized(withVat()).customer?.taxIds).toEqual(stored);
  });

  it('T9: order.create 12 sends them without the label; at cap 11 they are not sent', () => {
    const order = finalized(withVat());
    const at12 = toOrderCreateEnvelope(order, 'device_1', 1, { maxVersion: 12 });
    expect(at12.version).toBe(12);
    expect(at12.payload.customer?.taxIds).toStrictEqual([{ type: 'eu_vat', value: 'DE123', country: 'DE' }]);
    const at11 = toOrderCreateEnvelope(order, 'device_1', 1, { maxVersion: 11 });
    expect(at11.version).toBe(11);
    expect(at11.payload.customer).toBeTruthy();
    expect('taxIds' in at11.payload.customer!).toBe(false);
  });

  it('T10: a sale with no tax ids stores no taxIds key', () => {
    const order = finalized(saleOn(auCustomer));
    expect(order.customer).toBeTruthy();
    expect('taxIds' in order.customer!).toBe(false);
  });

  it('U1: setCustomer refuses 11 tax ids, keeping the customer it had; a valid customer clears the refusal', () => {
    const result = withVat();
    const before = result.current.order.customer;
    act(() => result.current.setCustomer({ id: '5', name: 'Ann', taxIds: Array.from({ length: 11 }, (_, i) => ({ type: 'other', value: `ID${i}` })) }));
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.order.customer).toStrictEqual(before);
    act(() => result.current.setCustomer({ id: '5', name: 'Ann' }));
    expect(result.current.error).toBeNull();
  });

  it('U2: setCustomer stores the cleaned list, the country upper-cased', () => {
    const result = saleOn({ ...auCustomer, taxIds: [{ type: ' eu_vat', value: 'DE1', country: 'de' }] });
    expect(result.current.error).toBeNull();
    expect(result.current.order.customer?.taxIds).toStrictEqual([{ type: 'eu_vat', value: 'DE1', country: 'DE' }]);
  });

  it('U3: a default customer with tax ids the store could not take starts no tender, and the gate is never asked', async () => {
    const tenderGate = vi.fn(async () => null);
    const result = saleOn(null, { defaultCustomer: { ...auCustomer, taxIds: [{ type: 't'.repeat(33), value: '1' }] }, tenderGate });
    await act(async () => { result.current.startTender('cash'); await Promise.resolve(); });
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.stage.kind).toBe('cart');
    act(() => result.current.setTender({ method: 'cash', amountMinor: result.current.order.totalMinor }));
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.order.payments).toHaveLength(0);
    let id: string | null = 'unset';
    act(() => { id = result.current.addTender({ method: 'cash', amountMinor: result.current.order.totalMinor }); });
    expect(id).toBeNull();
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.order.payments).toHaveLength(0);
    expect(result.current.stage.kind).toBe('cart');
    expect(tenderGate).not.toHaveBeenCalled();
  });

  it('U3: with no tender gate, startTender refuses too', () => {
    const result = saleOn(null, { defaultCustomer: { ...auCustomer, taxIds: [{ type: 'eu_vat', value: 'DE1' }, { type: 'eu_vat', value: 'DE1' }] } });
    act(() => result.current.startTender('cash'));
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.stage.kind).toBe('cart');
  });

  it.each<[string, CustomerTaxId[]]>([
    ['a 33-character type', [{ type: 't'.repeat(33), value: 'DE123' }]],
    ['a NUL', [{ type: 'eu_vat', value: 'DE\u0000123' }]],
  ])('U4: setTaxIds refuses %s', (_name, invalid) => {
    const result = withVat();
    expect(setTaxIds(result, invalid)).toBe(false);
    expect(result.current.error).toBe(TAX_IDS_INVALID);
    expect(result.current.order.customer?.taxIds).toEqual(stored);
  });

  // addTender works from the cart (no startTender), so the cart can hold captured money or a leg in motion.
  it.each([
    ['captured money (N3)', { method: 'cash' as const, amountMinor: 500 }],
    ['a leg in motion (N4)', { method: 'external' as const, amountMinor: 500, status: 'pending' as const }],
  ])('U5: setTaxIds refuses in the cart with %s', (_name, tender) => {
    const result = withVat();
    act(() => { expect(result.current.addTender(tender)).not.toBeNull(); });
    expect(result.current.stage.kind).toBe('cart');
    expect(setTaxIds(result, [{ type: 'au_abn', value: '51824753556' }])).toBe(false);
    expect(result.current.error).toBe(TAX_IDS_CHANGE_REFUSED);
    expect(result.current.order.customer?.taxIds).toEqual(stored);
  });
});
