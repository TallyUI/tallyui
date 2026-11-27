import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TaxContext, WooRate } from '../tax/types';
import { chargeOrderModeMinor, couponPricingBasis, createOrderBuilder, type OrderBuilder } from './order-builder';
import { restoreOrderDraft } from './order-drafts';
import type { Order } from './types';

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-27T12:00:00Z')); });
afterEach(() => { vi.useRealTimers(); });

const generic = (granularity: 'per_line_items' | 'per_order' = 'per_line_items', standard = 190000): TaxContext => ({
  pricesIncludeTax: false, rounding: { granularity, mode: 'half_up' }, getTaxRateCode: taxClass => taxClass,
  getTaxRatePpm: taxClass => taxClass === 'fee' ? 210000 : taxClass === 'post' ? 77000 : standard,
});
const rate = (id: number, percent: string): WooRate => ({
  id, code: `rate-${id}`, label: `Rate ${id}`, rate: percent, priority: id, compound: false, shipping: true,
});
const woo: TaxContext = {
  pricesIncludeTax: false, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, shippingTaxClass: 'inherit',
  getTaxRatePpm: () => { throw new Error('WooCommerce must use the rate list'); },
  getTaxRates: () => [rate(1, '10.0000')],
};
const price = (amount: number) => ({ amount, currency: 'EUR' });
const make = (taxContext: TaxContext, taxExempt?: true) => createOrderBuilder({ currency: 'EUR', taxContext, taxExempt });
const captured = { id: 'leg', method: 'cash', status: 'captured', amountMinor: 500 } as const;

it('G20 keeps the quoted fee net on rename and drops it on a price edit', () => {
  const builder = make(generic());
  const id = builder.addFee({ name: 'Bag', amountMinor: 1000, amountIncludesTax: true, taxClass: 'fee', exemptMinor: 826 });
  builder.setTaxExempt(true);
  expect(builder.getSnapshot().display.fees![0].amountMinor).toBe(826);
  builder.updateFee(id, { name: 'Tote' });
  expect(builder.getSnapshot().fees![0]).toMatchObject({ name: 'Tote', amountMinor: 826, exemptMinor: 826 });
  builder.updateFee(id, { amountMinor: 1210 });
  expect(builder.getSnapshot().display.fees![0].amountMinor).toBe(1000);
  expect(builder.getSnapshot().fees![0]).not.toHaveProperty('exemptMinor');
});

it.each([['G1', generic(), 902], ['G2', generic('per_order'), 902], ['G3', woo, 907]] as const)(
  '%s restores inclusive charges and their displayed figures on switch-off', (_, context, amountMinor) => {
    const builder = make(context), entry = { amountMinor, amountIncludesTax: true };
    builder.addLine({ productId: '1', name: 'Item', taxClass: 'standard', unitPrice: price(1000) });
    builder.addFee({ ...entry, name: 'Fee', taxClass: context === woo ? 'standard' : 'fee' });
    builder.addShipping({ ...entry, name: 'Post', taxClass: context === woo ? 'standard' : 'post' });
    const taxed = builder.getSnapshot();
    builder.setTaxExempt(true);
    builder.setTaxExempt(false);
    const restored = builder.getSnapshot();
    for (const key of ['fees', 'shipping'] as const) {
      expect(restored[key]).toMatchObject([entry]);
      expect(restored.display[key]).toEqual(taxed.display[key]);
    }
    expect(restored.totalMinor).toBe(taxed.totalMinor);
  });

function mixed(context: TaxContext, untaxed = false, taxExempt?: true) {
  const builder = make(context, taxExempt);
  const status = untaxed ? { taxStatus: 'none' as const } : {};
  const item = { name: 'Item', taxClass: 'standard', ...status };
  builder.addLine({ ...item, id: 'line', productId: '1', unitPrice: price(1000) });
  builder.addLine({ ...item, id: 'custom', productId: 'custom', custom: true, unitPrice: price(300) });
  if (context !== woo) builder.addLine({ ...item, id: 'given', productId: '2', unitPrice: price(500), taxRates: [{ code: 'given', ratePpm: 190000 }] });
  builder.addFee({ ...item, id: 'fee', amountMinor: 200 });
  builder.addShipping({ ...item, id: 'post', amountMinor: 103 });
  builder.applyLineDiscount('line', { id: 'discount', type: 'fixed', value: 70 });
  builder.applyOrderDiscount({ id: 'order-discount', type: 'fixed', value: 30 });
  return builder;
}

