// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

const order: PosOrder = {
  id: 'order-id', commandId: 'command-id', createdAt: '2026-09-23T12:00:00.000Z', updatedAt: '2026-09-23T12:00:00.000Z',
  currency: 'EUR', pricesIncludeTax: false, syncStatus: 'pending', subtotalMinor: 2900, discountMinor: 0, taxMinor: 551, totalMinor: 3451,
  lines: [
    { id: 'line1', productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', quantity: 2, unitPriceMinor: 850, discountMinor: 0, netMinor: 1700, taxLines: [] },
    { id: 'line2', productId: 'p2', name: 'Item 2', sku: '', quantity: 1, unitPriceMinor: 1200, discountMinor: 0, netMinor: 1200, taxLines: [] },
  ],
  payments: [
    { id: 'payment1', method: 'external', amountMinor: 1000, reference: 'terminal' },
    { id: 'payment2', method: 'cash', amountMinor: 2451, tenderedMinor: 3000, changeMinor: 549 },
  ],
  customer: { id: 'c1', name: 'Customer', email: 'buyer@example.com' }, note: 'Local note', registerId: 'r1', cashierRef: 'staff1',
};

const v3: PosOrder = { ...order,
  display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 2900, discountMinor: 0,
    taxMinor: 551, totalMinor: 3451, orderDiscountMinor: 0,
    lines: [{ lineId: 'line1', amountMinor: 1700, discounts: [] }, { lineId: 'line2', amountMinor: 1200, discounts: [] }] },
  taxByRate: [{ ratePpm: 190000, code: 'VAT', label: 'Tax 19%', netMinor: 2900, amountMinor: 551, grossMinor: 3451 }],
};

// The same full pipeline and deterministic identities as golden-v3.test.ts.
function goldenV3(): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 200000 } });
  const inclusive = builder.addLine({ productId: 'variant_inclusive', variantId: 'variant_inclusive', name: 'Inclusive item', sku: 'INCLUSIVE',
    unitPrice: { amount: 1200, currency: 'EUR', taxInclusive: true }, quantity: 2, taxRates: [{ code: 'VAT20', ratePpm: 200000 }] });
  builder.addLine({ productId: 'variant_exclusive', variantId: 'variant_exclusive', name: 'Exclusive item', sku: 'EXCLUSIVE',
    unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false }, quantity: 1, taxRates: [{ ratePpm: 100000 }] });
  builder.applyLineDiscount(inclusive, { type: 'fixed', value: 120, label: 'Line discount' });
  builder.applyOrderDiscount({ type: 'fixed', value: 120 });
  builder.addPayment({ method: 'cash', amountMinor: 4000, reference: 'cash_receipt_1' });
  builder.setCustomer({ id: 'cus_golden_v3', name: 'Golden Buyer', email: 'buyer@example.com' });
  const ids = ['019f6d2e-7800-7000-8000-000000000002', 'line_inclusive', 'line_exclusive', 'payment_cash',
    '019f6d2e-7800-7000-8000-000000000001'];
  let nextId = 0;
  const finalized = finalizeOrder(builder.getSnapshot(), { now: new Date('2026-09-28T10:00:00.000Z'), newId: () => ids[nextId++],
    capabilities: { orderCreate: 3 }, registerId: 'register_golden', cashierRef: 'cashier_golden' });
  for (const discount of finalized.display!.lines[0].discounts) discount.discountId = 'discount_line';
  return { ...finalized, sessionId: '019f6d2e-7800-7000-8000-000000000003' };
}

