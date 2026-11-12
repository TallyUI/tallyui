// @vitest-environment node
import { readFileSync } from 'node:fs';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { woocommerceCoupons, woocommerceTax } from '@tallyui/core';
import { toWooOrderPayload } from '@tallyui/connector-woocommerce';
import { createOrderBuilder, finalizeOrder, posOrderCollection, toOrderCreateEnvelope } from '@tallyui/pos';

interface WooBody {
  line_items: { product_id: number; quantity: number; subtotal: string; total: string }[];
  coupon_lines?: { code: string }[];
}
interface Fixture {
  cart: { sku: string; name: string; qty: number }[];
  tillDiscount: { type: string; amount: string; scope: string } | null;
  coupon: string | null;
  chargedMinor: number;
  posted: WooBody;
  woo: {
    total: string; discount_total: string; discount_tax: string;
    line_items: { sku: string; product_id: number; tax_class: string }[];
    tax_lines: { rate_id: number; rate_code: string; label: string; rate_percent: number; compound: boolean }[];
    coupon_lines: { code: string; discount_type: 'fixed_cart' | 'percent'; nominal_amount: number }[];
  };
}
const modes = ['inclusive', 'exclusive'] as const;
const names = ['plain', 'till-discount', 'coupon', 'till-discount-coupon', 'mixed', 'percent-coupon'];
const rows = modes.flatMap((mode) => names.map((name) => ({ mode, name, fixture: JSON.parse(readFileSync(
  new URL(`./__fixtures__/woo-coupon-matrix-2026-11-12/${mode}/${name}.json`, import.meta.url), 'utf8')) as Fixture })));
const fixtureFor = (mode: string, name: string) => rows.find((row) => row.mode === mode && row.name === name)!.fixture;
const mixed = fixtureFor('inclusive', 'mixed');
// Mixed's $23.00 subtotal less $1.37 leaves $21.63. Undo its proportional discount:
// tote 14.11 * 23 / 21.63 -> $15.00; croissant 3.29 * 23 / 21.63 -> $3.50 (nearest cent).
const shelfPrices: Record<string, number> = { 'COF-FLW': 450, 'BAK-MUF': 375, 'MER-TOT': 1500, 'BAK-CRO': 350 };
const products = [...fixtureFor('inclusive', 'plain').woo.line_items, ...mixed.woo.line_items];
const rates = mixed.woo.tax_lines.map((tax) => {
  const priority = tax.rate_id === 2 ? 2 : tax.rate_id === 4 ? 3 : 1;
  return { id: tax.rate_id, code: tax.rate_code, label: tax.label, rate: String(tax.rate_percent),
    compound: tax.compound, priority, order: priority, shipping: true,
    class: tax.rate_id === 5 ? 'zero-rate' : tax.rate_id === 3
      ? products.find((product) => product.sku === 'BAK-CRO')!.tax_class : '' };
});
const couponConfigs = new Map<string, woocommerceCoupons.CouponDiscountConfig>(
  ['coupon', 'percent-coupon'].map((name) => {
    const coupon = fixtureFor('inclusive', name).woo.coupon_lines[0];
    return [coupon.code, { discount_type: coupon.discount_type, amount: String(coupon.nominal_amount),
      limit_usage_to_x_items: null, product_ids: [], excluded_product_ids: [], product_categories: [],
      excluded_product_categories: [], exclude_sale_items: false }];
  }));

function wooServer(body: WooBody, store: { pricesIncludeTax: boolean }) {
  const precision = woocommerceTax.getRoundingPrecision(2);
  // REST order calculation uses the posted net fields. POS price meta is retained in the body,
  // but is not an input to WC_Order's subtotal/total calculation; validate this against every capture below.
  const lineItems = body.line_items.map(({ product_id, quantity, subtotal, total }) => {
    const tax_class = products.find((product) => product.product_id === product_id)!.tax_class;
    const itemRates = rates.filter((rate) => rate.class === tax_class);
    const taxOn = (amount: string) => woocommerceTax.calculateTaxes({ amount: Number(amount), rates: itemRates,
      amountIncludesTax: false, dp: 2, perRatePrecision: precision });
    const before = taxOn(subtotal), after = taxOn(total);
    return { product_id, quantity, tax_class, subtotal, total,
      subtotal_tax: before.total.toFixed(precision), total_tax: after.total.toFixed(precision),
      taxes: before.taxes.map((tax, index) => ({ id: tax.id, subtotal: tax.total.toFixed(precision),
        total: after.taxes[index].total.toFixed(precision) })) };
  });
  const replay = woocommerceCoupons.recalculateCoupons({ lineItems, couponLines: body.coupon_lines ?? [],
    couponConfigs, pricesIncludeTax: store.pricesIncludeTax, calcDiscountsSequentially: false,
    taxRates: rates, productCategories: new Map(), taxRoundAtSubtotal: false, dp: 2 });
  const totals = woocommerceCoupons.calculateOrderTotals({ ...replay, taxRates: rates,
    pricesIncludeTax: store.pricesIncludeTax, taxRoundAtSubtotal: false, dp: 2 });
  return { total: Number(totals.total).toFixed(2), discount_total: Number(totals.discount_total).toFixed(2),
    discount_tax: Number(totals.discount_tax).toFixed(2) };
}

