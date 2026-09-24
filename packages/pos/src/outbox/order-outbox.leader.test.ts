// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { posOrderSchema, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, type OrderOutbox } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

addRxPlugin(RxDBDevModePlugin);
const epoch = Date.parse('2026-09-23T12:00:00.000Z');
const waitOptions = { timeout: 15000, interval: 50 };
let databases: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>[];
let outboxes: OrderOutbox[];
let sends: ReturnType<typeof vi.fn<CommandTransport['send']>>[];
let server: Map<string, number>;
let states: OutboxState[];

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

beforeEach(async () => {
  vi.useRealTimers();
  databases = [];
  outboxes = [];
  sends = [];
  server = new Map();
  states = [];
  const name = `leader${uuidv7().replaceAll('-', '')}`;
  const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
  for (let i = 0; i < 2; i++) {
    const db = await createRxDatabase<{ pos_orders: RxCollection<PosOrder> }>({
      name, storage, multiInstance: true, localDocuments: true, ignoreDuplicate: true,
    });
    databases.push(db);
    const { pos_orders: collection } = await db.addCollections({ pos_orders: { schema: posOrderSchema } });
    const send = vi.fn<CommandTransport['send']>().mockImplementation(async (batch) => ({
      kind: 'results', results: batch.map((command) => {
        server.set(command.id, (server.get(command.id) ?? 0) + 1);
        return { id: command.id, status: 'applied',
          serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } };
      }),
    }));
    sends.push(send);
    outboxes.push(createOrderOutbox({ collection, transport: { send }, deviceId: `device-${i}`,
      initialBackoffMs: 10, maxBackoffMs: 20 }));
    outboxes[i].state$.subscribe((state) => { states[i] = state; });
  }
});

afterEach(async () => {
  outboxes.forEach((outbox) => outbox.stop());
  for (const db of databases) await db.close();
});

