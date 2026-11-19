// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { OrderUpdatePayload } from '@tallyui/core';
import { updatePayloadErrors } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { pairStoreIds, toOrderCreateEnvelope, toOrderUpdateEnvelope, UnsupportedOrderVersionError } from './command';
import { finalizeOrder } from './finalize';
import type { PosOrder } from './types';

const REV_A = 'sha256:e9770195141c0459c5c766e9094d71e66766563f967c134c3a5449243749e298';

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
const reopened: PosOrder = { ...withoutIds, storeOrderId: '4711', baseRevision: REV_A,
  lines: [{ ...withoutIds.lines[0], storeLineId: '11' }, withoutIds.lines[1]],
  fees: [{ ...withoutIds.fees![0], storeLineId: '12' }], shipping: [{ ...withoutIds.shipping![0], storeLineId: '13' }],
  payments: [{ ...withoutIds.payments[0], storePaymentId: '21' }, withoutIds.payments[1]] };

function plainSale() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'p1', name: 'Kept item', unitPrice: { amount: 100, currency: 'EUR' } });
  builder.addLine({ productId: 'p2', name: 'New item', unitPrice: { amount: 200, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 100 });
  builder.addPayment({ method: 'cash', amountMinor: 200 });
  return finalizeOrder(builder.getSnapshot(), { now: new Date('2026-11-17T10:00:00.000Z'), capabilities: { orderCreate: 9 } });
}
const plainWithoutIds = plainSale();
const plainReopened: PosOrder = { ...plainWithoutIds, storeOrderId: '4711', baseRevision: REV_A,
  lines: [{ ...plainWithoutIds.lines[0], storeLineId: '11' }, plainWithoutIds.lines[1]] };

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
    expect(update.payload).toMatchObject({ orderId: '4711', baseRevision: REV_A, createVersion: create.version });
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

  it.each([5, 6, 8, 9])('builds a reopened sale without fees at create version 5, byte-equal to its version-4 payload except the version number (cap %s)', (cap) => {
    const update = toOrderUpdateEnvelope(plainReopened, 'device-1', 1, { maxVersion: cap });
    const create = toOrderCreateEnvelope(plainWithoutIds, 'device-1', 1, { maxVersion: 4 });
    expect(update.payload.createVersion).toBe(5);
    expect(JSON.stringify(createPart(update.payload))).toBe(JSON.stringify(create.payload));
    expect(create.version).toBe(4);
    expect(updatePayloadErrors(update.payload)).toEqual([]);
  });

  it.each([1, 2, 3, 4] as const)('refuses to build order.update below create version 5 (cap %s)', (cap) => {
    expect(() => toOrderUpdateEnvelope(plainReopened, 'device-1', 1, { maxVersion: cap })).toThrow(new UnsupportedOrderVersionError(5, cap));
    expect(() => toOrderUpdateEnvelope({ ...plainReopened, sentVersion: cap }, 'device-1')).toThrow(new UnsupportedOrderVersionError(5, cap));
  });

  it('refuses a discounted reopened sale at a cap below 5 with the floor, not the discount version', () => {
    const discounted = { ...plainReopened,
      lines: [{ ...plainReopened.lines[0], discountMinor: 10, netMinor: 90 }, plainReopened.lines[1]] };
    expect(() => toOrderUpdateEnvelope(discounted, 'device-1', 1, { maxVersion: 1 }))
      .toThrow(expect.objectContaining({ name: 'UnsupportedOrderVersionError', needed: 5, supported: 1 }));
  });

  it('refuses to build order.update without a base revision', () => {
    const { baseRevision: _revision, ...order } = reopened;
    expect(() => toOrderUpdateEnvelope(order, 'device-1')).toThrow(`Order ${reopened.id} reopened store order 4711 without its base revision: order.update needs it (ADR-090)`);
  });

  it('refuses to build order.update for a row without figures', () => {
    const message = `Order ${plainReopened.id} has no figures: order.update goes at order.create version 5 or more, which needs them (ADR-090)`;
    expect(() => toOrderUpdateEnvelope({ ...plainReopened, display: undefined }, 'device-1')).toThrow(message);
    expect(() => toOrderUpdateEnvelope({ ...plainReopened, taxByRate: undefined }, 'device-1')).toThrow(message);
  });

  it('pairs store ids by client id with two fees, two shipping lines and a reordered builder output (gate 8)', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
    builder.addLine({ productId: 'p1', name: 'Kept item', unitPrice: { amount: 100, currency: 'EUR' } });
    builder.addLine({ productId: 'p2', name: 'New item', unitPrice: { amount: 200, currency: 'EUR' } });
    builder.addFee({ name: 'Bag', amountMinor: 20, taxStatus: 'none' });
    builder.addFee({ name: 'Box', amountMinor: 40, taxStatus: 'none' });
    builder.addShipping({ name: 'Delivery', amountMinor: 30, taxStatus: 'none' });
    builder.addShipping({ name: 'Express', amountMinor: 50, taxStatus: 'none' });
    builder.addPayment({ method: 'cash', amountMinor: 100 });
    builder.addPayment({ method: 'cash', amountMinor: 340 });
    const withoutIds = finalizeOrder(builder.getSnapshot(), { now: new Date('2026-11-17T10:00:00.000Z'), capabilities: { orderCreate: 9 } });
    const reopenedRow: PosOrder = { ...withoutIds, storeOrderId: '4711', baseRevision: REV_A,
      lines: [withoutIds.lines[0], { ...withoutIds.lines[1], storeLineId: '11' }],
      fees: [withoutIds.fees![0], { ...withoutIds.fees![1], storeLineId: '12' }],
      shipping: [{ ...withoutIds.shipping![0], storeLineId: '13' }, { ...withoutIds.shipping![1], storeLineId: '14' }],
      payments: [{ ...withoutIds.payments[0], storePaymentId: '21' }, withoutIds.payments[1]] };
    const create = toOrderCreateEnvelope(withoutIds, 'device-1', 1, { maxVersion: 9 }).payload;
    const reversedCopy = { ...create, lines: [...create.lines].reverse(), fees: [...create.fees!].reverse(),
      shipping: [...create.shipping!].reverse(), payments: [...create.payments].reverse() };
    const paired = pairStoreIds(reversedCopy, reopenedRow);
    expect(paired.lines.map((item) => item.clientLineId)).toEqual(reversedCopy.lines.map((item) => item.clientLineId));
    expect(paired.fees!.map((item) => item.clientFeeId)).toEqual(reversedCopy.fees.map((item) => item.clientFeeId));
    expect(paired.shipping!.map((item) => item.clientShippingId)).toEqual(reversedCopy.shipping.map((item) => item.clientShippingId));
    expect(paired.payments.map((item) => item.clientPaymentId)).toEqual(reversedCopy.payments.map((item) => item.clientPaymentId));
    for (const item of paired.lines) {
      const id = reopenedRow.lines.find((line) => line.id === item.clientLineId)!.storeLineId;
      if (id === undefined) expect(item).not.toHaveProperty('storeLineId'); else expect(item.storeLineId).toBe(id);
    }
    for (const item of paired.fees!) {
      const id = reopenedRow.fees!.find((fee) => fee.id === item.clientFeeId)!.storeLineId;
      if (id === undefined) expect(item).not.toHaveProperty('storeLineId'); else expect(item.storeLineId).toBe(id);
    }
    for (const item of paired.shipping!) {
      const id = reopenedRow.shipping!.find((charge) => charge.id === item.clientShippingId)!.storeLineId;
      if (id === undefined) expect(item).not.toHaveProperty('storeLineId'); else expect(item.storeLineId).toBe(id);
    }
    for (const item of paired.payments) {
      const id = reopenedRow.payments.find((payment) => payment.id === item.clientPaymentId)!.storePaymentId;
      if (id === undefined) expect(item).not.toHaveProperty('paymentId'); else expect(item.paymentId).toBe(id);
    }
    const { payload } = toOrderUpdateEnvelope(reopenedRow, 'device-1', 1, { maxVersion: 9 });
    expect(payload.fees!.map((item) => item.storeLineId)).toEqual([undefined, '12']);
    expect(payload.shipping!.map((item) => item.storeLineId)).toEqual(['13', '14']);
    expect(payload.lines.map((item) => item.storeLineId)).toEqual([undefined, '11']);
    expect(payload.payments.map((item) => item.paymentId)).toEqual(['21', undefined]);
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
