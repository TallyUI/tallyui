import { describe, expect, it } from 'vitest';
import { woocommerceTax, type StoreSettings } from '@tallyui/core';
import { taxSettingsForLocation } from './location-rates';

type WooTaxRate = woocommerceTax.WooTaxRate;

const wooRate = (id: number, rate: string, extra: Partial<WooTaxRate> = {}): WooTaxRate => ({
  id, country: '', state: '', postcode: '', city: '', postcodes: [], cities: [], rate, name: `Rate ${id}`,
  priority: 1, compound: false, shipping: true, order: id, class: 'standard', ...extra,
});

const table: WooTaxRate[] = [
  wooRate(1, '0.0000', { country: 'US', state: 'OR', name: 'OR Tax' }),
  wooRate(2, '7.2500', { country: 'US', state: 'CA', name: 'CA Tax' }),
  wooRate(3, '1.0000', { country: 'US', state: 'CA', postcode: '90210', postcodes: ['90210'], name: 'Local', priority: 2 }),
  wooRate(4, '20.0000', { country: 'GB', name: 'VAT' }),
  wooRate(5, '5.0000', { country: 'GB', name: 'VAT', class: 'reduced-rate' }),
  wooRate(6, '5.0000', { country: 'CA', name: 'GST' }),
  wooRate(7, '10.0000', { country: 'CA', state: 'QC', name: 'QST', priority: 2, compound: true }),
];

const address = (country: string, state = '', postcode = '', city = '') => ({ country, state, postcode, city });

const settings: StoreSettings = {
  currency: 'USD',
  pricesIncludeTax: false,
  taxRatesPpm: { default: 0 },
  taxRates: { standard: [] },
  taxClassSlugs: ['standard', 'reduced-rate'],
  taxRoundAtSubtotal: false,
  shippingTaxClass: 'inherit',
  taxBasedOn: 'billing',
  baseTaxAddress: address('US', 'OR', '97201', 'Portland'),
  taxRateTable: table,
  pricingContext: { store: '1' },
};

describe('taxSettingsForLocation', () => {
  it('matches both California rates for 90210 and sums them for the class', () => {
    const result = taxSettingsForLocation(settings, address('US', 'CA', '90210', 'Beverly Hills'));
    expect(result.taxRates).toEqual({
      standard: [
        { id: 2, code: 'US-CA-CA TAX-1', label: 'CA Tax', rate: '7.2500', priority: 1, compound: false, shipping: true },
        { id: 3, code: 'US-CA-LOCAL-2', label: 'Local', rate: '1.0000', priority: 2, compound: false, shipping: true },
      ],
    });
    expect(result.taxRatesPpm).toEqual({ default: 82500, 'reduced-rate': 0 });
    expect(taxSettingsForLocation(settings, address('US', 'CA', '90001')).taxRatesPpm.default).toBe(72500);
  });

  it('keys a GB address by class, with the standard class as default', () => {
    const result = taxSettingsForLocation(settings, address('GB', '', 'SW1A 1AA', 'London'));
    expect(result.taxRatesPpm).toEqual({ default: 200000, 'reduced-rate': 50000 });
    expect(result.taxRates).toEqual({
      standard: [{ id: 4, code: 'GB-VAT-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
      'reduced-rate': [{ id: 5, code: 'GB-VAT-1', label: 'VAT', rate: '5.0000', priority: 1, compound: false, shipping: true }],
    });
  });

  it('includes compound tax as calculateTaxes does, not as the plain sum', () => {
    const result = taxSettingsForLocation(settings, address('CA', 'QC'));
    const matched = result.taxRates!.standard;
    expect(matched.map((rate) => rate.id)).toEqual([6, 7]);
    const plainSum = matched.reduce((sum, rate) => sum + Math.round(Number(rate.rate) * 10000), 0);
    expect(plainSum).toBe(150000);
    // 5% of 100, then 10% of 105.
    expect(result.taxRatesPpm.default).toBe(155000);
    const expected = woocommerceTax.calculateTaxes({ amount: 100, rates: table.filter((rate) => rate.id >= 6), amountIncludesTax: false });
    expect(result.taxRatesPpm.default).toBe(Math.round(expected.total * 10000));
  });

  it('gives 0 for every class at an address no rate matches', () => {
    const result = taxSettingsForLocation(settings, address('FR', '', '75001', 'Paris'));
    expect(result.taxRatesPpm).toEqual({ default: 0, 'reduced-rate': 0 });
    expect(result.taxRates).toEqual({});
  });

  it('keeps a class with no matching rate at 0 rather than leaving it to fall back to default', () => {
    const result = taxSettingsForLocation(settings, address('US', 'CA', '90210'));
    expect(Object.hasOwn(result.taxRatesPpm, 'reduced-rate')).toBe(true);
    expect(result.taxRatesPpm['reduced-rate']).toBe(0);
  });

  it('returns the same object without a rate table', () => {
    const { taxRateTable: _table, ...withoutTable } = settings;
    expect(taxSettingsForLocation(withoutTable, address('GB'))).toBe(withoutTable);
  });

  it('keeps every other field, and does not change its input', () => {
    const before = structuredClone(settings);
    const { taxRates: _rates, taxRatesPpm: _ppm, ...rest } = taxSettingsForLocation(settings, address('GB'));
    const { taxRates: _r, taxRatesPpm: _p, ...expectedRest } = before;
    expect(rest).toEqual(expectedRest);
    expect(rest.taxRateTable).toBe(table);
    expect(settings).toEqual(before);
  });

  it('matches a postcode with stray whitespace through the core matcher', () => {
    const result = taxSettingsForLocation(settings, address('us', 'ca', ' 90210 ', 'beverly hills'));
    expect(result.taxRates!.standard.map((rate) => rate.id)).toEqual([2, 3]);
    expect(result.taxRatesPpm.default).toBe(82500);
  });
});
