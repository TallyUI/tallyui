import { describe, expect, it } from 'vitest';
import { toOrderCreateEnvelope } from './command';
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

describe('toOrderCreateEnvelope', () => {
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

  it('a converted line carries its own taxInclusive, the rest are unchanged', () => {
    const converted: PosOrder = { ...order, lines: [{ ...order.lines[0], taxInclusive: true }, order.lines[1]] };
    const envelope = toOrderCreateEnvelope(converted, 'device1');
    expect(envelope.payload.lines[0]).toStrictEqual({ clientLineId: 'line1', variantId: 'v1', title: 'Item 1', quantity: 2, unitPriceMinor: 850, taxInclusive: true });
    expect(envelope.payload.lines[1]).not.toHaveProperty('taxInclusive');
    expect(JSON.parse(JSON.stringify(envelope))).toStrictEqual(envelope);
  });
});
