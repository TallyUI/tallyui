import { describe, expect, it } from 'vitest';
import type { StoreOrder, TaxRounding } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder } from '../pos-order/finalize';
import { buildReceiptData } from './build-receipt-data';
import { buildReceiptDataFromPosOrder, buildReceiptDataFromStoreOrder } from './reprint';
import type { ReceiptConfig, ReceiptData } from './types';

const config: ReceiptConfig = {
  storeName: 'Test Coffee Shop', storeAddress: '123 Main St', cashier: 'Bob', register: 'POS-1', registerName: 'Front till',
  taxLabels: { 100000: 'VAT 10%' },
};

function finalizedSale(pricesIncludeTax: boolean, orderCreate: 2 | 6 = 6) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 100000, pricesIncludeTax } });
  const lineId = builder.addLine({ productId: 'p1', name: 'Espresso', sku: 'ESP-001', unitPrice: { amount: 450, currency: 'USD' }, quantity: 2 });
  builder.addLine({ productId: 'p2', name: 'Muffin', sku: 'MUF-001', unitPrice: { amount: 300, currency: 'USD' } });
  builder.applyLineDiscount(lineId, { type: 'fixed', value: 50, label: 'Regular' });
  builder.applyOrderDiscount({ type: 'percentage', value: 10, label: 'Staff' });
  builder.setCustomer({ id: 'c1', name: 'Alice' });
  builder.setNote('Extra hot');
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor + 37 });
  const order = builder.getSnapshot();
  let next = 0;
  const posOrder = finalizeOrder(order, {
    capabilities: { orderCreate }, now: new Date('2026-10-14T09:30:00.000Z'), newId: () => `id-${++next}`,
  });
  return { order, posOrder };
}

const withoutLabels = (receipt: ReceiptData) => receipt.totals.taxLines.map(({ label: _label, ...rest }) => rest);
const total = (rows: Array<{ amountMinor: number }>) => rows.reduce((sum, row) => sum + row.amountMinor, 0);

