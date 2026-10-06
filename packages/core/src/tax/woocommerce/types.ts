// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
export interface WooTaxRate {
	id: number;
	country: string;
	state: string;
	postcode: string;
	city: string;
	postcodes: string[];
	cities: string[];
	rate: string;
	name: string;
	priority: number;
	compound: boolean;
	shipping: boolean;
	order: number;
	class: string;
}

export interface CalculateTaxesInput {
	amount: number;
	rates: {
		id: number;
		rate: string;
		compound: boolean;
		order: number;
		priority?: number;
		[key: string]: any;
	}[];
	amountIncludesTax: boolean;
	dp?: number;
	perRatePrecision?: number;
}

export type ItemizedTax = { id: number; total: number; [key: string]: any };

export interface CalculateTaxesResult {
	total: number;
	taxes: { id: number; total: number }[];
}
