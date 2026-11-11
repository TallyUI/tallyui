// WooCommerce tax parity (ADR-076): ported from WCPOS v2 cart-config-for-order.ts (`orderTaxLocation`), MIT, Copyright (c) 2021-2026 WCPOS.

/** WooCommerce's "Calculate tax based on" (`woocommerce_tax_based_on`). */
export type TaxBasedOn = 'base' | 'billing' | 'shipping';

/** The address WooCommerce matches tax rates against. */
export interface TaxAddress { country: string; state: string; city: string; postcode: string }

/** WooCommerce's per-order override meta key (WCPOS stamps the basis onto each order). */
export const TAX_BASED_ON_META_KEY = '_woocommerce_pos_tax_based_on';

function isTaxBasedOn(value: unknown): value is TaxBasedOn {
	return value === 'base' || value === 'billing' || value === 'shipping';
}

/** Any non-TaxBasedOn value (missing, '', 'foo') → 'base', as WooCommerce and v2 normalizeStorePayload do. */
export function normalizeTaxBasedOn(value: unknown): TaxBasedOn {
	return isTaxBasedOn(value) ? value : 'base';
}

type LooseAddress = { country?: unknown; state?: unknown; city?: unknown; postcode?: unknown };

export interface TaxLocationOrder {
	billing?: LooseAddress;
	shipping?: LooseAddress;
	/** The order's own basis (its TAX_BASED_ON_META_KEY value); wins over the store's when valid. */
	taxBasedOnOverride?: unknown;
}

export interface ResolvedTaxLocation { taxBasedOn: TaxBasedOn; location: TaxAddress; addressUsed: TaxBasedOn }

function hasCountry(address: LooseAddress | undefined): boolean {
	return typeof address?.country === 'string' && address.country.length > 0;
}

function text(value: unknown): string {
	return typeof value === 'string' ? value : '';
}

/**
 * WC_Abstract_Order::get_tax_location(), as v2 cart-config-for-order.ts:25-61. `shipping` falls back to
 * billing, then to the shop base; `billing` falls back to the shop base only. Without an order, the shop base.
 */
export function orderTaxLocation(base: TaxAddress, storeTaxBasedOn: unknown, order?: TaxLocationOrder): ResolvedTaxLocation {
	const override = order?.taxBasedOnOverride;
	const taxBasedOn = isTaxBasedOn(override) ? override : normalizeTaxBasedOn(storeTaxBasedOn);
	let addressUsed: TaxBasedOn = 'base';
	if (order && taxBasedOn !== 'base') {
		if (taxBasedOn !== 'billing' && hasCountry(order.shipping)) addressUsed = 'shipping';
		else if (hasCountry(order.billing)) addressUsed = 'billing';
	}
	const address = addressUsed === 'base' ? undefined : order?.[addressUsed];
	if (!address) return { taxBasedOn, location: base, addressUsed };
	return {
		taxBasedOn,
		addressUsed,
		location: { country: text(address.country), state: text(address.state), city: text(address.city), postcode: text(address.postcode) },
	};
}
