// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath, URL } from 'node:url';
import { expect, it, vi } from 'vitest';
import type { ServerCapabilities } from '@tallyui/core';
import { payloadBoundErrors, payloadShapeErrors, precheckCommand } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { ORDER_CREATE_MAX_VERSION, TAX_EXEMPT_REASON_ORDER_CREATE_VERSION, toOrderCreateEnvelope, toOrderUpdateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder } from './finalize';
import { posOrderCollection } from './schema';
import { taxExemptReasonDelivery } from './tax-exempt-reason-delivery';
import type { PosOrder } from './types';

const fixturePath = fileURLToPath(new URL('./__fixtures__/order-create-v13.json', import.meta.url));
const reason = { text: 'Charity, form ST-5 on file', certificateId: 'ST5-0042' };
const optional = { orderCreate: 13, taxExempt: true, taxExemptReason: 'optional' } as const;
const envelope = (order: PosOrder, maxVersion: number) => toOrderCreateEnvelope(order, 'device_golden', 1, { maxVersion });

function sale(taxExemptReason: PosOrder['taxExemptReason'], capabilities: ServerCapabilities = optional, exempt = true) {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 88750 } });
  builder.addLine({ productId: 'p', name: 'Coffee', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.setTaxExempt(exempt);
  builder.setCustomer({ id: '42', name: 'Ann Lee', email: 'ann@example.com' });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
  let nextId = 0;
  return finalizeOrder({ ...builder.getSnapshot(), ...(taxExemptReason ? { taxExemptReason } : {}) }, { capabilities,
    now: new Date('2026-11-19T10:00:00.000Z'), newId: () => `019f8f66-7800-7000-8000-${String(++nextId).padStart(12, '0')}` });
}

it('V1 sends the golden order.create 13 bytes and passes the optional and required server checks', () => {
  const sent = envelope(sale(reason), 13);
  expect(JSON.stringify(sent, null, 2) + '\n').toBe(readFileSync(fixturePath, 'utf8'));
  for (const taxExemptReason of ['optional', 'required'] as const) {
    expect(precheckCommand(sent, { orderCreate: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13], register: [1],
      taxExempt: true, taxExemptReason })).toBeUndefined();
  }
  expect(payloadShapeErrors(sent.payload)).toEqual([]);
  expect(payloadBoundErrors(sent.payload)).toEqual([]);
});

it('V2 keeps cap 12 bytes when the reason is dropped or absent (F2, F3, F9)', () => {
  const at12 = { ...optional, orderCreate: 12 };
  const baseline = envelope(sale(undefined, at12), 12);
  expect(envelope(sale(reason, at12), 12)).toStrictEqual(baseline);
  expect(envelope(sale(undefined), 13)).toStrictEqual(baseline);
  expect(envelope(sale(undefined, { orderCreate: 13, taxExempt: true }), 13)).toStrictEqual(baseline);
});

it('V3 pins the till, stored maxima and golden version to 13', () => {
  const { properties } = posOrderCollection().schema;
  expect([ORDER_CREATE_MAX_VERSION, TAX_EXEMPT_REASON_ORDER_CREATE_VERSION, properties.sentVersion.maximum,
    properties.downgradedFrom.maximum, JSON.parse(readFileSync(fixturePath, 'utf8')).version]).toStrictEqual([13, 13, 13, 13, 13]);
});

it('V4 freezes reason and certificate, dropping empty fields', () => {
  expect(sale({ text: '  Charity\u0000 ', certificateId: '  ST5-\u00000042  ' }).taxExemptReason)
    .toStrictEqual({ text: 'Charity', certificateId: 'ST5-0042' });
  expect(sale({ text: 'a'.repeat(250), certificateId: 'b'.repeat(80) }).taxExemptReason)
    .toStrictEqual({ text: 'a'.repeat(199) + '…', certificateId: 'b'.repeat(63) + '…' });
  expect(sale({ text: 'Charity', certificateId: '   ' }).taxExemptReason).toStrictEqual({ text: 'Charity' });
  expect(sale({ text: ' \u0000 ', certificateId: reason.certificateId })).not.toHaveProperty('taxExemptReason');
});

const needsReason = new Error('finalize: a tax-exempt sale needs a reason on this store');
it.each([
  ['F1', true, reason, 'optional', 13, 13],
  ['F2', true, reason, 'optional', 12, 4],
  ['F3', true, undefined, 'optional', 13, 4],
  ['F4', true, reason, 'required', 13, 13],
  ['F5', true, undefined, 'required', 13, needsReason],
  ['F6 with reason', true, reason, 'required', 12, new UnsupportedOrderVersionError(13, 12)],
  ['F6 without reason', true, undefined, 'required', 12, new UnsupportedOrderVersionError(13, 12)],
  ['F7', true, reason, undefined, 13, new Error('finalize: a tax-exempt reason needs a store whose connector declares the taxExemptReason capability')],
  ['F8', false, reason, 'optional', 13, new Error('finalize: a tax-exempt reason needs a tax-exempt sale')],
  ['F9', true, undefined, undefined, 13, 4],
  ['F10', true, { text: ' \u0000 ', certificateId: reason.certificateId }, 'required', 13, needsReason],
] as const)('V5 %s', (_, exempt, input, capability, cap, expected) => {
  const finalize = vi.fn(() => sale(input, { orderCreate: cap, taxExempt: true, taxExemptReason: capability }, exempt));
  if (expected instanceof Error) {
    expect(finalize).toThrow(expected);
    const refusal = finalize.mock.results[0].value;
    if (expected instanceof UnsupportedOrderVersionError) {
      expect(refusal).toBeInstanceOf(UnsupportedOrderVersionError);
      expect(refusal).toMatchObject({ needed: 13, supported: 12 });
    }
    expect(refusal.message).not.toContain('Charity');
    expect(refusal.message).not.toContain('ST5-0042');
  } else {
    const stored = finalize(), sent = envelope(stored, cap);
    expect(stored.taxExemptReason).toStrictEqual(input);
    expect(sent.version).toBe(expected);
    if (expected === 13) expect(sent.payload.taxExemptReason).toStrictEqual(reason);
    else expect(sent.payload).not.toHaveProperty('taxExemptReason');
  }
});

it('V6 reports reason delivery from the stored reason and sent version', () => {
  expect(taxExemptReasonDelivery({ sentVersion: 13 })).toBe('none');
  expect(taxExemptReasonDelivery({ taxExemptReason: reason })).toBe('pending');
  expect(taxExemptReasonDelivery({ taxExemptReason: reason, sentVersion: 13 })).toBe('sent');
  expect(taxExemptReasonDelivery({ taxExemptReason: reason, sentVersion: 12 })).toBe('not_sent');
});

it('V7 refuses a reopened order carrying a reason', () => {
  const reopened = { ...sale(reason), storeOrderId: 'store', baseRevision: '1' };
  expect(() => toOrderUpdateEnvelope(reopened, 'till')).toThrow(new Error(`Order ${reopened.id}: a tax-exempt reason is never sent on order.update`));
});
