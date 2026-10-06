/** WCPOS receipt data schema version these blocks follow (wiki: fiscal groundwork, receipt identity and QR §2). */
export const RECEIPT_SCHEMA_VERSION = '1.4.0';

/** 1.4 `software`: which software produced the receipt. */
export interface ReceiptSoftware { name: string; plugin_version: string; app_version: string; app_build: string; platform: string }
/** 1.4 `register`: `{ id: '', name: '' }` when there is none. */
export interface ReceiptRegister { id: string; name: string }
/** 1.4 `fiscal` identity fields a till can know. Sale time, zone and counter come with the per-register sale counter (#475). */
export interface ReceiptFiscal {
  document_type: 'sale' | 'refund' | 'void' | 'cancellation' | 'closure' | 'x_report';
  is_reprint: boolean;
  reprint_count: number;
  qr_payload: string;
}

export interface ReceiptLineItem {
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  /** After every discount, including the line's order share, in the order's mode. Not the figure to print above the subtotal: use displayAmountMinor. */
  lineTotalMinor: number;
  discountMinor?: number;     // this line's discounts, already taken off lineTotalMinor; absent when 0
  displayAmountMinor: number; // before any discount, in the display mode; Σ = totals.subtotalMinor (ADR-063)
  displayDiscounts: { label: string; amountMinor: number }[]; // this line's own discounts, in the display mode
}

export interface ReceiptData {
  schemaVersion: string;
  software: ReceiptSoftware;
  register: ReceiptRegister;
  fiscal: ReceiptFiscal;
  header: {
    storeName: string;
    storeAddress?: string;
    orderNumber: string;
    date: string;
    cashier?: string;
    customer?: string;
    register?: string;
  };
  lineItems: ReceiptLineItem[];
  fees: Array<{ name: string; amountMinor: number }>;
  shipping: Array<{ name: string; amountMinor: number }>;
  discounts: { label: string; amountMinor: number }[];
  orderDiscountMinor: number;   // the order discounts as one row, in the display mode; + Σ displayDiscounts = totals.discountMinor
  totals: {
    taxInclusive: boolean;      // from order.display: tax is added (false) or included (true)
    subtotalMinor: number;      // order.display.subtotalMinor: before discounts, in the display mode
    discountMinor: number;      // order.display.discountMinor: every discount, in the display mode (>= 0)
    taxLines: { label: string; code?: string; ratePpm: number; amountMinor: number }[];
    taxMinor: number;           // order.display.taxMinor
    totalMinor: number;         // order.display.totalMinor
  };
  payments: { method: string; amountMinor: number; reference?: string }[];
  changeDueMinor: number;
  footer: {
    note?: string;
    barcode?: string;
  };
  currency: string;
}

export interface ReceiptConfig {
  storeName: string;
  storeAddress?: string;
  cashier?: string;
  register?: string;
  registerName?: string;
  software?: Partial<ReceiptSoftware>;
  fiscal?: Partial<ReceiptFiscal>;
  taxLabels?: Record<number, string>;
}
