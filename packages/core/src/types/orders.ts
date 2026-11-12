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

/** The filter fields a connector may support on listOrders. */
export type OrderFilterField =
  | 'status' | 'customerId' | 'cashierId' | 'registerId' | 'paymentMethod' | 'storeId' | 'createdVia' | 'dateRange';

/**
 * One page of order history, filtered on the server (#721). A connector maps each filter field its own way; a field the
 * connector does not list in `TallyConnector.orderFilters` is refused with `UnsupportedOrderFilterError`
 * (`assertOrderFiltersSupported`), never dropped.
 */
export interface ListOrdersQuery {
  /** 1-based; default 1. */
  page?: number;
  /** 1..100; default 25. */
  perPage?: number;
  /** The platform's own order search. */
  search?: string;
  /** The platform's own status word, as StoreOrder.status carries it. */
  status?: string;
  /** Store ids, as strings like every id in TallyUI. `'0'` is WooCommerce's guest. */
  customerId?: string;
  cashierId?: string;
  registerId?: string;
  /** A payment method or gateway id, as the platform records it. */
  paymentMethod?: string;
  /** The store (outlet) the order was rung at. */
  storeId?: string;
  /** Where the order was created, in the platform's own words (WooCommerce: `woocommerce-pos`, `checkout`, `admin`). */
  createdVia?: string;
  /** Created at or after `after` and before `before`: ISO 8601 instants in UTC with a `Z` (`2026-11-11T00:00:00.000Z`). Either end may be absent. */
  dateRange?: { after?: string; before?: string };
}

/** One page of an order list: its orders, whether more follow, and how many the whole query matches when the store says. */
export interface StoreOrderPage {
  orders: StoreOrder[];
  hasMore: boolean;
  /** Every order the query matches across all pages; undefined when the store gives no count. */
  total?: number;
}