describe('toOrderCreateEnvelope', () => {
  it('omits a malformed sessionId at version 3, and never refuses the sale for it', () => {
    for (const key of ['sessionId', 'lateSessionId'] as const) {
      for (const sessionId of ['', 's'.repeat(37), 's'.repeat(36), 'session-1', 123] as const) {
        const sale = { ...v3, [key]: sessionId } as PosOrder;
        const valid = typeof sessionId === 'string' && sessionId.length > 0 && sessionId.length <= 36;
        const envelope = toOrderCreateEnvelope(sale, 'device1');
        const expected = toOrderCreateEnvelope(v3, 'device1');
        expect(envelope).toStrictEqual({ ...expected, payload: { ...expected.payload, ...(valid ? { sessionId } : {}) } });
        if (!valid) expect(envelope.payload).not.toHaveProperty('sessionId');
        for (const maxVersion of [1, 2]) {
          expect(toOrderCreateEnvelope(sale, 'device1', 1, { maxVersion }))
            .toStrictEqual(toOrderCreateEnvelope(v3, 'device1', 1, { maxVersion }));
        }
      }
    }
  });

  it('no cap is byte-identical to today for v1, v2 and the golden v3', () => {
    const full = goldenV3();
    const legacy = { ...full, display: undefined, taxByRate: undefined };
    for (const [sale, version] of [[order, 1], [legacy, 2], [full, 3]] as const) {
      const envelope = toOrderCreateEnvelope(sale, 'device_golden');
      expect(envelope.version).toBe(version);
      expect(JSON.stringify(toOrderCreateEnvelope(sale, 'device_golden', 1, {}))).toBe(JSON.stringify(envelope));
    }
    expect(JSON.stringify(toOrderCreateEnvelope(full, 'device_golden'), null, 2) + '\n')
      .toBe(readFileSync(fileURLToPath(new URL('./__fixtures__/order-create-v3.json', import.meta.url)), 'utf8'));
  });

  it('caps v3 to 2, dropping only display, taxByRate, sessionId and customerId', () => {
    const full = goldenV3();
    const capped = toOrderCreateEnvelope(full, 'device_golden', 1, { maxVersion: 2 });
    const legacy = { ...full, display: undefined, taxByRate: undefined, sessionId: undefined, customer: { email: full.customer!.email } };
    expect(capped.version).toBe(2);
    expect(JSON.stringify(capped)).toBe(JSON.stringify(toOrderCreateEnvelope(legacy, 'device_golden')));
    const { display, taxByRate, sessionId, ...payload } = toOrderCreateEnvelope(full, 'device_golden').payload;
    expect(capped.payload).toStrictEqual({ ...payload, customer: { email: full.customer!.email } });
    expect(toOrderCreateEnvelope({ ...full, customer: { id: 'cus_golden_v3' } }, 'device_golden', 1, { maxVersion: 2 }).payload.customer).toBeNull();
  });

  it('caps a discount-free v3 order to 1', () => {
    const capped = toOrderCreateEnvelope({ ...v3, sessionId: 'session-1' }, 'device1', 1, { maxVersion: 1 });
    expect(capped.version).toBe(1);
    expect(JSON.stringify(capped)).toBe(JSON.stringify(toOrderCreateEnvelope(order, 'device1')));
  });

  it('throws UnsupportedOrderVersionError for a discounted order capped at 1', () => {
    const build = () => toOrderCreateEnvelope(goldenV3(), 'device1', 1, { maxVersion: 1 });
    expect(build).toThrow(UnsupportedOrderVersionError);
    expect(build).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_ORDER_VERSION', needed: 2, supported: 1 }));
  });

  it("an order's sentVersion caps its envelope without options", () => {
    const full = goldenV3();
    const saved = { ...full, sentVersion: 2 as const, downgradedFrom: 3 as const };
    expect(JSON.stringify(toOrderCreateEnvelope(saved, 'device1')))
      .toBe(JSON.stringify(toOrderCreateEnvelope(full, 'device1', 1, { maxVersion: 2 })));
    expect(toOrderCreateEnvelope(saved, 'device1', 1, { maxVersion: 3 })).toStrictEqual(toOrderCreateEnvelope(saved, 'device1'));
  });

  it('the cap is the lower of maxVersion and sentVersion', () => {
    for (const [sentVersion, maxVersion] of [[1, 2], [2, 1], [2, 3], [3, 2]] as const) {
      const envelope = toOrderCreateEnvelope({ ...v3, sentVersion }, 'device1', 1, { maxVersion });
      expect(envelope).toStrictEqual(toOrderCreateEnvelope(v3, 'device1', 1, { maxVersion: Math.min(sentVersion, maxVersion) }));
    }
  });

  it('sends version 1 and 2 byte-identical to before when the order has no ADR-065 fields', () => {
    const plain: PosOrder = { ...order, lines: [order.lines[0]], payments: [], customer: null, registerId: undefined,
      cashierRef: undefined, subtotalMinor: 1700, taxMinor: 323, totalMinor: 2023 };
    expect(JSON.stringify(toOrderCreateEnvelope(plain, 'device1'))).toBe(
      '{"id":"command-id","type":"order.create","version":1,"createdAt":"2026-09-23T12:00:00.000Z","deviceId":"device1","attempt":1,'
      + '"payload":{"clientOrderId":"order-id","createdAt":"2026-09-23T12:00:00.000Z","currency":"EUR","pricesIncludeTax":false,'
      + '"lines":[{"clientLineId":"line1","variantId":"v1","title":"Item 1","quantity":2,"unitPriceMinor":850}],"payments":[],'
      + '"subtotalMinor":1700,"taxMinor":323,"totalMinor":2023,"customer":null}}');
    const discounted = { ...plain, lines: [{ ...plain.lines[0], discountMinor: 100, netMinor: 1600 }],
      discountMinor: 100, subtotalMinor: 1600, taxMinor: 304, totalMinor: 1904 };
    expect(JSON.stringify(toOrderCreateEnvelope(discounted, 'device1'))).toBe(
      '{"id":"command-id","type":"order.create","version":2,"createdAt":"2026-09-23T12:00:00.000Z","deviceId":"device1","attempt":1,'
      + '"payload":{"clientOrderId":"order-id","createdAt":"2026-09-23T12:00:00.000Z","currency":"EUR","pricesIncludeTax":false,'
      + '"lines":[{"clientLineId":"line1","variantId":"v1","title":"Item 1","quantity":2,"unitPriceMinor":850,"discountMinor":100}],"payments":[],'
      + '"subtotalMinor":1600,"discountMinor":100,"taxMinor":304,"totalMinor":1904,"customer":null}}');
  });

  it('sends version 3 with display and taxByRate when the order carries them, discount-free and discounted', () => {
    const discounted: PosOrder = { ...v3, discountMinor: 100, subtotalMinor: 2800, taxMinor: 532, totalMinor: 3332,
      lines: [{ ...v3.lines[0], discountMinor: 100, netMinor: 1600 }, v3.lines[1]],
      display: { ...v3.display!, discountMinor: 100, taxMinor: 532, totalMinor: 3332,
        lines: [{ ...v3.display!.lines[0], discounts: [{ discountId: 'd1', label: 'Sale', amountMinor: 100 }] }, v3.display!.lines[1]] },
      taxByRate: [{ ratePpm: 190000, code: 'VAT', netMinor: 2800, amountMinor: 532, grossMinor: 3332 }] };
    for (const sale of [v3, discounted]) {
      const envelope = toOrderCreateEnvelope(sale, 'device1');
      expect(envelope.version).toBe(3);
      expect(envelope.payload.display).toStrictEqual({ ...sale.display!, lines: sale.display!.lines.map(({ lineId, ...line }) => ({
        clientLineId: lineId, ...line,
      })) });
      expect(envelope.payload.display!.lines.map((line) => line.clientLineId)).toEqual(envelope.payload.lines.map((line) => line.clientLineId));
      expect(envelope.payload.taxByRate).toStrictEqual(sale.taxByRate!.map(({ label, amountMinor, ...rate }) => ({ ...rate, taxMinor: amountMinor })));
      if (sale.discountMinor > 0) {
        expect(envelope.payload.discountMinor).toBe(100);
        expect(envelope.payload.lines[0].discountMinor).toBe(100);
        expect(envelope.payload.lines[1]).not.toHaveProperty('discountMinor');
      } else {
        expect(envelope.payload).not.toHaveProperty('discountMinor');
        for (const line of envelope.payload.lines) expect(line).not.toHaveProperty('discountMinor');
      }
    }
    expect(JSON.stringify(toOrderCreateEnvelope({ ...v3, sessionId: 'session-1' }, 'device1'))).toBe(JSON.stringify({
      id: 'command-id', type: 'order.create', version: 3, createdAt: order.createdAt, deviceId: 'device1', attempt: 1,
      payload: {
        clientOrderId: 'order-id', createdAt: order.createdAt, currency: 'EUR', pricesIncludeTax: false,
        lines: [{ clientLineId: 'line1', variantId: 'v1', title: 'Item 1', quantity: 2, unitPriceMinor: 850 },
          { clientLineId: 'line2', variantId: 'p2', title: 'Item 2', quantity: 1, unitPriceMinor: 1200 }],
        payments: [{ clientPaymentId: 'payment1', method: 'external', amountMinor: 1000, reference: 'terminal' },
          { clientPaymentId: 'payment2', method: 'cash', amountMinor: 2451, tenderedMinor: 3000, changeMinor: 549 }],
        subtotalMinor: 2900, taxMinor: 551, totalMinor: 3451,
        display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 2900, discountMinor: 0,
          taxMinor: 551, totalMinor: 3451, orderDiscountMinor: 0,
          lines: [{ clientLineId: 'line1', amountMinor: 1700, discounts: [] }, { clientLineId: 'line2', amountMinor: 1200, discounts: [] }] },
        taxByRate: [{ ratePpm: 190000, code: 'VAT', netMinor: 2900, taxMinor: 551, grossMinor: 3451 }],
        customer: { email: 'buyer@example.com', customerId: 'c1' }, registerId: 'r1', cashierRef: 'staff1', sessionId: 'session-1',
      },
    }));
    for (const incomplete of [{ ...v3, display: undefined }, { ...v3, taxByRate: undefined }]) {
      expect(toOrderCreateEnvelope(incomplete, 'device1')).toStrictEqual(toOrderCreateEnvelope(order, 'device1'));
    }
  });

  it('builds the same envelope bytes on every attempt', () => {
    const first = toOrderCreateEnvelope(v3, 'device1', 1);
    const second = toOrderCreateEnvelope(v3, 'device1', 2);
    expect([first.attempt, second.attempt]).toEqual([1, 2]);
    expect(JSON.stringify({ ...second, attempt: 1 })).toBe(JSON.stringify(first));
  });

  it("sends the picked customer's id at version 3, and never below 3", () => {
    const email = 'buyer@example.com';
    for (const [customer, expected] of [
      [{ id: 'cus_1', email }, { email, customerId: 'cus_1' }], [{ id: 'cus_1' }, { customerId: 'cus_1' }],
      [null, null], [{ id: 'x'.repeat(65), email }, { email }], [{ id: 'x'.repeat(65) }, null],
      [{ id: 'x'.repeat(64) }, { customerId: 'x'.repeat(64) }], [{ id: '' }, null], [{ email }, { email }],
    ] as const) {
      expect(toOrderCreateEnvelope({ ...v3, customer }, 'device1').payload.customer).toStrictEqual(expected);
      for (const discountMinor of [0, 100]) {
        const envelope = toOrderCreateEnvelope({ ...order, customer, lines: [{ ...order.lines[0], discountMinor }] }, 'device1');
        expect(envelope.version).toBe(discountMinor ? 2 : 1);
        expect(envelope.payload.customer).toStrictEqual(customer && 'email' in customer ? { email } : null);
      }
    }
  });

  it("sends the sale's session at version 3, stamped or late, and never below 3", () => {
    for (const stamp of [{ sessionId: 'session-1' }, { lateSessionId: 'session-1' }, { sessionId: 'session-1', lateSessionId: 'other' }]) {
      const envelope = toOrderCreateEnvelope({ ...v3, ...stamp }, 'device1');
      expect(envelope.payload.sessionId).toBe('session-1');
      expect(envelope.payload).not.toHaveProperty('lateSessionId');
      for (const discountMinor of [0, 100]) {
        const legacy = toOrderCreateEnvelope({ ...order, ...stamp, lines: [{ ...order.lines[0], discountMinor }] }, 'device1');
        expect(legacy.version).toBe(discountMinor ? 2 : 1);
        expect(legacy.payload).not.toHaveProperty('sessionId');
      }
    }
    expect(toOrderCreateEnvelope(v3, 'device1').payload).not.toHaveProperty('sessionId');
  });

  it('keeps the envelope bytes when the orphan sweep demotes a pending stamped order to a late sale', () => {
    const stamped = { ...v3, sessionId: 'session-1' };
    const { sessionId, ...unstamped } = stamped;
    const demoted = { ...unstamped, lateSessionId: sessionId };
    expect(JSON.stringify(toOrderCreateEnvelope(stamped, 'device1'))).toBe(JSON.stringify(toOrderCreateEnvelope(demoted, 'device1')));
  });

  it('maps all contract fields, falls back to productId, and survives JSON unchanged', () => {
    const before = structuredClone(order);
    const envelope = toOrderCreateEnvelope(order, 'device1', 3);
    expect(envelope).toStrictEqual({
      id: 'command-id', type: 'order.create', version: 1, createdAt: order.createdAt, deviceId: 'device1', attempt: 3,
      payload: {
        clientOrderId: 'order-id', createdAt: order.createdAt, currency: 'EUR', pricesIncludeTax: false,
        lines: [
          { clientLineId: 'line1', variantId: 'v1', title: 'Item 1', quantity: 2, unitPriceMinor: 850 },
          { clientLineId: 'line2', variantId: 'p2', title: 'Item 2', quantity: 1, unitPriceMinor: 1200 },
        ],
        payments: [
          { clientPaymentId: 'payment1', method: 'external', amountMinor: 1000, reference: 'terminal' },
          { clientPaymentId: 'payment2', method: 'cash', amountMinor: 2451, tenderedMinor: 3000, changeMinor: 549 },
        ],
        subtotalMinor: 2900, taxMinor: 551, totalMinor: 3451,
        customer: { email: 'buyer@example.com' }, registerId: 'r1', cashierRef: 'staff1',
      },
    });
    expect(JSON.parse(JSON.stringify(envelope))).toStrictEqual(envelope);
    expect(order).toStrictEqual(before);
    // A discount-free order stays version 1 and byte-identical to the payload before ADR-062, key order included.
    expect(JSON.stringify(envelope)).toBe('{"id":"command-id","type":"order.create","version":1,"createdAt":"2026-09-23T12:00:00.000Z",'
      + '"deviceId":"device1","attempt":3,"payload":{"clientOrderId":"order-id","createdAt":"2026-09-23T12:00:00.000Z","currency":"EUR",'
      + '"pricesIncludeTax":false,"lines":[{"clientLineId":"line1","variantId":"v1","title":"Item 1","quantity":2,"unitPriceMinor":850},'
      + '{"clientLineId":"line2","variantId":"p2","title":"Item 2","quantity":1,"unitPriceMinor":1200}],"payments":[{"clientPaymentId":'
      + '"payment1","method":"external","amountMinor":1000,"reference":"terminal"},{"clientPaymentId":"payment2","method":"cash",'
      + '"amountMinor":2451,"tenderedMinor":3000,"changeMinor":549}],"subtotalMinor":2900,"taxMinor":551,"totalMinor":3451,'
      + '"customer":{"email":"buyer@example.com"},"registerId":"r1","cashierRef":"staff1"}}');
  });

  // Test-only path: finalize still refuses discounts until the plugins honour version 2 (ADR-062).
  it('a discounted order is version 2: each discounted line carries discountMinor, and the order carries their sum', () => {
    const discounted: PosOrder = {
      ...order, subtotalMinor: 2610, discountMinor: 290, taxMinor: 496, totalMinor: 3106,
      lines: [
        { ...order.lines[0], discountMinor: 270, netMinor: 1430 },
        { ...order.lines[1], discountMinor: 20, netMinor: 1180, taxInclusive: true },
        { ...order.lines[1], id: 'line3', discountMinor: 0 },
      ],
    };
    const envelope = toOrderCreateEnvelope(discounted, 'device1');
    expect(envelope.version).toBe(2);
    expect(envelope.payload.lines).toStrictEqual([
      { clientLineId: 'line1', variantId: 'v1', title: 'Item 1', quantity: 2, unitPriceMinor: 850, discountMinor: 270 },
      { clientLineId: 'line2', variantId: 'p2', title: 'Item 2', quantity: 1, unitPriceMinor: 1200, taxInclusive: true, discountMinor: 20 },
      { clientLineId: 'line3', variantId: 'p2', title: 'Item 2', quantity: 1, unitPriceMinor: 1200 },
    ]);
    expect(envelope.payload.discountMinor).toBe(290);
    expect(envelope.payload.discountMinor).toBe(envelope.payload.lines.reduce((sum, line) => sum + (line.discountMinor ?? 0), 0));
    expect(envelope.payload).toMatchObject({ subtotalMinor: 2610, taxMinor: 496, totalMinor: 3106 });
    expect(JSON.parse(JSON.stringify(envelope))).toStrictEqual(envelope);
  });

  it.each([null, { name: 'Customer' }, { email: '' }])('omits undefined optional fields and uses null without an email: %j', (customer) => {
    const envelope = toOrderCreateEnvelope({ ...order, customer, registerId: undefined, cashierRef: undefined,
      payments: [{ id: 'payment', method: 'external', amountMinor: 3451, tenderedMinor: undefined, changeMinor: undefined, reference: undefined }],
    }, 'device1');
    expect(envelope.attempt).toBe(1);
    expect(envelope.payload.customer).toBeNull();
    for (const key of ['registerId', 'cashierRef', 'discountMinor', 'note']) expect(envelope.payload).not.toHaveProperty(key);
    for (const key of ['tenderedMinor', 'changeMinor', 'reference']) expect(envelope.payload.payments[0]).not.toHaveProperty(key);
    expect(JSON.parse(JSON.stringify(envelope))).toStrictEqual(envelope);
  });

  it("a single-mode order's payload has no taxInclusive key on any line (ADR-038 amendment)", () => {
    const envelope = toOrderCreateEnvelope(order, 'device1');
    for (const line of envelope.payload.lines) expect(line).not.toHaveProperty('taxInclusive');
  });

  // Registers c1a (ADR-032, late sale): lateSessionId is local only, like sessionId.
  it('never sends lateSessionId, in version 1 or 2', () => {
    const discounted: PosOrder = { ...order, discountMinor: 100, lines: [{ ...order.lines[0], discountMinor: 100 }, order.lines[1]] };
    for (const [sale, version] of [[order, 1], [discounted, 2]] as const) {
      const envelope = toOrderCreateEnvelope({ ...sale, lateSessionId: 'session-1' }, 'device1');
      expect(envelope.version).toBe(version);
      expect(envelope).toStrictEqual(toOrderCreateEnvelope(sale, 'device1'));
      expect(JSON.stringify(envelope)).not.toContain('session-1');
    }
  });

  it('a converted line carries its own taxInclusive, the rest are unchanged', () => {
    const converted: PosOrder = { ...order, lines: [{ ...order.lines[0], taxInclusive: true }, order.lines[1]] };
    const envelope = toOrderCreateEnvelope(converted, 'device1');
    expect(envelope.payload.lines[0]).toStrictEqual({ clientLineId: 'line1', variantId: 'v1', title: 'Item 1', quantity: 2, unitPriceMinor: 850, taxInclusive: true });
    expect(envelope.payload.lines[1]).not.toHaveProperty('taxInclusive');
    expect(JSON.parse(JSON.stringify(envelope))).toStrictEqual(envelope);
  });
});

