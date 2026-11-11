import { describe, expect, it } from 'vitest';
import { minorUnitDigits, type StoreOrder, type TaxRounding } from '@tallyui/core';
import { couponPricingBasis, createOrderBuilder } from '../../order/order-builder';
import type { Order } from '../../order/types';
import { finalizeOrder } from '../../pos-order/finalize';
import type { PosOrder } from '../../pos-order/types';
import { buildReceiptData } from '../../receipt/build-receipt-data';
import { buildReceiptDataFromPosOrder, buildReceiptDataFromStoreOrder } from '../../receipt/reprint';
import type { ReceiptConfig, ReceiptData } from '../../receipt/types';
import { roundMicrosToMinor } from '../../tax/exact';
import { wcposReceiptData } from './build';
import { wcposReceiptContext } from './context';
import { formatWcposReceiptData } from './format';
import { wcposSourceFromPosOrder, wcposSourceFromSentOrder, wcposSourceFromStoreOrder } from './from-orders';
import type { WcposReceiptSource } from './types';

const plain: ReceiptConfig = { storeName: 'S' };
const at = new Date('2026-11-01T10:00:00.000Z');
const sum = (amounts: number[]) => amounts.reduce((total, amount) => total + amount, 0);

function wcpos(source: WcposReceiptSource, config: ReceiptConfig = plain) {
  const { store, options } = wcposReceiptContext(config, { pricesIncludeTax: source.pricesIncludeTax }, () => at);
  return formatWcposReceiptData(wcposReceiptData(source, store, options));
}
type View = ReturnType<typeof wcpos>;
/** The totals the receipt prints, display side; `total` is the grand total (`total_incl`). */
const figures = ({ totals: t }: View) => ({
  total: t.total_incl, subtotal: t.subtotal, tax_total: t.tax_total, discount_total: t.discount_total,
  paid_total: t.paid_total, change_total: t.change_total,
});
function oracle(receipt: ReceiptData) {
  const major = (minor: number) => Math.round(minor) / 10 ** minorUnitDigits(receipt.currency);
  return {
    total: major(receipt.totals.totalMinor), subtotal: major(receipt.totals.subtotalMinor), tax_total: major(receipt.totals.taxMinor),
    discount_total: major(receipt.totals.discountMinor), paid_total: major(sum(receipt.payments.map((p) => p.amountMinor))),
    change_total: major(receipt.changeDueMinor),
  };
}

const finalize = (order: Order, orderCreate = 6) => finalizeOrder(order, { capabilities: { orderCreate } });
/** Both till lanes against TallyUI's own receipt for the same sale; returns the stored order and both views. */
function expectOracle(order: Order,config: ReceiptConfig = plain, orderCreate = 6) {
  const posOrder = finalize(order, orderCreate);
  const sent = wcpos(wcposSourceFromSentOrder(order, config), config);
  const pos = wcpos(wcposSourceFromPosOrder(posOrder, config), config);
  expect(figures(sent), 'SentOrder').toEqual(oracle(buildReceiptData(order, config)));
  expect(figures(pos), 'PosOrder').toEqual(oracle(buildReceiptDataFromPosOrder(posOrder, config)));
  return { posOrder, sent, pos };
}

// Line A carries two rates; the fee and shipping take the class rate, which has its own code.
function twoRateSale(pricesIncludeTax: boolean, rounding?: TaxRounding, shared = false) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: {
    getTaxRatePpm: () => 82500, getTaxRateCode: () => 'STD', pricesIncludeTax, ...(rounding ? { rounding } : {}),
  } });
  const a = builder.addLine({ productId: 'p1', name: 'A', sku: 'A', unitPrice: { amount: 451, currency: 'USD' }, quantity: 3,
    taxRates: [{ code: 'STATE', ratePpm: 62500 }, { code: 'CITY', ratePpm: 20000 }] });
  builder.addLine({ productId: 'p2', name: 'B', sku: 'B', unitPrice: { amount: 307, currency: 'USD' }, quantity: 2,
    taxRates: [{ code: shared ? 'STATE' : 'COUNTY', ratePpm: shared ? 40000 : 62500 }] });
  builder.applyLineDiscount(a, { type: 'fixed', value: 41, label: 'Dent' });
  builder.applyOrderDiscount({ type: 'percentage', value: 13, label: 'Staff' });
  builder.addFee({ name: 'Bag', amountMinor: 23 });
  builder.addShipping({ name: 'Courier', amountMinor: 650 });
  builder.addPayment({ method: 'external', amountMinor: 500, reference: 'r1' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor - 500 + 37 });
  return builder.getSnapshot();
}