describe('reprint receipt data', () => {
  it.each([false, true])('matches buildReceiptData for a finalized order, marked as a reprint (inclusive: %s)', (pricesIncludeTax) => {
    const { order, posOrder } = finalizedSale(pricesIncludeTax);
    expect(posOrder.display).toBeDefined();
    const original = buildReceiptData(order, config);
    const reprint = buildReceiptDataFromPosOrder(posOrder, config);

    expect({ ...reprint.totals, taxLines: withoutLabels(reprint) }).toEqual({ ...original.totals, taxLines: withoutLabels(original) });
    expect(reprint.fees).toEqual(original.fees);
    expect(reprint.shipping).toEqual(original.shipping);
    expect(reprint.orderDiscountMinor).toBe(original.orderDiscountMinor);
    expect(reprint.changeDueMinor).toBe(original.changeDueMinor);
    expect(reprint.changeDueMinor).toBe(37);
    expect(reprint.currency).toBe(original.currency);
    expect(reprint.lineItems).toHaveLength(original.lineItems.length);
    reprint.lineItems.forEach((line, index) => {
      const want = original.lineItems[index]!;
      expect({
        name: line.name, sku: line.sku, quantity: line.quantity, unitPriceMinor: line.unitPriceMinor,
        displayAmountMinor: line.displayAmountMinor, discounts: line.displayDiscounts.map((d) => d.amountMinor),
        lineTotalMinor: line.lineTotalMinor, discountMinor: line.discountMinor,
      }).toEqual({
        name: want.name, sku: want.sku, quantity: want.quantity, unitPriceMinor: want.unitPriceMinor,
        displayAmountMinor: want.displayAmountMinor, discounts: want.displayDiscounts.map((d) => d.amountMinor),
        lineTotalMinor: want.lineTotalMinor, discountMinor: want.discountMinor,
      });
    });
    expect(total(reprint.discounts)).toBe(total(original.discounts));
    expect(reprint.lineItems[0]!.displayDiscounts.map((d) => d.label)).toEqual(['Regular']);

    expect(reprint.fiscal).toStrictEqual({ document_type: 'sale', is_reprint: true, reprint_count: 1, qr_payload: '' });
    expect(reprint.header.orderNumber).toBe(posOrder.id);
    expect(reprint.footer).toStrictEqual({ note: 'Extra hot', barcode: posOrder.id });
    expect(reprint.header.date).toBe(posOrder.createdAt);
    expect(reprint.header).toMatchObject({ storeName: 'Test Coffee Shop', storeAddress: '123 Main St', cashier: 'Bob', register: 'POS-1', customer: 'Alice' });
    expect(reprint.register).toStrictEqual(original.register);
    expect(reprint.software).toStrictEqual(original.software);
    expect(reprint.schemaVersion).toBe(original.schemaVersion);
    expect(reprint.payments).toEqual(original.payments);
  });

  it.each([false, true])('matches buildReceiptData for a WooCommerce-rounded sale (inclusive: %s)', (pricesIncludeTax) => {
    for (const roundAtSubtotal of [false, true]) {
      const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
        pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal }, getTaxRatePpm: () => 200000,
        getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
      } });
      builder.addLine({ productId: '11', name: 'Tea', sku: 'TEA', unitPrice: { amount: 333, currency: 'GBP' }, quantity: 3 });
      builder.addLine({ productId: '12', name: 'Cake', sku: 'CAKE', unitPrice: { amount: 457, currency: 'GBP' } });
      builder.applyOrderDiscount({ type: 'percentage', value: 10, label: 'Staff' });
      builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
      const order = builder.getSnapshot();
      const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 6 } });
      expect(posOrder.lines.every((line) => line.netMicros !== undefined)).toBe(true);
      const original = buildReceiptData(order, config);
      expect(buildReceiptDataFromPosOrder(posOrder, config).lineItems.map((line) => line.lineTotalMinor), `roundAtSubtotal: ${roundAtSubtotal}`)
        .toEqual(original.lineItems.map((line) => line.lineTotalMinor));
    }
  });

  it('uses displayId as the order number once the store has one', () => {
    const { posOrder } = finalizedSale(false);
    const receipt = buildReceiptDataFromPosOrder({ ...posOrder, serverRefs: { orderId: '136', displayId: '136', totalMinor: posOrder.totalMinor } }, config);
    expect(receipt.header.orderNumber).toBe('136');
    expect(receipt.footer.barcode).toBe(posOrder.id);
  });

  it('passes reprint_count from config.fiscal', () => {
    const { posOrder } = finalizedSale(false);
    expect(buildReceiptDataFromPosOrder(posOrder, { ...config, fiscal: { reprint_count: 3 } }).fiscal)
      .toStrictEqual({ document_type: 'sale', is_reprint: true, reprint_count: 3, qr_payload: '' });
    expect(buildReceiptDataFromStoreOrder(order136, { ...config, fiscal: { reprint_count: 2 } }).fiscal.reprint_count).toBe(2);
  });

  // orderCreate 2, not 1: this sale has discounts, which finalizeOrder refuses below version 2.
  it.each([false, true])('builds from a PosOrder finalized below order.create v3, without display (inclusive: %s)', (pricesIncludeTax) => {
    const { order, posOrder } = finalizedSale(pricesIncludeTax, 2);
    expect(posOrder.display).toBeUndefined();
    expect(posOrder.taxByRate).toBeUndefined();
    const receipt = buildReceiptDataFromPosOrder(posOrder, config);
    expect(receipt.lineItems.map((line) => line.displayAmountMinor)).toEqual([900, 300]);
    expect(receipt.lineItems.map((line) => line.displayDiscounts)).toEqual(posOrder.lines.map((line) =>
      line.discountMinor > 0 ? [{ label: 'Discount', amountMinor: line.discountMinor }] : []));
    expect(receipt.lineItems.map((line) => line.lineTotalMinor)).toEqual(posOrder.lines.map((line) => line.netMinor));
    expect(receipt.discounts).toEqual([]);
    expect(receipt.orderDiscountMinor).toBe(0);
    expect(receipt.fees).toEqual([]);
    expect(receipt.shipping).toEqual([]);
    expect(receipt.totals).toEqual({
      taxInclusive: pricesIncludeTax, subtotalMinor: 1200, discountMinor: posOrder.lines[0]!.discountMinor + posOrder.lines[1]!.discountMinor,
      taxLines: [{ label: 'VAT 10%', ratePpm: 100000, amountMinor: posOrder.taxMinor }],
      taxMinor: posOrder.taxMinor, totalMinor: posOrder.totalMinor,
    });
    const amounts = receipt.totals.taxLines.map((row) => row.amountMinor);
    expect(amounts).toEqual(buildReceiptData(order, config).totals.taxLines.map((row) => row.amountMinor));
    expect(amounts.length).toBeGreaterThan(0);
    expect(total(receipt.totals.taxLines)).toBe(posOrder.taxMinor);
  });

  it('builds charges from a PosOrder without display', () => {
    const { posOrder } = finalizedSale(false);
    const { display: _display, ...stored } = posOrder;
    const charge = { id: 'f1', name: 'Bag', amountMinor: 10, taxStatus: 'none' as const, taxLines: [], netMinor: 10, taxMicros: '0' };
    const receipt = buildReceiptDataFromPosOrder({ ...stored, fees: [charge], shipping: [{ ...charge, name: 'Courier', amountMinor: 500 }] }, config);
    expect(receipt.fees).toEqual([{ name: 'Bag', amountMinor: 10 }]);
    expect(receipt.shipping).toEqual([{ name: 'Courier', amountMinor: 500 }]);
  });
});

