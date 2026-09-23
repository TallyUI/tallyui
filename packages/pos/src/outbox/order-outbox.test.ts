// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandEnvelope, CommandResult, OrderCreatePayload } from '@tallyui/core';
import { posOrderSchema, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, type OrderOutbox, type OrderOutboxOptions } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

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
  };
}

function applied(batch: CommandEnvelope<OrderCreatePayload>[]): CommandResult[] {
  return batch.map((command) => ({ id: command.id, status: 'applied',
    serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } }));
}

function setup(overrides: Partial<OrderOutboxOptions> = {}) {
  const send = vi.fn<CommandTransport['send']>().mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
  const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device-1', random: () => 0.5, ...overrides });
  outboxes.push(outbox);
  const states: OutboxState[] = [];
  outbox.state$.subscribe((state) => states.push(state));
  return { outbox, send, states };
}

beforeEach(async () => {
  outboxes = [];
  db = await createRxDatabase({ name: `outbox${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  ({ pos_orders: collection } = await db.addCollections({ pos_orders: { schema: posOrderSchema } }));
});

afterEach(async () => {
  outboxes.forEach((outbox) => outbox.stop());
  vi.useRealTimers();
  await db.remove();
});

describe('order outbox', () => {
  it('applies three orders in one send and publishes each patch', async () => {
    const orders = Array.from({ length: 3 }, (_, i) => order(i));
    await collection.bulkInsert(orders);
    const { outbox, send, states } = setup({ now: () => epoch + 10000 });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0]).toHaveLength(3);
    for (const input of orders) {
      const doc = await collection.findOne(input.id).exec();
      expect(doc?.toJSON()).toMatchObject({ syncStatus: 'applied', updatedAt: new Date(epoch + 10000).toISOString(),
        serverRefs: { orderId: `server-${input.commandId}`, totalMinor: input.totalMinor } });
    }
    expect(states.filter((state) => state.sending).map((state) => state.pending)).toEqual(expect.arrayContaining([3, 2, 1, 0]));
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false });
  });

  it('sends 25 orders in oldest-first batches of 10, 10, 5', async () => {
    const orders = Array.from({ length: 25 }, (_, i) => order(i));
    await collection.bulkInsert([...orders].reverse());
    const { outbox, send } = setup({ batchSize: 10 });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([10, 10, 5]);
    expect(send.mock.calls.flatMap(([batch]) => batch.map((command) => command.id))).toEqual(orders.map((input) => input.commandId));
  });

  it('caps batches at 50', async () => {
    await collection.bulkInsert(Array.from({ length: 51 }, (_, i) => order(i)));
    const { outbox, send } = setup({ batchSize: 100 });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([50, 1]);
  });

  it('rejects with the error and never sends the order again', async () => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    const error = { code: 'invalid', message: 'Invalid sale' };
    send.mockResolvedValue({ kind: 'results', results: [{ id: input.commandId, status: 'rejected', error }] });
    await outbox.flush();
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await collection.findOne(input.id).exec())?.toJSON()).toMatchObject({ syncStatus: 'rejected', error });
  });

  it('applies duplicate results with original server references and warnings', async () => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    const serverRefs = { orderId: 'original', totalMinor: 101 };
    const warnings = [{ code: 'total_mismatch' as const, expectedMinor: 100, serverMinor: 101 }];
    send.mockResolvedValue({ kind: 'results', results: [{ id: input.commandId, status: 'duplicate', serverRefs, warnings }] });
    await outbox.flush();
    expect((await collection.findOne(input.id).exec())?.toJSON()).toMatchObject({ syncStatus: 'applied', serverRefs, warnings });
  });

  it('retries after 1000 then 2000 ms, with attempt 3 on success', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    await collection.insert(order(0));
    const { outbox, send, states } = setup();
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' }).mockResolvedValueOnce({ kind: 'retry', reason: 'status_500' });
    await outbox.flush();
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, lastRetryReason: 'network', nextAttemptAt: epoch + 1000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(states.at(-1)?.nextAttemptAt).toBe(epoch + 3000);
    await vi.advanceTimersByTimeAsync(1999);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(send.mock.calls.map(([batch]) => batch[0].attempt)).toEqual([1, 2, 3]);
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false, lastRetryReason: undefined, nextAttemptAt: undefined });
    expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
  });

  it('backs off after empty results without changing the pending order', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const input = order(0);
    await collection.insert(input);
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'results', results: [] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, lastRetryReason: 'no_progress', nextAttemptAt: epoch + 1000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, lastRetryReason: 'no_progress', nextAttemptAt: epoch + 3000 });
    await vi.advanceTimersByTimeAsync(1999);
    expect(send).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(3);
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('pending');
  });

  it('resends immediately after partial progress, then backs off after empty results', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const orders = [order(0), order(1)];
    await collection.bulkInsert(orders);
    const { outbox, send, states } = setup();
    send.mockImplementationOnce(async (batch) => ({ kind: 'results', results: [applied(batch)[0]] }))
      .mockResolvedValueOnce({ kind: 'results', results: [] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([batch]) => batch.map((command) => command.id)))
      .toEqual([orders.map((input) => input.commandId), [orders[1].commandId]]);
    expect(Date.now()).toBe(epoch);
    expect((await collection.findOne(orders[0].id).exec())?.syncStatus).toBe('applied');
    expect((await collection.findOne(orders[1].id).exec())?.syncStatus).toBe('pending');
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, lastRetryReason: 'no_progress', nextAttemptAt: epoch + 1000 });
  });

  it('shares the same promise between concurrent flush calls', async () => {
    await collection.insert(order(0));
    const { outbox, send } = setup();
    const first = outbox.flush();
    const second = outbox.flush();
    expect(second).toBe(first);
    await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('cancels a scheduled retry on stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await collection.insert(order(0));
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'retry', reason: 'network' });
    await outbox.flush();
    outbox.stop();
    await vi.advanceTimersByTimeAsync(100000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ pending: 1, sending: false, nextAttemptAt: undefined });
  });

  it('starts immediately, reacts to insertions, and unsubscribes on stop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await collection.insert(order(0));
    const { outbox, send } = setup();
    outbox.start();
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    await collection.insert(order(1));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    outbox.stop();
    await collection.insert(order(2));
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
  });

  it('finishes applying an in-flight send after stop', async () => {
    await collection.insert(order(0));
    const { outbox, send } = setup();
    send.mockImplementation(async (batch) => {
      outbox.stop();
      return { kind: 'results', results: applied(batch) };
    });
    await outbox.flush();
    expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
  });

  it('matches result ids, ignores unknown ids, and resends missing results', async () => {
    const orders = [order(0), order(1), order(2)];
    await collection.bulkInsert(orders);
    const { outbox, send } = setup();
    send.mockImplementationOnce(async (batch) => ({ kind: 'results',
      results: [applied(batch)[2], { id: 'unknown', status: 'applied' }, applied(batch)[0]] }));
    await outbox.flush();
    expect(send.mock.calls[1][0].map((command) => command.id)).toEqual([orders[1].commandId]);
    expect(await collection.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(3);
  });

  it('re-reads before patching and leaves a terminal order unchanged', async () => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    const error = { code: 'rejected', message: 'Already rejected' };
    send.mockImplementation(async (batch) => {
      await (await collection.findOne(input.id).exec())!.incrementalPatch({ syncStatus: 'rejected', error });
      return { kind: 'results', results: applied(batch) };
    });
    await outbox.flush();
    expect((await collection.findOne(input.id).exec())?.toJSON()).toMatchObject({ syncStatus: 'rejected', error });
  });

  it('delivers 200 sales exactly once across seeded transport faults and reloads', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const orders = Array.from({ length: 200 }, (_, i) => order(i));
    await collection.bulkInsert(orders);
    const ledger = new Map<string, string>();
    const serverOrders = new Map<string, { totalMinor: number; applications: number }>();
    const sendsAfterApply = new Map<string, number>();
    const modes = new Set<number>();
    let seed = 0x12345678;
    let calls = 0;
    let reloads = 0;
    let restart = false;
    let current: OrderOutbox;
    const transport: CommandTransport = { async send(batch) {
      expect(++calls).toBeLessThanOrEqual(5000);
      for (const command of batch) {
        const doc = await collection.findOne(command.payload.clientOrderId).exec();
        if (doc?.syncStatus === 'applied') sendsAfterApply.set(command.id, (sendsAfterApply.get(command.id) ?? 0) + 1);
      }
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const mode = Math.floor(seed / 0x100000000 * 5);
      modes.add(mode);
      const results: CommandResult[] = [];
      if (mode === 0 || mode === 2) {
        for (const command of batch) {
          const fingerprint = JSON.stringify(command.payload);
          const duplicate = ledger.has(command.id);
          if (duplicate) expect(ledger.get(command.id)).toBe(fingerprint);
          else {
            ledger.set(command.id, fingerprint);
            const prior = serverOrders.get(command.id);
            serverOrders.set(command.id, { totalMinor: command.payload.totalMinor, applications: (prior?.applications ?? 0) + 1 });
          }
          results.push({ id: command.id, status: duplicate ? 'duplicate' : 'applied',
            serverRefs: { orderId: `server-${command.id}`, totalMinor: serverOrders.get(command.id)!.totalMinor } });
        }
      }
      if (calls % 7 === 0) { restart = true; current.stop(); }
      return mode === 0 ? { kind: 'results', results }
        : { kind: 'retry', reason: mode === 3 ? 'status_409' : mode === 4 ? 'status_500' : 'network' };
    } };
    let states: OutboxState[];
    ({ outbox: current, states } = setup({ transport }));
    await current.flush();
    while (await collection.count({ selector: { syncStatus: 'pending' } }).exec()) {
      expect(calls).toBeLessThan(5000);
      if (restart) {
        restart = false;
        reloads++;
        current.stop();
        ({ outbox: current, states } = setup({ transport }));
        await current.flush();
      } else {
        const nextAttemptAt = states.at(-1)?.nextAttemptAt;
        expect(nextAttemptAt).toBeDefined();
        await vi.advanceTimersByTimeAsync(nextAttemptAt! - Date.now());
      }
    }
    expect(reloads).toBeGreaterThan(0);
    expect(modes.size).toBe(5);
    expect(await collection.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(200);
    expect(ledger.size).toBe(200);
    expect(serverOrders.size).toBe(200);
    for (const input of orders) expect(serverOrders.get(input.commandId)).toEqual({ totalMinor: input.totalMinor, applications: 1 });
    expect(sendsAfterApply.size).toBe(0);
  });
});
