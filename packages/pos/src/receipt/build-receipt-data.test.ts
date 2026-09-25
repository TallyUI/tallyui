import { describe, it, expect } from 'vitest';
import { createOrderBuilder } from '../order/order-builder';
import { buildReceiptData } from './build-receipt-data';
import { roundMicrosToMinor } from '../tax/exact';
import type { Order } from '../order/types';
import type { ReceiptConfig, ReceiptData } from './types';

/** The receipt's invariants (ADR-063): lines sum to subtotal − discount; that plus tax (when exclusive) is
 *  the total, or minus nothing (when inclusive, since tax is already in the subtotal); tax lines sum to the tax. */
function expectReceiptAddsUp(receipt: ReceiptData) {
  const { totals } = receipt;
  const lineSum = receipt.lineItems.reduce((sum, li) => sum + li.lineTotalMinor, 0);
  expect(lineSum).toBe(totals.subtotalMinor - totals.discountMinor);
  expect(totals.subtotalMinor - totals.discountMinor + (totals.taxInclusive ? 0 : totals.taxMinor)).toBe(totals.totalMinor);
  expect(totals.taxLines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(totals.taxMinor);
}

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
      orderDiscountMinor: 0,
      netMinor: 900,
      taxInclusive: false,
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
      orderDiscountMinor: 0,
      netMinor: 300,
      taxInclusive: false,
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
  display: { taxInclusive: false, subtotalMinor: 1200, discountMinor: 100, taxMinor: 105, totalMinor: 1205 },
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
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    rates.forEach((ratePpm, index) => builder.addLine({
      productId: `p${index}`, name: 'Item', unitPrice: { amount, currency: 'USD' }, taxRates: [{ ratePpm }],
    }));
    const order = builder.getSnapshot();
    const receipt = buildReceiptData(order, { storeName: 'Shop' });
    expect(receipt.totals.taxLines.map((line) => line.amountMinor)).toEqual(expected);
    expect(receipt.totals.taxLines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(order.taxMinor);
  });

  it('groups stacked taxes by code and rate across lines', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
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
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 72500, pricesIncludeTax: false } });
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

  it('calculates totals from order.display (ADR-063)', () => {
    const receipt = buildReceiptData(baseOrder, config);
    expect(receipt.totals.taxInclusive).toBe(false);
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
      display: { taxInclusive: false, subtotalMinor: 0, discountMinor: 0, taxMinor: 0, totalMinor: 0 },
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

  // A: the line whose price has the other mode, converted; B: a line in the store's mode.
  it.each([
    { name: 'inclusive price, exclusive store', storeInclusive: false, ratePpm: 190000, a: 1000, aQty: 3, b: 1000,
      lineTotals: [2521, 1000], subtotalMinor: 3521, taxMinor: 669, totalMinor: 4190 },
    // Inclusive display's subtotal is before discounts, in the inclusive mode; with none, it equals the total.
    { name: 'exclusive price, inclusive store', storeInclusive: true, ratePpm: 190000, a: 1000, aQty: 3, b: 1000,
      lineTotals: [3570, 1000], subtotalMinor: 4570, taxMinor: 730, totalMinor: 4570 },
    // Per-line rounding would show A as 4 (tax 0.36¢ rounds to 0), but the order's one rounding of 0.76¢ gives 1¢.
    { name: 'sub-cent taxes, exclusive store', storeInclusive: false, ratePpm: 100000, a: 4, aQty: 1, b: 4,
      lineTotals: [3, 4], subtotalMinor: 7, taxMinor: 1, totalMinor: 8 },
  ])('shows a mixed-mode order\'s lines in the order\'s mode: $name', (row) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => row.ratePpm, pricesIncludeTax: row.storeInclusive } });
    builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: row.a, currency: 'EUR', taxInclusive: !row.storeInclusive }, quantity: row.aQty });
    builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: row.b, currency: 'EUR' } });
    const receipt = buildReceiptData(builder.getSnapshot(), config);
    const lineTotals = receipt.lineItems.map((line) => line.lineTotalMinor);
    expect(lineTotals).toEqual(row.lineTotals);
    expect(receipt.totals).toMatchObject({ taxInclusive: row.storeInclusive, subtotalMinor: row.subtotalMinor, taxMinor: row.taxMinor, totalMinor: row.totalMinor });
    expectReceiptAddsUp(receipt);
    // The customer still pays each shelf amount in full: A's gross, or A's net plus its exact tax, plus B in the store's mode.
    const exclusiveTax = (amount: number) => roundMicrosToMinor(BigInt(amount * row.ratePpm));
    const shelfA = row.storeInclusive ? row.a * row.aQty + exclusiveTax(row.a * row.aQty) : row.a * row.aQty;
    const shelfB = row.storeInclusive ? row.b : row.b + exclusiveTax(row.b);
    expect(receipt.totals.totalMinor).toBe(shelfA + shelfB);
  });

  it.each([false, true])('shows line and order discounts, and its totals still add up (ADR-062; inclusive store: %s)', (storeInclusive) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: storeInclusive } });
    const lineId = builder.addLine({ productId: 'a', name: 'A', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: !storeInclusive }, quantity: 3 });
    builder.addLine({ productId: 'b', name: 'B', unitPrice: { amount: 999, currency: 'EUR' } });
    builder.addLine({ productId: 'c', name: 'C', unitPrice: { amount: 500, currency: 'EUR' } });
    builder.applyLineDiscount(lineId, { type: 'fixed', value: 250 });
    builder.applyOrderDiscount({ type: 'percentage', value: 15, label: 'Staff' });
    const order = builder.getSnapshot();
    const receipt = buildReceiptData(order, config);
    const orderDiscount = order.discounts[0].amountMinor;
    expect(orderDiscount).toBe(Math.round((2750 + 999 + 500) * 0.15));
    expect(receipt.discounts).toEqual([{ label: 'Staff', amountMinor: orderDiscount }]);
    // Each line still shows its own discount, in its own mode (ADR-062); unlike before ADR-063, A's mode differs
    // from the store's, so these no longer sum to totals.discountMinor (that's the display figure; see backlog 48).
    const lineDiscounts = receipt.lineItems.map((line) => line.discountMinor ?? 0);
    expect(lineDiscounts).toEqual(order.lineItems.map((li) => li.discountMinor));
    expect(lineDiscounts.every((amount) => amount > 0)).toBe(true);
    expect(receipt.totals.discountMinor).toBe(order.display.discountMinor);
    expectReceiptAddsUp(receipt);
  });

  it('has no discount shown when the order has none', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' } });
    const receipt = buildReceiptData(builder.getSnapshot(), config);
    expect(receipt.totals.discountMinor).toBe(0);
    expectReceiptAddsUp(receipt);
  });

  it.each([
    { taxInclusive: false, display: { subtotalMinor: 1000, discountMinor: 200, taxMinor: 80, totalMinor: 880 } },
    { taxInclusive: true, display: { subtotalMinor: 1000, discountMinor: 200, taxMinor: 73, totalMinor: 800 } },
  ])('single-mode store with a line and an order discount: totals come from order.display exactly (inclusive: $taxInclusive)', (row) => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax: row.taxInclusive } });
    const lineId = builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'USD' } });
    builder.applyLineDiscount(lineId, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const receipt = buildReceiptData(builder.getSnapshot(), config);
    expect(receipt.totals).toMatchObject({ taxInclusive: row.taxInclusive, ...row.display });
    expectReceiptAddsUp(receipt);
  });

  it.each([
    { taxInclusive: false, display: { subtotalMinor: 3521, discountMinor: 88, taxMinor: 652, totalMinor: 4085 } },
    { taxInclusive: true, display: { subtotalMinor: 4190, discountMinor: 105, taxMinor: 652, totalMinor: 4085 } },
  ])('mixed cart (one inclusive line, one exclusive line) with an order discount, in each display mode (inclusive: $taxInclusive)', (row) => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: row.taxInclusive } });
    builder.addLine({ productId: 'a', name: 'Inclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: true }, quantity: 3 });
    builder.addLine({ productId: 'b', name: 'Exclusive', unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false } });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    const receipt = buildReceiptData(builder.getSnapshot(), config);
    expect(receipt.totals).toMatchObject({ taxInclusive: row.taxInclusive, ...row.display });
    expectReceiptAddsUp(receipt);
  });
});
