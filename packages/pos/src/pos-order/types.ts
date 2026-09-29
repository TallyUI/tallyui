import type { CommandError, CommandServerRefs, CommandWarning, PaymentMethodKind } from '@tallyui/core';
import type { DisplayTotals } from '../order/types';

export type PosOrderSyncStatus = 'pending' | 'applied' | 'rejected';

export type PosOrderLocalWarning = { code: 'customer_omitted'; field: 'email' | 'id' }
  | { code: 'payment_reference_dropped'; paymentId: string };
/** Server-answered failures of this order, persisted by job #32b. `since` is the outbox's stuck-clock
 * start in ms, excluding offline pauses; `reason` is the latest reason. */
export interface PosOrderServerFailures { count: number; since: number; reason: string }

export interface PosOrderLine {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  /** Line discounts plus the allocated order-discount share, in the line's own tax mode (ADR-062). */
  discountMinor: number;
  netMinor: number;
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
  createdAt: string;
  currency: string;
  pricesIncludeTax: boolean;
  lines: PosOrderLine[];
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
  /** Declared for the outbox's version fallback (ADR-065 amendment), which will set it after a server refuses a higher version (`unsupported_version`). Nothing writes it yet; absent means the content decides the version. */
  sentVersion?: 1 | 2 | 3;
  /** The version first tried, before the downgrade (the order's audit). */
  downgradedFrom?: 1 | 2 | 3;
  /** ADR-065: the receipt's display figures, in integer minor units of `currency` at `exponent`. */
  display?: DisplayTotals & { currency: string; exponent: number };
  /** ADR-065: tax by rate, named as `taxLinesByRate` names them (`amountMinor` is the tax). */
  taxByRate?: Array<{ ratePpm: number; code?: string; label?: string; netMinor: number; amountMinor: number; grossMinor: number }>;
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
