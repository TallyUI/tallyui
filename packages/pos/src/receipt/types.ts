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
    subtotalMinor: number;
    discountMinor: number;
    taxLines: { label: string; code?: string; ratePpm: number; amountMinor: number }[];
    taxMinor: number;
    totalMinor: number;
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
