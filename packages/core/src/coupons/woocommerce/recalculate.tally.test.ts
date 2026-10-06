// TallyUI's own cases for recalculate.ts (ADR-077); the upstream cases are in recalculate.test.ts.
import { describe, expect, it } from 'vitest';
import { recalculateCoupons, type RecalculateInput } from './recalculate';

describe('recalculateCoupons (TallyUI cases)', () => {
	it('caps a stacked coupon at the value left on the line (non-sequential)', () => {
		const input: RecalculateInput = {
			lineItems: [{
				product_id: 1,
				quantity: 1,
				tax_class: '',
				subtotal: '10',
				subtotal_tax: '0',
				total: '10',
				total_tax: '0',
				taxes: [],
				meta_data: [{
					key: '_woocommerce_pos_data',
					value: JSON.stringify({ price: '10', regular_price: '10', tax_status: 'taxable' }),
				}],
			}],
			couponLines: [
				{ code: 'a', discount: '0', discount_tax: '0', meta_data: [] },
				{ code: 'b', discount: '0', discount_tax: '0', meta_data: [] },
			],
			couponConfigs: new Map([
				['a', {
					discount_type: 'fixed_cart',
					amount: '8',
					limit_usage_to_x_items: null,
					product_ids: [],
					excluded_product_ids: [],
					product_categories: [],
					excluded_product_categories: [],
					exclude_sale_items: false,
				}],
				['b', {
					discount_type: 'fixed_cart',
					amount: '8',
					limit_usage_to_x_items: null,
					product_ids: [],
					excluded_product_ids: [],
					product_categories: [],
					excluded_product_categories: [],
					exclude_sale_items: false,
				}],
			]),
			pricesIncludeTax: false,
			calcDiscountsSequentially: false,
			taxRates: [],
			productCategories: new Map(),
		};
		const result = recalculateCoupons(input);

		expect(parseFloat(result.couponLines[0].discount!)).toBeCloseTo(8, 6);
		expect(parseFloat(result.couponLines[1].discount!)).toBeCloseTo(2, 6);
		expect(parseFloat(result.lineItems[0].total!)).toBeCloseTo(0, 6);
	});

	it('keeps the reset ex-tax total at full precision on a tax-inclusive store', () => {
		const input: RecalculateInput = {
			lineItems: [{
				product_id: 1,
				quantity: 1,
				tax_class: '',
				subtotal: '10',
				subtotal_tax: '0',
				total: '10',
				total_tax: '0',
				taxes: [],
				meta_data: [{
					key: '_woocommerce_pos_data',
					value: JSON.stringify({ price: '10', regular_price: '10', tax_status: 'taxable' }),
				}],
			}],
			couponLines: [],
			couponConfigs: new Map(),
			pricesIncludeTax: true,
			calcDiscountsSequentially: false,
			taxRates: [{ id: 1, rate: '10.0000', compound: false, order: 1, class: '' }],
			productCategories: new Map(),
		};
		const result = recalculateCoupons(input);
		const { total, total_tax } = result.lineItems[0];

		expect(parseFloat(total!) + parseFloat(total_tax!)).toBeCloseTo(10, 6);
		expect(parseFloat(total!)).toBeCloseTo(10 / 1.1, 2);
	});
});
