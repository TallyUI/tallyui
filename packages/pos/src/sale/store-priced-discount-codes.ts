import { couponPricingBasis, type StorePricedCoupon } from '../order';
import { COUPONS_NEED_CONNECTION, type SaleDiscountCodes, type SaleDiscountState } from './discount-codes';

/** What one `price` call gave (TallyUI#710): the codes priced, in order, their amounts, and the order's couponPricingBasis before the call. */
export interface StorePricedCodePricing { codes: readonly string[]; priced: ReadonlyMap<string, StorePricedCoupon>; basis: string }
/** An accepted store-priced code: its own amounts, and the pricing of every code up to it. */
export interface StorePricedAccepted { coupon: StorePricedCoupon; pricing: StorePricedCodePricing }
export interface StorePricedDiscountCodesOptions {
  /** Defaults to every store; `useSale` still requires `capabilities.coupons` and `orderCreate >= 6`. */
  supports?: SaleDiscountCodes['supports'];
  /**
   * Prices `codes` (the accepted codes in order, then the new one) against `sale.order`'s lines and discounts:
   * the store's amount per line for every code, or the refusal to show. Rejects when the store cannot be reached.
   * The order's own coupon figures may be stale; price from the inputs couponPricingBasis lists, never from them.
   */
  price(codes: readonly string[], sale: SaleDiscountState<StorePricedAccepted>):
    Promise<{ priced: ReadonlyMap<string, StorePricedCoupon> } | { refusal: string }>;
}

// A basis couponPricingBasis' JSON never equals: the order shows stale until its codes are priced again.
const STALE_PRICING = '';

/**
 * Discount codes for a store that prices its own codes (TallyUI#710; Medusa promotions first): `price` asks the store,
 * and the till applies the store's amounts through setCoupons' store-priced context, never computing a coupon's value.
 */
export function createStorePricedDiscountCodes(options: StorePricedDiscountCodesOptions): SaleDiscountCodes<StorePricedAccepted> {
  return {
    supports: options.supports ?? (() => true),
    async find(code, sale) {
      if (sale.accepted.has(code)) return { refusal: `Coupon ${code} is already applied` };
      const basis = couponPricingBasis(sale.order), codes = [...sale.accepted.keys(), code];
      let result: Awaited<ReturnType<StorePricedDiscountCodesOptions['price']>>;
      try { result = await options.price(codes, sale); }
      catch { return { refusal: COUPONS_NEED_CONNECTION, transient: true }; }
      if ('refusal' in result) return result;
      const missing = codes.find((each) => !result.priced.has(each));
      if (missing !== undefined) return { refusal: `Coupon ${missing} was not priced by the store` };
      return { found: { coupon: result.priced.get(code)!, pricing: { codes, priced: new Map(result.priced), basis } } };
    },
    check: () => null, // the store accepted the code when it priced it
    apply(builder, sale) {
      const codes = [...sale.accepted.keys()];
      const pricing = [...sale.accepted.values()].at(-1)?.pricing;
      if (!pricing) return builder.setCoupons([], { kind: 'store-priced', priced: new Map(), basis: couponPricingBasis(sale.order) });
      const same = pricing.codes.length === codes.length && pricing.codes.every((each, k) => each === codes[k]);
      // After a removal the remaining codes were priced together with the removed one: kept, but stale until priced again.
      builder.setCoupons(codes, same ? { kind: 'store-priced', priced: pricing.priced, basis: pricing.basis }
        : { kind: 'store-priced', priced: new Map([...pricing.priced].filter(([each]) => codes.includes(each))), basis: STALE_PRICING });
    },
  };
}
