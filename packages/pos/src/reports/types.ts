/** A store day, `yyyy-MM-dd` in the store's timezone. */
export type StoreDay = string;
/** Inclusive range of store days. */
export interface DayRange { from: StoreDay; to: StoreDay }

export interface ReportCategory { id: string; name: string }

export interface ReportLine {
  /** Grouping identity: variant, else product, else name. */
  key: string;
  name: string;
  quantity: number;
  /** After discounts, excluding tax. */
  netMinor: number;
  taxMinor: number;
  /** Cost of goods for the whole line (quantity × unit cost). Absent or null means the cost is missing, never 0. */
  costMinor?: number | null;
  /** The line's first category, when the caller joined one. */
  category?: ReportCategory;
}

export interface ReportPayment { method: string; label?: string; amountMinor: number }

export interface ReportTax {
  ratePpm: number;
  code?: string;
  label: string;
  taxMinor: number;
  /** The net this rate taxed; null when the source does not carry it. */
  netMinor: number | null;
}

/** An order as the reports read it. Money in integer minor units. */
export interface ReportOrder {
  id: string;
  /** ISO 8601 UTC instant the sale was made. */
  at: string;
  /** Gross, including tax. */
  totalMinor: number;
  taxMinor: number;
  discountMinor: number;
  /** True when the order still owes money: its unpaid remainder is `unpaid`, not `unknown`. */
  needsPayment?: boolean;
  lines: ReportLine[];
  payments: ReportPayment[];
  taxes: ReportTax[];
  /** Refunds embedded on the order, undated (a store order's own list). Positive. */
  refunds: Array<{ id: string; amountMinor: number }>;
}

/** A refund dated by when it was made, counted on that store day. */
export interface ReportRefund {
  id: string;
  orderId: string;
  /** ISO 8601 UTC instant the refund was made. */
  at: string;
  /** Positive. */
  amountMinor: number;
}

/** The caller's product directory: a line's unit cost and first category. */
export type LineJoin = (line: { productId?: string; variantId?: string }) =>
  { unitCostMinor?: number | null; category?: ReportCategory } | undefined;
