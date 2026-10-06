// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
export const STANDARD_TAX_CLASS = 'standard';

export function normalizeTaxClass(value?: string | null): string {
	return value === '' || value === null || value === undefined ? STANDARD_TAX_CLASS : value;
}

export const INHERIT_TAX_CLASS = 'inherit';

export const NO_SHIPPING_TAX = null;

export function resolveInheritedShippingTaxClass(
	activeLineItems: readonly { tax_class?: string | null; taxable: boolean }[],
	taxClassSlugs: readonly string[]
): string | typeof NO_SHIPPING_TAX {
	const itemClasses = new Set(
		activeLineItems.filter((item) => item.taxable).map((item) => normalizeTaxClass(item.tax_class))
	);
	if (itemClasses.size === 0) {
		return activeLineItems.length === 0 ? STANDARD_TAX_CLASS : NO_SHIPPING_TAX;
	}
	if (itemClasses.has(STANDARD_TAX_CLASS)) return STANDARD_TAX_CLASS;
	if (itemClasses.size === 1) return [...itemClasses][0];
	const found = taxClassSlugs.find((slug) => itemClasses.has(normalizeTaxClass(slug)));
	if (found !== undefined) return normalizeTaxClass(found);
	if (taxClassSlugs.length === 0) return STANDARD_TAX_CLASS;
	return NO_SHIPPING_TAX;
}

export function taxClassFromWire(value?: string | null): string {
	return value === '' || value === null || value === undefined ? STANDARD_TAX_CLASS : value;
}

export function taxClassToWire(value?: string | null): string {
	return value === STANDARD_TAX_CLASS || value === null || value === undefined ? '' : value;
}
