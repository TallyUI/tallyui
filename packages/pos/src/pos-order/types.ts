import type { CommandError, CommandServerRefs, CommandWarning, OrderAddress, OrderCreateLine, PaymentMethodKind, TaxRounding } from '@tallyui/core';
import type { DisplayTotals, FeeLine, ShippingLine } from '../order/types';

export type PosOrderSyncStatus = 'pending' | 'applied' | 'rejected';

export type PosOrderLocalWarning = { code: 'customer_omitted'; field: 'email' | 'id' }
  | { code: 'payment_reference_dropped'; paymentId: string };
/** The outbox's server-failure state for a pending order, kept so a restart restores it. */
export interface PosOrderServerFailures {
  /** The stuck clock's start in ms: the outbox's virtual start, which leaves out offline gaps. */
  since: number;
  /** The latest server-answered failure reason. */
  reason: string;
  /** The order failed when sent alone (as a probe or while isolated), so it is retried alone. */
  isolated: boolean;
}

/** A WooCommerce coupon on the stored order (ADR-077 d2): its figures are the order builder's coupon replay. */
export interface PosOrderCoupon {
  code: string; // lower-case code
  couponId: string; // the connector's coupon id, as a string
  discountMinor: number; // the coupon's discount, ex tax, in integer minor units
  discountTaxMinor: number; // its tax, in integer minor units
  carried?: true;
  /** Present only on a store-priced coupon (#790), in stored `lines` order, with no zero entries unless a carried amountMinor is non-zero;
   * absent on WooCommerce replay coupons and on every order stored before schema 13. */
  lines?: PosOrderCouponLine[];
}

export interface PosOrderCouponLine {
  lineId: string; // the stored line's id
  discountMinor: number; // tax-exclusive, integer minor units
  discountTaxMinor: number; // integer minor units
  amountMinor?: number;
}

export interface PosOrderLine {
  id: string;
  /** The store's id of a kept line (ADR-090); absent on a line added at the till. */
  storeLineId?: string;
  productId: string;
  variantId?: string;
  custom?: OrderCreateLine['custom'];
  taxStatus?: 'taxable' | 'none';
  name: string;
  sku: string;
  /** The SKU the line was added with, recorded only when the cashier edits the line's `sku` (pos_orders v18, ADR-092); absent means `sku` is the catalogue's. */
  catalogueSku?: string;
  quantity: number;
  unitPriceMinor: number;
  /** The chosen variation attributes, name to value (pos_orders v9, #495). */
  attributes?: Record<string, string>;
  /** The names in attributes the cashier picked for the variant's "Any" option groups (#495); absent when none. */
  anyAttributes?: string[];
  /** The catalogue's regular unit price, in the line's own tax mode like `unitPriceMinor` (pos_orders v9, ADR-077 d2). */
  regularUnitPriceMinor?: number;
  /** Line discounts plus the allocated order-discount share, in the line's own tax mode (ADR-062). */
  discountMinor: number;
  netMinor: number;
  netMicros?: string;
  taxLines: Array<{ code?: string; ratePpm: number; taxMicros: string }>;
  /** This line's own tax mode; set only when it was converted from the store's (ADR-038 amendment). */
  taxInclusive?: boolean;
}

export interface PosOrderPayment {
  id: string;
  /** The store's id of a payment already on the order (ADR-090): a captured leg, never re-taken. Sent as `order.update`'s `paymentId`. */
  storePaymentId?: string;
  method: PaymentMethodKind;
  /** The payment method's own id on the platform, kept for labels and takings (`legMethodId`); `method` decides cash. */
  methodId?: string;
  amountMinor: number;
  tenderedMinor?: number;
  changeMinor?: number;
  reference?: string;
  /** When the till recorded the leg (`Payment.takenAt`); absent on store-held and older legs. */
  takenAt?: string;
}

