// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce tax parity (ADR-076): keep the arithmetic as in the original; see docs/DECISIONS.md.
import type { CouponDiscountConfig } from './discount';
import type { CouponInput } from './types';

/**
 * Map `CouponInput`s (the adapter-prefetched coupon documents) to the replay's
 * `CouponDiscountConfig` shape, keyed by the given (lowercase) codes.
 *
 * The defaults (`amount || '0'`, `?? null`, `?? false`, array copies) live only
 * here and must not be duplicated by callers. The sale's discount-code step
 * (`@tallyui/pos` `sale/woocommerce/discount-codes.ts`) passes the accepted
 * coupons' own codes.
 *
 * Codes absent from the map are skipped; `recalculateCoupons` zeroes the
 * discount for any coupon line without a config.
 */
export function toCouponConfigs(
	codes: readonly string[],
	coupons: ReadonlyMap<string, CouponInput>
): Map<string, CouponDiscountConfig> {
	const couponConfigs = new Map<string, CouponDiscountConfig>();
	for (const code of codes) {
		const coupon = coupons.get(code);
		if (!coupon) continue;
		couponConfigs.set(code, {
			discount_type: coupon.discount_type,
			amount: coupon.amount || '0',
			limit_usage_to_x_items: coupon.limit_usage_to_x_items ?? null,
			product_ids: [...(coupon.product_ids ?? [])],
			excluded_product_ids: [...(coupon.excluded_product_ids ?? [])],
			product_categories: [...(coupon.product_categories ?? [])],
			excluded_product_categories: [...(coupon.excluded_product_categories ?? [])],
			exclude_sale_items: coupon.exclude_sale_items ?? false,
		});
	}
	return couponConfigs;
}
