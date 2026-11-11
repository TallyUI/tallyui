// WCPOS v2 receipt-data vocabulary (wcpos/monorepo 85ecbd43f, MIT), as typed for TallyUI.
// The canonical shape is v2's `mapReceiptData(buildReceiptData(...))`; snake_case keys are WCPOS's template tags.

/** A tax registration number (VAT ID, ABN, ...). `type` is WCPOS's id such as `eu_vat` or `de_ust_id`. */
export interface WcposTaxId { type: string; value: string; country?: string; label?: string }

/** One tax rate's share of an item, in minor units. `rateId` matches a `taxLines` entry. */
export interface WcposItemTaxSource { rateId: number | string; totalMinor: number }

/** A sale line. Amounts are integer minor units, excluding tax unless named `*TaxMinor`. */
export interface WcposLineSource {
  name: string;
  sku?: string;
  /** Negative on a refund line. */
  quantity: number;
  /** Line total before discount, and its tax. */
  subtotalMinor: number;
  subtotalTaxMinor: number;
  /** Line total after discount, and its tax. */
  totalMinor: number;
  totalTaxMinor: number;
  /** Keys starting `_` are hidden; `displayKey`/`displayValue` win when given. */
  meta?: Array<{ key: string; value: unknown; displayKey?: string; displayValue?: unknown }>;
  /** The price the POS recorded per unit, in the sale's price basis (`pricesIncludeTax`). */
  recordedPrice?: { priceMinor: number; regularPriceMinor: number; taxStatus?: 'taxable' | 'none' };
  taxes?: WcposItemTaxSource[];
}

/**
 * A platform-neutral description of a sale, in integer minor units of `currency`.
 * It mirrors the WooCommerce order fields WCPOS v2 reads, without the WooCommerce wire format.
 */
export interface WcposReceiptSource {
  /** `Number(id)`, or 0 when that is not a number. */
  id: number | string;
  number: string;
  currency: string;
  /** WooCommerce-style status slug: `completed`, `pending`, `on-hold`, ... */
  status: string;
  /** ISO stamp; becomes `order.created.datetime` as given. */
  createdAt: string;
  customerNote: string;
  paymentUrl?: string;
  /** The basis the sale was rung up on. It wins over the store's setting for recorded prices. */
  pricesIncludeTax: boolean;
  customer: {
    id?: number | string; firstName?: string; lastName?: string; email?: string; phone?: string;
    taxIds?: WcposTaxId[];
  } | null;
  lines: WcposLineSource[];
  fees: Array<{ name: string; totalMinor: number; totalTaxMinor: number; taxes?: WcposItemTaxSource[] }>;
  shipping: Array<{
    methodTitle: string; methodId?: string; totalMinor: number; totalTaxMinor: number; taxes?: WcposItemTaxSource[];
  }>;
  /** `quickDiscountPercent`: absent for a coupon, null for a fixed quick discount, else the percentage. */
  coupons: Array<{ code: string; discountMinor: number; discountTaxMinor: number; quickDiscountPercent?: number | null }>;
  taxLines: Array<{
    rateId: number | string; label?: string; rateCode?: string; ratePercent?: number; compound?: boolean;
    taxTotalMinor: number; shippingTaxTotalMinor: number;
  }>;
  totalMinor: number;
  totalTaxMinor: number;
  /** The order's own discount total (excl.) and its tax; the line sums are used when absent. */
  discountTotalMinor?: number;
  discountTaxMinor?: number;
  payments: Array<{
    methodId: string; methodTitle: string; amountMinor: number; transactionId?: string;
    tenderedMinor?: number; changeMinor?: number;
  }>;
  changeMinor?: number;
  /** The register the sale was rung up on. */
  registerId?: string;
  /** The fiscal sale stamp, its IANA zone and the sale counter. */
  saleTime?: { at: string; tz?: string; counter?: number };
}

