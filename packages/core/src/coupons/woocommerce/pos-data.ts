// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
/** WooCommerce POS line metadata key (`POS_META_KEYS.posData` upstream). */
const POS_DATA_META_KEY = '_woocommerce_pos_data';

export type MetaData = { id?: number; key?: string; value?: unknown }[] | null | undefined;
type TaxStatus = 'taxable' | 'none';
type PosData = {
	price?: string | number;
	regular_price?: string | number;
	tax_status?: TaxStatus;
	tax_class?: string;
	amount?: string | number;
	percent?: boolean;
	prices_include_tax?: boolean;
	percent_of_cart_total_with_tax?: boolean;
	virtual?: boolean;
	downloadable?: boolean;
	categories?: { id: number; name: string; [key: string]: unknown }[];
	[key: string]: unknown;
};

const isPosData = (value: unknown): value is PosData =>
	typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Get tax class from fee line meta data
 */
export const getMetaDataValueByKey = (metaData: MetaData, key: string) => {
	if (!Array.isArray(metaData)) {
		return;
	}
	const meta = metaData.find((m) => m.key === key);
	return meta ? meta.value : undefined;
};

/**
 * Extract and parse POS metadata from the line item.
 * Structural parameter (meta_data only) so the engine's structural input
 * types (LineItemInput etc.) are accepted alongside DB document fragments.
 */
export const parsePosData = (item: { meta_data?: MetaData }) => {
	const value = getMetaDataValueByKey(item.meta_data, POS_DATA_META_KEY);
	if (!value) {
		return null;
	}
	if (isPosData(value)) {
		return value;
	}
	if (typeof value !== 'string') {
		return null;
	}
	try {
		const parsed: unknown = JSON.parse(value);
		return isPosData(parsed) ? parsed : null;
	} catch {
		return null;
	}
};

/**
 * Resolve a cart line's tax status.
 *
 * Product line items store their tax_status inside `_woocommerce_pos_data` meta
 * — the order schema has no top-level tax_status for line_items. Fee/shipping
 * lines may carry a top-level tax_status. We check top-level first, then
 * pos_data, defaulting to 'taxable' to match WooCommerce's
 * WC_Product::get_tax_status() (empty/invalid values are treated as taxable).
 */
export const getLineItemTaxStatus = (
	item: { tax_status?: string | null; meta_data?: MetaData } | null | undefined
): 'taxable' | 'none' | 'shipping' => {
	const isValid = (value: unknown): value is 'taxable' | 'none' | 'shipping' =>
		value === 'taxable' || value === 'none' || value === 'shipping';

	const topLevel = item?.tax_status;
	if (isValid(topLevel)) {
		return topLevel;
	}

	// Guard before calling parsePosData: meta_data must be an array for type safety.
	const posData = Array.isArray(item?.meta_data) ? parsePosData(item) : null;
	const fromPosData = posData?.tax_status;
	if (isValid(fromPosData)) {
		return fromPosData;
	}

	return 'taxable';
};
