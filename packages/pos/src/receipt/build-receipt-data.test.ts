import { describe, it, expect } from 'vitest';
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
      price: 4.5,
      quantity: 2,
      taxRate: 0.1,
      taxAmount: 0.9,
      discounts: [],
      discountAmount: 0,
      lineTotal: 9.9,
    },
    {
      id: 'li2',
      productId: 'p2',
      name: 'Muffin',
      sku: 'MUF-001',
      price: 3.0,
      quantity: 1,
      taxRate: 0.05,
      taxAmount: 0.15,
      discounts: [],
      discountAmount: 0,
      lineTotal: 3.15,
    },
  ],
  discounts: [{ id: 'd1', type: 'fixed', value: 1, amount: 1, label: 'Loyalty' }],
  payments: [{ id: 'pay1', method: 'cash', amount: 15.0 }],
  customer: { id: 'c1', name: 'Alice' },
  note: 'Extra hot',
  subtotal: 12.0,
  discountTotal: 1.0,
  taxTotal: 1.05,
  total: 12.05,
  balanceDue: 0,
  changeDue: 2.95,
  currency: 'USD',
  createdAt: '2026-02-26T10:00:00Z',
  updatedAt: '2026-02-26T10:05:00Z',
};

const config: ReceiptConfig = {
  storeName: 'Test Coffee Shop',
  storeAddress: '123 Main St',
  cashier: 'Bob',
  register: 'POS-1',
  taxLabels: { 0.1: 'VAT 10%', 0.05: 'Reduced VAT 5%' },
};

describe('buildReceiptData', () => {
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
      unitPrice: 4.5,
      lineTotal: 9.9,
    });
  });

  it('maps discounts', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.discounts).toHaveLength(1);
    expect(receipt.discounts[0]).toEqual({ label: 'Loyalty', amount: 1 });
  });

  it('groups tax lines by rate with labels', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.totals.taxLines).toHaveLength(2);
    expect(receipt.totals.taxLines).toContainEqual({
      label: 'VAT 10%',
      rate: 0.1,
      amount: 0.9,
    });
    expect(receipt.totals.taxLines).toContainEqual({
      label: 'Reduced VAT 5%',
      rate: 0.05,
      amount: 0.15,
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
    expect(receipt.totals.subtotal).toBe(12.0);
    expect(receipt.totals.discountTotal).toBe(1.0);
    expect(receipt.totals.taxTotal).toBe(1.05);
    expect(receipt.totals.total).toBe(12.05);
  });

  it('maps payments', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.payments).toHaveLength(1);
    expect(receipt.payments[0]).toEqual({ method: 'cash', amount: 15.0 });
  });

  it('includes change due and footer', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.changeDue).toBe(2.95);
    expect(receipt.footer.note).toBe('Extra hot');
    expect(receipt.footer.barcode).toBe('order-001');
  });

  it('includes currency', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.currency).toBe('USD');
  });
});
