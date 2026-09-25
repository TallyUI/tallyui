import type { Money } from '@tallyui/core';

export interface Order {
  id: string;
  status: 'draft' | 'parked' | 'saved' | 'completed';
  lineItems: LineItem[];
  discounts: AppliedDiscount[];
  payments: Payment[];
  customer: CustomerSummary | null;
  note: string;
  currency: string;
  pricesIncludeTax: boolean;
  // Settlement figures, sent in `order.create` (ADR-038, ADR-062). Show `display` instead (ADR-063).
  subtotalMinor: number;      // settlement: excl. tax, after line and order discounts (both pre-tax, ADR-062)
  discountMinor: number;      // settlement: Σ lineItems[].discountMinor, each in its line's own mode, so it mixes modes; not for display
  taxMinor: number;           // settlement: rounded once per order
  totalMinor: number;         // settlement: what the customer pays
  display: DisplayTotals;
  paidMinor: number;
  balanceDueMinor: number;    // max(0, total − paid)
  changeDueMinor: number;     // max(0, paid − total)
  createdAt: string;
  updatedAt: string;
}

/**
 * Figures for showing the cart or a receipt in the store's display mode (ADR-063); never sent to the server.
 * A parked order's saved draft may carry them; they are recomputed from the lines on resume, so never authoritative.
 */
export interface DisplayTotals {
  taxInclusive: boolean;      // = order.pricesIncludeTax
  subtotalMinor: number;      // before discounts: excl. tax when exclusive, incl. tax when inclusive
  discountMinor: number;      // every discount, in the display mode; >= 0
  taxMinor: number;           // = order.taxMinor (added when exclusive, included when inclusive)
  totalMinor: number;         // = order.totalMinor
}

export interface LineItem {
  id: string;
  productId: string;
  variantId?: string;
  name: string;
  sku: string;
  imageUrl?: string;
  unitPriceMinor: number;     // as sold, integer
  quantity: number;           // integer >= 1
  taxLines: LineTaxLine[];    // stacked rates on the same net base (ADR-040)
  discounts: AppliedDiscount[];
  discountMinor: number;      // line discounts + orderDiscountMinor, in the line's own mode
  orderDiscountMinor: number; // this line's allocated share of the order discounts (ADR-062)
  netMinor: number;           // unitPriceMinor × quantity − discountMinor; the taxed base
  taxMicros: string;          // Σ taxLines[].taxMicros, decimal string of a bigint
  taxInclusive: boolean;      // the price's own tax mode; the order's when the price has none
  /** Set only when the price's tax mode differs from the order's; named price mode → order mode. */
  priceTaxModeConverted?: 'inclusive-to-exclusive' | 'exclusive-to-inclusive';
}

export interface LineTaxLine {
  code?: string;
  ratePpm: number;
  taxMicros: string;          // exact, decimal string of a bigint
}

export interface Discount {
  type: 'percentage' | 'fixed';
  value: number;              // percentage: percent (e.g. 10); fixed: integer minor units
  label?: string;
  couponCode?: string;
}

export interface AppliedDiscount extends Discount {
  id: string;
  amountMinor: number;        // an order discount: its own-mode amount, allocated across the lines
}

export interface Payment {
  id: string;
  method: string;
  // For cash, record the full amount tendered here, not the capped amount: `finalizeOrder`
  // caps it at the balance due and writes out `tenderedMinor`/`changeMinor` itself.
  amountMinor: number;
  tenderedMinor?: number;
  changeMinor?: number;
  reference?: string;
}

export interface CustomerSummary {
  id: string;
  name: string;
  email?: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  icon?: string;
  requiresReference?: boolean;
}

export interface AddLineInput {
  productId: string;
  variantId?: string;
  name: string;
  sku?: string;
  imageUrl?: string;
  unitPrice: Money & { taxInclusive?: boolean }; // currency must equal the order currency; taxInclusive wins over the order's pricesIncludeTax
  quantity?: number;          // default 1
  taxRates?: Array<{ code?: string; ratePpm: number }>; // default: [{ ratePpm: from taxContext }]
}
