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
  /** The line's total after discounts, excluding tax, as sold, before any return; set by a connector whose live totals shrink on return (connector-medusa at plugin contract 7), absent otherwise. */
  soldTotalMinor?: number;
  /** The tax beside `soldTotalMinor`, as sold. Present exactly when it is. */
  soldTaxMinor?: number;
  /** The store's returned quantity for the line (requested, received or dismissed returns); absent when the store does not say. Refund pricing does not read it. */
  returnedQuantity?: number;
}

/** A fee or shipping line: excluding tax, the tax beside it. A fee may be negative.
 * `taxMinor` is such that `totalMinor + taxMinor` is the gross rounded once. */
export interface StoreOrderCharge {
  /** The store's order-item id, which `OrderUpdateFee.storeLineId` / `OrderUpdateShipping.storeLineId` names; absent when the store gives none. */
  id?: string;
  name: string;
  totalMinor: number;
  taxMinor: number;
  /** The tax status the store recorded on the fee or shipping line; absent when the store's response carries none. */
  taxStatus?: 'taxable' | 'none';
  /** A fee's recorded tax class; absent means the standard class. Shipping lines carry none. */
  taxClass?: string;
  /** A shipping line's recorded method id. */
  methodId?: string;
}

export interface StoreOrderPayment {
  /** The store's payment record id, which `OrderUpdatePayment.paymentId` names; absent when the store keeps no per-payment record. */
  id?: string;
  /** The store's own method id, e.g. WooCommerce's `pos_cash`. */
  method: string;
  /** The store's name for it, e.g. "Cash". */
  title?: string;
  /** Set only when the method is one the till itself takes. */
  kind?: PaymentMethodKind;
  amountMinor: number;
}

/** One order line a store refund paid back (#1324). Integers; `netMinor + taxMinor` is the line's gross refund. Shipping and adjustments are never lines. */
export interface StoreOrderRefundLine { /** A `StoreOrderLine.id` of the same order. */ orderLineId: string; /** > 0. */ quantity: number; netMinor: number; taxMinor: number }

/** A refund the store already recorded against the order. */
export interface StoreOrderRefund {
  id: string; /** Positive. */ amountMinor: number; reason?: string;
  /** The lines this refund paid back, when the store records them; absent when it cannot say (#1324). A line is on the store refund that paid it back and never repeated on another: a till refund split over tenders is one store refund. When an order's refunds together name more of a line than was ordered, none of them carry lines. */
  lines?: StoreOrderRefundLine[];
}

/** An order as the store holds it, read online (ADR-081); never stored by the till. */
export interface StoreOrder {
  /** The store's order id: what `OrderRefundPayload.orderId` and `CommandServerRefs.orderId` carry. */
  id: string;
  /** The number the store shows (`CommandServerRefs.displayId`). */
  reference: string;
  /** The till's `PosOrder.id` when a till created the order; absent otherwise. It is also what an `order.reopen` sends as `clientOrderId`. */
  clientOrderId?: string;
  /** The cashier the store records for the order, as `ListOrdersQuery.cashierId` filters it (WooCommerce: the WordPress user id in `_pos_user`); absent when the store records none. */
  cashierId?: string;
  /** The store (outlet) the order was rung at, as `ListOrdersQuery.storeId` filters it (WooCommerce: `_pos_store`); absent when the store records none, as a single-store install does. */
  storeId?: string;
  /**
   * The register the store itself records for the order, as `ListOrdersQuery.registerId` filters it (WooCommerce: `_wcpos_register`,
   * which only WCPOS writes). It is neither the till's drawer nor its device id, and it is absent on every order TallyUI rings (ADR-090 decision 6).
   */
  registerId?: string;
  /** The store's current revision of the order, which `OrderReopenPayload.baseRevision` and `OrderUpdatePayload.baseRevision` carry; absent when the store has none. */
  revision?: string;
  /** The platform's own status word (WooCommerce: `completed`, `refunded`, …); the app labels it. */
  status: string;
  /** ISO 8601, UTC. */
  placedAt: string;
  /** When the store recorded the order as paid (WooCommerce: `date_paid_gmt`); absent while unpaid, or when the store records none. ISO 8601, UTC. */
  paidAt?: string;
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
  /** The store keeps a per-payment record for this order in a shape the connector cannot read
   * (WooCommerce: a WCPOS payment ledger of another schema); `payments` is then the order's paid-state
   * fallback, and a reopen must refuse the order. Absent otherwise. */
  paymentRecordUnreadable?: true;
  /** The store says the order still owes money (WooCommerce: `needs_payment`); absent when the store does not say. */
  needsPayment?: boolean;
  /** Where the order was created, in the platform's own words, as `ListOrdersQuery.createdVia` filters it (WooCommerce: `woocommerce-pos`, `checkout`, `admin`); absent when the store records none. */
  createdVia?: string;
  refunds: StoreOrderRefund[];
}

/** The filter fields a connector may support on listOrders. */
export type OrderFilterField =
  | 'status' | 'customerId' | 'cashierId' | 'registerId' | 'paymentMethod' | 'storeId' | 'createdVia' | 'dateRange' | 'modifiedAfter';

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
  /**
   * Changed at or after this instant: ISO 8601 UTC with a `Z`, as `dateRange` takes. It widens a read to orders created
   * earlier and changed since, such as one paid in a report's range (WooCommerce: `modified_after`).
   */
  modifiedAfter?: string;
}

/** One page of an order list: its orders, whether more follow, and how many the whole query matches when the store says. */
export interface StoreOrderPage {
  orders: StoreOrder[];
  hasMore: boolean;
  /** Orders on this page the connector could not read and left out; absent when every order read. */
  unreadable?: number;
  /** Every order the query matches across all pages; undefined when the store gives no count. It still counts orders left out as `unreadable`. */
  total?: number;
}

/** A refund the store recorded, dated by when it was made (ADR-081 decision 7). */
export interface StoreRefund {
  id: string;
  /** The refunded order's `StoreOrder.id`. */
  orderId: string;
  /** When the refund was made: ISO 8601, UTC, with a `Z`. */
  refundedAt: string;
  /** The refunded order's currency. A store's refund row carries none, so the connector reads it from the order. */
  currency: string;
  /** Zero or more. Gross: the refunded total, tax included (WooCommerce: the refund's `amount`). It comes off a tax-inclusive sales figure only, never a net-of-tax one. */
  amountMinor: number;
  reason?: string;
}

/** A refund whose order the store did not return: no currency, so no amount. Never counted, never dropped. */
export interface StoreRefundOrphan { id: string; orderId: string; refundedAt: string }

export interface ListRefundsQuery {
  /** 1-based; default 1. */
  page?: number;
  /** 1..100; default 25. */
  perPage?: number;
  /** Made at or after `after` and before `before`: ISO 8601 instants in UTC with a `Z`. Selects by when the refund was made, not when its order was placed. Either end may be absent. */
  dateRange?: { after?: string; before?: string };
  /** Only the refunds of this order (`StoreOrder.id`). */
  orderId?: string;
}

/** One page of refunds, newest first. */
export interface StoreRefundPage {
  refunds: StoreRefund[];
  /** Refunds on this page whose order the store did not return. */
  orphans: StoreRefundOrphan[];
  hasMore: boolean;
  /** Rows on this page the connector could not read and left out; absent when every row read. */
  unreadable?: number;
  /** Every refund the query matches across all pages, orphans and unreadable rows included; undefined when the store gives no count. */
  total?: number;
}
