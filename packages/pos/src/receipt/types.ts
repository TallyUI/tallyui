export interface ReceiptLineItem {
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
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
  discounts: { label: string; amount: number }[];
  totals: {
    subtotal: number;
    discountTotal: number;
    taxLines: { label: string; rate: number; amount: number }[];
    taxTotal: number;
    total: number;
  };
  payments: { method: string; amount: number; reference?: string }[];
  changeDue: number;
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
