import { describe, expect, it } from 'vitest';
import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import { taxDerivation, type SaleTaxLocation } from './tax-derivation';

type WooTaxRate = woocommerceTax.WooTaxRate;
type Address = woocommerceTax.TaxAddress;

const wooRate = (id: number, rate: string, extra: Partial<WooTaxRate> = {}): WooTaxRate => ({
  id, country: '', state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name: `Rate ${id}`,
  priority: 1, compound: false, shipping: true, order: id, class: 'standard', ...extra,
});

const table: WooTaxRate[] = [
  wooRate(1, '10.0000', { country: 'AU', name: 'GST' }),
  wooRate(2, '5.0000', { country: 'AU', name: 'GST reduced', class: 'reduced-rate' }),
  wooRate(3, '7.2500', { country: 'US', state: 'CA', postcodes: ['90*'], cities: ['BEVERLY HILLS'], name: 'CA Tax' }),
  wooRate(4, '4.0000', { country: 'US', state: 'NY', name: 'NY State' }),
  wooRate(5, '1.0000', { country: 'US', state: 'NY', name: 'NY Local', priority: 2, compound: true }),
];

const address = (country = '', state = '', postcode = '', city = ''): Address => ({ country, state, postcode, city });
const sydney = address('AU', 'NSW', '2000', 'Sydney');

const settings = (extra: Partial<StoreSettings> = {}): StoreSettings => ({
  currency: 'AUD', pricesIncludeTax: false, taxRatesPpm: { default: 0 }, taxBasedOn: 'shipping',
  baseTaxAddress: sydney, taxRateTable: table, ...extra,
});

type Customer = { billing?: Partial<Address>; shipping?: Partial<Address> } | null;
/** As useSale builds it: saleTaxContexts' orderTaxLocation, plus hasCustomer. */
function location(taxBasedOn: woocommerceTax.TaxBasedOn, customer: Customer, base: Address = sydney): SaleTaxLocation {
  return { ...woocommerceTax.orderTaxLocation(base, taxBasedOn, customer ?? undefined), hasCustomer: customer !== null };
}
const derive = (taxBasedOn: woocommerceTax.TaxBasedOn, customer: Customer, base?: Address, extra?: Partial<StoreSettings>) =>
  taxDerivation(settings({ taxBasedOn, baseTaxAddress: base ?? sydney, ...extra }), location(taxBasedOn, customer, base));

