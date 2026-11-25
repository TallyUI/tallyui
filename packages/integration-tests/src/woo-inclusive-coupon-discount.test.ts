// @vitest-environment node
// #1342: a Woo tax-inclusive sale with a till discount and a coupon keeps the discount, on the wire and in the Woo order.
import { describe, expect, it } from 'vitest';
import { woocommerceCoupons, woocommerceTax } from '@tallyui/core';
import { payloadShapeErrors } from '@tallyui/core/server';
import { toWooOrderPayload } from '@tallyui/connector-woocommerce';
import { createOrderBuilder, finalizeOrder, toOrderCreateEnvelope } from '@tallyui/pos';

interface WooBody {
  line_items: { product_id: number; quantity: number; subtotal: string; total: string; meta_data?: { key: string; value: string }[] }[];
  coupon_lines?: { code: string }[];
}
type Rate = { id: number; code: string; label: string; rate: string; priority: number; order: number; compound: boolean; shipping: boolean };
const rate = (id: number, percent: string, compound = false): Rate =>
  ({ id, code: `R${id}`, label: `R${id}`, rate: percent, priority: id, order: id, compound, shipping: true });
const vat = [rate(1, '20.0000')];
const couponConfigs = new Map<string, woocommerceCoupons.CouponDiscountConfig>([10, 30, 50, 100].map((n) => [`p${n}`, {
  discount_type: 'percent', amount: String(n), limit_usage_to_x_items: null, product_ids: [], excluded_product_ids: [],
  product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]));
type Line = { price: number; percent?: number; none?: true };
interface Sale { lines: Line[]; orderFixed?: number; coupon?: number; rates?: Rate[]; pricesIncludeTax?: boolean }

function sell({ lines, orderFixed, coupon, rates = vat, pricesIncludeTax = true }: Sale) {
  const builder = createOrderBuilder({ currency: 'GBP', taxContext: {
    pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, getTaxRates: () => rates,
    getTaxRatePpm: () => rates.reduce((sum, r) => sum + Math.round(Number(r.rate) * 10000), 0),
  }, couponContext: { configs: couponConfigs, couponIds: new Map([...couponConfigs.keys()].map((code, i) => [code, String(i + 1)])),
    productCategories: new Map(), calcDiscountsSequentially: false } });
  for (const [i, line] of lines.entries()) {
    const id = builder.addLine({ id: `line-${i}`, productId: String(i + 1), name: `Item ${i}`, separate: true,
      unitPrice: { amount: line.price, currency: 'GBP' }, ...(line.none ? { taxStatus: 'none' as const } : {}) });
    if (line.percent) builder.applyLineDiscount(id, { type: 'percentage', value: line.percent });
  }
  if (orderFixed) builder.applyOrderDiscount({ type: 'fixed', value: orderFixed });
  if (coupon) builder.setCoupons([`p${coupon}`]);
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  let nextId = 0;
  const order = finalizeOrder(builder.getSnapshot(), { now: new Date('2026-11-25T10:00:00.000Z'),
    newId: () => `019f6d2e-7800-7000-8000-${String(++nextId).padStart(12, '0')}`, capabilities: { orderCreate: 12 } });
  const envelope = toOrderCreateEnvelope(order, 'device-1342', 1, { maxVersion: 12 });
  const result = toWooOrderPayload(envelope, order);
  if ('error' in result) throw new Error(result.error.message);
  return { order, payload: envelope.payload, body: result.payload as unknown as WooBody };
}

// The matrix test's wooServer: Woo recalculates the order from the posted nets and coupon codes.
function wooTotalMinor(body: WooBody, rates: Rate[]) {
  const precision = woocommerceTax.getRoundingPrecision(2);
  const lineItems = body.line_items.map(({ product_id, quantity, subtotal, total }) => {
    const taxOn = (amount: string) => woocommerceTax.calculateTaxes({ amount: Number(amount), rates, amountIncludesTax: false, dp: 2, perRatePrecision: precision });
    const before = taxOn(subtotal), after = taxOn(total);
    return { product_id, quantity, tax_class: '', subtotal, total, subtotal_tax: before.total.toFixed(precision), total_tax: after.total.toFixed(precision),
      taxes: before.taxes.map((tax, i) => ({ id: tax.id, subtotal: tax.total.toFixed(precision), total: after.taxes[i].total.toFixed(precision) })) };
  });
  const replay = woocommerceCoupons.recalculateCoupons({ lineItems, couponLines: body.coupon_lines ?? [], couponConfigs, pricesIncludeTax: true,
    calcDiscountsSequentially: false, taxRates: rates, productCategories: new Map(), taxRoundAtSubtotal: false, dp: 2 });
  const totals = woocommerceCoupons.calculateOrderTotals({ ...replay, taxRates: rates, pricesIncludeTax: true, taxRoundAtSubtotal: false, dp: 2 });
  return Math.round(Number(totals.total) * 100);
}

const wooLines = (body: WooBody) => body.line_items.map((line) => [line.subtotal, line.total,
  JSON.parse(line.meta_data?.find((meta) => meta.key === '_woocommerce_pos_data')?.value ?? '{}').price]);
const fiveOff = { lines: [{ price: 1000, percent: 5 }] };

describe('#1342 Woo inclusive coupon keeps the till discount', () => {
  // T1. £10.00 inclusive at 20%. 5% line discount, D = 50: net(1000) − net(950) = 833.3333 − 791.6667 = 41.6667 → 42;
  // Woo line 9.50 / 1.2 = 7.916667, price 9.50, whatever the coupon. Till: 950 less the coupon's share.
  // £1.00 order discount, D = 100: 833.3333 − 750 = 83.3333 → 83; 9.00 / 1.2 = 7.500000.
  // 5% then £1.00, D = 150: 833.3333 − 708.3333 = 125; 8.50 / 1.2 = 7.083333.
  // Two lines, 10%: line 0 as above; line 1 £5.00 undiscounted, 5.00 / 1.2 = 4.166667; till (950 + 500) × 0.9 = 1305.
  it.each([
    { name: '5% line, coupon 10%', sale: { ...fiveOff, coupon: 10 }, wire: [42], woo: [['7.916667', '9.50']], charged: 855 },
    { name: '5% line, coupon 30%', sale: { ...fiveOff, coupon: 30 }, wire: [42], woo: [['7.916667', '9.50']], charged: 665 },
    { name: '5% line, coupon 50%', sale: { ...fiveOff, coupon: 50 }, wire: [42], woo: [['7.916667', '9.50']], charged: 475 },
    { name: '5% line, coupon 100%', sale: { ...fiveOff, coupon: 100 }, wire: [42], woo: [['7.916667', '9.50']] },
    { name: '£1 order, coupon 10%', sale: { lines: [{ price: 1000 }], orderFixed: 100, coupon: 10 }, wire: [83], woo: [['7.500000', '9.00']], charged: 810 },
    { name: '£1 order, coupon 50%', sale: { lines: [{ price: 1000 }], orderFixed: 100, coupon: 50 }, wire: [83], woo: [['7.500000', '9.00']], charged: 450 },
    { name: '5% line and £1 order, coupon 50%', sale: { ...fiveOff, orderFixed: 100, coupon: 50 }, wire: [125], woo: [['7.083333', '8.50']], charged: 425 },
    { name: 'two lines, one discounted, coupon 10%', sale: { lines: [{ price: 1000, percent: 5 }, { price: 500 }], coupon: 10 },
      wire: [42, undefined], woo: [['7.916667', '9.50'], ['4.166667', '5.00']], charged: 1305 },
  ])('T1 $name', ({ sale, wire, woo, charged }) => {
    const { order, payload, body } = sell(sale);
    expect(payload.lines.map((line) => line.discountMinor)).toEqual(wire);
    expect(payload.discountMinor).toBe(wire.reduce((sum: number, d) => sum + (d ?? 0), 0));
    expect(wooLines(body)).toEqual(woo.map(([net, price]) => [net, net, price]));
    expect(payloadShapeErrors(payload)).toEqual([]);
    if (charged !== undefined) {
      expect(order.totalMinor).toBe(charged);
      expect(wooTotalMinor(body, vat)).toBe(charged);
    }
  });

  it.each([undefined, 100])('T1 £1 order discount with coupon %s', (coupon) => {
    const { payload } = sell({ lines: [{ price: 1000 }], orderFixed: 100, coupon });
    expect([payload.lines[0].discountMinor, payload.discountMinor, payloadShapeErrors(payload)]).toEqual([83, 83, []]);
  });

  // T2. 20% + 5% non-compound: net = P / 1.25; 1000 → 800, 950 → 760: wire 40; Woo 7.600000.
  // 20% + compound 5%, 30% off (D = 300): per-rate 6 dp; 10.00 − 0.476190 − 1.587302 = 7.936508;
  // 7.00 − 0.333333 − 1.111111 = 5.555556; 7.936508 − 5.555556 = 2.380952 → 238 (both rates flat would give 240).
  // Untaxed: no tax, wire is the discount, 50; Woo 9.500000.
  it.each([
    { name: 'two rates, no coupon', sale: { ...fiveOff, rates: [rate(1, '20.0000'), rate(2, '5.0000')] }, wire: 40, woo: undefined },
    { name: 'two rates, coupon 50%', sale: { ...fiveOff, rates: [rate(1, '20.0000'), rate(2, '5.0000')], coupon: 50 }, wire: 40, woo: ['7.600000', '9.50'] },
    { name: 'compound, no coupon', sale: { lines: [{ price: 1000, percent: 30 }], rates: [rate(1, '20.0000'), rate(2, '5.0000', true)] }, wire: 238, woo: undefined },
    { name: 'compound, coupon 50%', sale: { lines: [{ price: 1000, percent: 30 }], rates: [rate(1, '20.0000'), rate(2, '5.0000', true)], coupon: 50 },
      wire: 238, woo: ['5.555556', '7.00'] },
    { name: 'untaxed line, coupon 50%', sale: { lines: [{ price: 1000, percent: 5, none: true as const }], coupon: 50 }, wire: 50, woo: ['9.500000', '9.50'] },
  ])('T2 $name', ({ sale, wire, woo }) => {
    const { payload, body } = sell(sale);
    expect([payload.lines[0].discountMinor, payload.discountMinor, payloadShapeErrors(payload)]).toEqual([wire, wire, []]);
    if (woo) expect(wooLines(body)).toEqual([[woo[0], woo[0], woo[1]]]);
  });

  // T3. Pinned on the unfixed code (6ab8b685): these bytes must not move.
  const pinned = { clientLineId: '019f6d2e-7800-7000-8000-000000000002', variantId: '1', title: 'Item 0', quantity: 1, unitPriceMinor: 1000 };
  it('T3 exclusive store, 5% line discount, coupon 50%: bytes unchanged', () => {
    const { payload, body } = sell({ ...fiveOff, coupon: 50, pricesIncludeTax: false });
    expect(payload.lines).toEqual([{ ...pinned, discountMinor: 50 }]);
    expect(body.line_items).toEqual([{ product_id: 1, quantity: 1, subtotal: '9.50', total: '9.50',
      meta_data: [{ key: '_woocommerce_pos_data', value: '{"price":"9.50","regular_price":"9.50"}' }] }]);
  });

  it('T3 inclusive, 5% line discount, no coupon: bytes unchanged', () => {
    const { payload, body } = sell(fiveOff);
    expect(payload.lines).toEqual([{ ...pinned, discountMinor: 42 }]);
    expect(body.line_items).toEqual([{ product_id: 1, quantity: 1, subtotal: '7.916667', total: '7.916667' }]);
  });

  it('T3 inclusive coupon, no discount: no discountMinor', () => {
    const { payload } = sell({ lines: [{ price: 1000 }], coupon: 50 });
    expect([payload.lines[0].discountMinor, payload.discountMinor]).toEqual([undefined, undefined]);
  });
});
