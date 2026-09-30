// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { resolveCapabilities } from '@tallyui/core';
import { medusaAdminUserConnector } from '@tallyui/connector-medusa';
import { createOrderBuilder } from '../order/order-builder';
import { taxLinesByRate } from '../tax/exact';
import type { LogEntry } from '../logging';
import { outboxLogger } from '../outbox/logger';
import { toOrderCreateEnvelope } from './command';
import { finalizeOrder, freezeSentForm, withSentForm } from './finalize';
import { uuidv7 } from './uuidv7';
import type { PosOrderLocalWarning } from './types';

function sale() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
  builder.addLine({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', unitPrice: { amount: 850, currency: 'EUR' }, quantity: 2 });
  builder.addLine({ productId: 'p2', name: 'Item 2', unitPrice: { amount: 1200, currency: 'EUR' } });
  return builder;
}

function discountedSale() {
  const builder = sale();
  builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'fixed', value: 100 });
  builder.addPayment({ method: 'cash', amountMinor: 5000 });
  return builder;
}

describe('finalizeOrder', () => {
  it('appends localWarnings, remaps builder payment ids by position, and leaves envelope bytes unchanged', () => {
    const builder = sale();
    builder.addPayment({ method: 'external', amountMinor: 1000 });
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: 'e'.repeat(255) });
    const input = builder.getSnapshot();
    const localWarnings: PosOrderLocalWarning[] = [
      { code: 'payment_reference_dropped', paymentId: input.payments[1].id },
      { code: 'payment_reference_dropped', paymentId: input.payments[0].id },
    ];
    const before = structuredClone(localWarnings);
    const stored = finalizeOrder(input, { localWarnings });
    expect(stored.localWarnings).toEqual([
      { code: 'payment_reference_dropped', paymentId: stored.payments[1].id },
      { code: 'payment_reference_dropped', paymentId: stored.payments[0].id },
      { code: 'customer_omitted', field: 'email' },
    ]);
    expect(stored.payments.map((payment) => payment.id)).not.toEqual(input.payments.map((payment) => payment.id));
    expect(localWarnings).toEqual(before);
    const { localWarnings: _warnings, ...withoutWarnings } = stored;
    const withFailures = { ...stored, serverFailures: { since: 0, reason: 'server_error', isolated: true } };
    expect(JSON.stringify(toOrderCreateEnvelope(withFailures, 'device1'))).toBe(JSON.stringify(toOrderCreateEnvelope(withoutWarnings, 'device1')));
  });

  it('drops and logs a localWarnings entry naming an unknown payment rather than failing the sale, even with a throwing sink', () => {
    const builder = sale();
    builder.addPayment({ method: 'external', amountMinor: 1000 });
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    const input = builder.getSnapshot();
    const logged: LogEntry[] = [];
    outboxLogger.addSink({ id: 'finalize-unknown-payment', levels: ['warn'], write: (entry) => logged.push(entry) });
    try {
      const alone = finalizeOrder(input, { localWarnings: [{ code: 'payment_reference_dropped', paymentId: 'unknown' }] });
      expect(alone).not.toHaveProperty('localWarnings');
      expect(logged).toEqual([expect.objectContaining({ level: 'warn',
        message: 'finalize: dropped a localWarnings entry naming an unknown payment', data: { orderId: alone.id, paymentId: 'unknown' } })]);
      const kept = finalizeOrder(input, { localWarnings: [{ code: 'payment_reference_dropped', paymentId: 'unknown' },
        { code: 'payment_reference_dropped', paymentId: input.payments[0].id }] });
      expect(kept.localWarnings).toEqual([{ code: 'payment_reference_dropped', paymentId: kept.payments[0].id }]);
    } finally {
      outboxLogger.removeSink('finalize-unknown-payment');
    }
    outboxLogger.addSink({ id: 'finalize-throwing', levels: ['warn'], write: () => { throw new Error('sink down'); } });
    try {
      expect(finalizeOrder(input, { localWarnings: [{ code: 'payment_reference_dropped', paymentId: 'unknown' }] }))
        .not.toHaveProperty('localWarnings');
    } finally {
      outboxLogger.removeSink('finalize-throwing');
    }
  });

  it('copies a cash sale into a pending document without mutating or sharing input objects', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000, reference: 'drawer' });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: 'buyer@example.com' });
    builder.setNote('Sale note');
    const input = builder.getSnapshot();
    const before = structuredClone(input);
    const now = new Date('2026-09-23T12:00:00.000Z');
    const order = finalizeOrder(input, { now, registerId: 'r1', cashierRef: 'staff1' });
    expect(input).toStrictEqual(before);
    expect(order).toMatchObject({
      currency: 'EUR', pricesIncludeTax: false, subtotalMinor: 2900, discountMinor: 0,
      taxMinor: 551, totalMinor: 3451, syncStatus: 'pending', createdAt: now.toISOString(), updatedAt: now.toISOString(),
      registerId: 'r1', cashierRef: 'staff1', note: 'Sale note', customer: input.customer,
      payments: [{ method: 'cash', amountMinor: 3451, tenderedMinor: 5000, changeMinor: 1549, reference: 'drawer' }],
    });
    expect(order.lines[0]).toMatchObject({ productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', quantity: 2,
      unitPriceMinor: 850, discountMinor: 0, netMinor: 1700, taxLines: input.lineItems[0].taxLines });
    const ids = [order.id, ...order.lines.map((line) => line.id), ...order.payments.map((payment) => payment.id), order.commandId];
    expect(new Set(ids).size).toBe(ids.length);
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/));
    expect(order.customer).not.toBe(input.customer);
    expect(order.lines[0].taxLines[0]).not.toBe(input.lineItems[0].taxLines[0]);
    expect(order.payments[0]).not.toBe(input.payments[0]);
  });

  it('allocates mixed payment change to cash and omits empty metadata', () => {
    const builder = sale();
    builder.addPayment({ method: 'external', amountMinor: 1000, reference: 'terminal' });
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    const newId = vi.fn(() => uuidv7());
    const order = finalizeOrder(builder.getSnapshot(), { newId });
    expect(newId).toHaveBeenCalledTimes(6);
    expect([order.id, ...order.lines.map((l) => l.id), ...order.payments.map((p) => p.id), order.commandId])
      .toEqual(newId.mock.results.map((result) => result.value));
    expect(order.payments).toEqual([
      { id: order.payments[0].id, method: 'external', amountMinor: 1000, reference: 'terminal' },
      { id: order.payments[1].id, method: 'cash', amountMinor: 2451, tenderedMinor: 3000, changeMinor: 549 },
    ]);
    expect(order.payments.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(3451);
    expect(order.customer).toBeNull();
    for (const key of ['note', 'registerId', 'cashierRef']) expect(order).not.toHaveProperty(key);
  });

  it('allocates change backwards across cash payments, skipping external payments', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    builder.addPayment({ method: 'external', amountMinor: 1000 });
    builder.addPayment({ method: 'cash', amountMinor: 1000 });
    const order = finalizeOrder(builder.getSnapshot());
    expect(order.payments.map(({ amountMinor, changeMinor }) => [amountMinor, changeMinor])).toEqual([[2451, 549], [1000, undefined], [0, 1000]]);
  });

  it('records zero change when paid exactly', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 3451 });
    expect(finalizeOrder(builder.getSnapshot()).payments[0]).toMatchObject({ amountMinor: 3451, tenderedMinor: 3451, changeMinor: 0 });
  });

  it('never sends a stamped register session: the order.create envelope is byte-identical with and without it', () => {
    const finalize = () => {
      let n = 0;
      const newId = () => `00000000-0000-7000-8000-${String(++n).padStart(12, '0')}`;
      const builder = sale();
      builder.addPayment({ method: 'cash', amountMinor: 5000 });
      return finalizeOrder(builder.getSnapshot(), { now: new Date('2026-09-23T12:00:00.000Z'), newId, registerId: 'r1' });
    };
    const stamped = { ...finalize(), sessionId: 'session-1' };
    const unstamped = finalize();
    expect(unstamped).not.toHaveProperty('sessionId');
    expect(JSON.stringify(toOrderCreateEnvelope(stamped, 'device-1'))).toBe(JSON.stringify(toOrderCreateEnvelope(unstamped, 'device-1')));
  });

  // TallyUI (#126 review, item 1): stampSession, which checks the session is live, is the only
  // way to set a sale's session. Revert: copy `options.sessionId` onto the order again.
  it('cannot set a session: an unchecked sessionId passed through a cast never reaches the order', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    const options = { registerId: 'r1', sessionId: 'unknown-session' } as Parameters<typeof finalizeOrder>[1];
    expect(finalizeOrder(builder.getSnapshot(), options)).not.toHaveProperty('sessionId');
  });

  it('finalizes an order with a converted line, carrying taxInclusive through to the payload line only', () => {
    const builder = sale();
    builder.addLine({ productId: 'p3', name: 'Item 3', sku: 'SKU3', unitPrice: { amount: 500, currency: 'EUR', taxInclusive: true } });
    builder.addPayment({ method: 'cash', amountMinor: 10000 });
    const order = finalizeOrder(builder.getSnapshot());
    expect(order.lines[0]).not.toHaveProperty('taxInclusive');
    expect(order.lines[2]).toMatchObject({ name: 'Item 3', taxInclusive: true });
    const envelope = toOrderCreateEnvelope(order, 'device1');
    expect(envelope.payload.lines[0]).not.toHaveProperty('taxInclusive');
    expect(envelope.payload.lines[2]).toMatchObject({ title: 'Item 3', taxInclusive: true });
  });

  it('finalizes an order whose lines all agree with the store tax mode', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 3451 });
    expect(() => finalizeOrder(builder.getSnapshot())).not.toThrow();
  });

  it.each(['no lines', 'underpaid', 'unsupported payment method voucher', 'change exceeds cash',
    'discounts are not supported by the server yet (order.create v2)', 'payments do not reconcile'])(
    'rejects %s', (reason) => {
      const builder = sale();
      if (reason === 'no lines') builder.clear();
      else if (reason === 'unsupported payment method voucher') builder.addPayment({ method: 'voucher', amountMinor: 3451 });
      else if (reason === 'change exceeds cash') {
        builder.addPayment({ method: 'external', amountMinor: 4000 });
        builder.addPayment({ method: 'cash', amountMinor: 0 });
      } else if (reason.startsWith('discounts')) {
        builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'fixed', value: 100 });
        builder.addPayment({ method: 'cash', amountMinor: 5000 });
      }
      const order = builder.getSnapshot();
      if (reason === 'payments do not reconcile') order.paidMinor = order.totalMinor;
      expect(() => finalizeOrder(order)).toThrow(`finalize: ${reason}`);
    },
  );

  it('still rejects an order discount, now allocated to the lines, with the same Error', () => {
    const builder = sale();
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    expect(() => finalizeOrder(builder.getSnapshot()))
      .toThrow(new Error('finalize: discounts are not supported by the server yet (order.create v2)'));
  });

  it('rejects a hand-built order with a negative discountMinor (the guard checks non-zero, not just positive)', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    const order = builder.getSnapshot();
    const rigged = {
      ...order,
      discountMinor: -100,
      discounts: [{ id: 'd1', type: 'fixed' as const, value: -100, amountMinor: -100 }],
      lineItems: order.lineItems.map((line, i) =>
        i === 0 ? { ...line, discountMinor: -100, orderDiscountMinor: -100 } : line,
      ),
    };
    expect(() => finalizeOrder(rigged))
      .toThrow(new Error('finalize: negative discount'));
  });
});

