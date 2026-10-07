import { minorUnitDigits, woocommerceCoupons } from '@tallyui/core';
import type { SaleDiscountCodes } from '../discount-codes';
import { couponLineItems, couponRefusal, type SaleCoupon, type SaleCouponSource } from './coupons';

/** WooCommerce coupons as the sale's discount codes (ADR-077): the source's coupons, checked by woocommerceCoupons.validateCoupon. */
export function createDiscountCodes(source: SaleCouponSource): SaleDiscountCodes<SaleCoupon> {
  return {
    supports: ({ rounding }) => rounding?.granularity === 'woocommerce',
    async find(code, sale) {
      if (sale.accepted.has(code)) return { refusal: couponRefusal(code, { code: 'already_applied' }) };
      const coupon = await source.find(code);
      return coupon === null ? { refusal: `Coupon ${code} does not exist` } : { found: coupon };
    },
    check(code, coupon, sale) {
      const snapshot = sale.order, customerId = snapshot.customer && Number(snapshot.customer.id);
      const validation = woocommerceCoupons.validateCoupon(coupon, {
        lineItems: couponLineItems(snapshot.lineItems, snapshot.currency, sale.categories), appliedCoupons: [...sale.accepted.keys()],
        appliedCouponsWithIndividualUse: [...sale.accepted].filter(([, value]) => value.individual_use).map(([key]) => key),
        cartSubtotal: snapshot.display.subtotalMinor / 10 ** minorUnitDigits(snapshot.currency),
        customerEmail: snapshot.customer?.email ?? '', customerId: Number.isSafeInteger(customerId) ? customerId : null, now: Date.now(),
      });
      return validation.valid ? null : couponRefusal(code, validation.rejection);
    },
    apply(builder, sale) {
      const context = { configs: woocommerceCoupons.toCouponConfigs([...sale.accepted.keys()], sale.accepted),
        couponIds: new Map([...sale.accepted].map(([code, coupon]) => [code, String(coupon.id)])),
        productCategories: sale.categories, calcDiscountsSequentially: sale.settings.calcDiscountsSequentially ?? false };
      builder.setCoupons([...sale.accepted.keys()], context);
    },
    async beforeResume(sale) {
      const ids = sale.order.lineItems.filter((line) => !line.custom).map((line) => Number(line.productId)).filter((id) => Number.isSafeInteger(id) && id >= 0);
      for (const [id, values] of await source.productCategories(ids)) if (values.length) sale.categories.set(id, [...values]);
    },
  };
}
