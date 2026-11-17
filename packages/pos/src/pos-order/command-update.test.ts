// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OrderUpdatePayload } from '@tallyui/core';
import { updatePayloadErrors } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope, toOrderUpdateEnvelope } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

function sale() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'p1', name: 'Kept item', unitPrice: { amount: 100, currency: 'EUR' } });
  builder.addLine({ productId: 'p2', name: 'New item', unitPrice: { amount: 200, currency: 'EUR' } });
  builder.addFee({ name: 'Bag', amountMinor: 20, taxStatus: 'none' });
  builder.addShipping({ name: 'Delivery', amountMinor: 30, taxStatus: 'none' });
  builder.addPayment({ method: 'cash', amountMinor: 100 });
  builder.addPayment({ method: 'cash', amountMinor: 250 });
  return finalizeOrder(builder.getSnapshot(), { now: new Date('2026-11-17T10:00:00.000Z'), capabilities: { orderCreate: 9 } });
}
const withoutIds = sale();
const reopened: PosOrder = { ...withoutIds, storeOrderId: '4711', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298',
  lines: [{ ...withoutIds.lines[0], storeLineId: '11' }, withoutIds.lines[1]],
  fees: [{ ...withoutIds.fees![0], storeLineId: '12' }], shipping: [{ ...withoutIds.shipping![0], storeLineId: '13' }],
  payments: [{ ...withoutIds.payments[0], storePaymentId: '21' }, withoutIds.payments[1]] };

function createPart(payload: OrderUpdatePayload) {
  const { orderId: _orderId, baseRevision: _baseRevision, createVersion: _createVersion, ...part } = payload;
  return { ...part, lines: part.lines.map(({ storeLineId: _id, ...line }) => line),
    payments: part.payments.map(({ paymentId: _id, ...payment }) => payment),
    ...(part.fees ? { fees: part.fees.map(({ storeLineId: _id, ...fee }) => fee) } : {}),
    ...(part.shipping ? { shipping: part.shipping.map(({ storeLineId: _id, ...charge }) => charge) } : {}) };
}

describe('order.update v1', () => {
  it.each([6, 8, 9])('builds order.update v1 from the order.create payload plus the store ids (cap %s)', (maxVersion) => {
    const create = toOrderCreateEnvelope(withoutIds, 'device-1', 1, { maxVersion });
    const update = toOrderUpdateEnvelope(reopened, 'device-1', 1, { maxVersion });
    expect(update).toMatchObject({ id: reopened.commandId, type: 'order.update', version: 1,
      createdAt: create.createdAt, deviceId: create.deviceId, attempt: create.attempt });
    expect(update.payload).toMatchObject({ orderId: '4711', baseRevision: 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298', createVersion: create.version });
    expect(createPart(update.payload)).toStrictEqual(create.payload);
    expect(updatePayloadErrors(update.payload)).toEqual([]);
    expect(update.payload.lines[0].storeLineId).toBe('11');
    expect(update.payload.lines[1]).not.toHaveProperty('storeLineId');
    expect(update.payload.fees![0].storeLineId).toBe('12');
    expect(update.payload.shipping![0].storeLineId).toBe('13');
    expect(update.payload.payments[0].paymentId).toBe('21');
    expect(update.payload.payments[1]).not.toHaveProperty('paymentId');
    for (const field of ['storePaymentId', 'storeOrderId']) expect(JSON.stringify(update)).not.toContain(field);
  });

  it('leaves baseRevision out when the row has none', () => {
    const { baseRevision: _revision, ...order } = reopened;
    const { payload } = toOrderUpdateEnvelope(order, 'device-1');
    expect(payload).not.toHaveProperty('baseRevision');
    expect(updatePayloadErrors(payload)).toEqual([]);
  });

  it('refuses to build order.update for a sale that reopened nothing', () => {
    expect(() => toOrderUpdateEnvelope(withoutIds, 'device-1')).toThrow(`Order ${withoutIds.id} has no storeOrderId: it is sent as order.create`);
  });

  it('the same row builds the same bytes on every attempt but the attempt number', () => {
    const first = toOrderUpdateEnvelope(reopened, 'device-1', 1);
    const second = toOrderUpdateEnvelope(reopened, 'device-1', 2);
    expect(JSON.stringify(second)).toBe(JSON.stringify({ ...first, attempt: 2 }));
  });
});
