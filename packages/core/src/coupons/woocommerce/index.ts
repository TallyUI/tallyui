// Ported from @wcpos/order-math, MIT, Copyright (c) 2021-2026 WCPOS.
// WooCommerce coupon parity (ADR-077): keep the arithmetic as in the original; see docs/DECISIONS.md.
export { recalculateCoupons } from './recalculate';
export { calculateOrderTotals } from './order-totals';
export type { OrderTotals } from './order-totals';
export { validateCoupon } from './validate';
export { toCouponConfigs } from './to-coupon-configs';
export { enrichCategoriesWithAncestors } from './helpers';
export type { RecalculateInput, RecalculateResult } from './recalculate';
export type { CouponValidationContext, ValidationResult } from './validate';
export type { CouponDiscountConfig } from './discount';
export type {
	CouponInput, CouponContext, CouponLineInput, LineItemInput, TaxRateInput,
	CouponRejection, CouponRejectionCode, EngineWarning,
} from './types';