const plainConfig: ReceiptConfig = { storeName: 'S' };
const coupons = {
  configs: new Map([['ten', { discount_type: 'percent' as const, amount: '10', limit_usage_to_x_items: null,
    product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
  couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
};

function wooSale(pricesIncludeTax: boolean, roundAtSubtotal: boolean, withCoupon: boolean) {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal }, getTaxRatePpm: () => 200000,
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
  }, couponContext: coupons as never });
  const a = builder.addLine({ productId: '11', name: 'Tea', sku: 'TEA', unitPrice: { amount: 333, currency: 'GBP' }, quantity: 3 });
  builder.addLine({ productId: '12', name: 'Cake', sku: 'CAKE', unitPrice: { amount: 457, currency: 'GBP' } });
  builder.applyLineDiscount(a, { type: 'fixed', value: 37, label: 'Dent' });
  builder.applyOrderDiscount({ type: 'percentage', value: 7, label: 'Staff' });
  if (withCoupon) builder.setCoupons(['ten']);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor + 101 });
  return builder.getSnapshot();
}

// Lines B and C are priced in the other tax mode when `converted` (ADR-038 amendment). Fees and shipping need order.create v5.
function plainSale(pricesIncludeTax: boolean, rounding: TaxRounding | undefined, converted: boolean, charges: boolean) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 82500, pricesIncludeTax, ...(rounding ? { rounding } : {}) } });
  const other = converted ? { taxInclusive: !pricesIncludeTax } : {};
  const a = builder.addLine({ productId: 'p1', name: 'A', sku: 'A', unitPrice: { amount: 451, currency: 'USD' }, quantity: 3 });
  builder.addLine({ productId: 'p2', name: 'B', sku: 'B', unitPrice: { amount: 307, currency: 'USD', ...other }, quantity: 2 });
  builder.addLine({ productId: 'p3', name: 'C', sku: 'C', unitPrice: { amount: 999, currency: 'USD', ...other } });
  builder.applyLineDiscount(a, { type: 'fixed', value: 41, label: 'Dent' });
  builder.applyOrderDiscount({ type: 'percentage', value: 13, label: 'Staff' });
  if (charges) {
    builder.addFee({ name: 'Bag', amountMinor: 23 });
    builder.addShipping({ name: 'Courier', amountMinor: 650 });
  }
  builder.addPayment({ method: 'external', amountMinor: 500, reference: 'r1' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor - 500 });
  return builder.getSnapshot();
}