describe('names and ids within the order.create bounds', () => {
  const named = (name: string): PosOrder => ({ ...order, lines: [{ ...order.lines[0], name }, order.lines[1]] });
  const title = (name: string) => toOrderCreateEnvelope(named(name), 'device1').payload.lines[0].title!;

  it('sends a 300-character name as 255 characters ending in …, while the stored order keeps all 300', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
    builder.addLine({ productId: 'p1', name: 'n'.repeat(300), unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    const stored = finalizeOrder(builder.getSnapshot());
    expect(toOrderCreateEnvelope(stored, 'device1').payload.lines[0].title).toBe(`${'n'.repeat(254)}…`);
    expect(stored.lines[0].name).toHaveLength(300);
    expect(title('n'.repeat(255))).toBe('n'.repeat(255));
  });

  it('never splits a surrogate pair at the cut', () => {
    expect(title(`${'x'.repeat(253)}😀${'y'.repeat(50)}`)).toBe(`${'x'.repeat(253)}…`);
    expect(title(`${'x'.repeat(252)}😀${'y'.repeat(50)}`)).toBe(`${'x'.repeat(252)}😀…`);
    // With the u flag, a surrogate range matches only a lone surrogate, never half of a pair.
    for (const at of [252, 253, 254]) expect(title(`${'x'.repeat(at)}😀${'y'.repeat(50)}`)).not.toMatch(/[\uD800-\uDFFF]/u);
  });

  it('strips NUL from a name, before measuring it', () => {
    expect(title('Co\u0000ff\u0000ee')).toBe('Coffee');
    expect(title('a\u0000'.repeat(200))).toBe('a'.repeat(200));
  });

  it('clamps and strips a v3 discount label, leaving the stored order whole', () => {
    const label = `D\u0000${'d'.repeat(300)}`;
    const discounted: PosOrder = { ...v3, display: { ...v3.display!,
      lines: [{ lineId: 'line1', amountMinor: 1700, discounts: [{ discountId: 'd1', label, amountMinor: 0 }] }, v3.display!.lines[1]] } };
    const sent = toOrderCreateEnvelope(discounted, 'device1').payload.display!.lines[0].discounts[0];
    expect(sent).toStrictEqual({ discountId: 'd1', label: `D${'d'.repeat(253)}…`, amountMinor: 0 });
    expect(discounted.display!.lines[0].discounts[0].label).toBe(label);
  });

  it("the till's minted ids are at most 255 characters, with no NUL", () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addLine({ productId: 'p2', name: 'Item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'external', amountMinor: 50 });
    builder.addPayment({ method: 'cash', amountMinor: 150 });
    const { id, payload } = toOrderCreateEnvelope(finalizeOrder(builder.getSnapshot()), 'device1');
    const ids = [id, payload.clientOrderId, ...payload.lines.map((line) => line.clientLineId),
      ...payload.payments.map((payment) => payment.clientPaymentId)];
    expect(ids).toHaveLength(6);
    for (const minted of ids) {
      expect(minted.length).toBeLessThanOrEqual(255);
      expect(minted).not.toContain('\u0000');
    }
  });
});
