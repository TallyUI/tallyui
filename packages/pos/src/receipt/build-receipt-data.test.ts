import { describe, it, expect } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { buildReceiptData } from './build-receipt-data';
import type { Order } from '../order/types';
import type { ReceiptConfig } from './types';

const baseOrder: Order = {
  id: 'order-001',
  status: 'completed',
  lineItems: [
    {
      id: 'li1',
      productId: 'p1',
      name: 'Espresso',
      sku: 'ESP-001',
      unitPriceMinor: 450,
      quantity: 2,
      taxLines: [{ ratePpm: 100000, taxMicros: '90000000' }],
      taxMicros: '90000000',
      discounts: [],
      discountMinor: 0,
      netMinor: 900,
    },
    {
      id: 'li2',
      productId: 'p2',
      name: 'Muffin',
      sku: 'MUF-001',
      unitPriceMinor: 300,
      quantity: 1,
      taxLines: [{ ratePpm: 50000, taxMicros: '15000000' }],
      taxMicros: '15000000',
      discounts: [],
      discountMinor: 0,
      netMinor: 300,
    },
  ],
  discounts: [{ id: 'd1', type: 'fixed', value: 100, amountMinor: 100, label: 'Loyalty' }],
  payments: [{ id: 'pay1', method: 'cash', amountMinor: 1500 }],
  customer: { id: 'c1', name: 'Alice' },
  note: 'Extra hot',
  subtotalMinor: 1200,
  discountMinor: 100,
  taxMinor: 105,
  totalMinor: 1205,
  balanceDueMinor: 0,
  changeDueMinor: 295,
  currency: 'USD',
  pricesIncludeTax: false,
  paidMinor: 1500,
  createdAt: '2026-02-26T10:00:00Z',
  updatedAt: '2026-02-26T10:05:00Z',
};

const config: ReceiptConfig = {
  storeName: 'Test Coffee Shop',
  storeAddress: '123 Main St',
  cashier: 'Bob',
  register: 'POS-1',
  taxLabels: { 100000: 'VAT 10%', 50000: 'Reduced VAT 5%' },
};

