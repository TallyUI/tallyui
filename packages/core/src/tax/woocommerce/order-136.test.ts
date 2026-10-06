import { expect, it } from 'vitest';
import { calculateTaxes, filterTaxRates, roundTaxTotal, sumTaxes } from './index';
import type { WooTaxRate } from './types';

it('matches WooCommerce order #136 (WCPOS 1.10.20, exclusive prices)', () => {
	const base: WooTaxRate = {
		id: 1, country: 'US', state: 'CA', postcode: '', city: '', postcodes: [], cities: [],
		rate: '7.2500', name: 'CA State', priority: 1, compound: false, shipping: true,
		order: 0, class: 'standard',
	};
	const rates: WooTaxRate[] = [
		base,
		{ ...base, id: 2, rate: '1.3750', name: 'SF District', priority: 2,
			postcode: '94105', city: 'SAN FRANCISCO', postcodes: ['94105'], cities: ['SAN FRANCISCO'] },
		{ ...base, id: 3, rate: '5.5000', name: 'CA Reduced', class: 'reduced-rate', shipping: false },
		{ ...base, id: 4, rate: '2.0000', name: 'Compound Test', priority: 3, compound: true, shipping: false },
		{ ...base, id: 5, rate: '0.0000', name: 'Zero', class: 'zero-rate', shipping: false },
	];
	const matched = filterTaxRates(rates, 'US', 'CA', '94105', 'San Francisco');
	const standard = matched.filter((rate) => rate.class === 'standard');
	expect(standard.map((rate) => rate.id)).toEqual([1, 2, 4]);

	const result = calculateTaxes({ amount: 3 * 3.00, rates: standard, amountIncludesTax: false, dp: 2 });
	expect(result.taxes).toEqual([
		{ id: 1, total: 0.6525 },
		{ id: 2, total: 0.12375 },
		{ id: 4, total: 0.195525 }, // Compound on the unrounded base.
	]);
	const rounded = result.taxes.map((tax) => ({ ...tax, total: roundTaxTotal(tax.total, 2, false) }));
	expect(rounded.map((tax) => tax.total)).toEqual([0.65, 0.12, 0.20]);
	expect(sumTaxes({ taxes: rounded })).toBe(0.97);

	const reduced = calculateTaxes({
		amount: 3.50, rates: matched.filter((rate) => rate.id === 3), amountIncludesTax: false, dp: 2,
	});
	expect(reduced.taxes).toEqual([{ id: 3, total: 0.1925 }]);
	expect(roundTaxTotal(reduced.taxes[0].total, 2, false)).toBe(0.19);
});