describe('leader-elected order outbox', () => {
  async function startTabs() {
    outboxes.forEach((outbox) => outbox.start());
    await vi.waitFor(() => {
      expect(databases.filter((db) => db.isLeader())).toHaveLength(1);
    }, waitOptions);
    return databases.findIndex((db) => db.isLeader());
  }

  it('writes shared state only when shared fields change while draining 20 orders', async () => {
    const leader = await startTabs();
    const upsertLocal = vi.spyOn(databases[leader], 'upsertLocal');
    await databases[leader].pos_orders.bulkInsert(Array.from({ length: 20 }, (_, i) => order(i)));
    await outboxes[leader].flush();
    await vi.waitFor(async () => {
      expect(await databases[leader].pos_orders.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(20);
      expect(states[leader]).toMatchObject({ pending: 0, sending: false });
      expect(states[1 - leader]).toMatchObject({ pending: 0, sending: false });
    }, waitOptions);
    expect(upsertLocal.mock.calls.filter(([id]) => id === 'tally-outbox-state').length).toBeLessThan(10);
  }, 30000);

  it('shares the auth pause and lets a follower flush after sign-in', async () => {
    const leader = await startTabs();
    const follower = 1 - leader;
    const applied = sends[leader].getMockImplementation()!;
    sends[leader].mockResolvedValue({ kind: 'unauthorized' });
    await databases[leader].pos_orders.bulkInsert([order(0), order(1)]);
    await vi.waitFor(() => {
      expect(states[leader]).toMatchObject({ authRequired: true, sending: false });
      expect(states[follower]).toMatchObject({ authRequired: true, sending: false,
        pending: 2, lastRetryReason: 'unauthorized' });
      expect(states[follower].nextAttemptAt).toBeUndefined();
    }, waitOptions);
    sends[leader].mockImplementation(applied);
    await outboxes[follower].flush();
    await vi.waitFor(async () => {
      expect(await databases[follower].pos_orders.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(2);
      expect(states[leader]).toMatchObject({ authRequired: false, pending: 0, sending: false });
      expect(states[follower]).toMatchObject({ authRequired: false, pending: 0, sending: false });
      expect(states[follower].lastRetryReason).toBeUndefined();
    }, waitOptions);
    expect(sends[follower]).not.toHaveBeenCalled();
  }, 30000);

  it('shares a batch refusal with the follower', async () => {
    const leader = await startTabs();
    const follower = 1 - leader;
    sends[leader].mockResolvedValue({ kind: 'refused', status: 400, reason: 'unsupported_protocol' });
    await databases[leader].pos_orders.insert(order(0));
    await vi.waitFor(() => {
      expect(states[follower]).toMatchObject({ sending: false, pending: 1,
        refused: { status: 400, reason: 'unsupported_protocol' }, lastRetryReason: 'refused' });
    }, waitOptions);
    expect(sends[follower]).not.toHaveBeenCalled();
  }, 30000);

  it('applies a server-rejected order requeued in the follower through the leader', async () => {
    const leader = await startTabs();
    const follower = 1 - leader;
    sends[leader].mockImplementationOnce(async (batch) => ({ kind: 'results',
      results: batch.map(({ id }) => ({ id, status: 'rejected',
        error: { code: 'out_of_stock', message: 'Restock and retry' } })),
    }));
    const input = order(0);
    await databases[leader].pos_orders.insert(input);
    await vi.waitFor(async () => {
      expect((await databases[follower].pos_orders.findOne(input.id).exec())?.syncStatus).toBe('rejected');
    }, waitOptions);
    expect(await outboxes[follower].requeue([input.id])).toBe(1);
    await vi.waitFor(async () => {
      const result = await databases[follower].pos_orders.findOne(input.id).exec();
      expect(result?.syncStatus).toBe('applied');
      expect(result?.commandId).not.toBe(input.commandId);
    }, waitOptions);
    expect(sends[follower]).not.toHaveBeenCalled();
    expect(sends[leader]).toHaveBeenCalledTimes(2);
  }, 30000);

  it('fails clearly when a multi-instance database lacks local documents', async () => {
    const db = await createRxDatabase<{ pos_orders: RxCollection<PosOrder> }>({
      name: `missinglocal${uuidv7().replaceAll('-', '')}`, multiInstance: true,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    databases.push(db);
    const { pos_orders: collection } = await db.addCollections({ pos_orders: { schema: posOrderSchema } });
    expect(() => createOrderOutbox({ collection, transport: { send: sends[0] }, deviceId: 'missing-local' }))
      .toThrow('Multi-tab outboxes need localDocuments: true');
  });

  it('does not send after stop while waiting for leadership', async () => {
    outboxes[0].start();
    await databases[0].waitForLeadership();
    outboxes[1].start();
    outboxes[1].stop();
    outboxes[0].stop();
    await databases[1].pos_orders.insert(order(0));
    await databases[0].close();
    await databases[1].waitForLeadership();
    await databases[1].requestIdlePromise();
    expect(sends[1]).not.toHaveBeenCalled();
    expect(await databases[1].pos_orders.count({ selector: { syncStatus: 'pending' } }).exec()).toBe(1);
  }, 30000);

  it('applies 50 sales from each tab exactly once through only the leader', async () => {
    outboxes.forEach((outbox) => outbox.start());
    await Promise.all(databases.map(async (db, tab) => {
      for (let i = 0; i < 50; i++) await db.pos_orders.insert(order(tab * 50 + i));
    }));
    await vi.waitFor(async () => {
      expect(await databases[0].pos_orders.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(100);
    }, waitOptions);
    expect(server.size).toBe(100);
    expect([...server.values()].every((count) => count === 1)).toBe(true);
    expect(sends.filter((send) => send.mock.calls.length > 0)).toHaveLength(1);
    const sender = sends.findIndex((send) => send.mock.calls.length > 0);
    expect(databases[sender].isLeader()).toBe(true);
    expect(databases[1 - sender].isLeader()).toBe(false);
  }, 30000);

  it('does not send when the follower explicitly flushes a pending order', async () => {
    await Promise.race(databases.map((db) => db.waitForLeadership()));
    const follower = databases.findIndex((db) => !db.isLeader());
    await databases[follower].pos_orders.insert(order(0));
    await outboxes[follower].flush();
    expect(sends[follower]).not.toHaveBeenCalled();
    expect(await databases[follower].pos_orders.count({ selector: { syncStatus: 'pending' } }).exec()).toBe(1);
  }, 30000);

  it('sends through the survivor after the leader closes', async () => {
    outboxes.forEach((outbox) => outbox.start());
    await vi.waitFor(() => {
      expect(databases.filter((db) => db.isLeader())).toHaveLength(1);
    }, waitOptions);
    const leader = databases.findIndex((db) => db.isLeader());
    const survivor = 1 - leader;
    outboxes[leader].stop();
    await databases[leader].close();
    for (let i = 0; i < 5; i++) await databases[survivor].pos_orders.insert(order(i));
    await vi.waitFor(async () => {
      expect(await databases[survivor].pos_orders.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(5);
    }, waitOptions);
    expect(databases[survivor].isLeader()).toBe(true);
    expect(sends[survivor].mock.calls.flatMap(([batch]) => batch)).toHaveLength(5);
    expect(sends[leader]).not.toHaveBeenCalled();
    expect(server.size).toBe(5);
    expect([...server.values()].every((count) => count === 1)).toBe(true);
  }, 30000);
});