describe('taxDerivation', () => {
  it('an AU base with no customer: the shop address, both AU classes in table order, why country AU', () => {
    const result = derive('shipping', null);
    expect(result).toMatchObject({ taxBasedOn: 'shipping', addressUsed: 'base', fromOrder: false, fallback: null,
      failure: null, noRateCause: null, location: sydney });
    expect(result.classes).toEqual([
      { slug: 'standard', name: 'Standard', percent: '10%',
        rates: [{ id: 1, name: 'GST', percent: '10%', why: { field: 'country', country: 'AU' } }] },
      { slug: 'reduced-rate', name: 'Reduced rate', percent: '5%',
        rates: [{ id: 2, name: 'GST reduced', percent: '5%', why: { field: 'country', country: 'AU' } }] },
    ]);
  });

  it("a customer shipping to CA 90210: the order's address, why postcode 90*", () => {
    const result = derive('shipping', { shipping: address('US', 'CA', '90210', 'Beverly Hills') });
    expect(result).toMatchObject({ addressUsed: 'shipping', fromOrder: true, fallback: null, failure: null });
    expect(result.classes).toEqual([{ slug: 'standard', name: 'Standard', percent: '7.25%',
      rates: [{ id: 3, name: 'CA Tax', percent: '7.25%', why: { field: 'postcode', pattern: '90*' } }] }]);
  });

  it('shipping with only a billing address in NY: shipping-to-billing, and the class percent compounds', () => {
    const result = derive('shipping', { billing: address('US', 'NY', '10001', 'New York') });
    expect(result).toMatchObject({ addressUsed: 'billing', fromOrder: true, fallback: 'shipping-to-billing' });
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0]).toMatchObject({ slug: 'standard', percent: '5.04%' });
    expect(result.classes[0].rates.map((rate) => [rate.id, rate.percent, rate.why])).toEqual([
      [4, '4%', { field: 'state' }], [5, '1%', { field: 'state' }]]);
  });

  it('billing with a customer who has no billing address: billing-to-shop, at the AU rates', () => {
    const result = derive('billing', { shipping: address('US', 'CA', '90210') });
    expect(result).toMatchObject({ addressUsed: 'base', fromOrder: false, fallback: 'billing-to-shop', failure: null });
    expect(result.classes.map((group) => group.percent)).toEqual(['10%', '5%']);
  });

  it('shipping with neither address: shipping-to-shop; no customer gives no fallback', () => {
    expect(derive('shipping', {}).fallback).toBe('shipping-to-shop');
    expect(derive('shipping', null).fallback).toBeNull();
    expect(derive('billing', null).fallback).toBeNull();
  });

  it('a customer in FR: rates fail, no rate for the country, no classes', () => {
    expect(derive('shipping', { shipping: address('FR', '', '75001', 'Paris') })).toMatchObject({
      fromOrder: true, failure: 'rates', noRateCause: 'no-rate-for-country', classes: [] });
  });

  it("a customer in US-TX: the store's US rates don't cover it", () => {
    expect(derive('billing', { billing: address('us', 'TX', '73301', 'Austin') })).toMatchObject({
      failure: 'rates', noRateCause: 'not-covered', classes: [] });
  });

  it('an empty base, shipping, and a customer with no addresses: the address fails', () => {
    expect(derive('shipping', {}, address())).toMatchObject({ failure: 'address', noRateCause: null, classes: [] });
  });

  it('the same on base: the rates fail for want of a country', () => {
    expect(derive('base', {}, address())).toMatchObject({ failure: 'rates', noRateCause: 'no-country', classes: [] });
  });

  it('no table: the classes come from settings.taxRates, why anywhere', () => {
    const taxRates: StoreSettings['taxRates'] = {
      standard: [{ id: 7, code: 'AU-GST-1', label: 'GST', rate: '10.0000', priority: 1, compound: false, shipping: true }],
      'zero-rate': [{ id: 8, code: 'AU-ZERO-1', label: 'Zero', rate: '0.0000', priority: 1, compound: false, shipping: true }],
    };
    const result = derive('base', null, sydney, { taxRateTable: undefined, taxRates });
    expect(result.classes).toEqual([
      { slug: 'standard', name: 'Standard', percent: '10%', rates: [{ id: 7, name: 'GST', percent: '10%', why: { field: 'anywhere' } }] },
      { slug: 'zero-rate', name: 'Zero rate', percent: '0%', rates: [{ id: 8, name: 'Zero', percent: '0%', why: { field: 'anywhere' } }] },
    ]);
    expect(derive('base', null, sydney, { taxRateTable: undefined, taxRates: {} })).toMatchObject({
      failure: 'rates', noRateCause: 'no-rate-for-country' });
  });

  it('formats percents with at most 4 decimals, trailing zeros trimmed: 10%, 8.875%, 0%; a city rate says city', () => {
    const local = [wooRate(9, '8.8750', { country: 'US', state: 'NY', cities: ['NEW YORK'], name: 'NYC' }),
      wooRate(10, '0.0000', { country: 'US', name: 'US zero', class: 'zero-rate' }), wooRate(11, '10.0000', { name: 'Flat', class: 'flat' })];
    const result = derive('base', null, address('US', 'NY', '10001', 'New York'), { taxRateTable: local });
    expect(result.classes.map((group) => [group.name, group.percent, group.rates[0].why])).toEqual([
      ['Standard', '8.875%', { field: 'city' }], ['Zero rate', '0%', { field: 'country', country: 'US' }], ['Flat', '10%', { field: 'anywhere' }]]);
  });

  it("classes follow the table's first appearance even when filterTaxRates returns them in another order", () => {
    // filterTaxRates groups by the raw class, so '' (standard on the wire) is its own group after reduced-rate.
    const mixed = [wooRate(20, '20.0000', { country: 'FR', name: 'FR TVA' }),
      wooRate(21, '5.0000', { country: 'AU', name: 'GST reduced', class: 'reduced-rate' }),
      wooRate(22, '10.0000', { country: 'AU', name: 'GST', class: '' })];
    expect(woocommerceTax.filterTaxRates(mixed, 'AU', 'NSW', '2000', 'Sydney').map((rate) => rate.id)).toEqual([21, 22]);
    expect(derive('base', null, sydney, { taxRateTable: mixed }).classes.map((group) => [group.slug, group.rates.map((rate) => rate.id)]))
      .toEqual([['standard', [22]], ['reduced-rate', [21]]]);
  });
});