describe('finalizeOrder refuses a pass-through reference outside the order.create bounds', () => {
  const paid = (reference?: string) => {
    const builder = sale();
    builder.addPayment({ method: 'external', amountMinor: 3451, ...(reference !== undefined ? { reference } : {}) });
    return builder.getSnapshot();
  };

  it.each([
    ['an over-long cashierRef', paid(), { cashierRef: 'c'.repeat(256) }, 'cashierRef is too long (max 255 characters)'],
    ['a payment reference with a NUL', paid('ref\u0000'), {}, "the external payment's reference contains a NUL character"],
    ['an over-long registerId', paid(), { registerId: 'r'.repeat(256) }, 'registerId is too long (max 255 characters)'],
  ] as const)('refuses %s, naming the field, before any id is minted', (_name, input, options, message) => {
    const newId = vi.fn(uuidv7);
    expect(() => finalizeOrder(input, { ...options, newId })).toThrow(new Error(`finalize: ${message}`));
    expect(newId).not.toHaveBeenCalled();
  });

  it("checks the variantId the envelope sends, or the productId when there's none, naming the line", () => {
    const input = paid();
    const lines = (variantId?: string, productId = 'p') =>
      ({ ...input, lineItems: [{ ...input.lineItems[0], variantId, productId: 'x'.repeat(300) }, { ...input.lineItems[1], productId }] });
    expect(() => finalizeOrder(lines('v'.repeat(256)))).toThrow(new Error('finalize: "Item 1": the variant id is too long (max 255 characters)'));
    expect(() => finalizeOrder(lines('v', 'p\u0000'))).toThrow(new Error('finalize: "Item 2": the product id contains a NUL character'));
    expect(() => finalizeOrder(lines('v'.repeat(255)))).not.toThrow();
  });

  it('names the line by at most 60 units of its name plus …, NUL stripped, never splitting a surrogate pair', () => {
    const input = paid();
    const named = (name: string) => ({ ...input, lineItems: [{ ...input.lineItems[0], name, variantId: 'v'.repeat(256) }, input.lineItems[1]] });
    const name = `N\u0000${'n'.repeat(4998)}`;
    expect(name).toHaveLength(5000);
    expect(() => finalizeOrder(named(name))).toThrow(new Error(`finalize: "N${'n'.repeat(59)}…": the variant id is too long (max 255 characters)`));
    expect(() => finalizeOrder(named(`${'x'.repeat(59)}😀tail`))).toThrow(new Error(`finalize: "${'x'.repeat(59)}…": the variant id is too long (max 255 characters)`));
    expect(() => finalizeOrder(named('x'.repeat(61)))).toThrow(new Error(`finalize: "${'x'.repeat(61)}": the variant id is too long (max 255 characters)`));
  });

  it('at capability 3, also refuses a line discount id or a tax code the envelope sends; below 3 neither is sent', () => {
    const input = discountedSale().getSnapshot();
    expect(input.display.lines[0].discounts).toHaveLength(1);
    const longId = { ...input, display: { ...input.display, lines: input.display.lines.map((line, i) => i > 0 ? line
      : { ...line, discounts: line.discounts.map((discount) => ({ ...discount, discountId: 'd'.repeat(256) })) }) } };
    const nulCode = { ...input, lineItems: input.lineItems.map((line, i) => i === 0 ? line
      : { ...line, taxLines: line.taxLines.map((tax) => ({ ...tax, code: 'VAT\u0000' })) }) };
    expect(nulCode.lineItems[1].taxLines).toHaveLength(1);
    expect(() => finalizeOrder(longId, { capabilities: { orderCreate: 3 } }))
      .toThrow(new Error('finalize: "Item 1": the discount id is too long (max 255 characters)'));
    expect(() => finalizeOrder(nulCode, { capabilities: { orderCreate: 3 } }))
      .toThrow(new Error('finalize: "Item 2": the tax code contains a NUL character'));
    for (const order of [longId, nulCode]) expect(() => finalizeOrder(order, { capabilities: { orderCreate: 2 } })).not.toThrow();
  });

  it('accepts every reference at 255 characters', () => {
    expect(() => finalizeOrder(paid('p'.repeat(255)), { cashierRef: 'c'.repeat(255), registerId: 'r'.repeat(255) })).not.toThrow();
  });
});