// The reprint tests' WooCommerce sale; `converted` adds a line priced in the other tax mode.
function wooSale(pricesIncludeTax: boolean, roundAtSubtotal: boolean, converted = false) {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal }, getTaxRatePpm: () => 200000,
    getTaxRates: () => [{ id: 1, code: 'VAT', label: 'VAT', rate: '20.0000', priority: 1, compound: false, shipping: true }],
  } });
  const a = builder.addLine({ productId: '11', name: 'Tea', sku: 'TEA', unitPrice: { amount: 333, currency: 'GBP' }, quantity: 3 });
  builder.addLine({ productId: '12', name: 'Cake', sku: 'CAKE', unitPrice: { amount: 457, currency: 'GBP' } });
  if (converted) {
    builder.addLine({ productId: '13', name: 'Jam', sku: 'JAM', unitPrice: { amount: 611, currency: 'GBP', taxInclusive: !pricesIncludeTax } });
  }
  builder.applyLineDiscount(a, { type: 'fixed', value: 37, label: 'Dent' });
  builder.applyOrderDiscount({ type: 'percentage', value: 7, label: 'Staff' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor + 101 });
  return builder.getSnapshot();
}

// The reprint tests' converted sale: lines B and C are priced in the other tax mode.
function convertedSale(pricesIncludeTax: boolean) {
  const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 82500, pricesIncludeTax } });
  const other = { taxInclusive: !pricesIncludeTax };
  const a = builder.addLine({ productId: 'p1', name: 'A', sku: 'A', unitPrice: { amount: 451, currency: 'USD' }, quantity: 3 });
  builder.addLine({ productId: 'p2', name: 'B', sku: 'B', unitPrice: { amount: 307, currency: 'USD', ...other }, quantity: 2 });
  builder.addLine({ productId: 'p3', name: 'C', sku: 'C', unitPrice: { amount: 999, currency: 'USD', ...other } });
  builder.applyLineDiscount(a, { type: 'fixed', value: 41, label: 'Dent' });
  builder.applyOrderDiscount({ type: 'percentage', value: 13, label: 'Staff' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  return builder.getSnapshot();
}

describe('WCPOS receipt sources match TallyUI\'s receipt', () => {
  it.each([undefined, { granularity: 'per_line_items', mode: 'half_up' } as const])('tax-exclusive, two rates on one line (rounding: %o)', (rounding) => {
    const { sent } = expectOracle(twoRateSale(false, rounding));
    expect(sent.lines[0]!.taxes.map((tax) => tax.code)).toEqual(['STATE', 'CITY']);
    expect(sent.tax_summary.map((row) => row.code)).toEqual(['STATE', 'CITY', 'COUNTY', 'STD']);
  });

  it('tax-inclusive', () => {
    expectOracle(twoRateSale(true));
  });

  it.each([false, true])('WooCommerce granularity (inclusive: %s)', (inc) => {
    for (const roundAtSubtotal of [false, true]) {
      const { posOrder } = expectOracle(wooSale(inc, roundAtSubtotal));
      expect(posOrder.lines.every((line) => line.netMicros !== undefined)).toBe(true);
    }
  });

  it.each([false, true])('a WooCommerce line priced in the other mode keeps WooCommerce\'s figures (inclusive: %s)', (inc) => {
    const order = wooSale(inc, false, true);
    expect(order.lineItems[2]).toMatchObject({ taxInclusive: !inc, priceTaxModeConverted: expect.any(String) });
    const { sent, pos } = expectOracle(order);
    for (const view of [sent, pos]) {
      expect(view.lines[2]!.line_total_excl).toBe(order.lineItems[2]!.netMinor / 100);
      expect(view.lines[2]!.line_total_incl).toBe(order.lineItems[2]!.totalMinor! / 100);
    }
  });

  it.each([false, true])('converted lines take their running tax share (inclusive: %s)', (inc) => {
    expectOracle(convertedSale(inc), plain, 3);
  });

  it('a converted line\'s share is a cent off a naive per-line round', () => {
    // A's tax is 8.25; B's, inclusive, is 8.383. Their running sum rounds to 17, so B's share is 9, where B alone rounds to 8.
    const builder = createOrderBuilder({ currency: 'USD', taxContext: { getTaxRatePpm: () => 82500, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'A', sku: 'A', unitPrice: { amount: 100, currency: 'USD' } });
    builder.addLine({ productId: 'p2', name: 'B', sku: 'B', unitPrice: { amount: 110, currency: 'USD', taxInclusive: true } });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = builder.getSnapshot();
    expect(roundMicrosToMinor(BigInt(order.lineItems[1]!.taxMicros))).toBe(8);
    const { sent, pos } = expectOracle(order);
    for (const view of [sent, pos]) expect(view.lines.map((line) => line.line_total_excl)).toEqual([1, 1.01]);
  });
});

// The reprint tests' order 136 cut to two rates, and an inclusive order with one rate and a coupon.
const twoRows: StoreOrder = {
  id: '136', reference: '136', clientOrderId: 'c-136', status: 'completed', placedAt: '2026-10-06T04:54:03.000Z', currency: 'USD',
  pricesIncludeTax: false, customer: null,
  lines: [
    { id: '20', name: 'Espresso', sku: 'COF-ESP', quantity: 3, subtotalMinor: 900, subtotalTaxMinor: 97, totalMinor: 900, taxMinor: 97 },
    { id: '21', name: 'Croissant', sku: 'BAK-CRO', quantity: 1, subtotalMinor: 350, subtotalTaxMinor: 19, totalMinor: 350, taxMinor: 19 },
  ],
  fees: [], shipping: [], coupons: [],
  taxLines: [
    { label: 'CA State', code: 'US-CA-CA STATE-1', ratePpm: 72500, amountMinor: 97 },
    { label: 'CA Reduced', code: 'US-CA-CA REDUCED-1', ratePpm: 55000, amountMinor: 19 },
  ],
  discountMinor: 0, discountTaxMinor: 0, taxMinor: 116, totalMinor: 1366,
  payments: [{ method: 'pos_cash', title: 'Cash', kind: 'cash', amountMinor: 1366 }], refunds: [],
};
const oneRow: StoreOrder = {
  ...twoRows, pricesIncludeTax: true, customer: { id: '5', name: 'Ada Lovelace', email: 'ada@example.com' },
  lines: [{ id: '20', name: 'Espresso', sku: 'COF-ESP', quantity: 3, subtotalMinor: 900, subtotalTaxMinor: 90, totalMinor: 800, taxMinor: 80 }],
  coupons: [{ code: 'save5', discountMinor: 100, discountTaxMinor: 10 }],
  shipping: [{ name: 'Delivery', totalMinor: 400, taxMinor: 40 }],
  taxLines: [{ label: 'VAT', code: 'VAT', ratePpm: 100000, amountMinor: 120 }],
  discountMinor: 100, discountTaxMinor: 10, taxMinor: 120, totalMinor: 1320,
  payments: [{ method: 'pos_card', title: 'Card', kind: 'external', amountMinor: 1320 }],
};

describe('a StoreOrder', () => {
  it('fills line taxes from its one tax row', () => {
    const view = wcpos(wcposSourceFromStoreOrder(oneRow, plain));
    expect(figures(view)).toEqual(oracle(buildReceiptDataFromStoreOrder(oneRow, plain)));
    expect(view.lines[0]!.taxes).toEqual([expect.objectContaining({ code: 'VAT', amount: 0.8 })]);
    expect(view.tax_summary).toEqual([expect.objectContaining({ code: 'VAT', tax_amount: 1.2, taxable_amount_excl: 8 })]);
    expect(view.customer).toMatchObject({ name: 'Ada Lovelace', first_name: 'Ada Lovelace', phone: '' });
    expect(view.order).toMatchObject({ wc_status: 'completed', needs_payment: false });
  });

  it('leaves line taxes out with two tax rows', () => {
    const view = wcpos(wcposSourceFromStoreOrder(twoRows, plain));
    expect(figures(view)).toEqual(oracle(buildReceiptDataFromStoreOrder(twoRows, plain)));
    expect(view.lines.map((line) => line.taxes)).toEqual([[], []]);
    expect(view.tax_summary.map((row) => [row.code, row.taxable_amount_excl])).toEqual([['US-CA-CA STATE-1', null], ['US-CA-CA REDUCED-1', null]]);
  });
});

describe('till orders', () => {
  it('lists a store-priced coupon once, outside discount_total', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: { getTaxRatePpm: () => 200000, pricesIncludeTax: false } });
    const line = builder.addLine({ productId: 'p1', name: 'P', unitPrice: { amount: 1000, currency: 'GBP' } });
    builder.setCoupons(['save'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
      priced: new Map([['save', { couponId: 'c1', lines: [{ lineId: line, amountMinor: 300 }] }]]) });
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = builder.getSnapshot();
    const { sent, pos } = expectOracle(order);
    for (const view of [sent, pos]) {
      expect(view.discounts.map((row) => [row.label, row.total])).toEqual([['save', 3]]);
      expect(view.totals.discount_total).toBe(3);
    }
  });

  it.each([false, true])('a cash sale with change: paid - change = total (inclusive: %s)', (inc) => {
    const order = twoRateSale(inc);
    expect(order.changeDueMinor).toBe(37);
    const { sent, pos } = expectOracle(order);
    for (const view of [sent, pos]) {
      expect(view.totals.change_total).toBe(0.37);
      expect(Math.round((view.totals.paid_total - view.totals.change_total) * 100)).toBe(Math.round(view.totals.total_incl * 100));
    }
  });

  it('the SentOrder and its PosOrder reprint give the same data, apart from print_count', () => {
    const order = twoRateSale(false);
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 6 }, now: new Date(order.createdAt), newId: () => order.id });
    const config: ReceiptConfig = { ...plain, cashier: 'Bob', register: 'POS-1', registerName: 'Front till' };
    const sent = wcpos(wcposSourceFromSentOrder(order, config), config);
    const pos = wcpos(wcposSourceFromPosOrder(posOrder, config), { ...config, fiscal: { reprint_count: 1 } });
    expect(pos.fiscal).toMatchObject({ is_reprint: true, reprint_count: 1 });
    expect(sent.fiscal).toMatchObject({ is_reprint: false, reprint_count: 0 });
    // A SentOrder cash leg keeps no tendered or change of its own; the stored leg does.
    const legs = (view: View) => view.payments.map(({ tendered: _t, tendered_display: _td, change: _c, change_display: _cd, ...rest }) => rest);
    const rest = (view: View) => ({ ...view, fiscal: { ...view.fiscal, is_reprint: false, reprint_count: 0 }, payments: legs(view) });
    expect(rest(pos)).toEqual(rest(sent));
  });

  it.each(['sent', 'pos'] as const)('a %s order is completed and shows its payments', (kind) => {
    const order = twoRateSale(false);
    const view = wcpos(kind === 'sent' ? wcposSourceFromSentOrder(order, plain) : wcposSourceFromPosOrder(finalize(order), plain));
    expect(view.order).toMatchObject({ wc_status: 'completed', needs_payment: false });
    expect(view.payments.map((p) => [p.method_title, p.amount])).toEqual([['Card terminal', 5], ['Cash', order.totalMinor / 100 - 5 + 0.37]]);
    if (kind === 'pos') expect(view.payments[1]).toMatchObject({ tendered: order.totalMinor / 100 - 5 + 0.37, change: 0.37 });
  });
});

