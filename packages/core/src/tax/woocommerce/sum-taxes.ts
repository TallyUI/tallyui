// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
import type { ItemizedTax } from './types';

export function sumTaxes({ taxes }: { taxes: { total: number; [key: string]: any }[] }) {
	return taxes.reduce((sum, tax, index) => index === 0 ? tax.total : sum + tax.total, 0);
}

export function sumItemizedTaxes({ taxes }: { taxes: (ItemizedTax | ItemizedTax[])[] }) {
	const groupedTaxes: Record<string, ItemizedTax[]> = Object.create(null);
	for (const tax of taxes.flat()) {
		(groupedTaxes[tax.id] ??= []).push(tax);
	}
	return Object.entries(groupedTaxes).map(([id, itemized]) => ({
		id: Number(id),
		total: sumTaxes({ taxes: itemized }),
	}));
}