describe('freezeSentForm', () => {
  it('freezes an older stored order once, changing only display strings and unsendable customer fields', () => {
    const stored = finalizeOrder(discountedSale().getSnapshot(), { capabilities: { orderCreate: 3 } });
    const longId = 'id-'.repeat(100);
    Object.assign(stored, { id: longId, commandId: longId, registerId: longId, cashierRef: longId,
      sessionId: longId, lateSessionId: longId, customer: { id: 'c\u00001', name: 'Customer', email: 'e'.repeat(255) } });
    Object.assign(stored.lines[0], { id: longId, productId: longId, variantId: longId, name: 'N'.repeat(300) });
    stored.display!.lines[0].lineId = longId;
    Object.assign(stored.display!.lines[0].discounts[0], { discountId: longId, label: 'D'.repeat(300) });
    Object.assign(stored.payments[0], { id: longId, reference: 'R'.repeat(300) });
    const before = structuredClone(stored);
    const frozen = freezeSentForm(stored);
    expect(frozen).not.toBe(stored);
    expect(frozen.lines[0].name).toBe(`${'N'.repeat(254)}…`);
    expect(frozen.display!.lines[0].discounts[0].label).toBe(`${'D'.repeat(254)}…`);
    expect(frozen.payments[0].reference).toBe(`${'R'.repeat(254)}…`);
    expect(frozen.customer).toStrictEqual({ name: 'Customer' });
    // An exact comparison pins every id, figure, timestamp and other field to the original.
    const expected = structuredClone(before);
    expected.lines[0].name = `${'N'.repeat(254)}…`;
    expected.display!.lines[0].discounts[0].label = `${'D'.repeat(254)}…`;
    expected.payments[0].reference = `${'R'.repeat(254)}…`;
    expected.customer = { name: 'Customer' };
    expected.localWarnings = [{ code: 'customer_omitted', field: 'email' }, { code: 'customer_omitted', field: 'id' }];
    expect(frozen).toStrictEqual(expected);
    expect(stored).toStrictEqual(before);
    expect(freezeSentForm(frozen)).toBe(frozen);
  });

  it('returns the same object for an already-frozen order', () => {
    const stored = finalizeOrder(discountedSale().getSnapshot(), { capabilities: { orderCreate: 3 } });
    expect(freezeSentForm(stored)).toBe(stored);
    expect(stored.localWarnings).toBeUndefined();
  });

  it('does not duplicate a customer omission already recorded', () => {
    const stored = finalizeOrder(discountedSale().getSnapshot(), { capabilities: { orderCreate: 3 } });
    stored.customer = { email: 'e'.repeat(255), id: 'i'.repeat(65) };
    stored.localWarnings = [{ code: 'customer_omitted', field: 'email' }, { code: 'customer_omitted', field: 'id' }];
    const frozen = freezeSentForm(stored);
    expect(frozen.customer).toEqual({});
    expect(frozen.localWarnings).toEqual(stored.localWarnings);
    expect(freezeSentForm(frozen)).toBe(frozen);
  });
});

