// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
import { describe, expect, it } from 'vitest';
import { calculateOrderTotals } from './order-totals';

describe('coupon line calculations', () => {
	it('derives discount from line item subtotal-total difference', () => {
		// Coupon discounts are now applied directly to line item totals.
		// calculateOrderTotals derives discount_total/discount_tax from
		// the difference between subtotal and total on each line item.
		const lineItems = [
			{
				subtotal: '100',
				total: '90',
				subtotal_tax: '10',
				total_tax: '9',
				taxes: [{ id: 1, total: '9' }],
			},
		];
		const couponLines = [
			{
				code: 'SAVE10',
				discount: '10',
				discount_tax: '0',
			},
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			couponLines: couponLines as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('10');
		expect(result.discount_tax).toBe('1');
		expect(result.total).toBe('99');
		expect(result.cart_tax).toBe('9');
	});

	it('handles synced coupon discounts (already in line items)', () => {
		const lineItems = [
			{
				subtotal: '100',
				total: '90',
				subtotal_tax: '10',
				total_tax: '9',
				taxes: [{ id: 1, total: '9' }],
			},
		];
		const couponLines = [
			{
				id: 123,
				code: 'SAVE10',
				discount: '10',
				discount_tax: '1',
			},
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			couponLines: couponLines as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('10');
		expect(result.discount_tax).toBe('1');
		expect(result.total).toBe('99');
		expect(result.coupon_total).toBe('10');
		expect(result.coupon_tax).toBe('1');
	});

	it('handles multiple coupons applied to line items', () => {
		// Two coupons: total discount of 15, applied to line items
		const lineItems = [
			{
				subtotal: '200',
				total: '185',
				subtotal_tax: '20',
				total_tax: '18.5',
				taxes: [{ id: 1, total: '18.5' }],
			},
		];
		const couponLines = [
			{ code: 'SAVE10', discount: '10', discount_tax: '0' },
			{ code: 'EXTRA5', discount: '5', discount_tax: '0' },
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			couponLines: couponLines as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('15');
		expect(result.discount_tax).toBe('1.5');
		expect(result.total).toBe('203.5');
		expect(result.coupon_total).toBe('15');
		expect(result.coupon_tax).toBe('0');
	});

	it('works with no coupon lines', () => {
		const lineItems = [
			{
				subtotal: '100',
				total: '100',
				subtotal_tax: '10',
				total_tax: '10',
				taxes: [{ id: 1, total: '10' }],
			},
		];

		const result = calculateOrderTotals({
			lineItems: lineItems as any,
			taxRates: [{ id: 1, name: 'Tax', rate: '10', compound: false }] as any,
			taxRoundAtSubtotal: false,
		});

		expect(result.discount_total).toBe('0');
		expect(result.coupon_total).toBe('0');
		expect(result.coupon_tax).toBe('0');
	});
});

describe('calculateOrderTotals (upstream lines 958-1007)', () => {
	describe('dev-free: discount_tax with float subtraction artifacts', () => {
		// Bug: 4.5 - 4.275 = 0.22499... in IEEE 754 (not 0.225).
		// Fix: pre-round to WC rounding precision (6dp) before rounding to dp.
		// This snaps 0.22499... → 0.225 → round(0.225, 2) = 0.23.
		it('pre-rounds discount_tax to rounding precision (single coupon)', () => {
			const lineItems = [
				{
					subtotal: '45',
					total: '42.75',
					subtotal_tax: '4.5',
					total_tax: '4.275',
					taxes: [{ id: 6, subtotal: '4.5', total: '4.275' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [{ id: 6, name: 'US Tax', rate: '10', compound: false }] as any,
				taxRoundAtSubtotal: false,
				pricesIncludeTax: false,
			});

			// 4.5 - 4.275 = 0.22499... → 6dp: 0.225 → 2dp: 0.23
			expect(result.discount_tax).toBe('0.23');
		});

		it('preserves stacked coupon discount_tax (no over-rounding)', () => {
			// prod8 + pct12 on Beanie ($18): total_tax = 0.687
			// discount_tax = 1.8 - 0.687 = 1.113 → 6dp: 1.113 → 2dp: 1.11
			const lineItems = [
				{
					subtotal: '18',
					total: '6.87',
					subtotal_tax: '1.8',
					total_tax: '0.687',
					taxes: [{ id: 6, subtotal: '1.8', total: '0.687' }],
				},
			];

			const result = calculateOrderTotals({
				lineItems: lineItems as any,
				taxRates: [{ id: 6, name: 'US Tax', rate: '10', compound: false }] as any,
				taxRoundAtSubtotal: false,
				pricesIncludeTax: false,
			});

			// 1.8 - 0.687 = 1.113 → 6dp: 1.113 → 2dp: 1.11 (NOT 1.12)
			expect(result.discount_tax).toBe('1.11');
		});
	});
});