/** The WCPOS store settings the receipt reads. */
export interface WcposReceiptStore {
  name: string;
  logo?: string;
  /** Address, address 2, city, "state postcode", country, in that order. */
  addressParts?: string[];
  phone?: string;
  email?: string;
  taxIds?: WcposTaxId[];
  /** `wc_price_decimals`; kept only when a non-negative integer. */
  priceDecimals?: number;
  taxDisplayCart: 'incl' | 'excl';
  /** `'single'` or `'itemized'`; anything else gives `'itemized'`. */
  taxTotalDisplay?: string;
  calcTaxes: boolean;
  /** The store setting; feeds `presentation_hints.prices_entered_with_tax`. */
  pricesIncludeTax: boolean;
  /** `en_US` or `en-US`. */
  locale?: string;
  /** IANA zone for `order.printed` and `fiscal.sale_time`. */
  timezone?: string;
  /** The decimal separator for a quick-discount percentage. Default `.`. */
  priceDecimalSep?: string;
  receiptI18n?: Record<string, unknown>;
}

/** App context the order does not carry. */
export interface WcposReceiptOptions {
  register?: { id: string; name: string };
  cashier?: { id: number; name: string };
  pluginVersion?: string;
  appVersion?: string;
  appBuild?: string;
  /** How many times this receipt has printed, this print included. */
  printCount?: number;
  /** A translated label for a status slug. Returning the slug means "unknown". */
  statusLabel?: (slug: string) => string;
  /** Wins over `store.receiptI18n`. */
  receiptI18n?: Record<string, unknown>;
  /** Clock for `order.printed`. Default `() => new Date()`. */
  now?: () => Date;
}

/** WCPOS's date block. Only the server fills every key; a local receipt sets `datetime` and leaves the rest ''. */
export interface WcposReceiptDate {
  datetime: string; date: string; time: string;
  datetime_short: string; datetime_long: string; datetime_full: string;
  date_short: string; date_long: string; date_full: string;
  date_ymd: string; date_dmy: string; date_mdy: string;
  weekday_short: string; weekday_long: string;
  day: string; month: string; month_short: string; month_long: string; year: string;
}

/** `x`, `x_incl` and `x_excl`: the display-side value and both bases. */
export type WcposTri<K extends string> = K | `${K}_incl` | `${K}_excl`;
type Amounts<K extends string, V = number> = { [P in WcposTri<K>]: V };

/** One tax rate on an item. `rate` is the percentage, or null when unknown. */
export interface WcposItemTax { code: string; rate: number | null; label?: string; compound?: boolean; amount: number }

/**
 * A sale line, in major units. `unit_price*` is the unit before discount.
 * Recorded-price and savings fields are null when unknown, never 0.
 */
export interface WcposReceiptLine extends
  Amounts<'unit_price'>, Amounts<'line_subtotal'>, Amounts<'discounts'>, Amounts<'line_total'>,
  Amounts<'regular_price', number | null>, Amounts<'selling_price', number | null>,
  Amounts<'unit_savings', number | null>, Amounts<'line_regular_total', number | null>,
  Amounts<'line_selling_total', number | null>, Amounts<'line_savings', number | null> {
  key: string;
  name: string;
  sku: string;
  qty: number;
  /** True when the line's discount already contains the sale saving. */
  savings_in_discounts: boolean;
  meta: Array<{ key: string; value: string }>;
  taxes: WcposItemTax[];
  /** Server payload only. */
  unit_subtotal?: number; unit_subtotal_incl?: number; unit_subtotal_excl?: number;
  qty_refunded?: number; total_refunded?: number;
}

/** A fee, a shipping row or a discount. Discount amounts are positive magnitudes. */
export interface WcposReceiptAdjustment extends Amounts<'total'> {
  label: string;
  meta?: Array<{ key: string; value: string }>;
  taxes?: WcposItemTax[];
}
export interface WcposReceiptShipping extends WcposReceiptAdjustment { method_id?: string }
export interface WcposReceiptDiscount extends WcposReceiptAdjustment { code?: string; codes?: string }

