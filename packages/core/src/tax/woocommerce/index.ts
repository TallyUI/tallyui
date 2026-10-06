// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
export { calculateTaxes } from './calculate-taxes';
export { filterTaxRates } from './filter-tax-rates';
export {
	roundHalfUp, roundHalfDown, getRoundingPrecision, roundTaxTotal,
	addNumberPrecision, removeNumberPrecision,
} from './precision';
export { sumTaxes, sumItemizedTaxes } from './sum-taxes';
export {
	normalizeTaxClass, taxClassFromWire, taxClassToWire,
	resolveInheritedShippingTaxClass, NO_SHIPPING_TAX, STANDARD_TAX_CLASS,
} from './tax-class';
export type { WooTaxRate, CalculateTaxesInput, CalculateTaxesResult, ItemizedTax } from './types';
