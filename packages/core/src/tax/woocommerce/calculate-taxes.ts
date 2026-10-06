// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
import type { CalculateTaxesInput, CalculateTaxesResult } from './types';
import {
	addNumberPrecision,
	getRoundingPrecision,
	removeNumberPrecision,
	roundHalfUp,
} from './precision';
import { sumTaxes } from './sum-taxes';

function calcInclusiveTax({
	amount,
	rates,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean }[];
}) {
	const taxes: { id: number; total: number }[] = [];
	const compoundRates: { id: number; rate: number }[] = [];
	const regularRates: { id: number; rate: number }[] = [];
	let nonCompoundAmount = amount;
	rates.forEach((_rate) => {
		const { id, rate, compound } = _rate;

		if (compound) {
			compoundRates.push({ id, rate: Number(rate) });
		} else {
			regularRates.push({ id, rate: Number(rate) });
		}
	});

	compoundRates.reverse(); // Working backwards.

	compoundRates.forEach((compoundRate) => {
		const { id, rate } = compoundRate;
		const total = nonCompoundAmount - nonCompoundAmount / (1 + rate / 100);
		taxes.push({ id, total });
		nonCompoundAmount -= total;
	});
	const regularTaxRate = 1 + regularRates.reduce((sum, regularRate, index) =>
		index === 0 ? regularRate.rate / 100 : sum + regularRate.rate / 100, 0);

	regularRates.forEach((regularRate) => {
		const { id, rate } = regularRate;
		const theRate = rate / 100 / regularTaxRate;
		const netPrice = amount - theRate * nonCompoundAmount;
		const total = amount - netPrice;
		taxes.push({ id, total });
	});

	return taxes;
}

function calcExclusiveTax({
	amount,
	rates,
}: {
	amount: number;
	rates: { id: number; rate: string; compound: boolean }[];
}) {
	const taxes: { id: number; total: number }[] = [];

	rates.forEach((_rate) => {
		const { id, rate, compound } = _rate;

		if (!compound) {
			const total = amount * (Number(rate) / 100);
			taxes.push({ id, total });
		}
	});

	let preCompoundTotal = sumTaxes({ taxes });
	rates.forEach((_rate) => {
		const { id, rate, compound } = _rate;

		if (compound) {
			const thePriceIncTax = amount + preCompoundTotal;
			const total = thePriceIncTax * (Number(rate) / 100);
			taxes.push({ id, total });
			preCompoundTotal = sumTaxes({ taxes });
		}
	});

	return taxes;
}

export function calculateTaxes({
	amount,
	rates,
	amountIncludesTax,
	dp = 2,
	perRatePrecision,
}: CalculateTaxesInput): CalculateTaxesResult {
	// Priority wins over display-only order; order remains the original fallback (#1548).
	const sortKey = (rate: { order: number; priority?: number }): number =>
		typeof rate.priority === 'number' ? rate.priority : rate.order;
	const sortedRates = [...rates].sort((a, b) => {
		if (sortKey(a) !== sortKey(b)) return sortKey(a) - sortKey(b);
		const aCountry = (a as any).country || '';
		const bCountry = (b as any).country || '';
		if ((aCountry !== '') !== (bCountry !== '')) return aCountry !== '' ? -1 : 1;
		const aState = (a as any).state || '';
		const bState = (b as any).state || '';
		if ((aState !== '') !== (bState !== '')) return aState !== '' ? -1 : 1;
		return a.id - b.id;
	});
	const roundingPrecision = perRatePrecision ?? dp + getRoundingPrecision(dp);
	const normalizedAmount = removeNumberPrecision(addNumberPrecision(amount, dp), dp);

	const taxes = amountIncludesTax
		? calcInclusiveTax({ amount: normalizedAmount, rates: sortedRates })
		: calcExclusiveTax({ amount: normalizedAmount, rates: sortedRates });

	// Order-item precision rounds once, after PHP's 15-significant-digit pre-round (#2344).
	const roundRate = (value: number) =>
		perRatePrecision === undefined
			? roundHalfUp(value, roundingPrecision)
			: roundHalfUp(Number(value.toPrecision(15)), roundingPrecision);
	const roundedItemizedTaxes = taxes.map((tax) => ({
		id: tax.id,
		total: roundRate(tax.total),
	}));

	const total = sumTaxes({ taxes: roundedItemizedTaxes });

	return {
		total: roundHalfUp(total, roundingPrecision),
		taxes: roundedItemizedTaxes,
	};
}