const lineFigures = (receipt: ReceiptData) => receipt.lineItems.map(({ lineTotalMinor, discountMinor, displayAmountMinor }) =>
  ({ lineTotalMinor, discountMinor, displayAmountMinor }));
const roundings: Array<TaxRounding | undefined> = [undefined, { granularity: 'per_line_items', mode: 'half_up' },
  { granularity: 'per_rate_group_items', mode: 'half_away_from_zero' }];
const modes = [false, true].flatMap((inc) => roundings.map((rounding) => [inc, rounding] as const));

describe('reprint receipt data with converted lines, tax labels and coupons', () => {
  it.each(modes.flatMap(([inc, rounding]) => [3, 6].flatMap((orderCreate) => [false, true].map((converted) =>
    [inc, rounding?.granularity ?? 'default', orderCreate, converted, rounding] as const))))(
    'matches buildReceiptData (inclusive: %s, rounding: %s, order.create v%s, converted: %s)', (inc, _name, orderCreate, converted, rounding) => {
      const order = plainSale(inc, rounding, converted, orderCreate >= 5);
      const posOrder = finalizeOrder(order, { capabilities: { orderCreate } });
      const original = buildReceiptData(order, plainConfig);
      const reprint = buildReceiptDataFromPosOrder(posOrder, plainConfig);
      expect(lineFigures(reprint)).toEqual(lineFigures(original));
      expect(reprint.totals).toEqual(original.totals);
      expect(reprint.totals.taxLines.map((row) => row.label)).toEqual(['Tax 8.25%']);
      // A stored order keeps the order discount only in the display mode, so with converted lines that is the row.
      expect(total(reprint.discounts)).toBe(converted ? posOrder.display!.orderDiscountMinor : total(original.discounts));
    },
  );

  it('labels the tax rows as buildReceiptData does without config.taxLabels', () => {
    const order = plainSale(false, undefined, false, false);
    const reprint = buildReceiptDataFromPosOrder(finalizeOrder(order, { capabilities: { orderCreate: 3 } }), plainConfig);
    expect(reprint.totals.taxLines.map((row) => row.label)).toEqual(['Tax 8.25%']);
    expect(reprint.totals.taxLines.map((row) => row.label)).toEqual(buildReceiptData(order, plainConfig).totals.taxLines.map((row) => row.label));
  });

  it.each([false, true])('lists the order discount, not the coupons, on a WooCommerce sale with a coupon (inclusive: %s)', (inc) => {
    for (const roundAtSubtotal of [false, true]) {
      const order = wooSale(inc, roundAtSubtotal, true);
      expect(order.coupons?.map((coupon) => coupon.code)).toEqual(['ten']);
      const original = buildReceiptData(order, plainConfig);
      const reprint = buildReceiptDataFromPosOrder(finalizeOrder(order, { capabilities: { orderCreate: 6 } }), plainConfig);
      expect(total(reprint.discounts), `roundAtSubtotal: ${roundAtSubtotal}`).toBe(total(original.discounts));
      expect(reprint.discounts.map((row) => row.label)).not.toContain('ten');
    }
  });

  it.each([false, true])('adds up the totals of a converted sale finalized below order.create v3 (inclusive: %s)', (inc) => {
    const order = plainSale(inc, undefined, true, false);
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 2 } });
    expect(posOrder.display).toBeUndefined();
    const { totals, fees, shipping, lineItems } = buildReceiptDataFromPosOrder(posOrder, plainConfig);
    expect(totals.subtotalMinor - totals.discountMinor + (inc ? 0 : total(totals.taxLines)) + total(fees) + total(shipping)).toBe(totals.totalMinor);
    const original = buildReceiptData(order, plainConfig);
    for (const index of [1, 2]) expect(lineItems[index]!.lineTotalMinor).toBe(original.lineItems[index]!.lineTotalMinor);
  });
});

