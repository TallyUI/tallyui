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
  subtotalMinor: number;      // excl. tax, after line discounts
  discountMinor: number;      // line + order discounts
  taxMinor: number;           // rounded once per order
  totalMinor: number;         // what the customer pays
  paidMinor: number;
  balanceDueMinor: number;    // max(0, total − paid)
  changeDueMinor: number;     // max(0, paid − total)
  createdAt: string;
  updatedAt: string;
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
  discountMinor: number;
  netMinor: number;           // unitPriceMinor × quantity − discountMinor
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
  amountMinor: number;
}

export interface Payment {
  id: string;
  method: string;
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