describe('finalizeOrder freezes the sent form (task #36)', () => {
  const lone = /[\uD800-\uDFFF]/u; // with the u flag, only a lone surrogate matches, never half of a pair

  it('withSentForm uses the frozen name, discount label and customer email without mutating either input', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    const id = builder.addLine({ productId: 'p1', name: 'N'.repeat(300), unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.applyLineDiscount(id, { type: 'fixed', value: 100, label: 'D'.repeat(300) });
    builder.setCustomer({ id: 'c1', name: 'Customer', email: `${'a'.repeat(246)}@test.com` });
    builder.addPayment({ method: 'cash', amountMinor: 1000 });
    const order = builder.getSnapshot();
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 3 } });
    const beforeOrder = structuredClone(order);
    const beforePosOrder = structuredClone(posOrder);
    const receipt = withSentForm(order, posOrder);
    expect(receipt).not.toBe(order);
    expect(receipt.lineItems[0].name).toBe(posOrder.lines[0].name);
    expect(receipt.lineItems[0].name).toBe(`${'N'.repeat(254)}…`);
    expect(receipt.display.lines[0].discounts[0].label).toBe(posOrder.display!.lines[0].discounts[0].label);
    expect(receipt.display.lines[0].discounts[0].label).toBe(`${'D'.repeat(254)}…`);
    expect(receipt.customer).toStrictEqual({ id: 'c1', name: 'Customer' });
    expect({ ...receipt, lineItems: order.lineItems, display: order.display, customer: order.customer }).toStrictEqual(order);
    expect({ ...receipt.lineItems[0], name: order.lineItems[0].name }).toStrictEqual(order.lineItems[0]);
    expect({ ...receipt.display, lines: order.display.lines }).toStrictEqual(order.display);
    expect({ ...receipt.display.lines[0], discounts: order.display.lines[0].discounts }).toStrictEqual(order.display.lines[0]);
    expect({ ...receipt.display.lines[0].discounts[0], label: order.display.lines[0].discounts[0].label })
      .toStrictEqual(order.display.lines[0].discounts[0]);
    expect(order).toStrictEqual(beforeOrder);
    expect(posOrder).toStrictEqual(beforePosOrder);
  });

  it('stores a line name cut to 255 units ending in …, NUL stripped, never splitting a surrogate pair; the builder Order keeps it whole', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 0, pricesIncludeTax: false } });
    const plain = `N\u0000${'n'.repeat(298)}`;
    const emoji = `N\u0000${'x'.repeat(252)}😀${'y'.repeat(44)}`;
    expect([plain.length, emoji.length]).toEqual([300, 300]);
    builder.addLine({ productId: 'p1', name: plain, unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addLine({ productId: 'p2', name: emoji, unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addPayment({ method: 'cash', amountMinor: 1000 });
    const stored = finalizeOrder(builder.getSnapshot());
    expect(stored.lines[0].name).toBe(`N${'n'.repeat(253)}…`);
    expect(stored.lines[0].name).toHaveLength(255);
    expect(stored.lines[1].name).toBe(`N${'x'.repeat(252)}…`);
    for (const { name } of stored.lines) expect(name).not.toMatch(lone);
    expect(stored.lines.some(({ name }) => name.includes('\u0000'))).toBe(false);
    expect(builder.getSnapshot().lineItems.map((line) => line.name)).toEqual([plain, emoji]);
  });

  it('stores a v3 discount label cut and stripped the same way; the builder Order keeps it whole', () => {
    const builder = sale();
    const label = `D\u0000${'d'.repeat(300)}`;
    builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'fixed', value: 100, label });
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    const stored = finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 3 } });
    expect(stored.display!.lines[0].discounts[0].label).toBe(`D${'d'.repeat(253)}…`);
    expect(builder.getSnapshot().display.lines[0].discounts[0].label).toBe(label);
  });

  it.each([
    ['a 255-character email', { id: 'c1', name: 'Long', email: `${'a'.repeat(246)}@test.com` }, { id: 'c1', name: 'Long' }],
    ['a customerId with a NUL', { id: 'c\u00001', name: 'Nul', email: 'nul@test.com' }, { name: 'Nul', email: 'nul@test.com' }],
  ])('leaves %s out of the stored customer, keeping the name', (_name, customer, expected) => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    builder.setCustomer(customer);
    expect(finalizeOrder(builder.getSnapshot()).customer).toStrictEqual(expected);
    expect(builder.getSnapshot().customer).toStrictEqual(customer);
  });

  it('withSentForm leaves out a customer id the stored customer lacks', () => {
    const builder = discountedSale();
    builder.setCustomer({ id: 'c\u00001', name: 'Customer', email: 'buyer@example.com' });
    const order = builder.getSnapshot();
    const stored = finalizeOrder(order, { capabilities: { orderCreate: 3 } });
    expect(stored.customer).not.toHaveProperty('id');
    expect(withSentForm(order, stored).customer).toStrictEqual({ name: 'Customer', email: 'buyer@example.com' });
    expect(order.customer?.id).toBe('c\u00001');
  });
});

