// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope, OrderUpdateEnvelope } from '@tallyui/core';
import { posOrderCollection, needsAttention, UPDATE_UNSENDABLE, UPDATE_UNSENDABLE_MESSAGE, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, isRequeueableOrder, type OrderOutbox, type OrderOutboxOptions } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>;
let collection: RxCollection<PosOrder>;
let outboxes: OrderOutbox[];
const epoch = Date.parse('2026-09-23T12:00:00.000Z');
const mark = { code: UPDATE_UNSENDABLE, message: UPDATE_UNSENDABLE_MESSAGE };

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
function reopened(i: number): PosOrder {
  const input = order(i);
  return { ...input, storeOrderId: 'store-' + i, baseRevision: `sha256:${String(i).repeat(64)}`,
    taxByRate: [], display: { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 100 + i, discountMinor: 0,
      taxMinor: 0, totalMinor: 100 + i, orderDiscountMinor: 0, lines: [{ lineId: input.lines[0].id, amountMinor: 100 + i, discounts: [] }] },
    lines: [{ ...input.lines[0], storeLineId: '11' }], payments: [{ ...input.payments[0], storePaymentId: '21' }] };
}
function applied(batch: Array<OrderCreateEnvelope | OrderUpdateEnvelope>): CommandResult[] {
  return batch.map((command) => ({ id: command.id, status: 'applied',
    serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } }));
}
function setup(overrides: Partial<OrderOutboxOptions> = {}) {
  const send = vi.fn<CommandTransport<OrderCreateEnvelope | OrderUpdateEnvelope>['send']>()
    .mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
  const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device-1', random: () => 0.5, ...overrides });
  outboxes.push(outbox);
  const states: OutboxState[] = [];
  outbox.state$.subscribe((state) => states.push(state));
  return { outbox, send, states };
}
const stored = async (id: string) => (await collection.findOne(id).exec())!.toJSON();

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

