import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTaxContext } from './tax-context';
import { TaxProvider, useTax, type TaxProviderProps } from './tax-provider';

const props: Omit<TaxProviderProps, 'children'> = {
  ratesPpm: { default: 200000, reduced: 50000 },
  pricesIncludeTax: true,
  rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
  rateCodes: { default: 'VAT', reduced: 'VAT-R' },
  taxRates: {
    standard: [{ id: 1, code: 'GB-VAT-1', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
    reduced: [{ id: 2, code: 'GB-VAT-R-1', label: 'VAT', rate: '5.0000', priority: 1, compound: false, shipping: false }],
  },
  shippingTaxClass: 'inherit',
  taxClassSlugs: ['standard', 'reduced'],
};

describe('createTaxContext', () => {
  it("answers as TaxProvider's context does for the same props", () => {
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...props, children });
    const provided = renderHook(() => useTax(), { wrapper }).result.current;
    const built = createTaxContext(props);
    for (const taxClass of [undefined, 'default', 'reduced', 'unknown']) {
      expect(built.getTaxRatePpm(taxClass)).toBe(provided.getTaxRatePpm(taxClass));
      expect(built.getTaxRateCode?.(taxClass)).toBe(provided.getTaxRateCode?.(taxClass));
    }
    for (const taxClass of [undefined, '', 'standard', 'reduced', 'unknown']) {
      expect(built.getTaxRates?.(taxClass)).toEqual(provided.getTaxRates?.(taxClass));
      expect(built.getTaxRates?.(taxClass, { shipping: true })).toEqual(provided.getTaxRates?.(taxClass, { shipping: true }));
    }
    expect(built.getTaxRates?.('reduced', { shipping: true })).toEqual([]);
    const { getTaxRates: _a, getTaxRatePpm: _b, getTaxRateCode: _c, ...builtRest } = built;
    const { getTaxRates: _d, getTaxRatePpm: _e, getTaxRateCode: _f, ...providedRest } = provided;
    expect(builtRest).toEqual(providedRest);
  });

  it('throws on a rate that is not integer ppm', () => {
    expect(() => createTaxContext({ ratesPpm: { default: 200000.5 }, pricesIncludeTax: false })).toThrow(RangeError);
    expect(() => createTaxContext({ ratesPpm: { default: -1 }, pricesIncludeTax: false })).toThrow('TaxProvider: rates must be integer ppm');
  });
});
