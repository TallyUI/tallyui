import type { PaymentMethodKind } from './commands';

/** A line of an order the store holds (ADR-081). Money in integer minor units of the order's currency, as the store
 * records it: every amount excludes tax, and the tax is beside it.
 * Each tax field is such that net + tax is the gross rounded once. */
export interface StoreOrderLine {
  /** The store's line id: what `OrderRefundLine.orderLineId` names. */
  id: string;
  /** The till's line id when a till created the line (its `clientLineId`); absent otherwise. */
  clientLineId?: string;
  productId?: string;
  /** The sellable the till's `variantId` names (a WooCommerce variation, or the product itself when simple). */
  variantId?: string;
  name: string;
  sku?: string;
  quantity: number;
  /** Before discounts, excluding tax. */
  subtotalMinor: number;
  subtotalTaxMinor: number;
  /** After discounts, excluding tax. */
  totalMinor: number;
  taxMinor: number;
}

/** A fee or shipping line: excluding tax, the tax beside it. A fee may be negative.
 * `taxMinor` is such that `totalMinor + taxMinor` is the gross rounded once. */
export interface StoreOrderCharge { name: string; totalMinor: number; taxMinor: number }

export interface StoreOrderPayment {
  /** The store's own method id, e.g. WooCommerce's `pos_cash`. */
  method: string;
  /** The store's name for it, e.g. "Cash". */
  title?: string;
  /** Set only when the method is one the till itself takes. */
  kind?: PaymentMethodKind;
  amountMinor: number;
}

/** A refund the store already recorded against the order. */
export interface StoreOrderRefund { id: string; /** Positive. */ amountMinor: number; reason?: string }

/** An order as the store holds it, read online (ADR-081); never stored by the till. */
export interface StoreOrder {
  /** The store's order id: what `OrderRefundPayload.orderId` and `CommandServerRefs.orderId` carry. */
  id: string;
  /** The number the store shows (`CommandServerRefs.displayId`). */
  reference: string;
  /** The till's `PosOrder.id` when a till created the order; absent otherwise. */
  clientOrderId?: string;
  /** The platform's own status word (WooCommerce: `completed`, `refunded`, …); the app labels it. */
  status: string;
  /** ISO 8601, UTC. */
  placedAt: string;
  currency: string;
  pricesIncludeTax: boolean;
  customer: { id?: string; name?: string; email?: string } | null;
  lines: StoreOrderLine[];
  fees: StoreOrderCharge[];
  shipping: StoreOrderCharge[];
  /** `discountMinor + discountTaxMinor` is the coupon's gross discount rounded once. */
  coupons: Array<{ code: string; discountMinor: number; discountTaxMinor: number }>;
  /** Tax by rate; `amountMinor` includes the rate's shipping tax. */
  taxLines: Array<{ label: string; code?: string; ratePpm: number; amountMinor: number }>;
  discountMinor: number;
  discountTaxMinor: number;
  taxMinor: number;
  totalMinor: number;
  payments: StoreOrderPayment[];
  refunds: StoreOrderRefund[];
}

export interface ListOrdersQuery {
  /** 1-based; default 1. */
  page?: number;
  /** 1..100; default 25. */
  perPage?: number;
  /** The platform's own order search. */
  search?: string;
}

export interface StoreOrderPage { orders: StoreOrder[]; hasMore: boolean }
