// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
import type { ItemizedTax } from './types';

function sumTaxTotals(taxes: { total: number }[]): number {
	if (taxes.length === 0) return 0;
	let result: number | undefined;
	for (const tax of taxes) {
		const current = tax.total;
		if (current !== undefined) result = result === undefined ? current : result + current;
	}
	// Preserve lodash's number return type; all-undefined totals yield undefined at runtime.
	return result as number;
}

export function sumTaxes({ taxes }: { taxes: { total: number; [key: string]: any }[] }) {
	const sum = sumTaxTotals(taxes);
	return sum;
}

export function sumItemizedTaxes({ taxes }: { taxes: (ItemizedTax | ItemizedTax[])[] }) {
	// group taxes by id
	const groupedTaxes: Record<string, ItemizedTax[]> = Object.create(null);
	for (const tax of taxes.flat()) {
		(groupedTaxes[tax.id] ??= []).push(tax);
	}
	return Object.entries(groupedTaxes).map(([id, itemized]) => ({
		id: Number(id), // groupBy converts the key to a string
		total: sumTaxes({ taxes: itemized }),
	}));
}
