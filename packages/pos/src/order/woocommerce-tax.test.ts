import { createElement, type ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ProductTraits, StoreSettings } from '@tallyui/core';
import { taxProviderProps } from '../store-settings/map-store-settings';
import { TaxProvider, useTax } from '../tax/tax-provider';
import { taxLinesByRate } from '../tax/exact';
import type { TaxContext, WooRate } from '../tax/types';
import { finalizeOrder } from '../pos-order/finalize';
import { buildReceiptData } from '../receipt/build-receipt-data';
import { createOrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order } from './types';

const rate = (id: number, percent: string, extra: Partial<WooRate> = {}): WooRate => ({
  id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound: false, shipping: true, ...extra,
});
const rates136 = {
  standard: [rate(1, '7.2500'), rate(2, '1.3750'), rate(4, '2.0000', { compound: true, shipping: false })],
  'reduced-rate': [rate(3, '5.5000', { shipping: false })],
  'zero-rate': [rate(5, '0.0000', { shipping: false })],
};
function context(rates: Record<string, WooRate[]>, pricesIncludeTax = false, roundAtSubtotal = false): TaxContext {
  return {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal },
    getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
    getTaxRates: (taxClass, options) => (rates[taxClass || 'standard'] ?? []).filter((rate) => !options?.shipping || rate.shipping),
  };
}
function make(rates = [rate(1, '20.0000')], inclusive = false, subtotal = false, currency = 'GBP') {
  return createOrderBuilder({ currency, taxContext: context({ standard: rates }, inclusive, subtotal) });
}
function add(builder: ReturnType<typeof make>, amount: number, productId = 'p', quantity = 1, taxClass?: string) {
  return builder.addLine({ productId, name: productId, unitPrice: { amount, currency: builder.getSnapshot().currency }, quantity, taxClass });
}
function displayIdentity(order: Order) {
  const d = order.display;
  expect(d.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(d.subtotalMinor);
  expect(d.subtotalMinor - d.discountMinor + [...(d.fees ?? []), ...(d.shipping ?? [])].reduce((sum, row) => sum + row.amountMinor, 0)
    + (d.taxInclusive ? 0 : d.taxMinor)).toBe(order.totalMinor);
}
function grouped(order: Order) {
  return taxLinesByRate([...order.lineItems, ...[...(order.fees ?? []), ...(order.shipping ?? [])].map((line) =>
    ({ ...line, taxInclusive: order.pricesIncludeTax }))], order.taxMinor, undefined, order.taxRounding);
}

describe('ADR-076 WooCommerce builder strategy', () => {
  it('adds a product with no WooCommerce tax when its trait returns none', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: context(rates136) });
    const product = { id: 'Banana Bread' };
    const traits = {
      getId: (doc: { id: string }) => doc.id, getName: (doc: { id: string }) => doc.id,
      getSku: () => undefined, getImageUrl: () => undefined, isSellable: () => true,
      getPrices: () => [{ amount: 425, currency: 'USD', kind: 'base' }], getTaxClass: () => '',
      getTaxStatus: (doc: typeof product, variantId?: string) => {
        expect(doc).toBe(product);
        expect(variantId).toBeUndefined();
        return 'none';
      },
    } as unknown as ProductTraits;
    builder.addProduct(product, traits);
    const order = builder.getSnapshot();
    expect(order.lineItems[0]).toMatchObject({ taxStatus: 'none', taxLines: [], taxMicros: '0' });
    expect(order).toMatchObject({ subtotalMinor: 425, taxMinor: 0, totalMinor: 425 });
    displayIdentity(order);
  });

  it('matches WooCommerce order #136, including compound precision, exemption and the zero row', () => {
    const builder = createOrderBuilder({ currency: 'USD', taxContext: context(rates136) });
    const traits = {
      getId: (doc: { id: string }) => doc.id, getName: (doc: { id: string }) => doc.id,
      getSku: () => undefined, getImageUrl: () => undefined, isSellable: () => true,
      getPrices: () => [{ amount: 300, currency: 'USD', kind: 'base' }], getTaxClass: () => '',
    } as unknown as ProductTraits;
    builder.addProduct({ id: 'Espresso' }, traits, { quantity: 3 });
    add(builder, 350, 'Croissant', 1, 'reduced-rate');
    add(builder, 1500, 'Tote Bag', 1, 'zero-rate');
    builder.addLine({ productId: 'Banana Bread', name: 'Banana Bread', unitPrice: { amount: 425, currency: 'USD' }, taxStatus: 'none' });
    const order = builder.getSnapshot();
    expect(order.lineItems[0].taxLines).toStrictEqual([
      { code: 'rate-1', rateId: 1, compound: false, ratePpm: 72500, taxMicros: '65250000' },
      { code: 'rate-2', rateId: 2, compound: false, ratePpm: 13750, taxMicros: '12375000' },
      { code: 'rate-4', rateId: 4, compound: true, ratePpm: 20000, taxMicros: '19552500' },
    ]);
    expect(order).toMatchObject({ subtotalMinor: 3175, taxMinor: 116, totalMinor: 3291 });
    expect(order.lineItems[2].taxLines).toEqual([{ code: 'rate-5', rateId: 5, compound: false, ratePpm: 0, taxMicros: '0' }]);
    expect(order.lineItems[3].taxLines).toEqual([]);
    expect(grouped(order).map(({ code, amountMinor }) => [code, amountMinor])).toEqual([
      ['rate-1', 65], ['rate-2', 12], ['rate-4', 20], ['rate-3', 19], ['rate-5', 0],
    ]);
    displayIdentity(order);
  });

  it('matches the 3 × 9.99 GB VAT plus compound surcharge oracle, at subtotal', () => {
    const builder = make([rate(2, '2.0000', { compound: true }), rate(1, '20.0000')], false, true);
    add(builder, 999, 'Oracle widget', 3);
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ subtotalMinor: 2997, taxMinor: 671, totalMinor: 3668 });
    expect(order.lineItems[0].taxLines.map((tax) => [tax.rateId, tax.taxMicros])).toEqual([[1, '599400000'], [2, '71928000']]);
    expect(grouped(order).map((tax) => tax.amountMinor)).toEqual([599, 72]);
    displayIdentity(order);
  });

  it('re-derives inclusive 9.99 at 20% and rounds 1.665 HALF_DOWN per line', () => {
    const builder = make(undefined, true);
    add(builder, 999);
    const order = builder.getSnapshot();
    expect(order.lineItems[0]).toMatchObject({ netMinor: 833, netMicros: '832500000', taxMicros: '166500000', totalMinor: 999 });
    expect(order).toMatchObject({ taxMinor: 166, totalMinor: 999 });
    expect(grouped(order)[0].amountMinor).toBe(166);
    displayIdentity(order);
  });

  it('charges and displays 1.01 for 1.00 inclusive with two non-compound 5% rates', () => {
    const builder = make([rate(1, '5.0000'), rate(2, '5.0000')], true);
    add(builder, 100);
    const order = builder.getSnapshot();
    expect(order.lineItems[0]).toMatchObject({ netMinor: 91, totalMinor: 101 });
    expect(grouped(order).map((tax) => tax.amountMinor)).toEqual([5, 5]);
    expect(order).toMatchObject({ subtotalMinor: 91, taxMinor: 10, totalMinor: 101, display: { lines: [{ amountMinor: 101 }], totalMinor: 101 } });
    const receipt = buildReceiptData(order, { storeName: 'Till' });
    expect(receipt.lineItems[0]).toMatchObject({ lineTotalMinor: 101, displayAmountMinor: 101 });
    expect(receipt.totals.taxLines.map((tax) => tax.amountMinor)).toEqual([5, 5]);
    displayIdentity(order);
  });

  it('sums three inclusive 0.01 fees raw and assigns display residue to the last fee', () => {
    const builder = make(undefined, true);
    for (let i = 0; i < 3; i++) builder.addFee({ name: `Fee ${i}`, amountMinor: 1 });
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ subtotalMinor: 0, taxMinor: 0, totalMinor: 2 });
    expect(order.fees?.map((line) => line.netMicros)).toEqual(['833300', '833300', '833300']);
    expect(order.display.fees?.map((line) => line.amountMinor)).toEqual([1, 1, 0]);
    displayIdentity(order);
  });

  it.each([false, true])('keeps order-math rate grouping for three 0.0049 taxes (subtotal: %s)', (subtotal) => {
    const builder = make([rate(1, '49.0000')], false, subtotal);
    for (let i = 0; i < 3; i++) add(builder, 1, `p${i}`);
    const order = builder.getSnapshot();
    expect(order.lineItems.map((line) => line.taxMicros)).toEqual(['490000', '490000', '490000']);
    expect(order.taxMinor).toBe(subtotal ? 1 : 0);
    expect(grouped(order)[0].amountMinor).toBe(subtotal ? 1 : 0);
    expect(buildReceiptData(order, { storeName: 'Till' }).totals.taxLines[0].amountMinor).toBe(subtotal ? 1 : 0);
    displayIdentity(order);
  });

  it('taxes fees and uses only shipping rates for shipping, including updates', () => {
    const builder = make([rate(1, '20.0000'), rate(2, '2.0000', { compound: true, shipping: false })]);
    const fee = builder.addFee({ name: 'Fee', amountMinor: 100 });
    const shipping = builder.addShipping({ name: 'Post', amountMinor: 100, methodId: 'post' });
    expect(builder.getSnapshot()).toMatchObject({ subtotalMinor: 0, taxMinor: 42, totalMinor: 242 });
    expect(builder.getSnapshot().fees?.[0].taxLines.map((tax) => tax.rateId)).toEqual([1, 2]);
    expect(builder.getSnapshot().shipping?.[0].taxLines.map((tax) => tax.rateId)).toEqual([1]);
    builder.updateFee(fee, { amountMinor: 200 });
    builder.updateShipping(shipping, { amountMinor: 200 });
    expect(builder.getSnapshot()).toMatchObject({ taxMinor: 85, totalMinor: 485 });
    displayIdentity(builder.getSnapshot());
  });

  it('assigns either sign of residue to shipping before fees or products', () => {
    const builder = make(undefined, true);
    add(builder, 100);
    for (let i = 0; i < 3; i++) builder.addFee({ name: `Fee ${i}`, amountMinor: 1 });
    builder.addShipping({ name: 'Post', amountMinor: 1 });
    expect(builder.getSnapshot().display.fees?.map((row) => row.amountMinor)).toEqual([1, 1, 1]);
    expect(builder.getSnapshot().display.shipping?.[0].amountMinor).toBe(0);
    displayIdentity(builder.getSnapshot());
    const positive = make([rate(1, '300.0000')], true);
    for (let i = 0; i < 3; i++) positive.addFee({ name: `Fee ${i}`, amountMinor: 5 });
    positive.addShipping({ name: 'Post', amountMinor: 0 });
    expect(positive.getSnapshot()).toMatchObject({ taxMinor: 12, totalMinor: 16 });
    expect(positive.getSnapshot().display.shipping?.[0].amountMinor).toBe(1);
    displayIdentity(positive.getSnapshot());
  });

  it.each([['JPY', 0, 100, 20, 120], ['KWD', 3, 999, 200, 1199]] as const)('uses %s currency decimals', (currency, _dp, amount, tax, total) => {
    const builder = make(undefined, false, false, currency);
    add(builder, amount);
    expect(builder.getSnapshot()).toMatchObject({ taxMinor: tax, totalMinor: total });
    displayIdentity(builder.getSnapshot());
  });

  it('recalculates discounts, quantity and price without losing the class or raw net', () => {
    const builder = make(undefined, true);
    const id = add(builder, 1200);
    builder.applyLineDiscount(id, { type: 'percentage', value: 10 });
    builder.applyOrderDiscount({ type: 'fixed', value: 120 });
    expect(builder.getSnapshot()).toMatchObject({ subtotalMinor: 800, taxMinor: 160, totalMinor: 960 });
    builder.updateQuantity(id, 2);
    builder.setUnitPrice(id, 600);
    expect(builder.getSnapshot()).toMatchObject({ subtotalMinor: 800, taxMinor: 160, totalMinor: 960 });
    expect(builder.getSnapshot().display).toMatchObject({ subtotalMinor: 1200, discountMinor: 240 });
    displayIdentity(builder.getSnapshot());
  });

  it('passes the address-filtered class list through StoreSettings and TaxProvider', () => {
    const settings: StoreSettings = { currency: 'USD', pricesIncludeTax: false, taxRatesPpm: { default: 86250 },
      taxRates: rates136, taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false },
      taxRoundAtSubtotal: false, shippingTaxClass: 'standard', taxClassSlugs: ['reduced-rate', 'zero-rate'] };
    const wrapper = ({ children }: { children: ReactNode }) => createElement(TaxProvider, { ...taxProviderProps(settings), children });
    expect(taxProviderProps(settings)).toMatchObject({ taxRates: rates136, taxRoundAtSubtotal: false,
      shippingTaxClass: 'standard', taxClassSlugs: ['reduced-rate', 'zero-rate'] });
    const { result } = renderHook(() => useTax(), { wrapper });
    expect(result.current.getTaxRates?.()).toEqual(rates136.standard);
    expect(result.current.getTaxRates?.('')).toEqual(rates136.standard);
    expect(result.current.getTaxRates?.('standard', { shipping: true }).map((rate) => rate.id)).toEqual([1, 2]);
    expect(result.current.getTaxRates?.('reduced-rate')).toEqual(rates136['reduced-rate']);
    expect(result.current.getTaxRates?.('unknown')).toEqual([]);
    expect(result.current.getTaxRatePpm()).toBe(86250);
  });

  it('refuses finalization until pos_orders version 8 can store the strategy', () => {
    const builder = make();
    add(builder, 100);
    builder.addPayment({ method: 'cash', amountMinor: 120 });
    expect(() => finalizeOrder(builder.getSnapshot())).toThrow(
      'finalize: the woocommerce tax strategy needs pos_orders version 8, which this release does not store yet');
  });

  it('requires getTaxRates to activate the WooCommerce arithmetic', () => {
    const builder = createOrderBuilder({ currency: 'GBP', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 200000,
      rounding: { granularity: 'woocommerce', roundAtSubtotal: false } } });
    add(builder, 999);
    const order = builder.getSnapshot();
    expect(order).toMatchObject({ totalMinor: 999, taxMinor: 167 });
    expect(order.lineItems[0].netMicros).toBeUndefined();
    expect(buildReceiptData(order, { storeName: 'Till' }).lineItems[0].lineTotalMinor).toBe(999);
    displayIdentity(order);
  });

  it('keeps each class when a WooCommerce draft is restored', () => {
    const options = { currency: 'USD', taxContext: context(rates136) };
    const builder = createOrderBuilder(options);
    add(builder, 350, 'Croissant', 1, 'reduced-rate');
    add(builder, 1500, 'Tote Bag', 1, 'zero-rate');
    const saved = builder.getSnapshot();
    const restored = restoreOrderDraft(saved, options).getSnapshot();
    expect(restored.lineItems.map((line) => line.taxLines)).toEqual(saved.lineItems.map((line) => line.taxLines));
    expect(restored).toMatchObject({ subtotalMinor: saved.subtotalMinor, taxMinor: 19, totalMinor: 1869 });
    displayIdentity(restored);
  });
});
