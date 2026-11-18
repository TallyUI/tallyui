// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { couponPricingBasis, createOrderBuilder } from '../order/order-builder';
import { toOrderCreateEnvelope } from '../pos-order/command';
import { finalizeOrder } from '../pos-order/finalize';
import { addPosOrderCollection } from '../pos-order/open';
import { olderCollection } from '../pos-order/open.test-helper';
import type { PosOrder } from '../pos-order/types';
import { uuidv7 } from '../pos-order/uuidv7';
import { createOrderOutbox } from './order-outbox';
import type { CommandTransport } from './types';

const deviceId = 'device-method-id';
/** A store-priced coupon sale with a note (order.create 9 today), paid by a card leg and a cash leg, each with or without its method id. */
function sale(ids: boolean): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 190000 } });
  const lineId = builder.addLine({ productId: 'p', name: 'Item', unitPrice: { amount: 1190, currency: 'EUR' } });
  builder.setCoupons(['c'], { kind: 'store-priced', basis: couponPricingBasis(builder.getSnapshot()),
    priced: new Map([['c', { couponId: 'promo_1', lines: [{ lineId, amountMinor: 100 }] }]]) });
  builder.setNote('Gift wrap');
  builder.addPayment({ method: 'external', amountMinor: 500, reference: 'T-1', ...(ids ? { methodId: 'stripe' } : {}) });
  builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor - 400, ...(ids ? { methodId: 'cod' } : {}) });
  return finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 10 } });
}
const withoutIds = (order: PosOrder): PosOrder => ({ ...order, payments: order.payments.map(({ methodId: _id, ...payment }) => payment) });
const applied = (command: OrderCreateEnvelope): CommandResult =>
  ({ id: command.id, status: 'applied', serverRefs: { orderId: 'server-1', totalMinor: command.payload.totalMinor } });

/** Drains `order` through the outbox on memory storage; `born15` writes it through a schema-15 till first. */
async function drain(order: PosOrder, max: number, answer: (command: OrderCreateEnvelope) => CommandResult = applied, born15 = false) {
  const name = `methodid${uuidv7().replaceAll('-', '')}`;
  const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
  if (born15) {
    const older = await createRxDatabase({ name, storage, multiInstance: false });
    await (await older.addCollections({ pos_orders: olderCollection(15) })).pos_orders.insert(structuredClone(order));
    await older.close();
  }
  const db = await createRxDatabase({ name, storage, multiInstance: false });
  try {
    const collection: RxCollection<PosOrder> = await addPosOrderCollection(db);
    if (!born15) await collection.insert(structuredClone(order));
    const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>(async (batch) => ({ kind: 'results', results: batch.map(answer) }));
    const outbox = createOrderOutbox({ collection, transport: { send }, deviceId, random: () => 0.5, getMaxOrderCreateVersion: () => max });
    try { await outbox.flush(); } finally { outbox.stop(); }
    return { sent: send.mock.calls.map(([batch]) => structuredClone(batch[0])), stored: (await collection.findOne(order.id).exec())!.toJSON() as PosOrder };
  } finally { await db.remove(); }
}

describe('order outbox: payment method ids (conditions 1 and 2)', () => {
  it("sends a schema-15 till's order to a store at 10 exactly as 9 sent it", async () => {
    const original = sale(false);
    const { sent } = await drain(original, 10, applied, true);
    expect(sent).toHaveLength(1);
    expect(sent[0].version).toBeLessThanOrEqual(9);
    expect(JSON.stringify(sent[0])).toBe(JSON.stringify(toOrderCreateEnvelope(original, deviceId, 1, { maxVersion: 9 })));
  });

  it('sends method ids as version 10 to a store at 10, and stores sentVersion 10', async () => {
    const order = sale(true);
    const { sent, stored } = await drain(order, 10);
    expect(sent.map((command) => command.version)).toEqual([10]);
    expect(sent[0].payload.payments.map((payment) => payment.methodId)).toEqual(['stripe', 'cod']);
    expect(stored).toMatchObject({ syncStatus: 'applied', sentVersion: 10 });
    expect(stored.payments).toStrictEqual(order.payments);
  });

  it('sends an order with ids to a store at 9 byte-identical to the same order without them', async () => {
    const order = sale(true);
    const { sent, stored } = await drain(order, 9);
    expect(JSON.stringify(sent[0])).toBe(JSON.stringify(toOrderCreateEnvelope(withoutIds(order), deviceId, 1, { maxVersion: 9 })));
    expect(stored).toMatchObject({ syncStatus: 'applied', sentVersion: 9 });
  });

  it("downgrades a 10 refused with orderCreate 9 to the order's today version and drops the ids", async () => {
    const order = sale(true);
    const { sent, stored } = await drain(order, 10, (command) => command.version === 10
      ? { id: command.id, status: 'rejected', error: { code: 'unsupported_version', message: 'Maximum 9', data: { orderCreate: 9 } } }
      : applied(command));
    const today = toOrderCreateEnvelope(withoutIds(order), deviceId, 1, { maxVersion: 9 });
    expect(sent.map((command) => command.version)).toEqual([10, today.version]);
    expect(JSON.stringify(sent[1].payload)).toBe(JSON.stringify(today.payload));
    expect(stored).toMatchObject({ syncStatus: 'applied', sentVersion: today.version, downgradedFrom: 10 });
  });
});