function charges(context: TaxContext) {
  const builder = make(context);
  builder.addLine({ productId: '1', name: 'Item', unitPrice: price(100) });
  builder.addFee({ name: 'Fee', amountMinor: 999, amountIncludesTax: true, taxClass: 'fee' });
  builder.addShipping({ name: 'Post', amountMinor: 999, amountIncludesTax: true, taxClass: 'post' });
  return builder;
}

function freeShipping() {
  const builder = make(woo);
  builder.addLine({ productId: '1', name: 'Item', unitPrice: price(100) });
  for (const name of ['A', 'B']) builder.addFee({ name, amountMinor: 5, amountIncludesTax: true });
  builder.addShipping({ name: 'Free', amountMinor: 0 });
  return builder;
}

function converted() {
  const builder = make(generic());
  builder.addLine({ productId: '1', name: 'Inclusive', unitPrice: { ...price(119), taxInclusive: true } });
  builder.addLine({ productId: '2', name: 'Exclusive', unitPrice: price(100) });
  return builder;
}

function storeCoupon(withFee: boolean, carried?: true) {
  const builder = make(generic('per_order'));
  const lineId = builder.addLine({ productId: '1', name: 'Item', unitPrice: price(100), taxClass: 'standard' });
  if (withFee) builder.addFee({ name: 'Fee', amountMinor: 999, amountIncludesTax: true, taxClass: 'fee' });
  builder.setCoupons(['save'], { kind: 'store-priced', carried, basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['save', { couponId: '1', lines: [{ lineId, amountMinor: withFee ? 4 : 30 }] }]]) });
  return builder;
}

