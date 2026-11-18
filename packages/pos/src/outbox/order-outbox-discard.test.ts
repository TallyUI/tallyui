// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope } from '@tallyui/core';
import { posOrderCollection, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, type OrderOutbox } from './order-outbox';
import type { CommandTransport, OutboxState, TransportOutcome } from './types';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>;
let collection: RxCollection<PosOrder>;
let outboxes: OrderOutbox[];
const epoch = Date.parse('2026-09-23T12:00:00.000Z');

function order(i: number, overrides: Partial<PosOrder> = {}): PosOrder {
  const createdAt = new Date(epoch + i * 1000).toISOString();
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: `product-${i}`, name: `Item ${i}`, sku: `SKU${i}`, quantity: 1,
      unitPriceMinor: 100 + i, discountMinor: 0, netMinor: 100 + i, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 + i }], customer: null,
    subtotalMinor: 100 + i, discountMinor: 0, taxMinor: 0, totalMinor: 100 + i, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...overrides,
  };
}
const refused = { code: 'unknown_variant', message: 'gone' };
const rejectedOrder = (i: number) => order(i, { syncStatus: 'rejected', error: refused });
const result = (input: PosOrder, status: 'applied' | 'rejected'): CommandResult => status === 'applied'
  ? { id: input.commandId, status, serverRefs: { orderId: `server-${input.commandId}`, totalMinor: input.totalMinor } }
  : { id: input.commandId, status, error: refused };

function setup() {
  const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>().mockImplementation(async (batch) =>
    ({ kind: 'results', results: batch.map((command) => ({ id: command.id, status: 'applied' as const,
      serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } })) }));
  const outbox = createOrderOutbox({ collection, transport: { send }, deviceId: 'device-1', random: () => 0.5 });
  outboxes.push(outbox);
  const states: OutboxState[] = [];
  outbox.state$.subscribe((state) => states.push(state));
  return { outbox, send, states };
}
const stored = async (id: string) => (await collection.findOne(id).exec())?.toJSON(true);

beforeEach(async () => {
  outboxes = [];
  db = await createRxDatabase({ name: `discard${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  ({ pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() }));
});

afterEach(async () => {
  outboxes.forEach((outbox) => outbox.stop());
  await db.remove();
});

describe('OrderOutbox.discard', () => {
  it('discard removes a rejected order and lowers state.rejected', async () => {
    const input = rejectedOrder(0);
    await collection.insert(input);
    const { outbox, states } = setup();
    await vi.waitFor(() => expect(states.at(-1)?.rejected).toBe(1));
    expect(await outbox.discard(input.id)).toBe(true);
    expect(await stored(input.id)).toBeUndefined();
    expect(states.at(-1)?.rejected).toBe(0);
  });

  it('discard of an unknown id resolves false and changes nothing', async () => {
    const inputs = [order(0), rejectedOrder(1)];
    await collection.bulkInsert(inputs);
    const before = await Promise.all(inputs.map((input) => stored(input.id)));
    const { outbox } = setup();
    expect(await outbox.discard('nope')).toBe(false);
    expect(await Promise.all(inputs.map((input) => stored(input.id)))).toEqual(before);
  });

  it('discard leaves a pending order alone', async () => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    expect(await outbox.discard(input.id)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending', commandId: input.commandId });
  });

  it.each([
    ['keeps an order the store applied', 'applied', false],
    ['removes an order the store rejected', 'rejected', true],
  ] as const)('discard waits for an in-flight flush and %s', async (_title, status, removed) => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    let release!: (outcome: TransportOutcome) => void;
    send.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const flushing = outbox.flush();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    let settled = false;
    const discarding = outbox.discard(input.id).then((value) => { settled = true; return value; });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
    release({ kind: 'results', results: [result(input, status)] });
    await flushing;
    expect(await discarding).toBe(removed);
    expect((await stored(input.id))?.syncStatus).toBe(removed ? undefined : 'applied');
  });

  it("a discarded order's commandId is forgotten", async () => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' })
      .mockResolvedValueOnce({ kind: 'results', results: [result(input, 'rejected')] });
    await outbox.flush();
    await outbox.flush();
    expect((await stored(input.id))?.syncStatus).toBe('rejected');
    expect(await outbox.discard(input.id)).toBe(true);
    const next = order(1);
    await collection.insert(next);
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.map((command) => [command.id, command.attempt])))
      .toEqual([[[input.commandId, 1]], [[input.commandId, 2]], [[next.commandId, 1]]]);
  });

  it.each(['requeue', 'discard'] as const)('a requeue racing a discard never removes the requeued order (%s first)', async (first) => {
    const input = rejectedOrder(0);
    await collection.insert(input);
    const { outbox } = setup();
    // Stopped, so requeue starts no flush and a requeued order stays pending.
    outbox.stop();
    const [requeued, discarded] = first === 'requeue'
      ? await Promise.all([outbox.requeue([input.id]), outbox.discard(input.id)])
      : await Promise.all([outbox.discard(input.id), outbox.requeue([input.id])]).then(([d, r]) => [r, d] as const);
    const after = await stored(input.id);
    if (discarded) expect([requeued, after]).toEqual([0, undefined]);
    else expect([requeued, after?.syncStatus, after?.commandId === input.commandId]).toEqual([1, 'pending', false]);
  });
});
