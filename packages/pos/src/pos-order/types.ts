import type { CommandError, CommandServerRefs, CommandWarning, PaymentMethodKind } from '@tallyui/core';
import type { DisplayTotals } from '../order/types';

export type PosOrderSyncStatus = 'pending' | 'applied' | 'rejected';

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
   * Local only: `toOrderCreateEnvelope` never sends it.
   */
  sessionId?: string;
  /**
   * Set only by `useSale`'s late-sale path (ADR-032): the session the sale was taken for, which
   * refused the stamp after the money was taken. Such an order has no `sessionId`, so no closure
   * counts it. Local only: `toOrderCreateEnvelope` never sends it.
   */
  lateSessionId?: string;
  /** ADR-065: the receipt's display figures, in integer minor units of `currency` at `exponent`. Not written yet. */
  display?: DisplayTotals & { currency: string; exponent: number };
  /** ADR-065: tax by rate, named as `taxLinesByRate` names them (`amountMinor` is the tax). Not written yet. */
  taxByRate?: Array<{ ratePpm: number; code?: string; label?: string; netMinor: number; amountMinor: number; grossMinor: number }>;
  cashierRef?: string;
  syncStatus: PosOrderSyncStatus;
  commandId: string;
  serverRefs?: CommandServerRefs;
  warnings?: CommandWarning[];
  error?: CommandError;
  updatedAt: string;
}
