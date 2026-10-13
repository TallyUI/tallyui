import { minorUnitDigits, woocommerceCoupons } from '@tallyui/core';
import type { LineItem } from '../order';

/** applyCoupon's refusal when the store cannot take coupons (ADR-077 R2, R3). */
export const COUPONS_UNSUPPORTED = "This store's plugin does not support coupons yet";
/** A WooCommerce coupon as the sale needs it: the engine's input and the connector's numeric id. */
export type SaleCoupon = woocommerceCoupons.CouponInput & { id: number };
/** Where the sale finds coupons (ADR-077 amendment 2); the app builds it over the till's coupons collection. */
export interface SaleCouponSource {
  /** The published coupon with this lower-case code, its usage already counting the till's own unsent orders; null when none. */
  find(code: string): Promise<SaleCoupon | null>;
  /** The WooCommerce category ids of each product asked for; a product it does not know is left out. */
  productCategories(productIds: readonly number[]): Promise<ReadonlyMap<number, readonly { id: number }[]>>;
}
/** The cashier-facing reason for a validator refusal. */
export function couponRefusal(code: string, rejection: woocommerceCoupons.CouponRejection): string {
  switch (rejection.code) {
    case 'already_applied': return `Coupon ${code} is already applied`;
    case 'expired': return `Coupon ${code} has expired`;
    case 'usage_limit_reached': return `Coupon ${code} has reached its usage limit`;
    case 'usage_limit_reached_for_customer': return `This customer has used coupon ${code} as often as it allows`;
    case 'minimum_spend_not_met': return `Coupon ${code} needs a spend of at least ${rejection.params?.amount}`;
    case 'maximum_spend_exceeded': return `Coupon ${code} allows a spend of at most ${rejection.params?.amount}`;
    case 'individual_use': return `Coupon ${code} cannot be used with other coupons`;
    case 'individual_use_conflict': return `Coupon ${rejection.params?.code} cannot be used with other coupons`;
    case 'email_required': return `Coupon ${code} needs a customer with an email address`;
    case 'email_not_allowed': return `This customer's email address cannot use coupon ${code}`;
    case 'not_applicable_to_cart': return `Coupon ${code} does not apply to anything in this sale`;
  }
}
/** The sale's product lines in the validator's shape (major units); custom lines count as product 0. */
export function couponLineItems(lines: readonly LineItem[], currency: string,
  categories: ReadonlyMap<number, readonly { id: number }[]>): woocommerceCoupons.CouponValidationContext['lineItems'] {
  const digits = minorUnitDigits(currency), factor = 10 ** digits;
  return lines.flatMap((line, lineIndex) => {
    if (line.unitPriceMinor < 0) return [];
    const id = Number(line.productId), product_id = !line.custom && Number.isSafeInteger(id) && id >= 0 ? id : 0;
    return [{ product_id, quantity: line.quantity, price: line.unitPriceMinor / factor,
      subtotal: (line.netMinor / factor).toFixed(digits), total: (line.netMinor / factor).toFixed(digits),
      categories: [...(categories.get(product_id) ?? [])], lineIndex,
      on_sale: line.regularUnitPriceMinor !== undefined && line.unitPriceMinor < line.regularUnitPriceMinor }];
  });
}
