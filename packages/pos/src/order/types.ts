import type { Money, TaxRounding } from '@tallyui/core';

export interface Order {
  id: string;
  status: 'draft' | 'parked' | 'saved' | 'completed';
  lineItems: LineItem[];
  fees?: FeeLine[];
  shipping?: ShippingLine[];
  discounts: AppliedDiscount[];
  payments: Payment[];
  customer: CustomerSummary | null;
  note: string;
  currency: string;
  pricesIncludeTax: boolean;
  /** The store's tax rounding strategy the figures were computed with (#287), from the sale's tax context; absent is per_order. */
  taxRounding?: TaxRounding;
  // Settlement figures, sent in `order.create` (ADR-038, ADR-062). Show `display` instead (ADR-063).
  subtotalMinor: number;      // settlement: excl. tax, after line and order discounts (both pre-tax, ADR-062)
  discountMinor: number;      // settlement: Σ lineItems[].discountMinor, each in its line's own mode, so it mixes modes; not for display
  taxMinor: number;           // settlement: rounded once per order, unless taxRounding says otherwise (#287)
  totalMinor: number;         // settlement: what the customer pays
  display: DisplayTotals;
  paidMinor: number;
  balanceDueMinor: number;    // max(0, total − paid)
  changeDueMinor: number;     // max(0, paid − total)
  createdAt: string;
  updatedAt: string;
}

/** An Order as it was stored and sent, whose customer id may have been left out. */
export type SentOrder = Omit<Order, 'customer'> & { customer: (Omit<CustomerSummary, 'id'> & { id?: string }) | null };

/**
 * Figures for showing the cart or a receipt in the store's display mode (ADR-063); never sent to the server.
 * A parked order's saved draft may carry them; they are recomputed from the lines on resume, so never authoritative.
 */
export interface DisplayTotals {
  taxInclusive: boolean;      // = order.pricesIncludeTax
  subtotalMinor: number;      // product lines before discounts, excluding fees and shipping (ADR-075)
  discountMinor: number;      // Σ lines' discount rows + orderDiscountMinor, in the display mode; >= 0
  taxMinor: number;           // = order.taxMinor (added when exclusive, included when inclusive)
  totalMinor: number;         // = order.totalMinor
  lines: DisplayLine[];       // in lineItems order; Σ amountMinor = subtotalMinor
  fees?: Array<{ id: string; name: string; amountMinor: number }>;
  shipping?: Array<{ id: string; name: string; amountMinor: number }>;
  orderDiscountMinor: number; // the order discounts as one row, not allocated: Σ each line's share, converted on its own
}

/** One line in the display mode (ADR-063): before any discount, with its own discounts as sub-rows. */
export interface DisplayLine {
  lineId: string;
  amountMinor: number;        // quantity × unit price, or WooCommerce's line figure; a residue recipient may adjust it
  discounts: { discountId: string; label?: string; amountMinor: number }[]; // this line's own discounts, each converted on its own
}

export interface LineItem {
  id: string;
  taxClass?: string;
  /** WooCommerce's stored net at rounding precision, in integer micro-minor units, and its rounded gross. */
  netMicros?: string;
  totalMinor?: number;
  custom?: true;
  taxStatus?: 'none';
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
  netMinor: number;           // unitPriceMinor × quantity − discountMinor; under WooCommerce, the rounded exclusive net
  taxMicros: string;          // Σ taxLines[].taxMicros, decimal string of a bigint
  taxInclusive: boolean;      // the price's own tax mode; the order's when the price has none
  /** Set only when the price's tax mode differs from the order's; named price mode → order mode. */
  priceTaxModeConverted?: 'inclusive-to-exclusive' | 'exclusive-to-inclusive';
}

export interface ChargeLine {
  id: string;
  netMicros?: string;
  totalMinor?: number;
  name: string;
  amountMinor: number; // integer >= 0, in the order's tax mode (ADR-075)
  taxClass?: string;
  taxStatus: 'taxable' | 'none';
  taxLines: LineItem['taxLines'];
  netMinor: number;
  taxMicros: string;
}
export interface FeeLine extends ChargeLine {}
export interface ShippingLine extends ChargeLine { methodId?: string }
export interface ChargeInput { name: string; amountMinor: number; taxClass?: string; taxStatus?: 'taxable' | 'none' }

export interface LineTaxLine {
  code?: string;
  rateId?: number;
  compound?: boolean;
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
  custom?: true;
  taxStatus?: 'taxable' | 'none';
  variantId?: string;
  name: string;
  sku?: string;
  imageUrl?: string;
  unitPrice: Money & { taxInclusive?: boolean }; // currency must equal the order currency; taxInclusive wins over the order's pricesIncludeTax
  quantity?: number;          // default 1
  taxRates?: Array<{ code?: string; ratePpm: number }>; // default: [{ ratePpm: taxContext's rate for taxClass }]
  taxClass?: string;          // the product's tax class (ProductTraits.getTaxClass); ignored when taxRates is given
}
