// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandResult, OrderCreateEnvelope, OrderUpdateEnvelope } from '@tallyui/core';
import { posOrderCollection, toOrderUpdateEnvelope, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, type OrderOutbox, type OrderOutboxOptions } from './order-outbox';
import type { CommandTransport, OutboxState } from './types';

let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>;
let collection: RxCollection<PosOrder>;
let outboxes: OrderOutbox[];
const epoch = Date.parse('2026-09-23T12:00:00.000Z');
const retry = { kind: 'retry', reason: 'status_503' } as const;

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

describe('order outbox updates', () => {
  it('sends a reopened sale as order.update and a plain sale as order.create in one batch', async () => {
    const plain = order(0), input = reopened(1);
    await collection.bulkInsert([plain, input]);
    const { outbox, send } = setup();
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    const batch = send.mock.calls[0][0];
    expect(batch.map(({ type }) => type)).toEqual(['order.create', 'order.update']);
    expect(batch[0].payload.clientOrderId).toBe(plain.id);
    expect(batch[1].payload).toMatchObject({ clientOrderId: input.id, orderId: input.storeOrderId,
      lines: [{ storeLineId: '11' }], payments: [{ paymentId: '21' }] });
    for (const row of [plain, input]) expect(await stored(row.id)).toMatchObject({ syncStatus: 'applied',
      serverRefs: { orderId: `server-${row.commandId}`, totalMinor: row.totalMinor } });
  });

  it("stores the order.create version of the update's bytes as sentVersion and resends the same bytes", async () => {
    const input = reopened(0);
    input.note = 'Gift wrap';
    input.taxByRate = [];
    input.display = { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 100, discountMinor: 0,
      taxMinor: 0, totalMinor: 100, orderDiscountMinor: 0, lines: [{ lineId: input.lines[0].id, amountMinor: 100, discounts: [] }] };
    await collection.insert(input);
    let max = 6;
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => max });
    send.mockResolvedValueOnce(retry);
    await outbox.flush();
    const first = send.mock.calls[0][0][0] as OrderUpdateEnvelope;
    expect(first.type).toBe('order.update');
    expect(first.payload.createVersion).not.toBe(1);
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending', sentVersion: first.payload.createVersion });
    max = 9;
    expect(toOrderUpdateEnvelope(input, 'device-1', 1, { maxVersion: max }).payload.createVersion).not.toBe(first.payload.createVersion);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(send.mock.calls[1][0][0])).toBe(JSON.stringify({ ...first, attempt: 2 }));
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'applied', sentVersion: first.payload.createVersion });
  });

  it.each(['503', 'unsupported_version', 'refused', 'isolation'] as const)(
    'never sends order.create for a reopened sale, on any path (%s)', async (scenario) => {
      const input = reopened(1), plain = order(0);
      if (scenario === 'unsupported_version' || scenario === 'refused') {
        input.taxByRate = [];
        input.display = { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 101, discountMinor: 0,
          taxMinor: 0, totalMinor: 101, orderDiscountMinor: 0, lines: [{ lineId: input.lines[0].id, amountMinor: 101, discounts: [] }] };
        if (scenario === 'refused') input.fees = [{ id: uuidv7(), name: 'Bag', amountMinor: 0, taxStatus: 'none', netMinor: 0, taxMicros: '0', taxLines: [] }];
      }
      await collection.bulkInsert(scenario === 'isolation' ? [plain, input] : [input]);
      const { outbox, send, states } = setup({ getMaxOrderCreateVersion: () => 3, isolateAfterAttempts: 2 });
      if (scenario === '503') {
        send.mockResolvedValueOnce(retry);
        await outbox.flush();
        expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending' });
        await outbox.flush();
        expect(send).toHaveBeenCalledTimes(2);
      } else if (scenario === 'unsupported_version') {
        let before: Awaited<ReturnType<typeof stored>> | undefined;
        const error = { code: 'unsupported_version', message: 'Maximum 3', data: { orderCreate: 3 } };
        send.mockImplementationOnce(async () => {
          before = await stored(input.id);
          return { kind: 'results', results: [{ id: input.commandId, status: 'rejected', error }] };
        });
        await outbox.flush();
        const after = await stored(input.id);
        expect(after).toMatchObject({ syncStatus: 'rejected', error });
        expect(after.sentVersion).toBe(before!.sentVersion);
        expect(after.downgradedFrom).toBe(before!.downgradedFrom);
        await outbox.flush();
        expect(send).toHaveBeenCalledTimes(1);
      } else if (scenario === 'refused') {
        send.mockResolvedValueOnce({ kind: 'refused', status: 400, reason: 'Invalid commands[0].version' });
        await outbox.flush();
        expect(await stored(input.id)).toMatchObject({ syncStatus: 'pending' });
        expect(states.at(-1)?.refused).toEqual({ status: 400, reason: 'Invalid commands[0].version' });
        await outbox.flush();
        expect(send).toHaveBeenCalledTimes(2);
      } else {
        let failing = true;
        send.mockImplementation(async (batch) => failing && batch.some((command) => command.id === plain.commandId)
          ? retry : { kind: 'results', results: applied(batch) });
        for (let i = 0; i < 4; i++) await outbox.flush();
        expect(send.mock.calls.map(([batch]) => batch.map(({ id }) => id))).toEqual([
          [plain.commandId, input.commandId], [plain.commandId, input.commandId], [plain.commandId], [input.commandId],
        ]);
        expect(await stored(plain.id)).toMatchObject({ syncStatus: 'pending', serverFailures: { isolated: true } });
        failing = false;
        vi.setSystemTime(Date.now() + 1000);
        await outbox.flush();
        expect(await stored(plain.id)).toMatchObject({ syncStatus: 'applied' });
      }
      if (scenario !== 'unsupported_version') expect(await stored(input.id)).toMatchObject({ syncStatus: 'applied' });
      const sent = send.mock.calls.flatMap(([batch]) => batch).filter((command) => command.payload.clientOrderId === input.id);
      expect(sent.length).toBeGreaterThan(0);
      for (const command of sent) expect(command.type).toBe('order.update');
    });

  it('requeue() sends a rejected reopened sale again as order.update', async () => {
    const input = reopened(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: input.commandId, status: 'rejected',
      error: { code: 'platform_error', message: 'Try again' } }] });
    await outbox.flush();
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'rejected' });
    expect(await outbox.requeue([input.id])).toBe(1);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    const first = send.mock.calls[0][0][0], second = send.mock.calls[1][0][0];
    expect([first.type, second.type]).toEqual(['order.update', 'order.update']);
    expect(second.id).not.toBe(first.id);
    expect(second.payload).toStrictEqual(first.payload);
    expect(await stored(input.id)).toMatchObject({ syncStatus: 'applied', commandId: second.id });
  });
});
