// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
import { describe, expect, it } from 'vitest';
import { sumItemizedTaxes, sumTaxes } from './sum-taxes';

describe('Calculate Taxes', () => {
	it('should skip undefined totals when summing taxes', () => {
		const taxes = [{ total: undefined }, { total: 2 }] as unknown as { total: number }[];
		expect(sumTaxes({ taxes })).toBe(2);
	});

	it('should return undefined when every tax total is undefined', () => {
		const taxes = [{ total: undefined }] as unknown as { total: number }[];
		expect(sumTaxes({ taxes })).toBeUndefined();
	});

	it('should sum taxes', () => {
		const taxes = [
			{ id: 1, total: 1.665 },
			{ id: 2, total: 2 },
		];
		expect(sumTaxes({ taxes })).toEqual(3.665);
	});

	it('should sum itemized taxes', () => {
		const taxes1 = [
			{ id: 1, total: 1.665 },
			{ id: 2, total: 2 },
		];
		const taxes2 = [
			{ id: 1, total: 1 },
			{ id: 2, total: 2 },
		];

		expect(sumItemizedTaxes({ taxes: [taxes1, taxes2] })).toEqual([
			{ id: 1, total: 2.665 },
			{ id: 2, total: 4 },
		]);
	});
});