function replay() {
  const builder = make(woo);
  builder.addLine({ productId: '1', name: 'Item', unitPrice: price(1000) });
  builder.setCoupons(['ten'], { configs: new Map([['ten', { discount_type: 'percent', amount: '10', limit_usage_to_x_items: null,
    product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
    couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false });
  return builder;
}

const amounts = (rows: { amountMinor: number }[] = []) => rows.map(row => row.amountMinor);
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
function displayIdentity(order: Order) {
  const display = order.display;
  const rounding = sum(order.cashRoundings?.map(entry => entry.minor) ?? []);
  const chargeSum = sum([...amounts(display.fees), ...amounts(display.shipping)]);
  expect(sum(amounts(display.lines))).toBe(display.subtotalMinor);
  expect(display.subtotalMinor - display.discountMinor + chargeSum + rounding).toBe(order.totalMinor);
  if (!order.lineItems.some(line => line.priceTaxModeConverted)) expect(sum(order.lineItems.map(line => line.netMinor))
    + sum([...(order.fees ?? []), ...(order.shipping ?? [])].map(charge => chargeOrderModeMinor(charge, false))) + rounding).toBe(order.totalMinor);
}

function checkExempt(order: Order) {
  expect(order.taxExempt).toBe(true);
  expect(order.taxMinor).toBe(0);
  expect(order.display.taxMinor).toBe(0);
  expect(order.display.totalMinor).toBe(order.totalMinor);
  expect(order.balanceDueMinor).toBe(Math.max(0, order.totalMinor - order.paidMinor));
  expect(order.changeDueMinor).toBe(Math.max(0, order.paidMinor - order.totalMinor));
  for (const row of [...order.lineItems, ...order.fees ?? [], ...order.shipping ?? []]) {
    expect(row.taxMicros).toBe('0');
    if (order.taxRounding?.granularity === 'woocommerce') expect(row.taxLines).toStrictEqual([]);
    else expect(row.taxLines).toMatchObject([{ ratePpm: 0, taxMicros: '0' }]);
  }
  for (const [index, coupon] of (order.coupons ?? []).entries()) {
    expect(coupon.discountTaxMinor).toBe(0);
    expect(coupon.discountMinor).toBe(order.exemptedFrom!.coupons![index].discountMinor);
    expect(coupon.lines?.map(line => line.discountMinor)).toEqual(order.exemptedFrom!.coupons![index].lines?.map(line => line.discountMinor));
    for (const line of coupon.lines ?? []) expect(line.discountTaxMinor).toBe(0);
  }
  displayIdentity(order);
}

function turnOn(builder: OrderBuilder) {
  const taxed = builder.getSnapshot();
  builder.setTaxExempt(true);
  const exempt = builder.getSnapshot();
  expect(exempt.exemptedFrom).toEqual(taxed);
  checkExempt(exempt);
  return exempt;
}

it.each([['E1', generic()], ['E2', generic('per_order')], ['E3', woo]] as const)('%s matches the untaxed twin', (_, context) => {
  const builder = mixed(context), taxed = builder.getSnapshot(), twin = mixed(context, true).getSnapshot();
  const order = turnOn(builder);
  expect(taxed.taxMinor).toBeGreaterThan(0);
  expect(order.totalMinor).toBe(taxed.totalMinor - taxed.display.taxMinor);
  expect(order.totalMinor).toBe(twin.totalMinor);
  expect(order.subtotalMinor).toBe(twin.subtotalMinor);
  expect(order.display).toEqual(twin.display);
  expect(order.lineItems.map(({ netMinor, taxLines }) => ({ netMinor, taxLines }))).toEqual(twin.lineItems.map(({ netMinor, taxLines }) => ({ netMinor, taxLines })));
  for (const key of ['fees', 'shipping'] as const) {
    expect(amounts(order[key])).toEqual(amounts(twin[key]));
    expect(order[key]!.map(row => row.taxLines)).toEqual(twin[key]!.map(row => row.taxLines));
  }
  expect(order.coupons?.map(coupon => coupon.discountMinor)).toEqual(twin.coupons?.map(coupon => coupon.discountMinor));
});

it.each([['E4a', 'per_line_items', 'fees', 1.21], ['E4b', 'per_line_items', 'shipping', 1.077],
  ['E4c', 'per_order', 'fees', 1.21], ['E4d', 'per_order', 'shipping', 1.077]] as const)('%s keeps both converted charges at their own nets', (_, mode, key, divisor) => {
  const builder = charges(generic(mode)), taxed = builder.getSnapshot(), order = turnOn(builder);
  // Per-line rounding moves neither row; per-order rounding moves a cent from shipping.
  expect(amounts(taxed.display.shipping)).toEqual([mode === 'per_order' ? 927 : 928]);
  for (const kind of ['fees', 'shipping'] as const) {
    const own = chargeOrderModeMinor(taxed[kind]![0], false), row = order[kind]![0];
    expect(row.amountIncludesTax).not.toBe(true);
    expect([row.netMinor, row.amountMinor, chargeOrderModeMinor(row, false), order.display[kind]![0].amountMinor]).toEqual([own, own, own, own]);
  }
  expect(order[key]![0].amountMinor).toBeGreaterThanOrEqual(Math.floor(999 / divisor));
  expect(order[key]![0].amountMinor).toBeLessThanOrEqual(Math.ceil(999 / divisor));
  expect(order.totalMinor).toBe(100 + 826 + 928);
});

it('E4w leaves free shipping at zero', () => {
  const builder = freeShipping(), taxed = builder.getSnapshot();
  expect(amounts(taxed.display.shipping)).toEqual([-1]);
  const order = turnOn(builder), nets = taxed.fees!.map(fee => fee.netMinor);
  expect(amounts(order.display.shipping)).toEqual([0]);
  expect(amounts(order.display.fees)).toEqual(nets);
  expect(order.fees!.map(fee => fee.totalMinor)).toEqual(nets);
  expect(order.totalMinor).toBe(100 + sum(nets));
  expect(Math.min(...amounts(order.display.lines), ...amounts(order.display.fees), ...amounts(order.display.shipping))).toBe(0);
});

it('E4x rewrites inclusive Woo fee and shipping totals and micros to their exempt nets', () => {
  const builder = charges(woo), taxed = builder.getSnapshot();
  expect(taxed.fees![0].totalMinor).toBe(999);
  expect(taxed.fees![0].netMinor).toBeLessThan(999);
  const order = turnOn(builder);
  for (const key of ['fees', 'shipping'] as const) {
    const net = taxed[key]![0].netMinor;
    expect(order[key]).toMatchObject([{ totalMinor: net, netMinor: net, amountMinor: net, netMicros: String(net * 1_000_000) }]);
    expect(amounts(order.display[key])).toEqual([net]);
  }
  expect(order.totalMinor).toBe(100 + taxed.fees![0].netMinor + taxed.shipping![0].netMinor);
});

it('E5 shows a converted product at its own net without changing its price mode', () => {
  const order = turnOn(converted());
  expect(amounts(order.display.lines)).toEqual([100, 100]);
  expect(order.totalMinor).toBe(200);
  expect(order.lineItems[0]).toMatchObject({ priceTaxModeConverted: 'inclusive-to-exclusive', unitPriceMinor: 119, netMinor: 119 });
});

it.each([['E6', replay, 100], ['E7', () => storeCoupon(false), 30]] as const)('%s keeps the priced coupon discount', (_, fixture, discount) => {
  const order = turnOn(fixture());
  expect(order.exemptedFrom!.coupons![0].discountTaxMinor).toBeGreaterThan(0);
  expect(amounts(order.display.coupons)).toEqual([discount]);
});

it('E7c removes the tax-rounding cent from the store-priced display coupon only while exempt', () => {
  const builder = storeCoupon(true), order = turnOn(builder);
  expect(amounts(order.display.coupons)).toEqual([4]);
  expect(order.totalMinor).toBe(922);
  builder.setTaxExempt(false);
  expect(amounts(builder.getSnapshot().display.coupons)).toEqual([5]);
});

it('E7d restores the taxed kept coupon before applying exemption', () => {
  const builder = storeCoupon(true);
  builder.addPayment(captured);
  const saved = turnOn(builder), options = { currency: 'EUR', taxContext: generic('per_order'), keepCoupons: true };
  const restored = restoreOrderDraft(saved, options).getSnapshot();
  checkExempt(restored);
  expect(restored.exemptedFrom).toEqual(restoreOrderDraft(saved.exemptedFrom!, options).getSnapshot());
  expect(amounts(restored.exemptedFrom!.display.coupons)).toEqual([5]);
  expect(amounts(restored.display.coupons)).toEqual([4]);
});

it('E7d restores a carried coupon from the parked taxed sale without keepCoupons', () => {
  const saved = turnOn(storeCoupon(true, true)), options = { currency: 'EUR', taxContext: generic('per_order') };
  const restored = restoreOrderDraft(JSON.parse(JSON.stringify(saved)), options).getSnapshot();
  checkExempt(restored);
  expect(restored.exemptedFrom).toEqual(restoreOrderDraft(saved.exemptedFrom!, options).getSnapshot());
  expect(restored.coupons![0]).toMatchObject({ carried: true, discountMinor: 4 });
  expect(amounts(restored.display.coupons)).toEqual([4]);
});

it.each([() => mixed(generic()), () => storeCoupon(false)])('E7b prices both views on the taxed basis', fixture => {
  const order = turnOn(fixture());
  expect(couponPricingBasis(order)).toBe(couponPricingBasis(order.exemptedFrom!));
  expect(order).not.toHaveProperty('couponPricesStale');
});

it.each([() => mixed(generic()), () => mixed(woo), () => charges(generic())])('E8 toggles without editing the underlying sale', fixture => {
  const builder = fixture(), taxed = builder.getSnapshot(), order = turnOn(builder);
  const emit = vi.fn(), subscription = builder.order$.subscribe(emit);
  builder.setTaxExempt(true);
  expect(builder.getSnapshot()).toStrictEqual(order);
  builder.setTaxExempt(false);
  expect(builder.getSnapshot()).toStrictEqual(taxed);
  expect(emit).toHaveBeenCalledTimes(3);
  subscription.unsubscribe();
});

it.each([true, false])('E9 restores the taxed draft first (keepTaxRates %s)', keepTaxRates => {
  const builder = mixed(generic());
  builder.addPayment(captured);
  const saved = turnOn(builder), options = { currency: 'EUR', taxContext: generic('per_line_items', keepTaxRates ? 70000 : 190000), keepTaxRates };
  const taxed = restoreOrderDraft(saved.exemptedFrom!, options).getSnapshot(), restored = restoreOrderDraft(saved, options);
  checkExempt(restored.getSnapshot());
  expect(restored.getSnapshot().exemptedFrom).toEqual(taxed);
  if (!keepTaxRates) expect(restored.getSnapshot()).toEqual(saved);
  restored.setTaxExempt(false);
  expect(restored.getSnapshot()).toEqual(taxed);
  expect(taxed.lineItems[2].taxLines[0]).toMatchObject({ code: 'given', ratePpm: 190000 });
  expect(taxed.fees![0].taxLines[0].ratePpm).toBe(190000);
});

it('E10 re-taxes class lines at the new rate without lifting exemption', () => {
  const saved = turnOn(mixed(generic())), options = { currency: 'EUR', taxContext: generic('per_line_items', 70000) };
  const restored = restoreOrderDraft(saved, options);
  checkExempt(restored.getSnapshot());
  restored.setTaxExempt(false);
  expect(restored.getSnapshot()).toEqual(restoreOrderDraft(saved.exemptedFrom!, options).getSnapshot());
  expect(restored.getSnapshot().lineItems[0].taxLines[0].ratePpm).toBe(70000);
});

it('E11 refuses an inclusive store or a draft missing the taxed sale', () => {
  const context = { ...generic(), pricesIncludeTax: true }, builder = make(context);
  const error = new Error('order builder: tax exemption is not available on a prices-include-tax store');
  expect(() => builder.setTaxExempt(true)).toThrow(error);
  expect(() => make(context, true)).toThrow(error);
  expect(() => builder.setTaxExempt(false)).not.toThrow();
  expect(() => restoreOrderDraft({ ...builder.getSnapshot(), taxExempt: true }, { currency: 'EUR', taxContext: generic() }))
    .toThrow(new Error('restoreOrderDraft: an exempt draft must carry exemptedFrom'));
});

it('E12b counts the captured leg’s +2 rounding in the exempt balance and display', () => {
  const builder = mixed(generic(), false, true), total = builder.getSnapshot().totalMinor;
  expect(total % 5).toBe(3);
  const paymentId = builder.addPayment({ ...captured, amountMinor: total + 2 });
  builder.addCashRounding({ paymentId, minor: 2 });
  const order = builder.getSnapshot(), taxed = order.exemptedFrom!;
  checkExempt(order);
  expect(order.totalMinor).toBe(taxed.totalMinor - taxed.display.taxMinor);
  expect(order.cashRoundings).toEqual([{ paymentId, minor: 2 }]);
  expect(order.paidMinor).toBe(taxed.paidMinor);
  expect(order.balanceDueMinor).toBe(0);
  expect(order.changeDueMinor).toBe(0);
});

it.each([() => mixed(generic()), () => mixed(generic('per_order')), () => mixed(woo), () => charges(generic()),
  () => charges(generic('per_order')), freeShipping, converted, replay, () => storeCoupon(false), () => storeCoupon(true),
  () => storeCoupon(true, true), () => {
    const builder = storeCoupon(true);
    builder.addPayment(captured);
    return restoreOrderDraft(builder.getSnapshot(), { currency: 'EUR', taxContext: generic('per_order'), keepCoupons: true });
  }, ...[true, false].map(keepTaxRates => () => {
    const builder = mixed(generic());
    builder.addPayment(captured);
    return restoreOrderDraft(builder.getSnapshot(), { currency: 'EUR', taxContext: generic('per_line_items', 70000), keepTaxRates });
  }), () => {
    const builder = mixed(generic()), paymentId = builder.addPayment(captured);
    builder.addCashRounding({ paymentId, minor: 2 });
    return builder;
  }])('E13 omits both keys before exemption and after clear', fixture => {
  const builder = fixture(), taxed = builder.getSnapshot();
  builder.setTaxExempt(true);
  builder.clear();
  for (const order of [taxed, builder.getSnapshot()]) {
    expect('taxExempt' in order).toBe(false);
    expect('exemptedFrom' in order).toBe(false);
  }
});