describe('finalizeOrder capability gate (ADR-062)', () => {
  it('rejects a discount when the capability is explicitly 1, same as no capabilities', () => {
    const order = discountedSale().getSnapshot();
    expect(() => finalizeOrder(order, { capabilities: { orderCreate: 1 } }))
      .toThrow('finalize: discounts are not supported by the server yet (order.create v2)');
  });

  it('accepts a discount and produces a version-2 envelope when the capability is 2', () => {
    const order = discountedSale().getSnapshot();
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 2 } });
    expect(posOrder.discountMinor).toBeGreaterThan(0);
    const envelope = toOrderCreateEnvelope(posOrder, 'device1');
    expect(envelope.version).toBe(2);
    expect(envelope.payload.discountMinor).toBe(posOrder.discountMinor);
  });

  // TallyUI (Medusa live contract, medusapos #62): a 100%-discounted sale needs no payment at all.
  it('finalizes a 100%-discounted sale at a total of 0, taking no payment, as a version-2 envelope', () => {
    const builder = sale();
    builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'percentage', value: 100 });
    builder.applyLineDiscount(builder.getSnapshot().lineItems[1].id, { type: 'percentage', value: 100 });
    const order = builder.getSnapshot();
    expect(order.totalMinor).toBe(0);
    const posOrder = finalizeOrder(order, { capabilities: { orderCreate: 2 } });
    expect(posOrder).toMatchObject({ totalMinor: 0, payments: [] });
    expect(toOrderCreateEnvelope(posOrder, 'device1').version).toBe(2);
  });

  it('leaves a discount-free order unaffected, whatever the capability', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 3451 });
    const order = builder.getSnapshot();
    expect(() => finalizeOrder(order, { capabilities: { orderCreate: 1 } })).not.toThrow();
    expect(() => finalizeOrder(order, { capabilities: { orderCreate: 2 } })).not.toThrow();
  });

  it('rejects a hand-built negative discount even with capabilities: { orderCreate: 2 }', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    const order = builder.getSnapshot();
    const rigged = {
      ...order,
      discountMinor: -100,
      discounts: [{ id: 'd1', type: 'fixed' as const, value: -100, amountMinor: -100 }],
      lineItems: order.lineItems.map((line, i) =>
        i === 0 ? { ...line, discountMinor: -100, orderDiscountMinor: -100 } : line,
      ),
    };
    expect(() => finalizeOrder(rigged, { capabilities: { orderCreate: 2 } }))
      .toThrow(new Error('finalize: negative discount'));
  });

  it('keeps the last known capability through an unreachable server (Front desk scenario)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('network error'));
    const context = { connectorId: medusaAdminUserConnector.id, baseUrl: 'https://medusa.test', headers: {} };
    const fresh = await medusaAdminUserConnector.capabilities!(context);
    fetchSpy.mockRestore();
    expect(fresh).toBeUndefined();
    const capabilities = resolveCapabilities(fresh, { orderCreate: 2 });
    expect(capabilities).toEqual({ orderCreate: 2 });
    const order = discountedSale().getSnapshot();
    const posOrder = finalizeOrder(order, { capabilities });
    expect(toOrderCreateEnvelope(posOrder, 'device1').version).toBe(2);
  });
});

