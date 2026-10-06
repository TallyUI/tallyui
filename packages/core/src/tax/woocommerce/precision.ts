// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
function toDecimalString(n: number): string {
	const s = String(n);
	if (!s.includes('e') && !s.includes('E')) return s;
	return n.toFixed(20);
}

export function roundHalfUp(value: number, precision: number): number {
	if (!Number.isFinite(value) || value === 0) return value;

	const sign = value < 0 ? -1 : 1;
	const abs = Math.abs(value);
	const factor = Math.pow(10, precision);
	const shifted = abs * factor;
	let result = Math.floor(shifted + 0.5);
	// Detect true decimal midpoints even when float multiplication lands below .5.
	const str = toDecimalString(abs);
	const dot = str.indexOf('.');
	if (dot !== -1) {
		const decimals = str.slice(dot + 1);
		if (precision < decimals.length && decimals[precision] === '5') {
			const rest = decimals.slice(precision + 1);
			if (rest === '' || /^0*$/.test(rest)) {
				result = Math.floor(shifted) + 1;
			}
		}
	}

	return (sign * result) / factor;
}

export function roundHalfDown(value: number, precision: number): number {
	if (!Number.isFinite(value) || value === 0) return value;

	const sign = value < 0 ? -1 : 1;
	const abs = Math.abs(value);
	const factor = Math.pow(10, precision);
	const shifted = abs * factor;
	let result = Math.floor(shifted + 0.5);
	// Detect true decimal midpoints even when float multiplication lands below .5.
	const str = toDecimalString(abs);
	const dot = str.indexOf('.');
	if (dot !== -1) {
		const decimals = str.slice(dot + 1);
		if (precision < decimals.length && decimals[precision] === '5') {
			const rest = decimals.slice(precision + 1);
			if (rest === '' || /^0*$/.test(rest)) {
				result = Math.floor(shifted);
			}
		}
	}

	return (sign * result) / factor;
}

export function getRoundingPrecision(dp: number): number {
	return Math.max(dp + 2, 6);
}

export function addNumberPrecision(value: number, dp: number, round = true): number {
	const factor = Math.pow(10, dp);
	const result = value * factor;
	const roundingPrecision = getRoundingPrecision(dp);
	const roundPrecision = round ? roundingPrecision - dp : roundingPrecision;
	return roundHalfUp(result, roundPrecision);
}

export function removeNumberPrecision(value: number, dp: number): number {
	return value / Math.pow(10, dp);
}

export function roundTaxTotal(
	value: number,
	dp: number,
	pricesIncludeTax: boolean,
	precision?: number
): number {
	const p = precision ?? dp;
	return pricesIncludeTax ? roundHalfDown(value, p) : roundHalfUp(value, p);
}

export function roundDiscount(value: number, precision: number): number {
	return roundHalfDown(value, precision);
}