describe('the tax key', () => {
  it('is the plain code when every rate has its own', () => {
    const source = wcposSourceFromSentOrder(twoRateSale(false), plain);
    expect(source.taxLines.map((row) => row.rateId)).toEqual(['STATE', 'CITY', 'COUNTY', 'STD']);
    expect(source.lines[0]!.taxes!.map((tax) => tax.rateId)).toEqual(['STATE', 'CITY']);
  });

  it('is [code, ratePpm] on both sides when two rates share a code', () => {
    const order = twoRateSale(false, undefined, true);
    const { sent, pos } = expectOracle(order);
    const lines = order.lineItems.map((li) => li.netMinor);
    const charges = sum([...order.fees ?? [], ...order.shipping ?? []].map((charge) => charge.netMinor));
    for (const view of [sent, pos]) {
      expect(view.lines.map((line) => line.taxes.map((tax) => tax.code)))
        .toEqual([['["STATE",62500]', '["CITY",20000]'], ['["STATE",40000]']]);
      expect(view.tax_summary.map((row) => [row.code, row.taxable_amount_excl])).toEqual([
        ['["STATE",62500]', lines[0]! / 100], ['["CITY",20000]', lines[0]! / 100], ['["STATE",40000]', lines[1]! / 100],
        ['["STD",82500]', charges / 100],
      ]);
    }
  });
});

describe('PosOrder tax labels', () => {
  const stored = (): PosOrder => finalize(convertedSale(false), 6);
  it('takes config.taxLabels, then Tax n%', () => {
    expect(stored().taxByRate?.[0]).not.toHaveProperty('label');
    const labelled = wcpos(wcposSourceFromPosOrder(stored(), { ...plain, taxLabels: { 82500: 'Sales tax' } }));
    expect(labelled.tax_summary.map((row) => row.label)).toEqual(['Sales tax']);
    const withRate = { ...stored(), taxByRate: stored().taxByRate!.map((row) => ({ ...row, ratePpm: 100000 })) };
    expect(wcpos(wcposSourceFromPosOrder(withRate, plain)).tax_summary.map((row) => row.label)).toEqual(['Tax 10%']);
  });
});
