// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope, OrderUpdateEnvelope } from '@tallyui/core';
import { markAttentionHandled, needsAttention, posOrderCollection, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, type OrderOutbox } from './order-outbox';
import type { CommandTransport } from './types';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>;
let collection: RxCollection<PosOrder>;
let outboxes: OrderOutbox[];
const epoch = Date.parse('2026-09-23T12:00:00.000Z');

function order(i: number): PosOrder {
  const createdAt = new Date(epoch + i * 1000).toISOString();
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: `product-${i}`, name: `Item ${i}`, sku: `SKU${i}`, quantity: 1,
      unitPriceMinor: 100 + i, discountMinor: 0, netMinor: 100 + i, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 + i }], customer: null,
    subtotalMinor: 100 + i, discountMinor: 0, taxMinor: 0, totalMinor: 100 + i, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
  };
}
function refused(batch: Array<OrderCreateEnvelope | OrderUpdateEnvelope>): CommandResult[] {
  return batch.map((command) => ({ id: command.id, status: 'rejected', error: { code: 'platform_error', message: 'Try again' } }));
}
function setup() {
  const send = vi.fn<CommandTransport<OrderCreateEnvelope | OrderUpdateEnvelope>['send']>()
    .mockImplementation(async (batch) => ({ kind: 'results', results: refused(batch) }));
  const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device-1', random: () => 0.5 });
  outboxes.push(outbox);
  return { outbox, send };
}
const stored = async (id: string) => (await collection.findOne(id).exec())!.toJSON() as PosOrder;
const attention = async () => needsAttention((await collection.find().exec()).map((row) => row.toJSON() as PosOrder));

beforeEach(async () => {
  outboxes = [];
  db = await createRxDatabase({ name: `outbox${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  ({ pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() }));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(epoch);
});
afterEach(async () => {
  outboxes.forEach((outbox) => outbox.stop());
  vi.useRealTimers();
  await db.remove();
});

describe('attention handled through the outbox (ADR-092 6f)', () => {
  it('R1 a handled refusal leaves needsAttention, and a requeued order refused again is back in it', async () => {
    const input = order(1); await collection.insert(input);
    const { outbox, send } = setup(); await outbox.flush(); outbox.stop();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'rejected', error: { code: 'platform_error' } });

    expect(await markAttentionHandled(collection, input.id)).toBe(true);
    expect((await stored(input.id)).attentionHandledFor).toBe(input.commandId);
    expect(await attention()).toEqual([]);

    expect(await outbox.requeue([input.id])).toBe(1);
    const requeued = await stored(input.id);
    expect(requeued.syncStatus).toBe('pending');
    expect(requeued.commandId).not.toBe(input.commandId);
    expect(await markAttentionHandled(collection, input.id)).toBe(false);

    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    const again = await stored(input.id);
    expect(again).toMatchObject({ syncStatus: 'rejected', commandId: requeued.commandId, attentionHandledFor: input.commandId });
    expect(again.commandId).not.toBe(again.attentionHandledFor);
    expect((await attention()).map(({ id }) => id)).toEqual([input.id]);
  });
});

describe('a refusal that names a store order (#1101)', () => {
  it('R2 keeps error.data through a re-opened database, and a requeue clears error', async () => {
    const data = { orderId: '115', displayId: '1001', storeCode: 'wcpos_amount_exceeds_balance', recorded: 1 };
    const name = `leftonstore${uuidv7().replaceAll('-', '')}`;
    const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
    const first = await createRxDatabase({ name, storage, multiInstance: false });
    const { pos_orders: before } = await first.addCollections({ pos_orders: posOrderCollection() });
    const input = order(2); await before.insert(input);
    const send = vi.fn<CommandTransport<OrderCreateEnvelope | OrderUpdateEnvelope>['send']>().mockImplementation(async (batch) => ({ kind: 'results',
      results: batch.map((command) => ({ id: command.id, status: 'rejected', error: { code: 'invalid_payload', message: 'Too much.', data } })) }));
    const outbox = createOrderOutbox({ collection: before, transport: { send }, deviceId: 'device-1', random: () => 0.5 });
    await outbox.flush(); outbox.stop();
    // Under fake timers the close, and the remove below, ran past the 5 s test limit.
    vi.useRealTimers();
    await first.close();

    const again = await createRxDatabase({ name, storage, multiInstance: false });
    const { pos_orders: after } = await again.addCollections({ pos_orders: posOrderCollection() });
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const reopened = createOrderOutbox({ collection: after, transport: { send }, deviceId: 'device-1', random: () => 0.5 });
    try {
      const read = async () => (await after.findOne(input.id).exec())!.toJSON() as PosOrder;
      expect((await read()).syncStatus).toBe('rejected');
      expect((await read()).error?.data).toEqual(data);
      expect(await reopened.requeue([input.id])).toBe(1);
      expect(await read()).toMatchObject({ syncStatus: 'pending' });
      expect((await read()).error).toBeUndefined();
    } finally {
      reopened.stop(); vi.useRealTimers(); await again.remove();
    }
  });
});
