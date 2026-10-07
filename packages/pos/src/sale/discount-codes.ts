import type { ServerCapabilities, StoreSettings, TaxRounding } from '@tallyui/core';
import type { Order, OrderBuilder } from '../order';

/** applyCoupon's refusal when the store cannot take coupons (ADR-077 R2, R3). */
export const COUPONS_UNSUPPORTED = "This store's plugin does not support coupons yet";

/** What a platform's discount codes see of the sale (ADR-077 amendment 3). */
export interface SaleDiscountState<Accepted> {
  /** The sale as it stands. */
  order: Order;
  /** The codes on the sale, in the order applied, each with what `find` gave for it. */
  accepted: ReadonlyMap<string, Accepted>;
  /** The categories the sale knows for each numeric product id; `beforeResume` may add to it. */
  categories: Map<number, { id: number }[]>;
  settings: Pick<StoreSettings, 'calcDiscountsSequentially'>;
}

/**
 * A platform's discount codes, as `useSale` takes them (ADR-077 amendment 3; Paul, 2026-10-07: each platform its own way).
 * The platform's side decides what a code is, which rules it must pass, how it reaches the order and how a refusal is worded;
 * `useSale` normalizes the code, keeps the accepted codes in order, and refuses a code whose sale changed during `find`.
 */
export interface SaleDiscountCodes<Accepted = unknown> {
  /** Whether this store can take codes in this tax context; `useSale` also requires `capabilities.coupons` and `orderCreate >= 6`. */
  supports(store: { capabilities?: ServerCapabilities; rounding?: TaxRounding }): boolean;
  /** Looks up a trimmed, lower-case code: what was found, or the refusal to show. */
  find(code: string, sale: SaleDiscountState<Accepted>): Promise<{ found: Accepted } | { refusal: string }>;
  /** Checks a found code against the sale; the refusal to show, or null when it may be applied. */
  check(code: string, found: Accepted, sale: SaleDiscountState<Accepted>): string | null;
  /** Puts `sale.accepted`'s codes, in order, on the builder; throws an Error whose message is the refusal. */
  apply(builder: OrderBuilder, sale: SaleDiscountState<Accepted>): void;
  /** Called once, before a parked sale's codes are looked up again by `resume()`. */
  beforeResume?(sale: SaleDiscountState<Accepted>): Promise<void>;
}