export interface WcposReceiptTotals extends
  Amounts<'subtotal'>, Amounts<'discount_total'>, Amounts<'total'>,
  Amounts<'sale_savings_total', number | null>, Amounts<'total_saved', number | null> {
  /** True when the savings are known for the display side. */
  total_saved_complete: boolean;
  tax_total: number;
  paid_total: number;
  change_total: number;
  refund_total?: number;
  net_total?: number;
  total_qty?: number;
  line_count?: number;
}

/** Section guards for the tax display. */
export interface WcposReceiptTax {
  display: 'incl' | 'excl';
  breakdown: 'hidden' | 'single' | 'itemized';
  display_incl: boolean;
  display_excl: boolean;
  breakdown_hidden: boolean;
  breakdown_single: boolean;
  breakdown_itemized: boolean;
}

/** One row per tax rate. `taxable_amount_*` is null when no item carries the rate. */
export interface WcposTaxSummaryRow {
  code: string;
  rate: number | null;
  label: string;
  compound?: boolean;
  tax_amount: number;
  taxable_amount_excl: number | null;
  taxable_amount_incl: number | null;
}

export interface WcposReceiptPayment {
  method_id: string;
  method_title: string;
  amount: number;
  transaction_id: string;
  tendered?: number;
  change?: number;
}

/** A refund line inside a refund. Amounts are positive. */
export interface WcposRefundLine {
  name: string; sku?: string; qty: number; total: number; line_total?: number;
  total_incl?: number; total_excl?: number; line_total_incl?: number; line_total_excl?: number;
  unit_total?: number; unit_total_incl?: number; unit_total_excl?: number;
  taxes?: WcposItemTax[];
}
export interface WcposRefundAdjustment {
  label: string; total: number; total_incl?: number; total_excl?: number; method_id?: string; taxes?: WcposItemTax[];
}

/** A refund against the order. Never produced by `wcposReceiptData`; every amount is positive. */
export interface WcposReceiptRefund {
  id: number;
  amount: number;
  subtotal?: number; tax_total?: number; shipping_total?: number; shipping_tax?: number;
  reason?: string; refunded_by_id?: number; refunded_by_name?: string; refunded_payment?: boolean;
  destination?: string; gateway_id?: string; gateway_title?: string; processing_mode?: string;
  date?: WcposReceiptDate;
  lines?: WcposRefundLine[];
  fees?: WcposRefundAdjustment[];
  shipping?: WcposRefundAdjustment[];
}

export interface WcposReceiptFiscal {
  document_type: 'sale' | 'refund' | 'void' | 'cancellation';
  sale_time: WcposReceiptDate | null;
  sale_tz: string;
  sale_counter: number | null;
  received_at: WcposReceiptDate | null;
  corrects: string;
  is_reprint: boolean;
  reprint_count: number;
  is_refund_document: boolean;
  immutable_id?: string;
}

export interface WcposReceiptPresentationHints {
  display_tax: 'incl' | 'excl' | 'hidden' | 'itemized' | 'single';
  prices_entered_with_tax: boolean;
  rounding_mode: string;
  /** BCP 47, `en-US`. */
  locale: string;
  order_barcode_type: 'qrcode' | 'code128' | 'ean13' | 'ean8' | 'upca';
}

/** WCPOS's canonical receipt data: money as numbers in major units, every always-set key present. */
export interface WcposReceiptData {
  store: {
    id: number; name: string; logo: string; price_decimals?: number;
    address_lines: string[]; phone: string; email: string; tax_ids?: WcposTaxId[];
  };
  order: {
    id: number; number: string; currency: string; customer_note: string;
    /** The raw status slug. */
    wc_status: string;
    status_label: string;
    needs_payment: boolean;
    payment_url: string;
    created_via?: string;
    created: WcposReceiptDate; paid: WcposReceiptDate; completed: WcposReceiptDate; printed: WcposReceiptDate;
  };
  /** `{ id: 0, name: '' }` when unknown. */
  cashier: { id: number; name: string };
  customer: {
    /** null for a guest. */
    id: number | null;
    name: string; first_name: string; email: string; phone: string;
    tax_ids?: WcposTaxId[];
    /** Server payload only; never set by `wcposReceiptData`. */
    billing_address?: Record<string, string>;
    shipping_address?: Record<string, string>;
  };
  lines: WcposReceiptLine[];
  fees: WcposReceiptAdjustment[];
  shipping: WcposReceiptShipping[];
  discounts: WcposReceiptDiscount[];
  totals: WcposReceiptTotals;
  tax: WcposReceiptTax;
  tax_summary: WcposTaxSummaryRow[];
  /** Rows exist and the breakdown is not hidden. */
  has_tax_summary: boolean;
  /** Empty while the order still needs payment. */
  payments: WcposReceiptPayment[];
  refunds?: WcposReceiptRefund[];
  fiscal: WcposReceiptFiscal;
  software: { name: string; plugin_version: string; app_version: string; app_build: string };
  register: { id: string; name: string };
  presentation_hints: WcposReceiptPresentationHints;
  /** The store's label overrides; absent when none are set. */
  i18n?: Record<string, string>;
}

