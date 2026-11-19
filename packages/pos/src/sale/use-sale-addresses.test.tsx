import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { woocommerceTax, type CustomerAddress, type StoreSettings } from '@tallyui/core';
import { wooProductTraits as traits } from '@tallyui/connector-woocommerce';
import { orderDraftSchema, type CustomerSummary, type Order } from '../order';
import { CUSTOMER_REFUSALS } from '../pos-order/command';
import { TaxProvider, saleTaxContexts } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { ADDRESS_CHANGE_REFUSED, useSale } from './use-sale';

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
const nzCustomer: CustomerSummary = { id: '7', name: 'Kiri', shipping: { country: 'NZ', city: 'Auckland', postcode: '1010' } };
// order.create 8 is what lets saleTaxContexts re-match by address (#722).
const contexts = (forSettings: StoreSettings) => saleTaxContexts(forSettings, { orderCreateVersion: 8 });
const auCustomer: CustomerSummary = { id: '9', name: 'Matt', shipping: { country: 'AU', state: 'VIC' } };
const nzAddress: CustomerAddress = { country: 'NZ', city: 'Auckland', postcode: '1010' };
const qldAddress: CustomerAddress = { country: 'AU', state: 'QLD' };
type Sale = { current: ReturnType<typeof useSale> };

/** The order's money and shape, without the ids and times a second sale can't share. */
function money(order: Order) {
  return JSON.parse(JSON.stringify(order, (key, value) => ['id', 'lineId', 'discountId', 'createdAt', 'updatedAt'].includes(key) ? undefined : value));
}
const rateCodes = (order: Order) => order.lineItems.map((line) => line.taxLines.map((tax) => tax.code));

describe('useSale setAddresses (vendurepos gap 5.2)', () => {
  let db: RxDatabase;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `saleaddr${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ pos_drafts: { schema: orderDraftSchema } });
  });
  afterEach(async () => { cleanup(); await db.remove(); });

  function renderSale() {
    const taxContextFor = contexts(settings);
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider>;
    }
    return renderHook(() => useSale(settings, { registerId: 'register-1', cashierRef: 'cashier@store.test',
      capabilities: { orderCreate: 8 }, drafts: db.pos_drafts, taxContextFor }), { wrapper: Wrapper });
  }
  function saleOn(customer: CustomerSummary | null) {
    const { result } = renderSale();
    if (customer) act(() => result.current.setCustomer(customer));
    act(() => { result.current.add(entries[0], traits); });
    return result;
  }
  function readdress(result: Sale, billing: CustomerAddress | undefined, shipping: CustomerAddress | undefined) {
    let done: boolean | undefined;
    act(() => { done = result.current.setAddresses(billing, shipping); });
    return done;
  }

  it('A1: re-taxes the cart to the new address exactly as a sale started on it', () => {
    const result = saleOn(auCustomer);
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1']]);
    expect(readdress(result, undefined, nzAddress)).toBe(true);
    expect(result.current.order.customer).toEqual({ id: '9', name: 'Matt', shipping: nzAddress });
    const fresh = saleOn({ id: '9', name: 'Matt', shipping: nzAddress });
    expect(money(result.current.order)).toEqual(money(fresh.current.order));
    expect(rateCodes(result.current.order)).toEqual([['NZ-GST-1']]);
  });

  it('A2: keeps the builder for an address with the same rates, and reports the new address used', () => {
    const result = saleOn(auCustomer);
    const before = result.current.order;
    expect(readdress(result, undefined, qldAddress)).toBe(true);
    expect(result.current.order.id).toBe(before.id);
    // A rebuild gives every line a new id; the same builder keeps them.
    expect(result.current.order.lineItems.map((line) => line.id)).toEqual(before.lineItems.map((line) => line.id));
    expect(result.current.order.customer?.shipping).toEqual(qldAddress);
    expect(result.current.taxLocation).toEqual({ taxBasedOn: 'shipping', addressUsed: 'shipping', hasCustomer: true,
      location: { country: 'AU', state: 'QLD', city: '', postcode: '' } });
  });

  it('A3: does nothing for a guest sale', () => {
    const result = saleOn(null);
    const before = result.current.order;
    expect(readdress(result, undefined, nzAddress)).toBe(false);
    expect(result.current.order.customer).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.order.lineItems.map((line) => line.taxLines)).toEqual(before.lineItems.map((line) => line.taxLines));
  });

  function refusedInTender() {
    const result = saleOn(auCustomer);
    act(() => result.current.startTender('cash'));
    const done = readdress(result, undefined, qldAddress);
    return { result, done };
  }

  it('A4: refuses in tender, even for an address with the same rates', () => {
    const { result, done } = refusedInTender();
    expect(done).toBe(false);
    expect(result.current.error).toBe(ADDRESS_CHANGE_REFUSED);
    expect(result.current.order.customer?.shipping).toEqual({ country: 'AU', state: 'VIC' });
  });

  it('A5: changes the address once the tender is cancelled, and clears the refusal', () => {
    const { result } = refusedInTender();
    act(() => result.current.cancelTender());
    expect(readdress(result, undefined, qldAddress)).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.order.customer?.shipping).toEqual(qldAddress);
  });

  it('A6: removes both addresses, leaving no key behind, and re-taxes to the shop base', () => {
    const result = saleOn(nzCustomer);
    expect(rateCodes(result.current.order)).toEqual([['NZ-GST-1']]);
    expect(readdress(result, undefined, undefined)).toBe(true);
    expect(result.current.order.customer).toStrictEqual({ id: '7', name: 'Kiri' });
    expect('shipping' in result.current.order.customer!).toBe(false);
    expect(rateCodes(result.current.order)).toEqual([['AU-GST-1']]);
  });

  it('A7: keeps an unrelated error', () => {
    const result = saleOn(auCustomer);
    // A customer email the store would refuse: setCustomer keeps Matt and sets its refusal.
    act(() => result.current.setCustomer({ id: '5', name: 'Long', email: `${'a'.repeat(250)}@example.com` }));
    expect(result.current.error).toBe(CUSTOMER_REFUSALS[0]);
    expect(readdress(result, undefined, qldAddress)).toBe(true);
    expect(result.current.order.customer?.shipping).toEqual(qldAddress);
    expect(result.current.error).toBe(CUSTOMER_REFUSALS[0]);
  });
});