describe('finalizeOrder version 3 (ADR-065)', () => {
  it('writes no display or taxByRate below capability 3', () => {
    const builder = sale();
    builder.addPayment({ method: 'cash', amountMinor: 5000 });
    const now = new Date('2026-09-23T12:00:00.000Z');
    for (const capabilities of [undefined, { orderCreate: 1 }, { orderCreate: 2 }]) {
      let n = 0;
      const result = finalizeOrder(builder.getSnapshot(), { now, newId: () => `id-${++n}`, capabilities });
      expect(result).toStrictEqual({
        id: 'id-1', createdAt: now.toISOString(), updatedAt: now.toISOString(), commandId: 'id-5', syncStatus: 'pending',
        currency: 'EUR', pricesIncludeTax: false,
        lines: [
          { id: 'id-2', productId: 'p1', variantId: 'v1', name: 'Item 1', sku: 'SKU1', quantity: 2,
            unitPriceMinor: 850, discountMinor: 0, netMinor: 1700, taxLines: [{ ratePpm: 190000, taxMicros: '323000000' }] },
          { id: 'id-3', productId: 'p2', name: 'Item 2', sku: '', quantity: 1,
            unitPriceMinor: 1200, discountMinor: 0, netMinor: 1200, taxLines: [{ ratePpm: 190000, taxMicros: '228000000' }] },
        ],
        payments: [{ id: 'id-4', method: 'cash', amountMinor: 3451, tenderedMinor: 5000, changeMinor: 1549 }],
        subtotalMinor: 2900, discountMinor: 0, taxMinor: 551, totalMinor: 3451, customer: null,
      });
    }
  });

  it("copies the receipt's display figures at capability 3, with lines joined to the order's line ids", () => {
    for (const [currency, exponent] of [['EUR', 2], ['JPY', 0]] as const) {
      const builder = createOrderBuilder({ currency, taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
      builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency } });
      builder.addLine({ productId: 'p2', name: 'Other', unitPrice: { amount: 500, currency } });
      builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'fixed', value: 100, label: 'Sale' });
      builder.addPayment({ method: 'cash', amountMinor: 2000 });
      const input = builder.getSnapshot();
      const result = finalizeOrder(input, { capabilities: { orderCreate: 3 } });
      const { currency: storedCurrency, exponent: storedExponent, ...display } = result.display!;
      expect([storedCurrency, storedExponent]).toEqual([currency, exponent]);
      expect(display.lines.map((line) => line.lineId)).toEqual(result.lines.map((line) => line.id));
      expect({ ...display, lines: display.lines.map((line, i) => ({ ...line, lineId: input.lineItems[i].id })) }).toStrictEqual(input.display);
    }
  });

  it("taxByRate at capability 3 equals the receipt's taxLinesByRate and sums to taxMinor", () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { getTaxRatePpm: () => 190000, pricesIncludeTax: false } });
    builder.addLine({ productId: 'p1', name: 'Inclusive', unitPrice: { amount: 1190, currency: 'EUR', taxInclusive: true },
      taxRates: [{ ratePpm: 190000, code: 'VAT' }] });
    builder.addLine({ productId: 'p2', name: 'Exclusive', unitPrice: { amount: 700, currency: 'EUR' }, taxRates: [{ ratePpm: 70000 }] });
    builder.applyLineDiscount(builder.getSnapshot().lineItems[0].id, { type: 'fixed', value: 100 });
    builder.applyOrderDiscount({ type: 'percentage', value: 10 });
    builder.addPayment({ method: 'cash', amountMinor: 3000 });
    const input = builder.getSnapshot();
    const result = finalizeOrder(input, { capabilities: { orderCreate: 3 } });
    expect(result.taxByRate).toStrictEqual(taxLinesByRate(input.lineItems, input.taxMinor).map(({ label, code, ...rate }) => ({
      ...rate, ...(code !== undefined ? { code } : {}), grossMinor: rate.netMinor + rate.amountMinor,
    })));
    expect(result.taxByRate).toHaveLength(2);
    expect(result.taxByRate!.reduce((sum, rate) => sum + rate.amountMinor, 0)).toBe(input.taxMinor);
    for (const rate of result.taxByRate!) {
      expect(rate.grossMinor).toBe(rate.netMinor + rate.amountMinor);
      expect(rate).not.toHaveProperty('label');
    }
    expect(result.display!.lines[0].discounts[0]).not.toHaveProperty('label');
  });

  it("the display copy shares no reference with the builder's snapshot", () => {
    const input = discountedSale().getSnapshot();
    const result = finalizeOrder(input, { capabilities: { orderCreate: 3 } });
    const before = structuredClone(result);
    expect(result.display).not.toBe(input.display);
    expect(result.display!.lines).not.toBe(input.display.lines);
    input.display.totalMinor = 1;
    input.display.lines[0].amountMinor = 2;
    input.display.lines[0].discounts[0].amountMinor = 3;
    input.display.lines[0].discounts.push({ discountId: 'extra', amountMinor: 4 });
    input.display.lines.push({ lineId: 'extra', amountMinor: 5, discounts: [] });
    expect(result).toStrictEqual(before);
  });

  it.each(['shorter', 'longer', 'reordered'])("refuses display lines that don't join the order's lines by id and count: %s", (kind) => {
    const input = discountedSale().getSnapshot();
    const lines = kind === 'shorter' ? input.display.lines.slice(0, 1)
      : kind === 'longer' ? [...input.display.lines, input.display.lines[0]] : [...input.display.lines].reverse();
    const mismatched = { ...input, display: { ...input.display, lines } };
    expect(() => finalizeOrder(mismatched, { capabilities: { orderCreate: 3 } }))
      .toThrow(new Error('finalize: display lines do not match the order lines'));
    expect(() => finalizeOrder(mismatched, { capabilities: { orderCreate: 2 } })).not.toThrow();
  });

  it('a consistent order still finalizes exactly as before', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 200000 } });
    const inclusive = builder.addLine({ productId: 'variant_inclusive', variantId: 'variant_inclusive', name: 'Inclusive item', sku: 'INCLUSIVE',
      unitPrice: { amount: 1200, currency: 'EUR', taxInclusive: true }, quantity: 2, taxRates: [{ code: 'VAT20', ratePpm: 200000 }] });
    builder.addLine({ productId: 'variant_exclusive', variantId: 'variant_exclusive', name: 'Exclusive item', sku: 'EXCLUSIVE',
      unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false }, quantity: 1, taxRates: [{ ratePpm: 100000 }] });
    builder.applyLineDiscount(inclusive, { type: 'fixed', value: 120, label: 'Line discount' });
    builder.applyOrderDiscount({ type: 'fixed', value: 120 });
    builder.addPayment({ method: 'cash', amountMinor: 4000, reference: 'cash_receipt_1' });
    builder.setCustomer({ id: 'cus_golden_v3', name: 'Golden Buyer', email: 'buyer@example.com' });
    const { payload } = JSON.parse(readFileSync(fileURLToPath(new URL('./__fixtures__/order-create-v3.json', import.meta.url)), 'utf8'));
    for (const [input, golden] of [[builder.getSnapshot(), true], [discountedSale().getSnapshot(), false]] as const) {
      input.display.lines[0].discounts[0].discountId = 'discount_line';
      let n = 0;
      const options = { now: new Date('2026-09-28T10:00:00.000Z'), newId: () => `id-${++n}`,
        registerId: 'register_golden', cashierRef: 'cashier_golden' };
      const legacy = finalizeOrder(input, { ...options, capabilities: { orderCreate: 2 } });
      n = 0;
      const expectedDisplay = golden ? payload.display : {
        currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 2900, discountMinor: 100,
        taxMinor: 532, totalMinor: 3332, orderDiscountMinor: 0,
        lines: [{ amountMinor: 1700, discounts: [{ discountId: 'discount_line', amountMinor: 100 }] },
          { amountMinor: 1200, discounts: [] }],
      };
      expect(finalizeOrder(input, { ...options, capabilities: { orderCreate: 3 } })).toStrictEqual({
        ...legacy, display: { ...expectedDisplay, lines: expectedDisplay.lines.map((line: { amountMinor: number; discounts: unknown[] }, i: number) => ({
          lineId: legacy.lines[i].id, amountMinor: line.amountMinor, discounts: line.discounts,
        })) },
        taxByRate: golden ? payload.taxByRate.map(({ taxMinor, ...rate }: { taxMinor: number }) => ({ ...rate, amountMinor: taxMinor }))
          : [{ ratePpm: 190000, netMinor: 2800, amountMinor: 532, grossMinor: 3332 }],
      });
    }
  });

  it('finalizes converted lines with line and order discounts and a rounding residue at capability 3', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 190000 } });
    const id = builder.addLine({ productId: 'p1', name: 'Converted 1', unitPrice: { amount: 100, currency: 'EUR', taxInclusive: true } });
    builder.addLine({ productId: 'p2', name: 'Converted 2', unitPrice: { amount: 100, currency: 'EUR', taxInclusive: true } });
    builder.applyLineDiscount(id, { type: 'fixed', value: 1 });
    builder.applyOrderDiscount({ type: 'fixed', value: 2 });
    builder.addPayment({ method: 'cash', amountMinor: 200 });
    const input = builder.getSnapshot();
    // Remaining 98 and 99 convert to 82 and 83; rounding their combined tax leaves one cent on the second line.
    expect(input.lineItems.map((line) => line.netMinor)).toStrictEqual([98, 99]);
    expect(input.display.lines.map((line) => line.amountMinor)).toStrictEqual([84, 85]);
    const result = finalizeOrder(input, { capabilities: { orderCreate: 3 } });
    expect(result.display).toStrictEqual({
      ...input.display, currency: 'EUR', exponent: 2,
      lines: input.display.lines.map((line, i) => ({ ...line, lineId: result.lines[i].id })),
    });
    expect(result.display).toMatchObject({ subtotalMinor: 169, discountMinor: 3, orderDiscountMinor: 2, taxMinor: 31, totalMinor: 197 });
  });

  it.each(['taxInclusive'] as const)('refuses a display with inconsistent %s', (key) => {
    for (const pricesIncludeTax of [false, true]) {
      const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax, getTaxRatePpm: () => 190000 } });
      const id = builder.addLine({ productId: 'p1', name: 'Converted', unitPrice: { amount: 1190, currency: 'EUR', taxInclusive: !pricesIncludeTax } });
      builder.applyLineDiscount(id, { type: 'fixed', value: 100 });
      builder.applyOrderDiscount({ type: 'fixed', value: 100 });
      builder.addPayment({ method: 'cash', amountMinor: 2000 });
      const input = builder.getSnapshot();
      expect(() => finalizeOrder(input, { capabilities: { orderCreate: 3 } })).not.toThrow();
      const value = !input.display[key];
      expect(() => finalizeOrder({ ...input, display: { ...input.display, [key]: value } }, { capabilities: { orderCreate: 3 } }))
        .toThrow('finalize: display does not match the order');
    }
  });

  it('refuses display or tax-by-rate figures inconsistent with the order', () => {
    const input = discountedSale().getSnapshot();
    for (const key of ['totalMinor', 'taxMinor'] as const) {
      expect(() => finalizeOrder({ ...input, display: { ...input.display, [key]: input.display[key] + 1 } },
        { capabilities: { orderCreate: 3 } })).toThrow('finalize: display does not match the order');
    }
    expect(() => finalizeOrder({ ...input, lineItems: input.lineItems.map((line) => ({ ...line, taxLines: [] })) },
      { capabilities: { orderCreate: 3 } })).toThrow('finalize: tax by rate does not sum to the order tax');
  });
});