// The template view: the canonical data plus `*_display` money strings.
type Displays<K extends string> = { [P in K as `${P}_display`]: string };
type MaybeDisplays<K extends string> = { [P in K as `${P}_display`]?: string };

/** Savings twins are '' for 0; nullable twins are absent for null. */
export type WcposLineView = WcposReceiptLine
  & Displays<WcposTri<'unit_price' | 'line_subtotal' | 'discounts' | 'line_total'>>
  & MaybeDisplays<WcposTri<'regular_price' | 'selling_price' | 'unit_savings' | 'line_regular_total'
    | 'line_selling_total' | 'line_savings'>>
  & { taxes: WcposItemTaxView[] };
export type WcposItemTaxView = WcposItemTax & { amount_display: string };
export type WcposAdjustmentView<T extends WcposReceiptAdjustment = WcposReceiptAdjustment> = T
  & Displays<WcposTri<'total'>> & { taxes?: WcposItemTaxView[] };
export type WcposTotalsView = WcposReceiptTotals
  & Displays<WcposTri<'subtotal' | 'discount_total' | 'total'> | 'tax_total' | 'paid_total' | 'change_total'>
  & MaybeDisplays<WcposTri<'sale_savings_total' | 'total_saved'> | 'refund_total' | 'net_total'>;
/** `taxable_amount_*_display` is '' when the amount is null. */
export type WcposTaxSummaryView = WcposTaxSummaryRow
  & Displays<'tax_amount' | 'taxable_amount_excl' | 'taxable_amount_incl'>;
export type WcposPaymentView = WcposReceiptPayment & Displays<'amount'> & MaybeDisplays<'tendered' | 'change'>;
export type WcposRefundLineView = WcposRefundLine & { line_total: number }
  & Displays<'total' | 'line_total'>
  & MaybeDisplays<'unit_total' | 'line_total_incl' | 'line_total_excl' | 'unit_total_incl' | 'unit_total_excl'>
  & { taxes?: WcposItemTaxView[] };
export type WcposRefundView = WcposReceiptRefund & Displays<'amount'>
  & MaybeDisplays<'subtotal' | 'tax_total' | 'shipping_total' | 'shipping_tax'>
  & {
    lines?: WcposRefundLineView[];
    fees?: Array<WcposRefundAdjustment & Displays<'total'>>;
    shipping?: Array<WcposRefundAdjustment & Displays<'total'>>;
  };

/** What a WCPOS template renders over. `i18n` is the defaults merged with the store's labels. */
export interface WcposReceiptView extends Omit<WcposReceiptData,
  'lines' | 'fees' | 'shipping' | 'discounts' | 'totals' | 'tax_summary' | 'payments' | 'refunds' | 'i18n'> {
  lines: WcposLineView[];
  fees: WcposAdjustmentView[];
  shipping: Array<WcposAdjustmentView<WcposReceiptShipping>>;
  discounts: Array<WcposAdjustmentView<WcposReceiptDiscount>>;
  totals: WcposTotalsView;
  tax_summary: WcposTaxSummaryView[];
  payments: WcposPaymentView[];
  refunds?: WcposRefundView[];
  i18n: Record<string, string>;
}