// The WooCommerce connector's mapping of order 136 (WCPOS 1.10.20's recorded push response), written out by hand.
const order136: StoreOrder = {
  id: '136', reference: '136', clientOrderId: '3f7fa644-9d6d-40d5-800f-3eb18eea2203', status: 'completed',
  placedAt: '2026-10-06T04:54:03.000Z', currency: 'USD', pricesIncludeTax: false, customer: null,
  lines: [
    { id: '20', clientLineId: '0d652d8c-ce3b-40c4-b1cf-a747261b5eb8', productId: '80', variantId: '80', name: 'Espresso', sku: 'COF-ESP',
      quantity: 3, subtotalMinor: 900, subtotalTaxMinor: 97, totalMinor: 900, taxMinor: 97 },
    { id: '21', clientLineId: '01828a6a-7161-4e54-b1e1-da83aa2f7774', productId: '86', variantId: '86', name: 'Croissant', sku: 'BAK-CRO',
      quantity: 1, subtotalMinor: 350, subtotalTaxMinor: 19, totalMinor: 350, taxMinor: 19 },
    { id: '22', clientLineId: '323bdf7b-0088-4bca-9a3b-b0a6dff9525c', productId: '96', variantId: '96', name: 'Tote Bag', sku: 'MER-TOT',
      quantity: 1, subtotalMinor: 1500, subtotalTaxMinor: 0, totalMinor: 1500, taxMinor: 0 },
    { id: '23', clientLineId: '53453090-ea72-4fe0-b546-f211df03a2d4', productId: '90', variantId: '90', name: 'Banana Bread', sku: 'BAK-BAN',
      quantity: 1, subtotalMinor: 425, subtotalTaxMinor: 0, totalMinor: 425, taxMinor: 0 },
  ],
  fees: [], shipping: [], coupons: [],
  taxLines: [
    { label: 'CA State', code: 'US-CA-CA STATE-1', ratePpm: 72500, amountMinor: 65 },
    { label: 'SF District', code: 'US-CA-SF DISTRICT-2', ratePpm: 13750, amountMinor: 12 },
    { label: 'Compound Test', code: 'US-CA-COMPOUND TEST-3', ratePpm: 20000, amountMinor: 20 },
    { label: 'CA Reduced', code: 'US-CA-CA REDUCED-1', ratePpm: 55000, amountMinor: 19 },
    { label: 'Zero', code: 'US-CA-ZERO-1', ratePpm: 0, amountMinor: 0 },
  ],
  discountMinor: 0, discountTaxMinor: 0, taxMinor: 116, totalMinor: 3291,
  payments: [{ method: 'pos_cash', title: 'Cash', kind: 'cash', amountMinor: 3291 }],
  refunds: [],
};