describe('unsendable order updates', () => {
  it('skips a reopened sale without a base revision, sends the rest of the batch, and marks it pending', async () => {
    const plain = order(0), input = reopened(1); delete input.baseRevision;
    await collection.bulkInsert([plain, input]);
    const { outbox, send, states } = setup(); await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject([{ id: plain.commandId, type: 'order.create' }]);
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending', error: mark, commandId: input.commandId });
    expect((await stored(input.id)).sentVersion).toBeUndefined();
    expect(states.at(-1)).toMatchObject({ pending: 1, sending: false });
    expect(states.at(-1)?.nextAttemptAt).toBeUndefined(); expect(states.at(-1)?.stuck).toBeUndefined();
  });
  it('skips a reopened sale without figures', async () => {
    const plain = order(0), input = reopened(1); delete input.display; delete input.taxByRate;
    await collection.bulkInsert([plain, input]);
    const { outbox, send } = setup(); await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toMatchObject([{ id: plain.commandId, type: 'order.create' }]);
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending', error: mark });
    expect((await stored(input.id)).sentVersion).toBeUndefined();
  });
  it("skips a reopened sale when the store's order.create maximum is below 5, but sends it at 5 when the maximum is unknown", async () => {
    const input = reopened(1); await collection.insert(input);
    const first = setup({ getMaxOrderCreateVersion: () => 4 }); await first.outbox.flush();
    expect(first.send).not.toHaveBeenCalled();
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending', error: mark }); first.outbox.stop();
    const other = reopened(2); await collection.insert(other);
    const second = setup({ getMaxOrderCreateVersion: () => undefined }); await second.outbox.flush();
    expect(second.send).toHaveBeenCalledTimes(1);
    expect(second.send.mock.calls[0][0]).toMatchObject([{ id: other.commandId, type: 'order.update', payload: { createVersion: 5 } }]);
  });
  it('holds later rows of the same store order behind the skipped row, and lets other orders and earlier rows go', async () => {
    const a = reopened(1), b = reopened(2), c = reopened(3), d = reopened(4), e = order(5);
    b.storeOrderId = c.storeOrderId = a.storeOrderId; delete b.baseRevision;
    await collection.bulkInsert([a, b, c, d, e]);
    const { outbox, send } = setup(); await outbox.flush();
    expect(send.mock.calls.flatMap(([batch]) => batch.map(({ id }) => id))).toEqual([a.commandId, d.commandId, e.commandId]);
    for (const row of [a, d, e]) expect((await stored(row.id)).syncStatus).toBe('applied');
    expect(await stored(b.id)).toMatchObject({ syncStatus: 'pending', error: mark });
    expect(await stored(c.id)).toMatchObject({ syncStatus: 'pending' });
    expect((await stored(c.id)).error).toBeUndefined(); expect((await stored(c.id)).sentVersion).toBeUndefined();
    expect(new Set(send.mock.calls[0][1]!.local.orders.keys())).toEqual(new Set([a.commandId, d.commandId, e.commandId]));
    await outbox.flush(); expect(send).toHaveBeenCalledTimes(1);
  });
  it('does not let held rows take the batch: ten skipped rows and one plain sale go in one flush', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => { const row = reopened(i); delete row.baseRevision; return row; });
    const plain = order(20); await collection.bulkInsert([...rows, plain]);
    const { outbox, send } = setup(); await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1); expect(send.mock.calls[0][0]).toMatchObject([{ id: plain.commandId }]);
    for (const row of rows) expect((await stored(row.id)).error).toEqual(mark);
  });
  it('keeps the row held and visible across a restart, and never retries it on its own', async () => {
    const input = reopened(1); delete input.baseRevision; await collection.bulkInsert([order(0), input]);
    const first = setup(); await first.outbox.flush(); first.outbox.stop();
    const second = setup(); await second.outbox.flush();
    await vi.advanceTimersByTimeAsync(10 * 60_000); await second.outbox.flush();
    expect(second.send).not.toHaveBeenCalled(); expect((await stored(input.id)).error).toEqual(mark);
    expect(needsAttention((await collection.find().exec()).map((row) => row.toJSON() as PosOrder)).map(({ id }) => id)).toEqual([input.id]);
  });
  it('requeue clears the mark; the row goes once it can be built, and is marked again if it still cannot', async () => {
    const input = reopened(1); delete input.baseRevision; await collection.bulkInsert([order(0), input]);
    const { outbox, send } = setup(); await outbox.flush(); outbox.stop();
    expect(await outbox.requeue([input.id])).toBe(1);
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending', commandId: input.commandId });
    expect((await stored(input.id)).error).toBeUndefined();
    await outbox.flush(); expect((await stored(input.id)).error).toEqual(mark); outbox.stop();
    await (await collection.findOne(input.id).exec())!.incrementalModify((data) => ({ ...data, baseRevision: reopened(1).baseRevision }));
    expect(await outbox.requeue([input.id])).toBe(1); await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toMatchObject([{ id: input.commandId, type: 'order.update', attempt: 1 }]);
    expect((await stored(input.id)).syncStatus).toBe('applied');
  });
  it('requeue does not resend a reopened sale refused with reopen_required or revision_conflict, and keeps the base revision of one refused with payment_in_motion', async () => {
    const rows = [reopened(1), reopened(2), reopened(3), order(4)].map((row, i): PosOrder => ({ ...row, syncStatus: 'rejected',
      error: { code: ['reopen_required', 'revision_conflict', 'payment_in_motion', 'revision_conflict'][i], message: 'Refused' } }));
    await collection.bulkInsert(rows);
    expect(rows.map(isRequeueableOrder)).toEqual([false, false, true, true]);
    expect(isRequeueableOrder({ ...reopened(5), error: mark })).toBe(true); expect(isRequeueableOrder(order(6))).toBe(false);
    const { outbox } = setup(); outbox.stop(); expect(await outbox.requeue()).toBe(2);
    for (const row of rows.slice(0, 2)) expect(await stored(row.id)).toMatchObject({ syncStatus: 'rejected', error: row.error });
    expect(await stored(rows[2].id)).toMatchObject({ syncStatus: 'pending', storeOrderId: rows[2].storeOrderId, baseRevision: rows[2].baseRevision });
    expect((await stored(rows[2].id)).commandId).not.toBe(rows[2].commandId);
    expect((await stored(rows[3].id)).syncStatus).toBe('pending');
  });
});
