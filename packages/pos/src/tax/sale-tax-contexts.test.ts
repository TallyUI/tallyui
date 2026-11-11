import { describe, expect, it } from 'vitest';
import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import type { CustomerSummary } from '../order/types';
import { saleTaxContexts } from './sale-tax-contexts';

type WooTaxRate = woocommerceTax.WooTaxRate;
const wooRate = (id: number, country: string, rate: string, name: string): WooTaxRate => ({
  id, country, state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name,
  priority: 1, compound: false, shipping: true, order: id, class: 'standard',
});
const AU = { id: 1, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true };
const NZ = { id: 2, code: 'NZ-GST-1', label: 'GST', rate: '15.0000', priority: 1, compound: false, shipping: true };

const auNzSettings: StoreSettings = {
  currency: 'AUD', pricesIncludeTax: false,
  taxRatesPpm: { default: 100000 }, taxRates: { standard: [AU] },
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false },
  taxClassSlugs: ['standard'], shippingTaxClass: 'inherit',
  taxBasedOn: 'shipping',
  baseTaxAddress: { country: 'AU', state: 'NSW', city: 'Sydney', postcode: '2000' },
  taxRateTable: [wooRate(1, 'AU', '10.0000', 'GST'), wooRate(2, 'NZ', '15.0000', 'GST')],
};
const nz = { country: 'NZ', city: 'Auckland', postcode: '1010' };
const shipsToNz: CustomerSummary = { id: '7', name: 'Kiri', shipping: nz, billing: { country: 'AU' } };
const billsInNz: CustomerSummary = { id: '8', name: 'Aroha', billing: nz };
const inAu: CustomerSummary = { id: '9', name: 'Matt', shipping: { country: 'AU', state: 'VIC' } };

describe('saleTaxContexts', () => {
  // order.create 8 is what lets it re-match by address (#722).
  const contextFor = saleTaxContexts(auNzSettings, { orderCreateVersion: 8 });

  it('taxes no customer at the shop base', () => {
    const { taxContext, location } = contextFor(null);
    expect(taxContext.getTaxRates?.()).toEqual([AU]);
    expect(taxContext.getTaxRatePpm()).toBe(100000);
    expect(location).toEqual({ taxBasedOn: 'shipping', addressUsed: 'base', location: auNzSettings.baseTaxAddress });
  });

  it("taxes by a customer's shipping address, else their billing address", () => {
    const shipped = contextFor(shipsToNz), billed = contextFor(billsInNz);
    expect(shipped.taxContext.getTaxRates?.()).toEqual([NZ]);
    expect(shipped.taxContext.getTaxRatePpm()).toBe(150000);
    expect(shipped.location).toEqual({ taxBasedOn: 'shipping', addressUsed: 'shipping',
      location: { country: 'NZ', state: '', city: 'Auckland', postcode: '1010' } });
    expect(billed.taxContext.getTaxRates?.()).toEqual([NZ]);
    expect(billed.location.addressUsed).toBe('billing');
  });

  it('gives customers whose addresses match the same rates the same context, each with its own location', () => {
    const first = contextFor(shipsToNz), second = contextFor(billsInNz);
    expect(second.taxContext).toBe(first.taxContext);
    expect(first.location.addressUsed).toBe('shipping');
    expect(second.location.addressUsed).toBe('billing');
    const au = contextFor(inAu);
    expect(au.taxContext).toBe(contextFor(null).taxContext);
    expect(au.location).toMatchObject({ addressUsed: 'shipping', location: { country: 'AU', state: 'VIC' } });
    expect(au.taxContext).not.toBe(first.taxContext);
  });

  it("gives everyone the store's own context without a rate table", () => {
    const { taxRateTable: _table, ...noTable } = auNzSettings;
    const storeFor = saleTaxContexts(noTable, { orderCreateVersion: 8 });
    const store = storeFor(null);
    expect(storeFor(shipsToNz).taxContext).toBe(store.taxContext);
    expect(storeFor(billsInNz).taxContext).toBe(store.taxContext);
    expect(store.taxContext.getTaxRates?.()).toEqual([AU]);
    expect(storeFor(shipsToNz).location).toEqual({ taxBasedOn: 'shipping', addressUsed: 'base', location: auNzSettings.baseTaxAddress });
    const { baseTaxAddress: _base, ...noBase } = auNzSettings;
    const noBaseFor = saleTaxContexts(noBase, { orderCreateVersion: 8 });
    expect(noBaseFor(shipsToNz).taxContext).toBe(noBaseFor(null).taxContext);
    expect(noBaseFor(shipsToNz).location.location).toEqual({ country: '', state: '', city: '', postcode: '' });
  });

  it.each([
    ['no option', undefined],
    ['order.create 7', { orderCreateVersion: 7 }],
  ])("gives everyone the store's own context with the table but %s: the server taxes below 8 on the base", (_label, options) => {
    const storeFor = saleTaxContexts(auNzSettings, options);
    const store = storeFor(null);
    expect(storeFor(shipsToNz).taxContext).toBe(store.taxContext);
    expect(storeFor(billsInNz).taxContext).toBe(store.taxContext);
    expect(store.taxContext.getTaxRates?.()).toEqual([AU]);
    expect(storeFor(shipsToNz).location).toEqual({ taxBasedOn: 'shipping', addressUsed: 'base', location: auNzSettings.baseTaxAddress });
  });

  it('re-matches by address from order.create 8', () => {
    const at8 = saleTaxContexts(auNzSettings, { orderCreateVersion: 8 })(shipsToNz);
    expect(at8.taxContext.getTaxRates?.()).toEqual([NZ]);
    expect(at8.location.addressUsed).toBe('shipping');
  });
});
