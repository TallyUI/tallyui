// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import { toWooOrderPayload } from '@tallyui/connector-woocommerce';
import type { OrderCreateEnvelope } from '@tallyui/core';
import { toOrderCreateEnvelope, type PosOrder } from '@tallyui/pos';

// Condition 2: one stored order per platform, every leg carrying its payment method's own id. The goldens were captured
// from the base builder (b1c661e4) before order.create 10 existed and are never regenerated: up to 9 the bytes are today's.

const woocommerce: PosOrder = {
  id: '019f8a10-0000-7000-8000-000000000001',
  saleId: '1794966933999-1',
  createdAt: '2026-11-18T09:00:00.000Z',
  updatedAt: '2026-11-18T09:00:00.000Z',
  commandId: '019f8a10-0000-7000-8000-000000000006',
  syncStatus: 'pending',
  currency: 'GBP',
  pricesIncludeTax: true,
  lines: [{ id: '019f8a10-0000-7000-8000-000000000002', productId: '101', name: 'Mug', sku: 'MUG', quantity: 2, unitPriceMinor: 1200, discountMinor: 0, netMinor: 1800, netMicros: '1800000000', taxLines: [{ code: 'VAT', ratePpm: 200000, taxMicros: '360000000' }] }, { id: '019f8a10-0000-7000-8000-000000000003', productId: '102', name: 'Tea', sku: 'TEA', quantity: 1, unitPriceMinor: 600, discountMinor: 0, netMinor: 500, netMicros: '500000000', taxLines: [{ code: 'VAT', ratePpm: 200000, taxMicros: '100000000' }] }],
  payments: [{ id: '019f8a10-0000-7000-8000-000000000004', method: 'external', amountMinor: 1000, reference: 'TERM-42', methodId: 'stripe_terminal_for_woocommerce' }, { id: '019f8a10-0000-7000-8000-000000000005', method: 'cash', amountMinor: 1760, tenderedMinor: 2260, changeMinor: 500, methodId: 'pos_cash' }],
  subtotalMinor: 2300,
  discountMinor: 0,
  taxMinor: 460,
  totalMinor: 2760,
  taxRounding: { granularity: 'woocommerce', roundAtSubtotal: false },
  coupons: [{ code: 'spring', couponId: '303', discountMinor: 200, discountTaxMinor: 40, lines: [{ lineId: '019f8a10-0000-7000-8000-000000000002', discountMinor: 200, discountTaxMinor: 40 }] }],
  display: { currency: 'GBP', exponent: 2, taxInclusive: true, subtotalMinor: 3000, discountMinor: 240, taxMinor: 460, totalMinor: 2760, lines: [{ lineId: '019f8a10-0000-7000-8000-000000000002', amountMinor: 2400, discounts: [] }, { lineId: '019f8a10-0000-7000-8000-000000000003', amountMinor: 600, discounts: [] }], orderDiscountMinor: 0, coupons: [{ code: 'spring', amountMinor: 240 }] },
  taxByRate: [{ ratePpm: 200000, code: 'VAT', netMinor: 2300, amountMinor: 460, grossMinor: 2760 }],
  customer: null,
};
const medusa: PosOrder = {
  id: '019f8a20-0000-7000-8000-000000000001',
  saleId: '1794966934006-6',
  createdAt: '2026-11-18T09:00:00.000Z',
  updatedAt: '2026-11-18T09:00:00.000Z',
  commandId: '019f8a20-0000-7000-8000-000000000006',
  syncStatus: 'pending',
  currency: 'EUR',
  pricesIncludeTax: false,
  lines: [{ id: '019f8a20-0000-7000-8000-000000000002', productId: 'prod_01', variantId: 'variant_01', name: 'Hoodie', sku: 'HOOD-M', quantity: 1, unitPriceMinor: 4500, discountMinor: 0, netMinor: 4500, taxLines: [{ ratePpm: 190000, taxMicros: '855000000' }] }],
  payments: [{ id: '019f8a20-0000-7000-8000-000000000004', method: 'cash', amountMinor: 2000, tenderedMinor: 2000, changeMinor: 0, methodId: 'cash' }, { id: '019f8a20-0000-7000-8000-000000000005', method: 'external', amountMinor: 3950, reference: 'pi_123', methodId: 'pp_system_default' }],
  shipping: [{ id: '019f8a20-0000-7000-8000-000000000003', name: 'Standard', amountMinor: 500, taxStatus: 'taxable', taxLines: [{ ratePpm: 190000, taxMicros: '95000000' }], netMinor: 500, taxMicros: '95000000', methodId: 'so_standard' }],
  subtotalMinor: 4500,
  discountMinor: 0,
  taxMinor: 950,
  totalMinor: 5950,
  taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
  display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 4500, discountMinor: 0, taxMinor: 950, totalMinor: 5950, lines: [{ lineId: '019f8a20-0000-7000-8000-000000000002', amountMinor: 4500, discounts: [] }], orderDiscountMinor: 0, shipping: [{ id: '019f8a20-0000-7000-8000-000000000003', name: 'Standard', amountMinor: 500 }] },
  taxByRate: [{ ratePpm: 190000, netMinor: 5000, amountMinor: 950, grossMinor: 5950 }],
  customer: null,
};
const vendure: PosOrder = {
  id: '019f8a30-0000-7000-8000-000000000001',
  saleId: '1794966934007-11',
  createdAt: '2026-11-18T09:00:00.000Z',
  updatedAt: '2026-11-18T09:00:00.000Z',
  commandId: '019f8a30-0000-7000-8000-000000000005',
  syncStatus: 'pending',
  currency: 'USD',
  pricesIncludeTax: false,
  lines: [{ id: '019f8a30-0000-7000-8000-000000000002', productId: '7', variantId: '12', name: 'Notebook', sku: 'NB-A5', quantity: 3, unitPriceMinor: 1250, discountMinor: 0, netMinor: 3750, taxLines: [{ ratePpm: 80000, taxMicros: '300000000' }] }],
  payments: [{ id: '019f8a30-0000-7000-8000-000000000003', method: 'cash', amountMinor: 1500, tenderedMinor: 1500, changeMinor: 0, methodId: 'cash-payment' }, { id: '019f8a30-0000-7000-8000-000000000004', method: 'external', amountMinor: 2550, methodId: 'card-terminal' }],
  subtotalMinor: 3750,
  discountMinor: 0,
  taxMinor: 300,
  totalMinor: 4050,
  taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
  display: { currency: 'USD', exponent: 2, taxInclusive: false, subtotalMinor: 3750, discountMinor: 0, taxMinor: 300, totalMinor: 4050, lines: [{ lineId: '019f8a30-0000-7000-8000-000000000002', amountMinor: 3750, discounts: [] }], orderDiscountMinor: 0 },
  taxByRate: [{ ratePpm: 80000, netMinor: 3750, amountMinor: 300, grossMinor: 4050 }],
  customer: null,
  note: 'Leave at the counter',
};

