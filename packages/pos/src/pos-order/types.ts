import type { CommandError, CommandServerRefs, CommandWarning, OrderCreateLine, PaymentMethodKind, TaxRounding } from '@tallyui/core';
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
}

export interface PosOrderLine {
  id: string;
  productId: string;
  variantId?: string;
  custom?: OrderCreateLine['custom'];
  taxStatus?: 'taxable' | 'none';
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  /** The chosen variation attributes, name to value (pos_orders v9, #495). */
  attributes?: Record<string, string>;
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
  method: PaymentMethodKind;
  amountMinor: number;
  tenderedMinor?: number;
  changeMinor?: number;
  reference?: string;
}

export interface PosOrder {
  id: string;
  /** The sale order's id (the builder's), set by finalizeOrder (pos_orders v7, ADR-072): support traceability from a draft or preview to this stored order. Never sent, never printed. */
  saleId?: string;
  createdAt: string;
  currency: string;
  pricesIncludeTax: boolean;
  lines: PosOrderLine[];
  /** pos_orders v9, ADR-077 d2; present only on a sale with coupons */
  coupons?: PosOrderCoupon[];
  fees?: FeeLine[];
  shipping?: ShippingLine[];
  subtotalMinor: number;
  discountMinor: number;
  taxMinor: number;
  totalMinor: number;
  payments: PosOrderPayment[];
  customer: { id?: string; name?: string; email?: string } | null;
  note?: string;
  registerId?: string;
  /**
   * The register session the sale was taken in (ADR-032): its closure counts this order.
   * Sent at `order.create` version 3 as the payload's `sessionId` (the stamped or late session, one field).
   */
  sessionId?: string;
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
  sentVersion?: 1 | 2 | 3 | 4 | 5;
  /** The version first tried, before the downgrade (the order's audit). */
  downgradedFrom?: 1 | 2 | 3 | 4 | 5;
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
}
