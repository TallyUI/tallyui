export interface ReceiptLineItem {
  name: string;
  sku: string;
  quantity: number;
  unitPriceMinor: number;
  lineTotalMinor: number;
  discountMinor?: number;     // this line's discounts, already taken off lineTotalMinor; absent when 0
}

export interface ReceiptData {
  header: {
    storeName: string;
    storeAddress?: string;
    orderNumber: string;
    date: string;
    cashier?: string;
    register?: string;
  };
  lineItems: ReceiptLineItem[];
  discounts: { label: string; amountMinor: number }[];
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
  taxLabels?: Record<number, string>;
}