const orders = { woocommerce, medusa, vendure };
const goldenCaps = { woocommerce: [8, 9], medusa: [7, 9], vendure: [7, 9] } as const;
const golden = (platform: keyof typeof orders): Record<string, string> =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`./__fixtures__/order-create-method-id/${platform}.json`, import.meta.url)), 'utf8'));
const envelope = (order: PosOrder, cap: number) => toOrderCreateEnvelope(order, 'device-golden', 1, { maxVersion: cap });
const withoutIds = (order: PosOrder): PosOrder => ({ ...order, payments: order.payments.map(({ methodId: _id, ...payment }) => payment) });
/** The JSON of `make()`, or of the error it throws, so a cap too low for the order compares too. */
const outcome = (make: () => unknown) => {
  try { return JSON.stringify(make()); } catch (error) { return `throws ${String(error)}`; }
};
/** Woo's own stored figures for the inclusive sale, as its till holds them. */
const wooLocal = { lines: woocommerce.lines.map((line) => ({ id: line.id, netMicros: line.netMicros, discountMinor: line.discountMinor,
  taxLines: line.taxLines.map(({ ratePpm }) => ({ rateId: 1, compound: false, ratePpm })) })) };
const wooPayloads = (order: PosOrder, cap: number) => ({
  [`woo:${cap}`]: outcome(() => toWooOrderPayload(envelope(order, cap), undefined, { paymentsList: true })),
  [`woo:${cap}:local`]: outcome(() => toWooOrderPayload(envelope(order, cap), wooLocal, { paymentsList: true })),
});
/** A version-10 envelope as the cap-9 golden carries it: its version (9, or the order's lower today version) set back and every payment's methodId taken out. */
const asToday = (sent: OrderCreateEnvelope, version: number) => ({ ...sent, version,
  payload: { ...sent.payload, payments: sent.payload.payments.map(({ methodId: _id, ...payment }) => payment) } });

describe.each(['woocommerce', 'medusa', 'vendure'] as const)('order.create payment method ids on %s (condition 2)', (platform) => {
  const order = orders[platform];

  it("sends today's bytes at the platform's caps, whatever ids the legs carry", () => {
    expect(order.payments.every((payment) => payment.methodId)).toBe(true);
    const expected = golden(platform);
    for (const cap of goldenCaps[platform]) {
      expect(JSON.stringify(envelope(order, cap))).toBe(expected[String(cap)]);
      if (platform === 'woocommerce') {
        for (const [key, value] of Object.entries(wooPayloads(order, cap))) expect(value).toBe(expected[key]);
      }
    }
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('sends at cap %i exactly what the same order without ids sends', (cap) => {
    expect(outcome(() => envelope(order, cap))).toBe(outcome(() => envelope(withoutIds(order), cap)));
    if (platform === 'woocommerce') expect(wooPayloads(order, cap)).toStrictEqual(wooPayloads(withoutIds(order), cap));
  });

  it.each([10, 11])('sends version 10 with each leg\'s methodId at cap %i, otherwise the cap-9 bytes', (cap) => {
    const sent = envelope(order, cap), nine = golden(platform)['9'];
    expect(sent.version).toBe(10);
    expect(sent.payload.payments.map((payment) => payment.methodId)).toEqual(order.payments.map((payment) => payment.methodId));
    expect(JSON.stringify(asToday(sent, JSON.parse(nine).version))).toBe(nine);
  });
});