describe('inclusive coupon once: captured WooCommerce matrix, 2026-11-12', () => {
  // No fix assertion runs until the server model reproduces ALL real stored figures,
  // including the old inclusive coupon totals 7.25, 5.88 and 12.77.
  beforeAll(() => {
    for (const { mode, name, fixture } of rows) {
      const simulated = wooServer(fixture.posted, { pricesIncludeTax: mode === 'inclusive' });
      console.info(`${mode}/${name}: fixture Woo=${fixture.woo.total}, simulated 3.20.0=${simulated.total}`);
      expect(simulated, `${mode}/${name}: real Woo totals`).toEqual({ total: fixture.woo.total,
        discount_total: fixture.woo.discount_total, discount_tax: fixture.woo.discount_tax });
    }
  });

  it.each(rows)('$mode/$name: till, stored tax metadata, payload and server total', async ({ mode, name, fixture }) => {
    const pricesIncludeTax = mode === 'inclusive';
    const builder = createOrderBuilder({ currency: 'USD', taxContext: {
      pricesIncludeTax, rounding: { granularity: 'woocommerce', roundAtSubtotal: false },
      getTaxRates: (taxClass) => rates.filter((rate) => rate.class === (taxClass ?? '')),
      getTaxRatePpm: (taxClass) => rates.filter((rate) => rate.class === (taxClass ?? ''))
        .reduce((sum, rate) => sum + Math.round(Number(rate.rate) * 10000), 0),
    }, couponContext: { configs: couponConfigs, couponIds: new Map([['fiveoff', '1'], ['ten', '2']]),
      productCategories: new Map(), calcDiscountsSequentially: false } });
    for (const item of fixture.cart) {
      const product = products.find((product) => product.sku === item.sku)!;
      builder.addLine({ productId: String(product.product_id), name: item.name, sku: item.sku, quantity: item.qty,
        unitPrice: { amount: shelfPrices[item.sku], currency: 'USD' }, regularUnitPriceMinor: shelfPrices[item.sku],
        taxClass: product.tax_class });
    }
    if (fixture.tillDiscount) builder.applyOrderDiscount({ type: 'fixed', value: 137 });
    if (fixture.coupon) builder.setCoupons([fixture.coupon]);
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 8 } });
    const envelope = toOrderCreateEnvelope(order, 'device-matrix', 1, { maxVersion: 8 });
    expect(order.totalMinor, `${mode}/${name}: till charged`).toBe(fixture.chargedMinor);

    const db = await createRxDatabase({ name: `couponmatrix${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      const { pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() });
      await collection.insert(order);
      const local = (await collection.findOne(order.id).exec())!.toJSON();
      expect(local.lines.map((line) => line.taxLines)).toEqual(order.lines.map((line) => line.taxLines));
      for (const line of local.lines) for (const tax of line.taxLines) {
        expect(tax, `${mode}/${name}: stored Woo tax metadata`).toMatchObject({
          rateId: expect.any(Number), compound: expect.any(Boolean),
        });
      }
      const result = toWooOrderPayload(envelope, local);
      if ('error' in result) throw new Error(`${mode}/${name}: ${result.error.message}`);
      const body = result.payload as unknown as WooBody;
      if (!pricesIncludeTax || !fixture.coupon) {
        expect(body.line_items, `${mode}/${name}: unchanged bytes`).toEqual(fixture.posted.line_items);
      } else {
        // woocommerceLine, 7.25% + 1.375% then compound 2%, per-rate precision 6:
        // $11.25 - (0.736140 + 0.139613 + 0.220588) = $10.153659 (muffins x3).
        // $4.50 - (0.294456 + 0.055845 + 0.088235) = $4.061464 (flat white x1).
        const expected = name === 'percent-coupon' ? ['10.153659', '4.061464']
          : fixtureFor(mode, name === 'coupon' ? 'plain' : 'till-discount').posted.line_items.map((line) => line.subtotal);
        expect(body.line_items.map((line) => line.subtotal)).toEqual(expected);
        expect(body.line_items.map((line) => line.total)).toEqual(expected);
        // The old inclusive coupon body must fail this pre-coupon assertion.
        expect(fixture.posted.line_items.map((line) => line.subtotal)).not.toEqual(expected);
        expect(body.line_items.map(({ subtotal: _subtotal, total: _total, ...rest }) => rest))
          .toEqual(fixture.posted.line_items.map(({ subtotal: _subtotal, total: _total, ...rest }) => rest));
      }
      const old = wooServer(fixture.posted, { pricesIncludeTax }), current = wooServer(body, { pricesIncludeTax });
      console.info(`${mode}/${name}: till=${(order.totalMinor / 100).toFixed(2)}, fixture Woo=${fixture.woo.total}, `
        + `simulated 3.20.0=${old.total}, simulated new=${current.total}`);
      expect(Math.round(Number(current.total) * 100), `${mode}/${name}: server matches till`).toBe(fixture.chargedMinor);
    } finally {
      await db.remove();
    }
  });
});