describe('reprint receipt data from a StoreOrder', () => {
  it('builds from a StoreOrder, exclusive', () => {
    const receipt = buildReceiptDataFromStoreOrder(order136, config);
    expect(receipt.header).toStrictEqual({
      storeName: 'Test Coffee Shop', storeAddress: '123 Main St', cashier: 'Bob', register: 'POS-1',
      orderNumber: '136', date: '2026-10-06T04:54:03.000Z',
    });
    expect(receipt.footer).toStrictEqual({ barcode: '136' });
    expect(receipt.currency).toBe('USD');
    expect(receipt.lineItems[0]).toStrictEqual({
      name: 'Espresso', sku: 'COF-ESP', quantity: 3, unitPriceMinor: 300, lineTotalMinor: 900, displayAmountMinor: 900, displayDiscounts: [],
    });
    expect(receipt.lineItems.map((line) => line.displayAmountMinor)).toEqual([900, 350, 1500, 425]);
    expect(receipt.discounts).toEqual([]);
    expect(receipt.fees).toEqual([]);
    expect(receipt.shipping).toEqual([]);
    expect(receipt.orderDiscountMinor).toBe(0);
    expect(receipt.totals).toStrictEqual({
      taxInclusive: false, subtotalMinor: 3175, discountMinor: 0, taxLines: order136.taxLines, taxMinor: 116, totalMinor: 3291,
    });
    const { totals } = receipt;
    expect(totals.subtotalMinor - totals.discountMinor + total(receipt.fees) + total(receipt.shipping) + total(totals.taxLines))
      .toBe(totals.totalMinor);
    expect(receipt.payments).toStrictEqual([{ method: 'cash', amountMinor: 3291 }]);
    expect(receipt.changeDueMinor).toBe(0);
    expect(receipt.fiscal).toStrictEqual({ document_type: 'sale', is_reprint: true, reprint_count: 1, qr_payload: '' });
    expect(receipt.register).toStrictEqual({ id: 'POS-1', name: 'Front till' });
  });

  it('builds from a StoreOrder, inclusive', () => {
    const order: StoreOrder = {
      ...order136,
      pricesIncludeTax: true,
      customer: { id: '5', email: 'ada@example.com' },
      lines: [
        { ...order136.lines[0]!, subtotalMinor: 900, subtotalTaxMinor: 90, totalMinor: 800, taxMinor: 80 },
        { id: '24', name: 'Gift', quantity: 0, subtotalMinor: 0, subtotalTaxMinor: 0, totalMinor: 0, taxMinor: 0 },
      ],
      coupons: [{ code: 'save5', discountMinor: 100, discountTaxMinor: 10 }],
      fees: [{ name: 'Loyalty', totalMinor: -100, taxMinor: 0 }],
      shipping: [{ name: 'Delivery', totalMinor: 400, taxMinor: 40 }],
      taxLines: [{ label: 'VAT', ratePpm: 100000, amountMinor: 120 }],
      discountMinor: 100, discountTaxMinor: 10, taxMinor: 120, totalMinor: 1220,
      payments: [{ method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 1220 }, { method: 'bacs', title: 'Bank', amountMinor: 0 },
        { method: 'cod', amountMinor: 0 }],
    };
    const receipt = buildReceiptDataFromStoreOrder(order, config);
    expect(receipt.header.customer).toBe('ada@example.com');
    expect(receipt.lineItems).toStrictEqual([
      { name: 'Espresso', sku: 'COF-ESP', quantity: 3, unitPriceMinor: 330, lineTotalMinor: 880, discountMinor: 110,
        displayAmountMinor: 990, displayDiscounts: [{ label: 'Discount', amountMinor: 110 }] },
      { name: 'Gift', sku: '', quantity: 0, unitPriceMinor: 0, lineTotalMinor: 0, displayAmountMinor: 0, displayDiscounts: [] },
    ]);
    expect(receipt.discounts).toStrictEqual([{ label: 'save5', amountMinor: 110 }]);
    expect(receipt.fees).toStrictEqual([{ name: 'Loyalty', amountMinor: -100 }]);
    expect(receipt.shipping).toStrictEqual([{ name: 'Delivery', amountMinor: 440 }]);
    expect(receipt.orderDiscountMinor).toBe(0);
    expect(receipt.totals).toStrictEqual({
      taxInclusive: true, subtotalMinor: 990, discountMinor: 110, taxLines: [{ label: 'VAT', ratePpm: 100000, amountMinor: 120 }],
      taxMinor: 120, totalMinor: 1220,
    });
    const { totals } = receipt;
    expect(totals.subtotalMinor - totals.discountMinor + total(receipt.fees) + total(receipt.shipping)).toBe(totals.totalMinor);
    expect(receipt.payments).toStrictEqual([
      { method: 'external', amountMinor: 1220 }, { method: 'Bank', amountMinor: 0 }, { method: 'cod', amountMinor: 0 },
    ]);
    expect(receipt.changeDueMinor).toBe(0);
    expect(receipt.fiscal).toMatchObject({ is_reprint: true, reprint_count: 1 });
  });
});