describe('buildReceiptData', () => {
  it.each([
    { rates: [190000, 70000], amount: 1000, expected: [190, 70] },
    { rates: [190000, 70000, 50000], amount: 5, expected: [1, 1, 0] },
    { rates: [50000, 150000], amount: 10, expected: [0, 2] },
  ])('apportions tax by largest remainder: $rates', ({ rates, amount, expected }) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRate: () => 0, pricesIncludeTax: false } });
    rates.forEach((ratePpm, index) => builder.addLine({
      productId: `p${index}`, name: 'Item', unitPrice: { amount, currency: 'USD' }, taxRates: [{ ratePpm }],
    }));
    const order = builder.getSnapshot();
    const receipt = buildReceiptData(order, { storeName: 'Shop' });
    expect(receipt.totals.taxLines.map((line) => line.amountMinor)).toEqual(expected);
    expect(receipt.totals.taxLines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(order.taxMinor);
  });

  it('groups stacked taxes by code and rate across lines', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRate: () => 0, pricesIncludeTax: false } });
    const input = {
      productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' },
      taxRates: [{ code: 'STATE', ratePpm: 60000 }, { code: 'CITY', ratePpm: 25000 }],
    };
    builder.addLine(input);
    expect(buildReceiptData(builder.getSnapshot(), config).totals.taxLines).toEqual([
      { label: 'Tax 6%', code: 'STATE', ratePpm: 60000, amountMinor: 60 },
      { label: 'Tax 2.5%', code: 'CITY', ratePpm: 25000, amountMinor: 25 },
    ]);
    builder.addLine({ ...input, productId: 'p2' });
    builder.addLine({ ...input, productId: 'p3', taxRates: [{ code: 'CITY', ratePpm: 60000 }] });
    expect(buildReceiptData(builder.getSnapshot(), config).totals.taxLines).toEqual([
      { label: 'Tax 6%', code: 'STATE', ratePpm: 60000, amountMinor: 120 },
      { label: 'Tax 2.5%', code: 'CITY', ratePpm: 25000, amountMinor: 50 },
      { label: 'Tax 6%', code: 'CITY', ratePpm: 60000, amountMinor: 60 },
    ]);
  });

  it('keeps fractional percentages in default tax labels', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRate: () => 0.0725, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' } });
    expect(buildReceiptData(builder.getSnapshot(), config).totals.taxLines[0].label).toBe('Tax 7.25%');
  });

  it('builds receipt header from config and order', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.header.storeName).toBe('Test Coffee Shop');
    expect(receipt.header.storeAddress).toBe('123 Main St');
    expect(receipt.header.orderNumber).toBe('order-001');
    expect(receipt.header.cashier).toBe('Bob');
    expect(receipt.header.register).toBe('POS-1');
    expect(receipt.header.date).toBe('2026-02-26T10:00:00Z');
  });

  it('maps line items', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.lineItems).toHaveLength(2);
    expect(receipt.lineItems[0]).toEqual({
      name: 'Espresso',
      sku: 'ESP-001',
      quantity: 2,
      unitPriceMinor: 450,
      lineTotalMinor: 900,
    });
  });

  it('maps discounts', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.discounts).toHaveLength(1);
    expect(receipt.discounts[0]).toEqual({ label: 'Loyalty', amountMinor: 100 });
  });

  it('groups tax lines by rate with labels', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.totals.taxLines).toHaveLength(2);
    expect(receipt.totals.taxLines).toContainEqual({
      label: 'VAT 10%',
      ratePpm: 100000,
      amountMinor: 90,
    });
    expect(receipt.totals.taxLines).toContainEqual({
      label: 'Reduced VAT 5%',
      ratePpm: 50000,
      amountMinor: 15,
    });
  });

  it('uses default tax label when not configured', () => {
    const receipt = buildReceiptData(baseOrder, { storeName: 'Shop' });
    const labels = receipt.totals.taxLines.map((t) => t.label);
    expect(labels).toContain('Tax 10%');
    expect(labels).toContain('Tax 5%');
  });

  it('calculates totals', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.totals.subtotalMinor).toBe(1200);
    expect(receipt.totals.discountMinor).toBe(100);
    expect(receipt.totals.taxMinor).toBe(105);
    expect(receipt.totals.totalMinor).toBe(1205);
  });

  it('maps payments', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.payments).toHaveLength(1);
    expect(receipt.payments[0]).toEqual({ method: 'cash', amountMinor: 1500 });
  });

  it('includes change due and footer', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.changeDueMinor).toBe(295);
    expect(receipt.footer.note).toBe('Extra hot');
    expect(receipt.footer.barcode).toBe('order-001');
  });

  it('includes currency', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.currency).toBe('USD');
  });

  it('handles empty order with no line items', () => {
    const emptyOrder: Order = {
      ...baseOrder,
      lineItems: [],
      discounts: [],
      payments: [],
      paidMinor: 0,
      subtotalMinor: 0,
      discountMinor: 0,
      taxMinor: 0,
      totalMinor: 0,
      balanceDueMinor: 0,
      changeDueMinor: 0,
    };
    const receipt = buildReceiptData(emptyOrder, config);
    expect(receipt.lineItems).toHaveLength(0);
    expect(receipt.totals.taxLines).toHaveLength(0);
    expect(receipt.totals.totalMinor).toBe(0);
  });

  it('uses fallback label for discount without label or couponCode', () => {
    const orderWithUnlabeledDiscount: Order = {
      ...baseOrder,
      discounts: [
        { id: 'd1', type: 'percentage', value: 10, amountMinor: 120 },
      ],
    };
    const receipt = buildReceiptData(orderWithUnlabeledDiscount, config);
    expect(receipt.discounts[0].label).toBe('percentage discount');
  });
});