export interface PosOrder {
  id: string;
  /** The sale order's id (the builder's), set by finalizeOrder (pos_orders v7, ADR-072): support traceability from a draft or preview to this stored order. Never sent, never printed. */
  saleId?: string;
  /** The store order this sale reopened (ADR-090); the outbox sends such a row as `order.update`, never `order.create`. */
  storeOrderId?: string;
  /** The store's revision of that order as the reopen left it (ADR-090). */
  baseRevision?: string;
  createdAt: string;
  currency: string;
  pricesIncludeTax: boolean;
  lines: PosOrderLine[];
  /** pos_orders v9, ADR-077 d2; present only on a sale with coupons */
  coupons?: PosOrderCoupon[];
  fees?: Array<FeeLine & {
    /** The store's id of a kept fee or shipping line, in the same id space as lines (ADR-090). */
    storeLineId?: string;
  }>;
  shipping?: Array<ShippingLine & {
    /** The store's id of a kept fee or shipping line, in the same id space as lines (ADR-090). */
    storeLineId?: string;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  /** What the store owes back on a reopened sale whose locked payments exceed its new total, in minor units (pos_orders v15, ADR-090). `finalizeOrder` writes it on every reopened sale, 0 when nothing is due; absent on a till sale. */
  refundDueMinor?: number;
  payments: PosOrderPayment[];
  /** `billing` and `shipping` (#722) are frozen copies of the customer's addresses, stored only with `taxAddress`. */
  customer: { id?: string; name?: string; email?: string; billing?: OrderAddress; shipping?: OrderAddress;
    /** The sale's tax ids (pos_orders v18, ADR-092), sent at order.create 12; `label` is kept on the till and is not sent. */
    taxIds?: Array<{ type: string; value: string; country?: string; label?: string }> } | null;
  /** The customer address the sale was taxed on (#722), sent as order.create 8's `taxAddress`; absent: the store's base. */
  taxAddress?: 'billing' | 'shipping';
  /** The sale's note; sent as order.create version 7's `note` (ADR-083), cut to ORDER_NOTE_MAX when frozen. */
  note?: string;
  /** The order's custom fields (pos_orders v18, ADR-092), sent at order.create 12 in this order. */
  meta?: Array<{ key: string; value: string }>;
  registerId?: string;
  /**
   * The register session the sale was taken in (ADR-032): its closure counts this order.
   * Sent at `order.create` version 3 as the payload's `sessionId` (the stamped or late session, one field).
   */
  sessionId?: string;
  /** The closed session whose closure already counted this sale: set by finalize on an after-close reopen (ADR-077), which then joins no session. */
  countedInClosureOf?: string;
  /**
   * Set only by `useSale`'s late-sale path (ADR-032): the session the sale was taken for, which
   * refused the stamp after the money was taken. Such an order has no `sessionId`, so no closure
   * counts it. Sent at `order.create` version 3 as the payload's `sessionId` (the stamped or late session, one field).
   */
  lateSessionId?: string;
  /**
   * The order.create version every attempt under this `commandId` goes out at: the outbox records it before the first
   * send, and lowers it only on a downgrade (ADR-065 amendment). Absent means not sent yet (or requeued).
   */
  sentVersion?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  /** The version first tried, before the downgrade (the order's audit). */
  downgradedFrom?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  /** ADR-065: the receipt's display figures, in integer minor units of `currency` at `exponent`. */
  display?: DisplayTotals & { currency: string; exponent: number };
  /** ADR-065: tax by rate, named as `taxLinesByRate` names them (`amountMinor` is the tax). */
  taxByRate?: Array<{ ratePpm: number; code?: string; label?: string; netMinor: number; amountMinor: number; grossMinor: number }>;
  /**
   * The tax rounding the figures were computed with (#287), frozen at finalize; the till's own record, never sent.
   * Version 6's migration sets the default on every older row.
   */
  taxRounding: TaxRounding;
  cashierRef?: string;
  syncStatus: PosOrderSyncStatus;
  commandId: string;
  serverRefs?: CommandServerRefs;
  warnings?: CommandWarning[];
  localWarnings?: PosOrderLocalWarning[];
  serverFailures?: PosOrderServerFailures;
  error?: CommandError;
  updatedAt: string;
  /** When the till reopened this refused order as a parked sale (ADR-077 d4b). Needs attention keeps it until its finalized successor is in the list (`replacedOrderIds`), and it stays as the record of the refusal. */
  reopenedAt?: string;
  /** The commandId whose refusal the cashier marked handled (tally-woo 03, ADR-092 6f); the logic comes in a later PR. */
  attentionHandledFor?: string;
}
