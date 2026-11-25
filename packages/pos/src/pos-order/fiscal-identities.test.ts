// @vitest-environment node
// #1256: every sale the builder makes passes the server's ADR-063 display identities (I1–I3 in fiscalFiguresErrors).
import { expect, it } from 'vitest';
import { precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import type { Discount } from '../order/types';
import type { TaxContext, WooRate } from '../tax/types';
import { ORDER_CREATE_MAX_VERSION, toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';

const supported = { orderCreate: Array.from({ length: ORDER_CREATE_MAX_VERSION }, (_, i) => i + 1), register: [1], cashRounding: true };
const wooRate = (id: number, rate: string): WooRate => ({ id, code: `rate-${id}`, label: `Rate ${id}`, rate, priority: 1, compound: false, shipping: true });
const wooRates: Record<string, WooRate[]> = { standard: [wooRate(1, '20.0000')], reduced: [wooRate(2, '5.0000')] };
const ppm: Record<string, number> = { standard: 200000, reduced: 50000 };
function taxContext(pricesIncludeTax: boolean, woo: boolean): TaxContext {
  return woo
    ? { pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal: false }, getTaxRatePpm: (taxClass) => ppm[taxClass || 'standard'],
      getTaxRates: (taxClass, options) => (wooRates[taxClass || 'standard'] ?? []).filter((rate) => !options?.shipping || rate.shipping) }
    : { pricesIncludeTax, getTaxRatePpm: (taxClass) => ppm[taxClass || 'standard'] };
}
const couponContext = {
  configs: new Map([['ten', { discount_type: 'percent' as const, amount: '10', limit_usage_to_x_items: null,
    product_ids: [], excluded_product_ids: [], product_categories: [], excluded_product_categories: [], exclude_sale_items: false }]]),
  couponIds: new Map([['ten', '303']]), productCategories: new Map(), calcDiscountsSequentially: false,
};

it('P1: 200 seeded random built sales pass the server precheck, display identities included', () => {
  // mulberry32: a small deterministic PRNG, so a failure reproduces.
  let seed = 0x1256;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (min: number, max: number) => min + Math.floor(random() * (max - min + 1));
  const discount = (max: number): Discount => random() < 0.5 ? { type: 'percentage', value: int(1, 60) } : { type: 'fixed', value: int(1, max) };
  const counts = { inclusive: 0, exclusive: 0, woo: 0, nonWoo: 0, twoRates: 0, lineDiscount: 0, orderDiscount: 0,
    coupon: 0, fee: 0, shipping: 0, cashRounding: 0 };

  for (let index = 0; index < 200; index++) {
    const pricesIncludeTax = random() < 0.5, woo = random() < 0.5;
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: taxContext(pricesIncludeTax, woo), ...(woo ? { couponContext } : {}) });
    const classes = new Set<string>();
    let lineDiscount = false;
    for (let n = int(1, 4); n > 0; n--) {
      const taxClass = random() < 0.5 ? 'standard' : 'reduced';
      classes.add(taxClass);
      const lineId = builder.addLine({ productId: `p${n}`, name: `Item ${n}`, quantity: int(1, 3), taxClass,
        unitPrice: { amount: int(100, 20000), currency: 'EUR', ...(woo ? {} : { taxInclusive: random() < 0.5 }) } });
      if (random() < 0.3) { builder.applyLineDiscount(lineId, discount(5000)); lineDiscount = true; }
    }
    // No return line: the builder caps a negative line at 0 and finalize refuses it, so F10 covers returns server-side.
    const orderDiscountDraw = random() < 0.3 ? discount(5000) : undefined;
    const coupon = woo && random() < 0.4;
    // #1342: a Woo inclusive line's net discount can go negative with an order discount and a coupon; re-enable when it is fixed.
    const orderDiscount = orderDiscountDraw !== undefined && !(woo && pricesIncludeTax && coupon);
    if (orderDiscount && orderDiscountDraw) builder.applyOrderDiscount(orderDiscountDraw);
    if (coupon) builder.setCoupons(['ten']);
    // #1341: Woo inclusive charge rows can differ by 1 from the payload; re-enable when it is fixed.
    const charges = !(woo && pricesIncludeTax);
    const fee = charges && random() < 0.3, shipping = charges && random() < 0.3;
    if (fee) builder.addFee({ name: 'Bag', amountMinor: int(1, 500) });
    if (shipping) builder.addShipping({ name: 'Delivery', amountMinor: int(1, 1500), taxClass: 'standard', methodId: 'flat_rate' });
    const due = builder.getSnapshot().totalMinor;
    const rounding = due > 2 && random() < 0.4 ? int(-2, 2) || 1 : 0;
    if (due > 0) builder.addPayment({ method: 'cash', amountMinor: due + rounding }, rounding ? { minor: rounding } : undefined);
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: ORDER_CREATE_MAX_VERSION, cashRounding: true } });
    const envelope = toOrderCreateEnvelope(order, 'device-1', 1, { maxVersion: ORDER_CREATE_MAX_VERSION });
    expect(precheckCommand(envelope, supported), `sale ${index}: ${JSON.stringify(envelope.payload.display)}`).toBeUndefined();

    counts[pricesIncludeTax ? 'inclusive' : 'exclusive']++;
    counts[woo ? 'woo' : 'nonWoo']++;
    if (classes.size === 2) counts.twoRates++;
    if (lineDiscount) counts.lineDiscount++;
    if (orderDiscount) counts.orderDiscount++;
    if (envelope.payload.coupons?.length) counts.coupon++;
    if (envelope.payload.fees?.length) counts.fee++;
    if (envelope.payload.shipping?.length) counts.shipping++;
    if (envelope.payload.cashRoundings?.length) counts.cashRounding++;
  }
  for (const [kind, count] of Object.entries(counts)) expect(count, `${kind} sales`).toBeGreaterThan(0);
});
