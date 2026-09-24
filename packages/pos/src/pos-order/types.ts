import type { CommandError, CommandServerRefs, CommandWarning, PaymentMethodKind } from '@tallyui/core';

export type PosOrderSyncStatus = 'pending' | 'applied' | 'rejected';

export interface PosOrderLine {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
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
  cashierRef?: string;
  syncStatus: PosOrderSyncStatus;
  commandId: string;
  serverRefs?: CommandServerRefs;
  warnings?: CommandWarning[];
  error?: CommandError;
  updatedAt: string;
}
