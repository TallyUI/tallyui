// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CommandEnvelope, OrderCreatePayload } from '@tallyui/core';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder } from './finalize';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v3.json', import.meta.url));

describe('order.create v3 shared golden envelope', () => {
  it('the fullest v3 envelope matches the shared golden file byte for byte', () => {
    const builder = createOrderBuilder({
      currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 200000 },
    });
    const inclusiveLineId = builder.addLine({
      productId: 'variant_inclusive', variantId: 'variant_inclusive', name: 'Inclusive item', sku: 'INCLUSIVE',
      unitPrice: { amount: 1200, currency: 'EUR', taxInclusive: true }, quantity: 2,
      taxRates: [{ code: 'VAT20', ratePpm: 200000 }],
    });
    builder.addLine({
      productId: 'variant_exclusive', variantId: 'variant_exclusive', name: 'Exclusive item', sku: 'EXCLUSIVE',
      unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false }, quantity: 1,
      taxRates: [{ ratePpm: 100000 }],
    });
    builder.applyLineDiscount(inclusiveLineId, { type: 'fixed', value: 120, label: 'Line discount' });
    builder.applyOrderDiscount({ type: 'fixed', value: 120 });
    builder.addPayment({ method: 'cash', amountMinor: 4000, reference: 'cash_receipt_1' });
    builder.setCustomer({ id: 'cus_golden_v3', name: 'Golden Buyer', email: 'buyer@example.com' });

    const ids = [
      '019f6d2e-7800-7000-8000-000000000002', 'line_inclusive', 'line_exclusive', 'payment_cash',
      '019f6d2e-7800-7000-8000-000000000001',
    ];
    let nextId = 0;
    const finalized = finalizeOrder(builder.getSnapshot(), {
      now: new Date('2026-09-28T10:00:00.000Z'), newId: () => ids[nextId++],
      capabilities: { orderCreate: 3 }, registerId: 'register_golden', cashierRef: 'cashier_golden',
    });
    // Like newId above, normalize the builder-minted discount id after finalization.
    for (const discount of finalized.display!.lines[0].discounts) discount.discountId = 'discount_line';
    const stamped = { ...finalized, sessionId: '019f6d2e-7800-7000-8000-000000000003' };
    const envelope = toOrderCreateEnvelope(stamped, 'device_golden', 1);
    const fileText = readFileSync(fixturePath, 'utf8');
    expect(JSON.stringify(envelope, null, 2) + '\n').toBe(fileText);
  });

  it("the golden envelope's figures agree with each other", () => {
    const { payload } = JSON.parse(readFileSync(fixturePath, 'utf8')) as CommandEnvelope<OrderCreatePayload>;
    const display = payload.display!;
    const taxByRate = payload.taxByRate!;
    expect(display.totalMinor).toBe(payload.totalMinor);
    expect(display.taxMinor).toBe(payload.taxMinor);
    expect(taxByRate.reduce((sum, rate) => sum + rate.taxMinor, 0)).toBe(payload.taxMinor);
    for (const rate of taxByRate) expect(rate.grossMinor).toBe(rate.netMinor + rate.taxMinor);
    expect(display.lines.reduce((sum, line) => sum + line.amountMinor, 0)).toBe(display.subtotalMinor);
    for (const line of display.lines) {
      expect(payload.lines.map((payloadLine) => payloadLine.clientLineId)).toContain(line.clientLineId);
    }
    expect(payload.discountMinor).toBe(payload.lines.reduce((sum, line) => sum + (line.discountMinor ?? 0), 0));
  });
});
