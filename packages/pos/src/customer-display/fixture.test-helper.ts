import type { ReceiptData, ReceiptLineItem } from '../receipt/types';

export const line = (name: string, extra: Partial<ReceiptLineItem> = {}): ReceiptLineItem => ({
  name, sku: '', quantity: 1, unitPriceMinor: 100, lineTotalMinor: 100, displayAmountMinor: 100, displayDiscounts: [], ...extra,
});

export function receiptWith(lineItems: ReceiptLineItem[], note?: string): ReceiptData {
  const totalMinor = lineItems.reduce((sum, item) => sum + item.displayAmountMinor, 0);
  return {
    schemaVersion: '1.4.0',
    software: { name: 'TallyUI', plugin_version: '', app_version: '', app_build: '', platform: '' },
    register: { id: '', name: '' },
    fiscal: { document_type: 'sale', is_reprint: false, reprint_count: 0, qr_payload: '' },
    header: { storeName: 'Corner Shop', orderNumber: '1001', date: '2026-11-10T10:00:00Z' },
    lineItems, fees: [], shipping: [], discounts: [], orderDiscountMinor: 0,
    totals: { taxInclusive: false, subtotalMinor: totalMinor, discountMinor: 0, taxLines: [], taxMinor: 0, totalMinor },
    payments: [], changeDueMinor: 0, footer: note === undefined ? {} : { note }, currency: 'USD',
  };
}
