import { describe, expect, it } from 'vitest';
import { toVendureStoreOrder, type VendureOrder } from '@tallyui/connector-vendure';
import { buildReceiptDataFromStoreOrder, type ReceiptConfig } from '@tallyui/pos';

const config: ReceiptConfig = { storeName: 'Test Store', storeAddress: '1 Main St', cashier: 'Bob', register: 'POS-1' };
const order: VendureOrder = {
  id: '12', code: 'ORDER-12', state: 'PaymentSettled', active: false,
  orderPlacedAt: '2026-01-02T10:00:00.000Z', updatedAt: '2026-01-02T10:01:00.000Z',
  currencyCode: 'USD', totalQuantity: 1, total: 100, totalWithTax: 100, customer: null,
  customFields: {
    tallyClientOrderId: 'client-12', tallySaleAt: null, tallyRegisterId: null, tallySessionId: null,
    tallyCashierRef: null, tallyRejected: false, tallyRejectedClientOrderId: null,
    tallyPayments: null, tallySnapshot: '{"version":1,"taxExempt":true}', tallyShipping: null,
  },
  lines: [{
    id: 'line-1', quantity: 1, orderPlacedQuantity: 1, taxRate: 0,
    productVariant: { id: 'variant-1', name: 'Coffee', sku: 'COFFEE' },
    proratedUnitPrice: 100, proratedUnitPriceWithTax: 100, proratedLinePrice: 100, proratedLinePriceWithTax: 100,
    unitPrice: 100, unitPriceWithTax: 100, linePrice: 100, linePriceWithTax: 100,
    discountedLinePrice: 100, discountedLinePriceWithTax: 100, discounts: [],
  }],
  shippingLines: [], surcharges: [], subTotal: 100, subTotalWithTax: 100, shipping: 0, shippingWithTax: 0,
  taxSummary: [], discounts: [], couponCodes: [],
};

describe('Vendure zero-tax store order reprint', () => {
  it('marks the receipt totals exempt when the plugin marked the order', () => {
    const receipt = buildReceiptDataFromStoreOrder(toVendureStoreOrder(order, false), config);
    expect(receipt.totals.taxExempt).toBe(true);
  });

  it('omits taxExempt from receipt totals without the marker', () => {
    const customFields = { ...order.customFields!, tallySnapshot: '{"version":1}' };
    const receipt = buildReceiptDataFromStoreOrder(toVendureStoreOrder({ ...order, customFields }, false), config);
    expect(receipt.totals).not.toHaveProperty('taxExempt');
  });
});
