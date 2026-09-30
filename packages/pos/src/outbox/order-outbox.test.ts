// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxChangeEvent, type RxCollection, type RxDatabase } from 'rxdb';
import { Subject, type Observable } from 'rxjs';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandEnvelope, CommandResult, OrderCreateEnvelope, OrderCreatePayload } from '@tallyui/core';
import { commandFingerprint } from '@tallyui/core/server';
import { createOrderBuilder } from '../order/order-builder';
import { finalizeOrder, posOrderCollection, toOrderCreateEnvelope, uuidv7, type PosOrder } from '../pos-order';
import { createOrderOutbox, ISOLATE_AFTER_ATTEMPTS, STUCK_AFTER_MS, type OrderOutbox, type OrderOutboxOptions } from './order-outbox';
import { outboxLogger } from './index';
import type { CommandTransport, OutboxState, TransportOutcome } from './types';

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

// golden-v3.test.ts's full pipeline, with fresh identities for each stored sale.
function v3Order(i = 0, discounted = true): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 200000 } });
  const inclusive = builder.addLine({ productId: 'variant_inclusive', variantId: 'variant_inclusive', name: 'Inclusive item', sku: 'INCLUSIVE',
    unitPrice: { amount: 1200, currency: 'EUR', taxInclusive: true }, quantity: 2, taxRates: [{ code: 'VAT20', ratePpm: 200000 }] });
  builder.addLine({ productId: 'variant_exclusive', variantId: 'variant_exclusive', name: 'Exclusive item', sku: 'EXCLUSIVE',
    unitPrice: { amount: 1000, currency: 'EUR', taxInclusive: false }, quantity: 1, taxRates: [{ ratePpm: 100000 }] });
  if (discounted) {
    builder.applyLineDiscount(inclusive, { type: 'fixed', value: 120, label: 'Line discount' });
    builder.applyOrderDiscount({ type: 'fixed', value: 120 });
  }
  builder.addPayment({ method: 'cash', amountMinor: 4000, reference: 'cash_receipt_1' });
  builder.setCustomer({ id: 'cus_golden_v3', name: 'Golden Buyer', email: 'buyer@example.com' });
  return { ...finalizeOrder(builder.getSnapshot(), { now: new Date(epoch + i * 1000), capabilities: { orderCreate: 3 },
    registerId: 'register_golden', cashierRef: 'cashier_golden' }), sessionId: '019f6d2e-7800-7000-8000-000000000003' };
}

function unsupported(input: Pick<PosOrder, 'commandId'>, max?: unknown): CommandResult {
  return { id: input.commandId, status: 'rejected', error: { code: 'unsupported_version',
    message: 'order.create version is not supported', ...(max !== undefined ? { data: { orderCreate: max } } : {}) } };
}

function setup(overrides: Partial<OrderOutboxOptions> = {}) {
  const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>().mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
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
  ({ pos_orders: collection } = await db.addCollections({ pos_orders: posOrderCollection() }));
});

afterEach(async () => {
  outboxes.forEach((outbox) => outbox.stop());
  vi.useRealTimers();
  await db.remove();
});

describe('order outbox', () => {
  it('freezes an older pending order before sending and retries the same bytes without a second write', async () => {
    vi.useFakeTimers();
    const input = order(0);
    input.lines[0].name = 'N'.repeat(300);
    await collection.insert(input);
    const { outbox, send } = setup();
    send.mockImplementation(async (batch) => {
      expect(batch[0].payload.lines[0].title).toBe(`${'N'.repeat(254)}…`);
      expect((await collection.findOne(input.id).exec())!.lines[0].name).toBe(`${'N'.repeat(254)}…`);
      return { kind: 'retry', reason: 'network' };
    });
    await outbox.flush();
    const stored = (await collection.findOne(input.id).exec())!.toJSON(true);
    expect(stored.lines[0].name).toHaveLength(255);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    const first = send.mock.calls[0][0][0];
    const retry = send.mock.calls[1][0][0];
    expect([first.attempt, retry.attempt]).toEqual([1, 2]);
    expect(commandFingerprint(retry)).toBe(commandFingerprint(first));
    expect((await collection.findOne(input.id).exec())!.toJSON(true)).toStrictEqual(stored);
  });

  it('a backlog larger than one batch on an old plugin downgrades batch by batch and never enters refused', async () => {
    const inputs = Array.from({ length: 25 }, (_, i) => v3Order(i));
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup({ getMaxOrderCreateVersion: () => 2 });
    send.mockImplementation(async (batch) => {
      const index = batch.findIndex((command) => command.version > 2);
      return index < 0 ? { kind: 'results', results: applied(batch) }
        : { kind: 'refused', status: 400, reason: `Invalid commands[${index}].version` };
    });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(6);
    for (const input of inputs) {
      expect(send.mock.calls.flatMap(([batch]) => batch.filter((command) => command.payload.clientOrderId === input.id))
        .map((command) => [command.id, command.version])).toEqual([[input.commandId, 3], [input.commandId, 2]]);
      const stored = (await collection.findOne(input.id).exec())!.toJSON();
      expect(stored).toMatchObject({ syncStatus: 'applied', commandId: input.commandId, sentVersion: 2, downgradedFrom: 3 });
      expect(stored.display).toStrictEqual(input.display);
      expect(stored.taxByRate).toStrictEqual(input.taxByRate);
    }
    expect(states.some((state) => state.refused)).toBe(false);
  });

  it('logs downgrades and unsupported rejections through outboxLogger', async () => {
    const inputs = [v3Order(0, false), v3Order(1)];
    await collection.bulkInsert(inputs);
    const write = vi.fn();
    outboxLogger.addSink({ id: 'fallback-capture', levels: ['warn', 'error'], write });
    try {
      const { outbox, send } = setup({ getMaxOrderCreateVersion: () => 1 });
      send.mockResolvedValueOnce({ kind: 'results', results: inputs.map((input) => unsupported(input, 1)) });
      await outbox.flush();
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', scope: 'outbox',
        message: 'Sent an order at a lower order.create version', data: { orderId: inputs[0].id, from: 3, to: 1 } }));
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', scope: 'outbox',
        message: 'This sale needs order.create version 2; the server supports up to 1.', data: { orderId: inputs[1].id } }));
    } finally { outboxLogger.removeSink('fallback-capture'); }
  });

  it.each([0, 2.5, -1])('an invalid app max (0, 2.5, -1) never downgrades or stalls: %s', async (max) => {
    const input = v3Order(0, false);
    await collection.insert(input);
    const { outbox, send, states } = setup({ getMaxOrderCreateVersion: () => max });
    const result = unsupported(input);
    send.mockResolvedValue({ kind: 'results', results: [result] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    const stored = (await collection.findOne(input.id).exec())!.toJSON();
    expect(stored).toMatchObject({ syncStatus: 'rejected', error: result.error, commandId: input.commandId });
    expect(stored.sentVersion).toBeUndefined();
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false, nextAttemptAt: undefined });
  });

  it("a failing refreshCapabilities doesn't block a downgrade the server already specified", async () => {
    const input = v3Order();
    await collection.insert(input);
    const cause = new Error('refresh offline');
    const refreshCapabilities = vi.fn(async () => { throw cause; });
    const { outbox, send } = setup({ refreshCapabilities, getMaxOrderCreateVersion: () => 3 });
    const write = vi.fn();
    outboxLogger.addSink({ id: 'refresh-capture', levels: ['warn'], write });
    try {
      send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(input, 2)] });
      await outbox.flush();
      expect(refreshCapabilities).toHaveBeenCalledTimes(1);
      expect(write).toHaveBeenCalledWith(expect.objectContaining({ level: 'warn', data: { cause } }));
      expect(send.mock.calls.map(([batch]) => [batch[0].id, batch[0].version])).toEqual([[input.commandId, 3], [input.commandId, 2]]);
      expect((await collection.findOne(input.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'applied', sentVersion: 2 });
    } finally { outboxLogger.removeSink('refresh-capture'); }
  });

  it("an order can be lowered again when the server's max drops, and downgradedFrom keeps the first version", async () => {
    const input = v3Order(0, false);
    await collection.insert(input);
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => 2 });
    send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(input, 2)] });
    await outbox.flush();
    const current = (await collection.findOne(input.id).exec())!;
    expect(current.toJSON()).toMatchObject({ syncStatus: 'applied', sentVersion: 2, downgradedFrom: 3 });
    // A persisted refusal after the server's maximum drops is requeueable, with the prior cap intact.
    await current.incrementalPatch({ syncStatus: 'rejected', error: unsupported(input, 1).error });
    outbox.stop();
    expect(await outbox.requeue([input.id])).toBe(1);
    const requeued = (await collection.findOne(input.id).exec())!.toJSON();
    send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(requeued, 1)] });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => [batch[0].id, batch[0].version])).toEqual([
      [input.commandId, 3], [input.commandId, 2], [requeued.commandId, 2], [requeued.commandId, 1],
    ]);
    const stored = (await collection.findOne(input.id).exec())!.toJSON();
    expect(stored).toMatchObject({ syncStatus: 'applied', sentVersion: 1, downgradedFrom: 3 });
    for (const key of ['display', 'taxByRate', 'lines', 'payments', 'subtotalMinor', 'discountMinor', 'taxMinor', 'totalMinor'] as const) {
      expect(stored[key]).toStrictEqual(input[key]);
    }
  });

  it('refreshCapabilities runs once per batch', async () => {
    const inputs = [v3Order(0, false), v3Order(1, false)];
    await collection.bulkInsert(inputs);
    const refreshCapabilities = vi.fn(async () => {});
    const getMaxOrderCreateVersion = vi.fn().mockReturnValueOnce(2).mockReturnValue(1);
    const { outbox, send } = setup({ refreshCapabilities, getMaxOrderCreateVersion });
    send.mockResolvedValueOnce({ kind: 'results', results: inputs.map((input) => unsupported(input)) });
    await outbox.flush();
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
    expect(getMaxOrderCreateVersion).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].map((command) => [command.id, command.version])).toEqual(inputs.map((input) => [input.commandId, 2]));
    for (const input of inputs) expect((await collection.findOne(input.id).exec())!.syncStatus).toBe('applied');
  });

  it('a per-command unsupported_version refreshes, records the downgrade and resends at v2 under the same commandId', async () => {
    const input = v3Order();
    await collection.insert(input);
    const refreshCapabilities = vi.fn(async () => {});
    const getMaxOrderCreateVersion = vi.fn(() => 3);
    const { outbox, send, states } = setup({ refreshCapabilities, getMaxOrderCreateVersion });
    send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(input, 2)] });
    send.mockImplementationOnce(async (batch) => {
      expect(refreshCapabilities).toHaveBeenCalledTimes(1);
      expect(states.at(-1)?.lastRetryReason).toBe('downgraded');
      expect((await collection.findOne(input.id).exec())!.toJSON()).toStrictEqual({ ...input, sentVersion: 2, downgradedFrom: 3 });
      return { kind: 'results', results: applied(batch) };
    });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([batch]) => [batch[0].id, batch[0].version])).toEqual([[input.commandId, 3], [input.commandId, 2]]);
    expect(send.mock.calls[1][0][0]).toStrictEqual(toOrderCreateEnvelope(input, 'device-1', 2, { maxVersion: 2 }));
    const stored = (await collection.findOne(input.id).exec())!.toJSON();
    expect(stored).toMatchObject({ syncStatus: 'applied', sentVersion: 2, downgradedFrom: 3 });
    expect(stored.display).toStrictEqual(input.display);
    expect(stored.taxByRate).toStrictEqual(input.taxByRate);
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
    expect(getMaxOrderCreateVersion).not.toHaveBeenCalled();
    expect(states.some((state) => state.refused)).toBe(false);
  });

  it.each([undefined, 0, -1, 1.5, '2', Number.MAX_SAFE_INTEGER + 1])('refreshes before reading capabilities when error data is unusable: %s', async (max) => {
    const input = v3Order();
    await collection.insert(input);
    let supported = 3;
    const refreshCapabilities = vi.fn(async () => { supported = 2; });
    const { outbox, send } = setup({ refreshCapabilities, getMaxOrderCreateVersion: async () => supported });
    send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(input, max)] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0][0].version).toBe(2);
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
  });

  it('an old-plugin batch 400 Invalid commands[1].version rebuilds the batch and never enters refused', async () => {
    const inputs = [order(0), v3Order(1), v3Order(2)];
    await collection.bulkInsert(inputs);
    let supported = 3;
    const refreshCapabilities = vi.fn(async () => { supported = 2; });
    const { outbox, send, states } = setup({ refreshCapabilities, getMaxOrderCreateVersion: () => supported });
    send.mockResolvedValueOnce({ kind: 'refused', status: 400, reason: 'Invalid commands[1].version' });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls.map(([batch]) => batch.map((command) => command.id))).toEqual([inputs.map((input) => input.commandId), inputs.map((input) => input.commandId)]);
    expect(send.mock.calls[1][0].map((command) => command.version)).toEqual([1, 2, 2]);
    for (const input of inputs) {
      const stored = (await collection.findOne(input.id).exec())!;
      expect(stored.syncStatus).toBe('applied');
      expect(stored.sentVersion).toBe(input.display ? 2 : undefined);
      expect(stored.downgradedFrom).toBe(input.display ? 3 : undefined);
    }
    expect(refreshCapabilities).toHaveBeenCalledTimes(1);
    expect(states.some((state) => state.refused)).toBe(false);
    expect(states.some((state) => state.lastRetryReason === 'downgraded')).toBe(true);
  });

  it.each([false, true])('a discounted order with max 1 is rejected unsupported_version while the others are applied, batch 400: %s', async (legacy) => {
    const inputs = [v3Order(), order(1), v3Order(2, false)];
    await collection.bulkInsert(inputs);
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => 1 });
    send.mockResolvedValueOnce(legacy ? { kind: 'refused', status: 400, reason: 'Invalid commands[0].version' }
      : { kind: 'results', results: [unsupported(inputs[0], 1), ...applied([toOrderCreateEnvelope(inputs[1], 'device-1')]), unsupported(inputs[2], 1)] });
    await outbox.flush();
    const rejected = (await collection.findOne(inputs[0].id).exec())!.toJSON();
    expect(rejected.syncStatus).toBe('rejected');
    expect(rejected.error).toStrictEqual({ code: 'unsupported_version', message: 'This sale needs order.create version 2; the server supports up to 1.' });
    expect(rejected.sentVersion).toBeUndefined();
    expect(rejected.downgradedFrom).toBeUndefined();
    expect(rejected.display).toStrictEqual(inputs[0].display);
    expect(rejected.taxByRate).toStrictEqual(inputs[0].taxByRate);
    for (const input of inputs.slice(1)) expect((await collection.findOne(input.id).exec())!.syncStatus).toBe('applied');
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0].every((command) => command.version === 1 && command.id !== inputs[0].commandId)).toBe(true);
  });

  it('requeue picks up an unsupported_version rejection and keeps sentVersion', async () => {
    const input: PosOrder = { ...v3Order(), sentVersion: 2, downgradedFrom: 3, syncStatus: 'rejected',
      error: { code: 'unsupported_version', message: 'not supported' } };
    await collection.insert(input);
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => 3 });
    outbox.stop();
    expect(await outbox.requeue([input.id])).toBe(1);
    expect((await collection.findOne(input.id).exec())!.sentVersion).toBe(2);
    await outbox.flush();
    expect(send.mock.calls[0][0][0].version).toBe(2);
    expect((await collection.findOne(input.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'applied', sentVersion: 2, downgradedFrom: 3 });
  });

  it('a second unsupported answer with a lower maximum lowers the order again', async () => {
    const input = v3Order(0, false);
    await collection.insert(input);
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => 1 });
    const second = unsupported(input, 1);
    send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(input, 2)] })
      .mockResolvedValueOnce({ kind: 'results', results: [second] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect((await collection.findOne(input.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'applied',
      sentVersion: 1, downgradedFrom: 3, commandId: input.commandId });
  });

  it('a refusal at the current sentVersion is terminal', async () => {
    const input = { ...v3Order(0, false), sentVersion: 2 as const, downgradedFrom: 3 as const };
    await collection.insert(input);
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => 2 });
    const result = unsupported(input, 2);
    send.mockResolvedValue({ kind: 'results', results: [result] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await collection.findOne(input.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'rejected',
      error: result.error, sentVersion: 2, downgradedFrom: 3, commandId: input.commandId });
  });

  it('a downgraded order resends the same bytes after the outbox is recreated', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const input = v3Order();
    await collection.insert(input);
    const first = setup({ getMaxOrderCreateVersion: () => 2 });
    first.send.mockResolvedValueOnce({ kind: 'results', results: [unsupported(input, 2)] })
      .mockResolvedValueOnce({ kind: 'retry', reason: 'offline' });
    await first.outbox.flush();
    first.outbox.stop();
    const next = setup({ getMaxOrderCreateVersion: () => 3 });
    await next.outbox.flush();
    expect(first.send).toHaveBeenCalledTimes(2);
    expect(next.send).toHaveBeenCalledTimes(1);
    const original = first.send.mock.calls[1][0][0];
    const restarted = next.send.mock.calls[0][0][0];
    expect(restarted).toMatchObject({ id: input.commandId, version: 2, attempt: 1 });
    // As in command.test.ts, attempt is informational and restarts with the outbox.
    expect(JSON.stringify({ ...restarted, attempt: original.attempt })).toBe(JSON.stringify(original));
  });

  it('without getMaxOrderCreateVersion an unsupported result becomes plain rejected', async () => {
    const input = v3Order();
    await collection.insert(input);
    const refreshCapabilities = vi.fn(async () => {});
    const { outbox, send } = setup({ refreshCapabilities });
    const result = unsupported(input, 2);
    send.mockResolvedValue({ kind: 'results', results: [result] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(refreshCapabilities).not.toHaveBeenCalled();
    expect((await collection.findOne(input.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'rejected', error: result.error });
    expect((await collection.findOne(input.id).exec())!.sentVersion).toBeUndefined();
  });

  it.each([undefined, 3])('an unsupported answer with no lower maximum is terminal: %s', async (max) => {
    const input = v3Order();
    await collection.insert(input);
    const { outbox, send } = setup({ getMaxOrderCreateVersion: () => max });
    const result = unsupported(input);
    send.mockResolvedValue({ kind: 'results', results: [result] });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect((await collection.findOne(input.id).exec())!.toJSON().error).toStrictEqual(result.error);
    expect((await collection.findOne(input.id).exec())!.syncStatus).toBe('rejected');
  });

  it('a matching batch 400 is refused once the order cannot be lowered again', async () => {
    const input = v3Order(0, false);
    await collection.insert(input);
    const refreshCapabilities = vi.fn(async () => {});
    const { outbox, send, states } = setup({ refreshCapabilities, getMaxOrderCreateVersion: vi.fn().mockReturnValueOnce(2).mockReturnValue(1) });
    send.mockResolvedValue({ kind: 'refused', status: 400, reason: 'Invalid commands[0].version' });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(refreshCapabilities).toHaveBeenCalledTimes(3);
    expect(states.at(-1)?.refused).toStrictEqual({ status: 400, reason: 'Invalid commands[0].version' });
    expect((await collection.findOne(input.id).exec())!.sentVersion).toBe(1);
  });

  it.each(['malformed batch', 'Invalid commands[0].payload', 'Invalid commands[0].version extra'])('a 400 with any other reason is refused: %s', async (reason) => {
    const input = v3Order();
    await collection.insert(input);
    const refreshCapabilities = vi.fn(async () => {});
    const { outbox, send, states } = setup({ refreshCapabilities, getMaxOrderCreateVersion: () => 2 });
    send.mockResolvedValue({ kind: 'refused', status: 400, reason });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(refreshCapabilities).not.toHaveBeenCalled();
    expect(states.at(-1)?.refused).toStrictEqual({ status: 400, reason });
    expect((await collection.findOne(input.id).exec())!.toJSON()).toStrictEqual(input);
  });

  it('sends a version-3 order as version 3 and a pre-v3 pending order as before', async () => {
    const legacy = order(0);
    const current = order(1);
    current.display = { currency: 'EUR', exponent: 2, taxInclusive: false, subtotalMinor: 101, discountMinor: 0,
      taxMinor: 0, totalMinor: 101, orderDiscountMinor: 0, lines: [{ lineId: current.lines[0].id, amountMinor: 101, discounts: [] }] };
    current.taxByRate = [{ ratePpm: 0, netMinor: 101, amountMinor: 0, grossMinor: 101 }];
    await collection.bulkInsert([legacy, current]);
    const { outbox, send } = setup();
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    const batch = send.mock.calls[0][0];
    expect(batch.map((command) => command.version)).toEqual([1, 3]);
    expect(batch).toStrictEqual([toOrderCreateEnvelope(legacy, 'device-1'), toOrderCreateEnvelope(current, 'device-1')]);
    expect((await collection.find().exec()).map((doc) => doc.syncStatus)).toEqual(['applied', 'applied']);
  });

  it.each([false, true])('pauses after three 401s, with intervening 500: %s, and resumes on flush', async (interleave) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const input = order(0);
    await collection.insert(input);
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'unauthorized' });
    await outbox.flush();
    expect(states.at(-1)?.authRequired).not.toBe(true);
    if (interleave) send.mockResolvedValueOnce({ kind: 'retry', reason: 'status_500' });
    for (let i = 0; i < (interleave ? 3 : 2); i++) {
      await vi.advanceTimersByTimeAsync(states.at(-1)!.nextAttemptAt! - Date.now());
    }
    expect(states.at(-1)).toMatchObject({ authRequired: true, lastRetryReason: 'unauthorized',
      sending: false, nextAttemptAt: undefined, pending: 1 });
    expect(send).toHaveBeenCalledTimes(interleave ? 4 : 3);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(interleave ? 4 : 3);
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('pending');
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await outbox.flush();
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('applied');
    expect(states.at(-1)?.authRequired).toBe(false);
  });

  it.each(['results', 'refused'] as const)('resets the 401 counter on %s, even without applied orders', async (kind) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await collection.insert(order(0));
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'unauthorized' });
    for (let i = 0; i < 3; i++) await outbox.flush();
    expect(states.at(-1)?.authRequired).toBe(true);
    send.mockResolvedValueOnce(kind === 'results' ? { kind, results: [] } : { kind, status: 400, reason: 'bad' });
    await outbox.flush();
    if (kind === 'results') {
      expect(states.at(-1)).toMatchObject({ authRequired: false, lastRetryReason: 'no_progress' });
    } else {
      expect(states.at(-1)).toMatchObject({ authRequired: false,
        refused: { status: 400, reason: 'bad' }, nextAttemptAt: undefined });
      expect((await collection.findOne().exec())?.syncStatus).toBe('pending');
    }
    for (let i = 0; i < 2; i++) {
      await outbox.flush();
      expect(states.at(-1)?.nextAttemptAt).toBeDefined();
    }
    await outbox.flush();
    expect(states.at(-1)).toMatchObject({ authRequired: true, nextAttemptAt: undefined });
  });

  it('never prompts after two 401s followed by success', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await collection.insert(order(0));
    const { outbox, send, states } = setup();
    send.mockResolvedValueOnce({ kind: 'unauthorized' }).mockResolvedValueOnce({ kind: 'unauthorized' });
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(states.some((state) => state.authRequired === true)).toBe(false);
    expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
  });

  it('keeps all 25 refused orders pending and pauses until the next flush', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const inputs = Array.from({ length: 25 }, (_, i) => order(i));
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'refused', status: 400, reason: 'unsupported_protocol' });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await collection.count().exec()).toBe(25);
    for (const doc of await collection.find().exec()) {
      expect(doc.syncStatus).toBe('pending');
      expect(doc.error).toBeUndefined();
      expect(doc.toJSON()).toEqual(inputs.find((input) => input.id === doc.id));
    }
    expect(states.at(-1)).toMatchObject({ pending: 25, sending: false, lastRetryReason: 'refused',
      refused: { status: 400, reason: 'unsupported_protocol' }, nextAttemptAt: undefined });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await outbox.flush();
    expect(await collection.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(25);
    expect(states.at(-1)?.refused).toBeUndefined();
  });

  it.each([false, true])('requeues rejected orders with fresh command IDs, stopped: %s', async (stopped) => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const input = order(0);
    await collection.insert(input);
    const { outbox, send, states } = setup();
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: input.commandId,
      status: 'rejected', error: { code: 'unknown_variant', message: 'x' } }] });
    await outbox.flush();
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('rejected');
    await expect(outbox.requeue(['no-such-id'])).resolves.toBe(0);
    expect(send).toHaveBeenCalledTimes(1);
    if (stopped) outbox.stop();
    vi.setSystemTime(epoch + 1000);
    send.mockResolvedValue({ kind: 'refused', status: 400, reason: 'bad' });
    await expect(outbox.requeue(stopped ? [input.id] : undefined)).resolves.toBe(1);
    const requeued = (await collection.findOne(input.id).exec())!;
    expect(requeued.syncStatus).toBe('pending');
    expect(requeued.error).toBeUndefined();
    expect(requeued.commandId).not.toBe(input.commandId);
    expect(requeued.updatedAt).toBe(new Date(epoch + 1000).toISOString());
    expect(states.at(-1)?.pending).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(stopped ? 1 : 2);
    await outbox.flush();
    expect(send.mock.calls[1][0][0]).toMatchObject({ id: requeued.commandId, attempt: 1 });
  });

  it('requeues once when two calls find the same rejected order', async () => {
    const input = { ...order(0), syncStatus: 'rejected' as const, error: { code: 'unknown_variant', message: 'x' } };
    const doc = await collection.insert(input);
    const { outbox } = setup();
    outbox.stop();
    const modify = doc.incrementalModify.bind(doc);
    const commandIds = new Set<string>();
    let release!: () => void;
    const bothFound = new Promise<void>((resolve) => { release = resolve; });
    let calls = 0;
    const spy = vi.spyOn(doc, 'incrementalModify').mockImplementation(async (modifier) => {
      if (++calls === 2) release();
      await bothFound;
      const result = await modify(modifier);
      commandIds.add(result.commandId);
      return result;
    });
    const counts = await Promise.all([outbox.requeue(), outbox.requeue()]);
    spy.mockRestore();
    expect(counts.reduce((sum, count) => sum + count, 0)).toBe(1);
    expect(commandIds.size).toBe(1);
    expect(commandIds.has(input.commandId)).toBe(false);
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('pending');
  });

  it.each(['applied', 'idempotency_mismatch'])('leaves a stale requeue unchanged after %s', async (change) => {
    const input = { ...order(0), syncStatus: 'rejected' as const, error: { code: 'unknown_variant', message: 'x' } };
    const doc = await collection.insert(input);
    const { outbox, send } = setup();
    const modify = doc.incrementalModify.bind(doc);
    const patch = change === 'applied' ? { syncStatus: 'applied' as const }
      : { error: { code: 'idempotency_mismatch', message: 'x' } };
    const spy = vi.spyOn(doc, 'incrementalModify').mockImplementationOnce(async (modifier) => {
      await modify((data) => ({ ...data, ...patch }));
      return modify(modifier);
    });
    await expect(outbox.requeue()).resolves.toBe(0);
    spy.mockRestore();
    expect((await collection.findOne(input.id).exec())?.toJSON()).toMatchObject({ ...input, ...patch });
    expect(send).not.toHaveBeenCalled();
  });

  it('leaves idempotency_mismatch rejections for reconciliation when requeueing', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const input = order(0);
    const mismatch = order(1);
    const error = { code: 'idempotency_mismatch', message: 'y' };
    await collection.bulkInsert([input, mismatch]);
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'results', results: [
      { id: input.commandId, status: 'rejected', error: { code: 'unknown_variant', message: 'x' } },
      { id: mismatch.commandId, status: 'rejected', error },
    ] });
    await outbox.flush();
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('rejected');
    expect((await collection.findOne(mismatch.id).exec())?.syncStatus).toBe('rejected');
    send.mockResolvedValue({ kind: 'refused', status: 400, reason: 'bad' });
    await expect(outbox.requeue()).resolves.toBe(1);
    const requeued = (await collection.findOne(input.id).exec())!;
    expect(requeued.syncStatus).toBe('pending');
    expect(requeued.commandId).not.toBe(input.commandId);
    expect(requeued.error).toBeUndefined();
    expect((await collection.findOne(mismatch.id).exec())?.toJSON()).toMatchObject({
      syncStatus: 'rejected', commandId: mismatch.commandId, error,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    await expect(outbox.requeue([mismatch.id])).resolves.toBe(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await collection.findOne(mismatch.id).exec())?.toJSON()).toMatchObject({
      syncStatus: 'rejected', commandId: mismatch.commandId, error,
    });
  });

  it('keeps a 409 pending and retries', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await collection.insert(order(0));
    const { outbox, send } = setup();
    send.mockResolvedValue({ kind: 'retry', reason: 'status_409' });
    await outbox.flush();
    expect((await collection.findOne().exec())?.syncStatus).toBe('pending');
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await collection.findOne().exec())?.syncStatus).toBe('pending');
  });

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

  it('caps batches at 10 when configured for 50', async () => {
    await collection.bulkInsert(Array.from({ length: 25 }, (_, i) => order(i)));
    const { outbox, send } = setup({ batchSize: 50 });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([10, 10, 5]);
  });

  it('applies an unknown warning on the oldest order and sends the next order', async () => {
    const orders = [order(0), order(1)];
    await collection.bulkInsert(orders);
    const { outbox, send } = setup({ batchSize: 1 });
    const warnings = [{ code: 'new_code', foo: 1 }];
    send.mockImplementationOnce(async (batch) => ({ kind: 'results',
      results: [{ ...applied(batch)[0], warnings }] as unknown as CommandResult[] }));
    await outbox.flush();
    expect((await collection.findOne(orders[0].id).exec())?.toJSON()).toMatchObject({ syncStatus: 'applied', warnings });
    expect(send.mock.calls.map(([batch]) => batch[0].id)).toEqual(orders.map((input) => input.commandId));
    expect((await collection.findOne(orders[1].id).exec())?.syncStatus).toBe('applied');
  });

  it.each(['applied', 'rejected'] as const)('prunes attempts after an order is %s', async (status) => {
    const doc = await collection.insert(order(0));
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' }).mockResolvedValueOnce({ kind: 'results',
      results: [{ id: doc.commandId, status, error: { code: 'invalid', message: 'Invalid' } }] });
    await outbox.flush();
    await outbox.flush();
    expect((await collection.findOne(doc.id).exec())?.syncStatus).toBe(status);
    // Requeue the same command to observe whether its terminal attempt entry was removed.
    await doc.incrementalPatch({ syncStatus: 'pending' });
    await collection.insert(order(1));
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.map((command) => command.attempt))).toEqual([[1], [2], [1, 1]]);
  });

  it('retries after stop and start during an in-flight send', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await collection.insert(order(0));
    const { outbox, send } = setup();
    let resolve!: (outcome: Awaited<ReturnType<CommandTransport<OrderCreateEnvelope>['send']>>) => void;
    send.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
    outbox.start();
    const running = outbox.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    outbox.stop();
    outbox.start();
    resolve({ kind: 'retry', reason: 'network' });
    await running;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
  });

  it('resolves and schedules a retry when send throws without unhandled rejections', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    await collection.insert(order(0));
    const { outbox, send, states } = setup();
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      send.mockImplementationOnce(() => { throw new Error('send failed'); });
      outbox.start();
      await expect(outbox.flush()).resolves.toBeUndefined();
      expect(states.at(-1)).toMatchObject({ lastRetryReason: 'error: send failed', nextAttemptAt: epoch + 1000 });
      await vi.advanceTimersByTimeAsync(1000);
      expect(send).toHaveBeenCalledTimes(2);
      expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });

  it('re-flushes when start runs during the final state update of a stopped run', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await collection.bulkInsert([order(0), order(1)]);
    const { outbox, send } = setup({ batchSize: 1 });
    send.mockImplementationOnce(async (batch) => {
      outbox.stop();
      return { kind: 'results', results: applied(batch) };
    });
    const subscription = outbox.state$.subscribe((state) => {
      if (!state.sending && state.pending === 1) outbox.start();
    });
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(0);
    subscription.unsubscribe();
    expect(send).toHaveBeenCalledTimes(2);
    expect(await collection.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(2);
  });

  it('arms a retry and clears running when updateState throws in run and finally', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const { outbox, send, states } = setup();
    await outbox.flush();
    await collection.insert(order(0));
    const count = vi.spyOn(collection, 'count').mockImplementation(() => { throw new Error('count failed'); });
    try {
      await expect(outbox.flush()).resolves.toBeUndefined();
      expect(states.at(-1)?.lastRetryReason).toBe('error: count failed');
    } finally {
      count.mockRestore();
    }
    await vi.advanceTimersByTimeAsync(1000);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
  });

  it('clamps a 30-day Retry-After without a timer overflow hot loop', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    await collection.insert(order(0));
    const { outbox, send, states } = setup({ maxBackoffMs: 60000 });
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'status_503', retryAfterMs: 30 * 86400_000 });
    await outbox.flush();
    expect(states.at(-1)!.nextAttemptAt! - epoch).toBeLessThanOrEqual(60000);
    await vi.advanceTimersByTimeAsync(100);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(59900);
    expect(send).toHaveBeenCalledTimes(2);
    expect((await collection.findOne().exec())?.syncStatus).toBe('applied');
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
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, authRequired: false, lastRetryReason: 'no_progress', nextAttemptAt: epoch + 1000 });
    await vi.advanceTimersByTimeAsync(999);
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(send).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, authRequired: false, lastRetryReason: 'no_progress', nextAttemptAt: epoch + 3000 });
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
    expect(states.at(-1)).toEqual({ pending: 1, sending: false, authRequired: false, lastRetryReason: 'no_progress', nextAttemptAt: epoch + 1000 });
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

  it('an UPDATE event without previousDocumentData counts as a change: it flushes, and the watch goes on', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const input = order(0);
    await collection.insert(input);
    // A hand-built event stream stands in for the collection's.
    const events = new Subject<RxChangeEvent<PosOrder>>();
    const watched = collection as { $: Observable<RxChangeEvent<PosOrder>> };
    const real = watched.$;
    watched.$ = events;
    try {
      const { outbox, send } = setup();
      send.mockResolvedValue({ kind: 'retry', reason: 'network' });
      outbox.start();
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      const update = { operation: 'UPDATE', documentId: input.id, isLocal: false, collectionName: 'pos_orders',
        documentData: (await collection.findOne(input.id).exec())!.toJSON(true) } as unknown as RxChangeEvent<PosOrder>;
      events.next(update);
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(2);
      events.next(update);
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(3);
    } finally {
      watched.$ = real;
    }
  });

  it('sends a pending order already in the collection on start(), with no flush() call', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(1);
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('applied');
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

  it('an order requeued to a new commandId while its old command is in flight stays pending under the new commandId when the old result arrives', async () => {
    const input = order(0);
    await collection.insert(input);
    const { outbox, send } = setup();
    let requeuedCommandId!: string;
    send.mockImplementationOnce(async (batch) => {
      // A requeue lands while this send (built under input.commandId) is still in flight.
      await (await collection.findOne(input.id).exec())!.incrementalModify((data) => {
        requeuedCommandId = uuidv7();
        return { ...data, commandId: requeuedCommandId, syncStatus: 'pending' as const };
      });
      return { kind: 'results', results: applied(batch) }; // the old command's result, keyed by input.commandId
    });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    const requeued = (await collection.findOne(input.id).exec())!;
    expect(requeued.syncStatus).toBe('pending');
    expect(requeued.commandId).toBe(requeuedCommandId);
    // A second flush sends it, once, under the new commandId, and marks it applied.
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0]).toEqual([expect.objectContaining({ id: requeuedCommandId })]);
    expect((await collection.findOne(input.id).exec())?.syncStatus).toBe('applied');
  });

  // RxDB 16.21.1 bug 4: a write that lands after a cached query's storage read has answered, but
  // before its continuation runs, never reaches that query. These insert a sale at that moment.
  it('sends a sale inserted while the pending read is in flight, and a later sale', async () => {
    const [first, raced, later] = [order(0), order(1), order(2)];
    await collection.insert(first);
    const query = collection.storageInstance.query.bind(collection.storageInstance);
    let armed = true;
    vi.spyOn(collection.storageInstance, 'query').mockImplementation(async (prepared) => {
      const result = await query(prepared);
      if (armed && prepared.query.limit) { armed = false; await collection.insert(raced); }
      return result;
    });
    const { outbox, send, states } = setup();
    await outbox.flush();
    expect(armed).toBe(false);
    expect(send.mock.calls.flatMap(([batch]) => batch.map((command) => command.id)))
      .toEqual([first.commandId, raced.commandId]);
    expect(await collection.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(2);
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false });
    await collection.insert(later);
    await outbox.flush();
    expect(send.mock.calls.at(-1)?.[0].map((command) => command.id)).toEqual([later.commandId]);
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false });
  });

  it('counts a sale inserted while the pending count is in flight', async () => {
    const input = order(0);
    const count = collection.storageInstance.count.bind(collection.storageInstance);
    let armed = true;
    vi.spyOn(collection.storageInstance, 'count').mockImplementation(async (prepared) => {
      const result = await count(prepared);
      if (armed) { armed = false; await collection.insert(input); }
      return result;
    });
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'retry', reason: 'network' });
    await outbox.flush();
    outbox.stop();
    expect(armed).toBe(false);
    expect(send).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toMatchObject({ pending: 1, sending: false });
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
    const transport: CommandTransport<OrderCreateEnvelope> = { async send(batch) {
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

describe('order outbox isolation', () => {
  const ids = (batch: OrderCreateEnvelope[]) => batch.map((command) => command.id);
  const status = async (input: PosOrder) => (await collection.findOne(input.id).exec())?.syncStatus;
  const fail = { kind: 'retry', reason: 'status_503' } as const;
  // The store answers 503 for any batch holding one of `bad`, and applies every other batch.
  const failing = (...bad: PosOrder[]): CommandTransport<OrderCreateEnvelope>['send'] => async (batch) =>
    batch.some((command) => bad.some((input) => input.commandId === command.id)) ? fail : { kind: 'results', results: applied(batch) };
  // OutboxState.stuck for orders whose clocks share one `since` and reason.
  const stuckOf = (commandIds: string[], since: number, reason = 'status_503') =>
    ({ commandIds, since, reason, orders: commandIds.map((commandId) => ({ commandId, since, reason })) });

  function timed(overrides: Partial<OrderOutboxOptions> = {}) {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const harness = setup(overrides);
    const next = () => vi.advanceTimersByTimeAsync(harness.states.at(-1)!.nextAttemptAt! - Date.now());
    return { ...harness, next };
  }

  it('isolates an order the store keeps failing, and the orders around it apply', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(inputs[1]));
    await outbox.flush();
    // The fifth failure starts a walk; its first probe, one interval later, applies order 1: nothing is
    // isolated and batching resumes at once. Order 2 now heads it: five failures, a second walk, whose
    // probe of order 2 fails and whose probe of order 3 applies, so order 2 is isolated.
    for (let i = 0; i < 2 * ISOLATE_AFTER_ATTEMPTS + 1; i++) await next();
    const all = inputs.map((input) => input.commandId);
    expect(send.mock.calls.map(([batch]) => ids(batch))).toEqual([...Array(ISOLATE_AFTER_ATTEMPTS).fill(all), [all[0]],
      ...Array(ISOLATE_AFTER_ATTEMPTS).fill([all[1], all[2]]), [all[1]], [all[2]]]);
    expect([await status(inputs[0]), await status(inputs[1]), await status(inputs[2])]).toEqual(['applied', 'pending', 'applied']);
    expect(states.at(-1)).toMatchObject({ pending: 1, sending: false, lastRetryReason: 'status_503', nextAttemptAt: Date.now() + 1000 });
    // Retried alone on its own backoff, while later sales are batched without it.
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([all[1]]);
    expect(states.at(-1)?.nextAttemptAt).toBe(Date.now() + 2000);
    const later = [order(3), order(4)];
    await collection.bulkInsert(later);
    await outbox.flush();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual(later.map((input) => input.commandId));
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([all[1]]);
    expect([await status(inputs[1]), await status(later[0]), await status(later[1])]).toEqual(['pending', 'applied', 'applied']);
    expect(states.some((state) => state.stuck)).toBe(false);
  });

  it('flags an isolated order as stuck after STUCK_AFTER_MS, and clears it when the store applies it', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(inputs[1]));
    await outbox.flush();
    while (Date.now() < epoch + STUCK_AFTER_MS - 60_000) await next();
    expect(states.some((state) => state.stuck)).toBe(false);
    while (Date.now() < epoch + STUCK_AFTER_MS + 60_000) await next();
    expect(states.at(-1)?.stuck).toEqual(stuckOf([inputs[1].commandId], epoch));
    expect(await status(inputs[1])).toBe('pending');
    // An offline attempt pauses the clock, so the flag stays; the next 503 resumes it, leaving out the offline gap.
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' });
    await next();
    const pausedAt = Date.now();
    expect(states.at(-1)).toMatchObject({ stuck: stuckOf([inputs[1].commandId], epoch), lastRetryReason: 'network' });
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([inputs[1].commandId]);
    expect(states.at(-1)?.stuck).toEqual(stuckOf([inputs[1].commandId], epoch + Date.now() - pausedAt));
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await next();
    expect(await status(inputs[1])).toBe('applied');
    expect(states.at(-1)).toMatchObject({ pending: 0, stuck: undefined, nextAttemptAt: undefined });
    const later = [order(3), order(4)];
    await collection.bulkInsert(later);
    await outbox.flush();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual(later.map((input) => input.commandId));
    expect(await status(later[1])).toBe('applied');
  });

  it('a lone order the store keeps failing is not isolated, and is flagged at STUCK_AFTER_MS', async () => {
    const lone = order(0);
    await collection.insert(lone);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(lone));
    await outbox.flush();
    while (Date.now() < epoch + STUCK_AFTER_MS - 60_000) await next();
    expect(states.some((state) => state.stuck)).toBe(false);
    while (Date.now() < epoch + STUCK_AFTER_MS) await next();
    expect(states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], epoch));
    // Not isolated: a new sale is batched behind it, and fails with it, on its own clock.
    const later = order(1);
    await collection.insert(later);
    await outbox.flush();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([lone.commandId, later.commandId]);
    expect(states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], epoch));
  });

  it('an outage: no isolation, one request per backoff interval honouring Retry-After, the head batch flagged, then recovery', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    const times: number[] = [];
    send.mockImplementation(async () => { times.push(Date.now()); return { ...fail, retryAfterMs: 30_000 }; });
    await outbox.flush();
    while (Date.now() < epoch + STUCK_AFTER_MS - 60_000) await next();
    expect(Date.now()).toBeLessThan(epoch + STUCK_AFTER_MS);
    expect(states.some((state) => state.stuck)).toBe(false);
    while (Date.now() < epoch + STUCK_AFTER_MS + 60_000) await next();
    // Each gap is the outbox's backoff (1 s doubling, capped at 60 s), floored at Retry-After's 30 s.
    const gaps = times.slice(1).map((time, i) => time - times[i]);
    expect(gaps).toEqual(gaps.map((_, i) => Math.min(Math.max(30_000, 1000 * 2 ** i), 60_000)));
    // Five batches, then one probe per interval through the queue; all fail, so batching resumes.
    const all = inputs.map((input) => input.commandId);
    const cycle = [...Array(ISOLATE_AFTER_ATTEMPTS).fill(all), [all[0]], [all[1]], [all[2]]];
    expect(send.mock.calls.map(([batch]) => ids(batch))).toEqual(times.map((_, i) => cycle[i % cycle.length]));
    expect(states.at(-1)?.stuck).toEqual(stuckOf(all, epoch));
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    for (let i = 0; i < 10 && states.at(-1)!.pending; i++) await next();
    expect(await Promise.all(inputs.map(status))).toEqual(['applied', 'applied', 'applied']);
    expect(states.at(-1)).toMatchObject({ pending: 0, stuck: undefined, nextAttemptAt: undefined });
  });

  it('when the head order is the bad one, the probe moves past it: it is isolated and batching resumes', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    const times: number[] = [];
    const bad = failing(inputs[0]);
    send.mockImplementation(async (batch) => { times.push(Date.now()); return bad(batch); });
    await outbox.flush();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 1; i++) await next();
    const all = inputs.map((input) => input.commandId);
    expect(send.mock.calls.map(([batch]) => ids(batch)))
      .toEqual([...Array(ISOLATE_AFTER_ATTEMPTS).fill(all), [all[0]], [all[1]], [all[2]]]);
    // The second probe waits one interval after the failed first; the batch after it goes at once.
    const interval = 2 ** ISOLATE_AFTER_ATTEMPTS * 1000;
    expect(times.slice(-3).map((time) => time - times.at(-3)!)).toEqual([0, interval, interval]);
    expect(await Promise.all(inputs.map(status))).toEqual(['pending', 'applied', 'applied']);
    expect(states.at(-1)).toMatchObject({ pending: 1, lastRetryReason: 'status_503' });
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([all[0]]);
    const later = order(3);
    await collection.insert(later);
    await outbox.flush();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([later.commandId]);
    expect(await status(later)).toBe('applied');
  });

  it('a network failure during the walk stops it and schedules the usual retry', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS; i++) send.mockResolvedValueOnce(fail);
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' });
    await outbox.flush();
    while (send.mock.calls.length < ISOLATE_AFTER_ATTEMPTS + 1) await next();
    expect(send).toHaveBeenCalledTimes(ISOLATE_AFTER_ATTEMPTS + 1);
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([inputs[0].commandId]);
    expect(states.at(-1)).toMatchObject({ pending: 3, lastRetryReason: 'network' });
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual(inputs.map((input) => input.commandId));
    expect(states.at(-1)).toMatchObject({ pending: 0 });
  });

  it('a sale inserted while a run ends waiting on an isolated order is sent at once', async () => {
    const inputs = [order(0), order(1)];
    await collection.bulkInsert(inputs);
    const { outbox, send, next } = timed();
    send.mockImplementation(failing(inputs[0]));
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    while (send.mock.calls.length < ISOLATE_AFTER_ATTEMPTS + 2) await next();
    expect(await status(inputs[1])).toBe('applied');
    // The race of 'sends a sale inserted while the pending read is in flight', on the batch read.
    const raced = order(2);
    const query = collection.storageInstance.query.bind(collection.storageInstance);
    let armed = true;
    vi.spyOn(collection.storageInstance, 'query').mockImplementation(async (prepared) => {
      const result = await query(prepared);
      if (armed && JSON.stringify(prepared.query.selector).includes('$nin')) { armed = false; await collection.insert(raced); }
      return result;
    });
    // A run while the isolated order is not yet due finds nothing else to send, and would wait on it.
    const before = Date.now();
    const calls = send.mock.calls.length;
    await outbox.flush();
    expect(armed).toBe(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(Date.now()).toBe(before);
    expect(send.mock.calls.slice(calls).map(([batch]) => ids(batch))).toEqual([[raced.commandId]]);
    expect(await status(raced)).toBe('applied');
  });

  it('offline never counts toward isolation or stuck', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockResolvedValue({ kind: 'retry', reason: 'network' });
    await outbox.flush();
    while (Date.now() < epoch + STUCK_AFTER_MS + 5 * 60_000) await next();
    expect(send.mock.calls.length).toBeGreaterThan(ISOLATE_AFTER_ATTEMPTS * 2);
    for (const [batch] of send.mock.calls) expect(ids(batch)).toEqual(inputs.map((input) => input.commandId));
    expect(states.some((state) => state.stuck)).toBe(false);
    expect(states.at(-1)).toMatchObject({ pending: 3, lastRetryReason: 'network' });
  });

  it('a failure that comes back with results that apply resets the count', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, next } = timed();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS - 1; i++) send.mockResolvedValueOnce(fail);
    // Progress that keeps the same head: the store applies only the last order of the batch.
    send.mockImplementationOnce(async (batch) => ({ kind: 'results', results: applied(batch).slice(-1) }));
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS - 1; i++) send.mockResolvedValueOnce(fail);
    await outbox.flush();
    while (send.mock.calls.length < 2 * ISOLATE_AFTER_ATTEMPTS - 1) await next();
    expect(send.mock.calls.every(([batch]) => batch[0].id === inputs[0].commandId && batch.length > 1)).toBe(true);
    expect(await status(inputs[2])).toBe('applied');
    // The fifth failure since the progress starts the walk, as the bound says: probe 1 fails, probe 2 applies.
    send.mockResolvedValueOnce(fail).mockResolvedValueOnce(fail);
    for (let i = 0; i < 3; i++) await next();
    expect(send.mock.calls.slice(-3).map(([batch]) => ids(batch)))
      .toEqual([[inputs[0].commandId, inputs[1].commandId], [inputs[0].commandId], [inputs[1].commandId]]);
    expect([await status(inputs[0]), await status(inputs[1])]).toEqual(['pending', 'applied']);
  });

  it('a new head order restarts the count', async () => {
    const inputs = [order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, next } = timed();
    send.mockResolvedValue(fail);
    await outbox.flush();
    for (let i = 1; i < ISOLATE_AFTER_ATTEMPTS - 1; i++) await next();
    // An older sale now heads the batch.
    const older = order(0);
    await collection.insert(older);
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS - 1; i++) await next();
    expect(send).toHaveBeenCalledTimes(2 * ISOLATE_AFTER_ATTEMPTS - 2);
    expect(send.mock.calls.every(([batch]) => batch.length > 1)).toBe(true);
    // The fifth failure with the new head starts the walk: one probe per interval, all failing, so batching resumes.
    for (let i = 0; i < 5; i++) await next();
    const all = [older, ...inputs].map((input) => input.commandId);
    expect(send.mock.calls.slice(-5).map(([batch]) => ids(batch))).toEqual([all, [all[0]], [all[1]], [all[2]], all]);
  });

  it("the Front desk's case: one bad product sold 10 times, then a good 11th order, which applies within one walk", async () => {
    const bad = Array.from({ length: 10 }, (_, i) => order(i));
    const good = order(10);
    await collection.bulkInsert([...bad, good]);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(...bad));
    await outbox.flush();
    for (let i = 0; i < 30 && await status(good) === 'pending'; i++) await next();
    // Five batches of the ten bad orders, then one probe per interval through the queue, past the batch.
    const all = [...bad, good].map((input) => input.commandId);
    expect(send.mock.calls.map(([batch]) => ids(batch)))
      .toEqual([...Array(ISOLATE_AFTER_ATTEMPTS).fill(all.slice(0, 10)), ...all.map((id) => [id])]);
    expect(await status(good)).toBe('applied');
    expect(await Promise.all(bad.map(status))).toEqual(Array(10).fill('pending'));
    expect(states.at(-1)).toMatchObject({ pending: 10, lastRetryReason: 'status_503' });
    // The ten are isolated: a new sale is batched without them, and they are retried alone.
    const sale = order(11);
    await collection.insert(sale);
    await outbox.flush();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([sale.commandId]);
    expect(await status(sale)).toBe('applied');
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toHaveLength(1);
    expect(all.slice(0, 10)).toContain(ids(send.mock.calls.at(-1)![0])[0]);
  });

  it('an outage over a long queue: one probe per interval through all of it, no isolation, a stuck clock per order, then recovery', async () => {
    const inputs = Array.from({ length: 40 }, (_, i) => order(i));
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    const times: number[] = [];
    const firstFailure = new Map<string, number>();
    send.mockImplementation(async (batch) => {
      times.push(Date.now());
      for (const id of ids(batch)) if (!firstFailure.has(id)) firstFailure.set(id, Date.now());
      return fail;
    });
    // Flagged: exactly the orders whose first failure was STUCK_AFTER_MS ago or more, since the earliest.
    const check = () => {
      const due = [...firstFailure].filter(([, at]) => Date.now() - at >= STUCK_AFTER_MS);
      expect(new Set(states.at(-1)?.stuck?.commandIds ?? [])).toEqual(new Set(due.map(([id]) => id)));
      if (due.length) expect(states.at(-1)?.stuck?.since).toBe(Math.min(...due.map(([, at]) => at)));
      // Each order's own entry starts at its own first failure.
      expect(new Set(states.at(-1)?.stuck?.orders ?? [])).toEqual(new Set(due.map(([commandId, since]) => ({ commandId, since, reason: 'status_503' }))));
    };
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    while (states.at(-1)!.nextAttemptAt! <= epoch + 10 * 60_000) { await next(); check(); }
    // A sale rung up at +10 minutes triggers the walk's next probe at once: one request.
    await vi.advanceTimersByTimeAsync(epoch + 10 * 60_000 - Date.now());
    const added = order(600);
    await collection.insert(added);
    await vi.advanceTimersByTimeAsync(0);
    const insertCall = times.length - 1;
    expect(times[insertCall]).toBe(epoch + 10 * 60_000);
    let checked = false;
    while (send.mock.calls.length < ISOLATE_AFTER_ATTEMPTS + 42) {
      await next();
      check();
      if (!checked && Date.now() >= epoch + STUCK_AFTER_MS) {
        checked = true;
        expect(states.at(-1)?.stuck?.commandIds).toContain(inputs[0].commandId);
        expect(states.at(-1)?.stuck?.commandIds).not.toContain(added.commandId);
      }
    }
    expect(checked).toBe(true);
    // Five batches, a probe of each order in turn, then (none left: the store is down) batching again.
    const all = [...inputs, added].map((input) => input.commandId);
    expect(send.mock.calls.map(([batch]) => ids(batch)))
      .toEqual([...Array(ISOLATE_AFTER_ATTEMPTS).fill(all.slice(0, 10)), ...all.map((id) => [id]), all.slice(0, 10)]);
    // One request per backoff interval (1 s doubling, capped at 60 s), bar the one the sale triggered.
    const gaps = times.slice(1).map((time, i) => time - times[i]);
    const expected = gaps.map((_, i) => Math.min(1000 * 2 ** i, 60_000));
    expect(gaps[insertCall - 1]).toBeLessThan(60_000);
    expected[insertCall - 1] = gaps[insertCall - 1];
    expect(gaps).toEqual(expected);
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    for (let i = 0; i < 10 && states.at(-1)!.pending; i++) await next();
    expect(await collection.count({ selector: { syncStatus: 'applied' } }).exec()).toBe(41);
    expect(states.at(-1)).toMatchObject({ pending: 0, stuck: undefined, nextAttemptAt: undefined });
  });

  // Review Major 1: a slow final count (a SQLite worker round trip) lets the isolated order's timer fire mid-run.
  it.each([50, 1500])('a retry timer that fires while a run is finishing is not lost (final count %s ms)', async (countMs) => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(inputs[0]));
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 1; i++) await next();
    expect(await Promise.all(inputs.map(status))).toEqual(['pending', 'applied', 'applied']);
    const dueAt = states.at(-1)!.nextAttemptAt!;
    await vi.advanceTimersByTimeAsync(dueAt - Date.now() - 10);
    let slow = false;
    let armed = false;
    outbox.state$.subscribe((state) => { if (armed && state.nextAttemptAt !== undefined) slow = true; });
    armed = true;
    const count = collection.storageInstance.count.bind(collection.storageInstance);
    vi.spyOn(collection.storageInstance, 'count').mockImplementation(async (query) => {
      if (slow) { slow = false; await new Promise((resolve) => setTimeout(resolve, countMs)); }
      return count(query);
    });
    const sale = order(3);
    await collection.insert(sale);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await status(sale)).toBe('applied');
    const before = send.mock.calls.length;
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send.mock.calls.slice(before).filter(([batch]) => ids(batch)[0] === inputs[0].commandId).length).toBeGreaterThan(0);
  });

  // Review minor 4: offline time never counts toward the stuck flag.
  it('an isolated order offline for most of the 15 minutes is not flagged', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(inputs[0]));
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 1; i++) await next();
    expect(await Promise.all(inputs.map(status))).toEqual(['pending', 'applied', 'applied']);
    send.mockResolvedValue({ kind: 'retry', reason: 'network' });
    await collection.insert(order(3));
    await vi.advanceTimersByTimeAsync(0);
    while (Date.now() < epoch + STUCK_AFTER_MS + 60_000) await next();
    expect(send.mock.calls.filter(([batch]) => ids(batch)[0] === inputs[0].commandId).length).toBeGreaterThan(ISOLATE_AFTER_ATTEMPTS + 1);
    expect(states.some((state) => state.stuck)).toBe(false);
  });

  it('a sale rung up during a walk triggers its next probe, one request', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, next } = timed();
    send.mockResolvedValue(fail);
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS; i++) await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([inputs[0].commandId]);
    const before = send.mock.calls.length;
    await collection.insert(order(3));
    await vi.advanceTimersByTimeAsync(0);
    expect(send.mock.calls.slice(before).map(([batch]) => ids(batch))).toEqual([[inputs[1].commandId]]);
  });

  // Review minor 3.
  it('after a probe proves the store up, a 429 with Retry-After still spaces every request', async () => {
    const inputs = Array.from({ length: 6 }, (_, i) => order(i));
    await collection.bulkInsert(inputs);
    const { outbox, send, next } = timed();
    const log: { at: number; reason?: string }[] = [];
    send.mockImplementation(async (batch) => {
      const call = log.length + 1;
      const outcome: TransportOutcome = call <= ISOLATE_AFTER_ATTEMPTS ? fail : call === ISOLATE_AFTER_ATTEMPTS + 1
        ? { kind: 'results', results: applied(batch) } : { kind: 'retry', reason: 'status_429', retryAfterMs: 30_000 };
      log.push({ at: Date.now(), reason: outcome.kind === 'retry' ? outcome.reason : undefined });
      return outcome;
    });
    await outbox.flush();
    for (let i = 0; i < 2 * ISOLATE_AFTER_ATTEMPTS + 2; i++) await next();
    expect(log.filter((entry) => entry.reason === 'status_429').length).toBeGreaterThan(ISOLATE_AFTER_ATTEMPTS);
    for (let i = 1; i < log.length; i++) {
      if (log[i - 1].reason === 'status_429') expect(log[i].at - log[i - 1].at).toBeGreaterThanOrEqual(30_000);
    }
  });

  it('a 429 with Retry-After on an isolated retry ends the run, even after the store took something in it', async () => {
    const inputs = [order(0), order(1), order(2), order(3)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(failing(inputs[0], inputs[1], inputs[2]));
    await outbox.flush();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 3; i++) await next();
    expect(await Promise.all(inputs.map(status))).toEqual(['pending', 'pending', 'pending', 'applied']);
    // At once due: the first applies, the second answers 429 with Retry-After 30 s, the third fails.
    const times: number[] = [];
    let limited = false;
    send.mockImplementation(async (batch) => {
      times.push(Date.now());
      if (batch[0].id === inputs[0].commandId) return { kind: 'results', results: applied(batch) };
      if (batch[0].id === inputs[1].commandId && !limited) { limited = true; return { kind: 'retry', reason: 'status_429', retryAfterMs: 30_000 }; }
      return fail;
    });
    await next();
    expect(send.mock.calls.slice(-2).map(([batch]) => ids(batch))).toEqual([[inputs[0].commandId], [inputs[1].commandId]]);
    expect(states.at(-1)).toMatchObject({ lastRetryReason: 'status_429', nextAttemptAt: Date.now() + 30_000 });
    await next();
    expect(times).toHaveLength(3);
    expect(times[2] - times[1]).toBe(30_000);
  });

  // Five failures of the first batch start a walk, whose first probe is due one interval later.
  async function walking() {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const harness = timed();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS; i++) harness.send.mockResolvedValueOnce(fail);
    await harness.outbox.flush();
    for (let i = 1; i < ISOLATE_AFTER_ATTEMPTS; i++) await harness.next();
    expect(harness.send).toHaveBeenCalledTimes(ISOLATE_AFTER_ATTEMPTS);
    const tail = (n: number) => harness.send.mock.calls.slice(-n).map(([batch]) => ids(batch));
    const probeThenRest = [[inputs[0].commandId], [inputs[1].commandId, inputs[2].commandId]];
    const allApplied = async () => expect(await Promise.all(inputs.map(status))).toEqual(['applied', 'applied', 'applied']);
    return { ...harness, inputs, tail, probeThenRest, allApplied };
  }

  it('a 401 during a walk resends the same probe, and nothing is lost', async () => {
    const { send, next, tail, probeThenRest, allApplied } = await walking();
    send.mockResolvedValueOnce({ kind: 'unauthorized' });
    await next();
    await next();
    expect(tail(3)).toEqual([probeThenRest[0], ...probeThenRest]);
    await allApplied();
  });

  it('a refusal during a walk pauses it until flush, then the same probe goes, and nothing is lost', async () => {
    const { outbox, send, states, next, tail, probeThenRest, allApplied } = await walking();
    send.mockResolvedValueOnce({ kind: 'refused', status: 422, reason: 'bad' });
    await next();
    expect(states.at(-1)).toMatchObject({ refused: { status: 422, reason: 'bad' }, nextAttemptAt: undefined });
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(ISOLATE_AFTER_ATTEMPTS + 1);
    await outbox.flush();
    expect(tail(3)).toEqual([probeThenRest[0], ...probeThenRest]);
    await allApplied();
  });

  it('a requeue during a walk sends the next probe, and the requeued order is sent under its new commandId', async () => {
    const rejected: PosOrder = { ...order(9), syncStatus: 'rejected', error: { code: 'unknown_variant', message: 'gone' } };
    await collection.insert(rejected);
    const { outbox, tail, inputs, allApplied } = await walking();
    expect(await outbox.requeue()).toBe(1);
    await vi.advanceTimersByTimeAsync(0);
    const requeued = (await collection.findOne(rejected.id).exec())!.toJSON();
    expect(requeued).toMatchObject({ syncStatus: 'applied' });
    expect(requeued.commandId).not.toBe(rejected.commandId);
    expect(tail(2)).toEqual([[inputs[0].commandId], [inputs[1].commandId, inputs[2].commandId, requeued.commandId]]);
    await allApplied();
  });

  it('stop() during a walk sends nothing more; start() goes on with the probe, and nothing is lost', async () => {
    const { outbox, send, tail, probeThenRest, allApplied } = await walking();
    outbox.stop();
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(send).toHaveBeenCalledTimes(ISOLATE_AFTER_ATTEMPTS);
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    expect(tail(2)).toEqual(probeThenRest);
    await allApplied();
  });

  it('an isolated order the store answers unsupported_version is downgraded and resent, not lost', async () => {
    const [a, b] = [v3Order(0), v3Order(1)];
    await collection.bulkInsert([a, b]);
    const { outbox, send, next } = timed({ getMaxOrderCreateVersion: () => 3 });
    send.mockImplementation(failing(a));
    await outbox.flush();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 1; i++) await next();
    expect([await status(a), await status(b)]).toEqual(['pending', 'applied']);
    send.mockImplementation(async (batch) => (batch[0].version > 2
      ? { kind: 'results', results: [unsupported(a, 2)] } : { kind: 'results', results: applied(batch) }));
    await next();
    await next();
    expect(send.mock.calls.slice(-2).map(([batch]) => batch.map((command) => [command.id, command.version])))
      .toEqual([[[a.commandId, 3]], [[a.commandId, 2]]]);
    expect((await collection.findOne(a.id).exec())!.toJSON()).toMatchObject({ syncStatus: 'applied', sentVersion: 2, downgradedFrom: 3 });
  });

  // inputs[0] is an order the store always 503s: drive until it is isolated and inputs 1 and 2 are applied.
  async function isolatedHead(overrides: Partial<OrderOutboxOptions> = {}) {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const harness = timed(overrides);
    harness.send.mockImplementation(failing(inputs[0]));
    harness.outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 1; i++) await harness.next();
    expect(await Promise.all(inputs.map(status))).toEqual(['pending', 'applied', 'applied']);
    return { ...harness, bad: inputs[0] };
  }
  const sentWith = (send: ReturnType<typeof setup>['send'], input: PosOrder) =>
    send.mock.calls.filter(([batch]) => ids(batch).includes(input.commandId)).length;

  // Round-3 review blocker: the isolated order went first on every timer run, failed, and ended the run.
  it('STRANDED: a sale rung up while the isolated order is in flight is sent within two intervals, and the order keeps retrying', async () => {
    const { send, next, bad } = await isolatedHead();
    const sale = order(3);
    let armed = true;
    send.mockImplementation(async (batch) => {
      if (armed && ids(batch).join() === bad.commandId) { armed = false; await collection.insert(sale); }
      return failing(bad)(batch);
    });
    await next();
    expect(armed).toBe(false);
    for (let i = 0; i < 2 && await status(sale) !== 'applied'; i++) await next();
    expect(await status(sale)).toBe('applied');
    expect(sentWith(send, sale)).toBe(1);
    const before = sentWith(send, bad);
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    expect(sentWith(send, bad)).toBeGreaterThan(before);
    expect(await status(bad)).toBe('pending');
  });

  it('STRANDED-BLIP: a sale whose first send is offline, while an order is isolated, is sent again within two intervals', async () => {
    const { send, next, bad } = await isolatedHead();
    const sale = order(3);
    let blip = true;
    send.mockImplementation(async (batch) => {
      if (blip && ids(batch).includes(sale.commandId)) { blip = false; return { kind: 'retry', reason: 'network' }; }
      return failing(bad)(batch);
    });
    await collection.insert(sale);
    await vi.advanceTimersByTimeAsync(0);
    expect(blip).toBe(false);
    for (let i = 0; i < 2 && await status(sale) !== 'applied'; i++) await next();
    expect(await status(sale)).toBe('applied');
    expect(sentWith(send, sale)).toBe(2);
  });

  it('with an isolated order due and a failing batch, timer runs alternate between them, one request per interval', async () => {
    const { send, next, bad } = await isolatedHead();
    const labels: string[] = [];
    send.mockImplementation(async (batch) => { labels.push(ids(batch).join() === bad.commandId ? 'isolated' : 'batch'); return fail; });
    await collection.insert(order(3));
    await vi.advanceTimersByTimeAsync(0);
    expect(labels).toEqual(['batch']);
    for (let i = 0; i < 3 * ISOLATE_AFTER_ATTEMPTS; i++) {
      const calls = send.mock.calls.length;
      await next();
      expect(send.mock.calls.length).toBe(calls + 1);
    }
    expect(labels).toEqual(labels.map((_, i) => (i % 2 ? 'isolated' : 'batch')));
  });

  it('an outage with isolated orders: still one request per backoff interval', async () => {
    const bad = [order(0), order(1), order(2)];
    const good = order(3);
    await collection.bulkInsert([...bad, good]);
    const { outbox, send, next } = timed();
    send.mockImplementation(failing(...bad));
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 30 && await status(good) !== 'applied'; i++) await next();
    expect(await Promise.all([...bad, good].map(status))).toEqual(['pending', 'pending', 'pending', 'applied']);
    // The store goes down; three more sales are rung up.
    const times: number[] = [];
    send.mockImplementation(async () => { times.push(Date.now()); return fail; });
    await collection.bulkInsert([order(4), order(5), order(6)]);
    await vi.advanceTimersByTimeAsync(0);
    expect(times).toHaveLength(1);
    const start = Date.now();
    while (Date.now() < start + 30 * 60_000) {
      const calls = send.mock.calls.length;
      await next();
      expect(send.mock.calls.length).toBe(calls + 1);
    }
    // Each gap is at least the outbox's backoff (1 s doubling, capped at 60 s).
    const gaps = times.slice(1).map((time, i) => time - times[i]);
    gaps.forEach((gap, i) => expect(gap).toBeGreaterThanOrEqual(Math.min(1000 * 2 ** i, 60_000)));
  });

  // Round-3 review: the oldest due isolated order went every time, and its own backoff kept it due.
  it('isolated orders take turns: one that keeps failing does not starve the others on a quiet till', async () => {
    const bad = [order(0), order(1), order(2)];
    const good = order(3);
    await collection.bulkInsert([...bad, good]);
    const { outbox, send, next } = timed();
    send.mockImplementation(failing(...bad));
    outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 30 && await status(good) !== 'applied'; i++) await next();
    expect(await Promise.all([...bad, good].map(status))).toEqual(['pending', 'pending', 'pending', 'applied']);
    send.mockImplementation(failing(bad[0]));
    for (let i = 0; i < 3 && await status(bad[2]) !== 'applied'; i++) await next();
    expect(await Promise.all(bad.map(status))).toEqual(['pending', 'applied', 'applied']);
  });

  it('a paused stuck clock: 503s between offline spells flag the order once its answered time reaches STUCK_AFTER_MS', async () => {
    const lone = order(0);
    await collection.insert(lone);
    const { outbox, send, states, next } = timed();
    // Offline for one minute in every five; the store answers 503 otherwise.
    let answered = 0;
    let running: number | undefined; // the last answered failure, while the clock runs
    let pausedAt: number | undefined;
    send.mockImplementation(async () => {
      const at = Date.now();
      if (running !== undefined) answered += at - running;
      const offline = Math.floor((at - epoch) / 60_000) % 5 === 4;
      running = offline ? undefined : at;
      if (offline) pausedAt ??= at; else pausedAt = undefined;
      return offline ? { kind: 'retry', reason: 'network' } : fail;
    });
    await outbox.flush();
    let unflaggedAfterWallClock = false;
    while (Date.now() < epoch + 20 * 60_000) {
      await next();
      const since = (running ?? pausedAt!) - answered;
      expect(states.at(-1)?.stuck).toEqual(answered >= STUCK_AFTER_MS ? stuckOf([lone.commandId], since) : undefined);
      if (Date.now() >= epoch + STUCK_AFTER_MS && !states.at(-1)?.stuck) unflaggedAfterWallClock = true;
    }
    expect(unflaggedAfterWallClock).toBe(true);
    expect(states.at(-1)?.stuck?.commandIds).toEqual([lone.commandId]);
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await next();
    expect(states.at(-1)).toMatchObject({ pending: 0, stuck: undefined });
  });

  it('twenty minutes offline never flag an order; the clock goes on from its answered time when the store answers again', async () => {
    const lone = order(0);
    await collection.insert(lone);
    const { outbox, send, states, next } = timed();
    send.mockResolvedValue(fail);
    await outbox.flush();
    while (Date.now() < epoch + 10 * 60_000) await next();
    send.mockResolvedValue({ kind: 'retry', reason: 'network' });
    await next();
    const pausedAt = Date.now();
    while (Date.now() < pausedAt + 20 * 60_000) {
      await next();
      expect(states.at(-1)?.stuck).toBeUndefined();
    }
    send.mockResolvedValue(fail);
    await next();
    const since = epoch + Date.now() - pausedAt;
    while (states.at(-1)!.nextAttemptAt! < since + STUCK_AFTER_MS) {
      await next();
      expect(states.at(-1)?.stuck).toBeUndefined();
    }
    await next();
    expect(states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], since));
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await next();
    expect(states.at(-1)).toMatchObject({ pending: 0, stuck: undefined });
  });

  const timeout = { kind: 'retry', reason: 'timeout' } as const;
  const offline = { kind: 'retry', reason: 'network' } as const;

  it('isolates an order the store hangs on every time (timeout) like one it always 503s', async () => {
    const inputs = [order(0), order(1), order(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states, next } = timed();
    send.mockImplementation(async (batch) => ids(batch).includes(inputs[1].commandId) ? timeout : { kind: 'results', results: applied(batch) });
    await outbox.flush();
    for (let i = 0; i < 2 * ISOLATE_AFTER_ATTEMPTS + 1; i++) await next();
    const all = inputs.map((input) => input.commandId);
    expect(send.mock.calls.map(([batch]) => ids(batch))).toEqual([...Array(ISOLATE_AFTER_ATTEMPTS).fill(all), [all[0]],
      ...Array(ISOLATE_AFTER_ATTEMPTS).fill([all[1], all[2]]), [all[1]], [all[2]]]);
    expect(await Promise.all(inputs.map(status))).toEqual(['applied', 'pending', 'applied']);
    expect(states.at(-1)).toMatchObject({ pending: 1, lastRetryReason: 'timeout' });
    await next();
    expect(ids(send.mock.calls.at(-1)![0])).toEqual([all[1]]);
  });

  // Isolates `k` orders the store always 503s (a later one applies), leaving the outbox started.
  async function isolateMany(k: number) {
    const bad = Array.from({ length: k }, (_, i) => order(i));
    const good = order(k);
    await collection.bulkInsert([...bad, good]);
    const harness = timed();
    harness.send.mockImplementation(failing(...bad));
    harness.outbox.start();
    await vi.advanceTimersByTimeAsync(0);
    for (let i = 0; i < 60 && await status(good) !== 'applied'; i++) await harness.next();
    expect(await Promise.all([...bad, good].map(status))).toEqual([...bad.map(() => 'pending'), 'applied']);
    return { ...harness, bad };
  }
  // Drives the outbox until `input` is flagged, for at most six hours, and returns when.
  async function flaggedAt(input: PosOrder, states: OutboxState[], next: () => Promise<unknown>) {
    const start = Date.now();
    while (!states.at(-1)?.stuck?.commandIds.includes(input.commandId) && Date.now() < start + 6 * 60 * 60_000) await next();
    return Date.now();
  }

  // Round-4 review: batch sends that timed out (then `network`) paused the isolated orders' clocks, so the more
  // orders were isolated, the later the first one was flagged.
  it.each([1, 3, 5])('PAUSE MAGNIFIED: %s isolated orders answered 503 while every batch send times out: the first is flagged at STUCK_AFTER_MS', async (k) => {
    const { send, states, next, bad } = await isolateMany(k);
    send.mockImplementation(async (batch) => (batch.length === 1 && bad.some((input) => input.commandId === batch[0].id) ? fail : timeout));
    await collection.insert(order(100));
    await vi.advanceTimersByTimeAsync(0);
    const at = await flaggedAt(bad[0], states, next);
    expect(at - epoch).toBeGreaterThanOrEqual(STUCK_AFTER_MS);
    expect(at - epoch).toBeLessThanOrEqual(STUCK_AFTER_MS + 60_000);
    expect(states.at(-1)?.stuck?.orders).toContainEqual({ commandId: bad[0].commandId, since: epoch, reason: 'status_503' });
  });

  it('batch sends time out while an isolated order gets 503s: turns alternate, and it is flagged at STUCK_AFTER_MS, not about twice that', async () => {
    const { send, states, next, bad } = await isolatedHead();
    const labels: string[] = [];
    send.mockImplementation(async (batch) => {
      const alone = ids(batch).join() === bad.commandId;
      labels.push(alone ? 'isolated' : 'batch');
      return alone ? fail : timeout;
    });
    await collection.insert(order(3));
    await vi.advanceTimersByTimeAsync(0);
    const at = await flaggedAt(bad, states, next);
    expect(labels.length).toBeGreaterThan(10);
    expect(labels).toEqual(labels.map((_, i) => (i % 2 ? 'isolated' : 'batch')));
    expect(at - epoch).toBeGreaterThanOrEqual(STUCK_AFTER_MS);
    expect(at - epoch).toBeLessThanOrEqual(STUCK_AFTER_MS + 60_000);
    expect(states.at(-1)?.stuck?.orders).toContainEqual({ commandId: bad.commandId, since: epoch, reason: 'status_503' });
  });

  it.each<[string, TransportOutcome]>([['status_503', fail], ['status_409', { kind: 'retry', reason: 'status_409' }],
    ['bad_body', { kind: 'retry', reason: 'bad_body' }], ['timeout', timeout], ['no_progress', { kind: 'results', results: [] }]])(
    'an offline spell between answered failures pauses the clock, and the next answer (%s) resumes it', async (reason, answer) => {
      const lone = order(0);
      await collection.insert(lone);
      const { outbox, send, states, next } = timed({ stuckAfterMs: 1 });
      send.mockResolvedValue(fail);
      await outbox.flush();
      await next();
      send.mockResolvedValue(offline);
      await next();
      const pausedAt = Date.now();
      for (let i = 0; i < 3; i++) {
        await next();
        expect(states.at(-1)).toMatchObject({ stuck: stuckOf([lone.commandId], epoch), lastRetryReason: 'network' });
      }
      send.mockResolvedValue(answer);
      await next();
      expect(Date.now()).toBeGreaterThan(pausedAt);
      expect(states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], epoch + Date.now() - pausedAt, reason));
    });

  it('an answered success of another order resumes a paused clock', async () => {
    const { outbox, send, states, next, bad } = await isolatedHead({ stuckAfterMs: 1 });
    let pausedAt: number | undefined;
    send.mockImplementation(async (batch) => {
      if (ids(batch).join() !== bad.commandId) return { kind: 'results', results: applied(batch) };
      pausedAt ??= Date.now();
      return offline;
    });
    for (let i = 0; i < 3; i++) await next();
    expect(states.at(-1)?.stuck).toEqual(stuckOf([bad.commandId], epoch));
    const sale = order(3);
    await collection.insert(sale);
    await outbox.flush();
    expect(await status(sale)).toBe('applied');
    expect(Date.now()).toBeGreaterThan(pausedAt!);
    expect(states.at(-1)?.stuck).toEqual(stuckOf([bad.commandId], epoch + Date.now() - pausedAt!));
  });

  it.each<[string, TransportOutcome, (state: OutboxState) => void]>([
    ['a 401', { kind: 'unauthorized' }, (state) => expect(state.lastRetryReason).toBe('unauthorized')],
    ['a refusal', { kind: 'refused', status: 400, reason: 'bad' }, (state) => expect(state.refused).toEqual({ status: 400, reason: 'bad' })],
  ])('an answered %s for another order resumes a paused clock, like a success', async (_, answer, assertAnswer) => {
      const { outbox, send, states, next, bad } = await isolatedHead({ stuckAfterMs: 1 });
      let pausedAt: number | undefined;
      send.mockImplementation(async (batch) => {
        if (ids(batch).join() !== bad.commandId) return answer;
        pausedAt ??= Date.now();
        return offline;
      });
      for (let i = 0; i < 3; i++) await next();
      expect(states.at(-1)?.stuck).toEqual(stuckOf([bad.commandId], epoch));
      await collection.insert(order(3));
      await outbox.flush();
      expect(Date.now()).toBeGreaterThan(pausedAt!);
      expect(states.at(-1)?.stuck).toEqual(stuckOf([bad.commandId], epoch + Date.now() - pausedAt!));
      // Proves the clock moved on that answer, not on a network retry.
      assertAnswer(states.at(-1)!);
    });

  it('a device clock set back during a pause leaves the answered time unchanged: flagged at STUCK_AFTER_MS of it, no earlier or later', async () => {
    const lone = order(0);
    await collection.insert(lone);
    const { outbox, send, states, next } = timed();
    send.mockResolvedValue(fail);
    await outbox.flush();
    while (Date.now() < epoch + 10 * 60_000) await next();
    send.mockResolvedValue(offline);
    await next();
    const pausedAt = Date.now();
    await next();
    vi.setSystemTime(pausedAt - 60 * 60_000);
    send.mockResolvedValue(fail);
    await outbox.flush();
    // The answered time before the pause (pausedAt - epoch) carries over: the clock reads as if it had started here.
    const since = epoch + Date.now() - pausedAt;
    expect(since).toBeLessThan(epoch - 40 * 60_000);
    while (Date.now() < since + STUCK_AFTER_MS) {
      expect(states.at(-1)?.stuck).toBeUndefined();
      await next();
    }
    // Flagged at the first run once 15 minutes are answered, with the same `since`.
    expect(Date.now() - (since + STUCK_AFTER_MS)).toBeLessThanOrEqual(60_000);
    expect(states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], since));
  });

  describe('serverFailures across a restart', () => {
    const stored = async (input: PosOrder) => (await collection.findOne(input.id).exec())!.toJSON(true);
    const nextOf = (states: OutboxState[]) => vi.advanceTimersByTimeAsync(states.at(-1)!.nextAttemptAt! - Date.now());

    it('an isolated order survives a restart: the new outbox batches without it, then sends it alone; progress clears the field', async () => {
      const { outbox, bad } = await isolatedHead();
      expect((await stored(bad)).serverFailures).toEqual({ since: epoch, reason: 'status_503', isolated: true });
      outbox.stop();
      const later = [order(3), order(4)];
      await collection.bulkInsert(later);
      const restarted = setup();
      restarted.send.mockImplementation(failing(bad));
      restarted.outbox.start();
      await vi.advanceTimersByTimeAsync(0);
      // No five failures behind it: the first send leaves it out, and it goes alone after.
      expect(restarted.send.mock.calls.map(([batch]) => ids(batch))).toEqual([later.map((input) => input.commandId), [bad.commandId]]);
      expect(await Promise.all([...later, bad].map(status))).toEqual(['applied', 'applied', 'pending']);
      const writes: PosOrder[] = [];
      collection.$.subscribe((event) => { if (event.documentId === bad.id) writes.push(event.documentData); });
      restarted.send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
      await nextOf(restarted.states);
      expect(await status(bad)).toBe('applied');
      expect((await stored(bad)).serverFailures).toBeUndefined();
      // Removed in the write that marks it applied.
      expect(writes.map((data) => [data.syncStatus, data.serverFailures])).toEqual([['applied', undefined]]);
    });

    it('a stuck clock survives a restart with the same since', async () => {
      const lone = order(0);
      await collection.insert(lone);
      const { outbox, send, states, next } = timed({ stuckAfterMs: 60_000 });
      send.mockImplementation(failing(lone));
      await outbox.flush();
      while (!states.at(-1)?.stuck) await next();
      expect(states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], epoch));
      outbox.stop();
      // Offline after the restart: the restored clock is paused, and still flagged.
      const restoredAt = Date.now();
      const restarted = setup({ stuckAfterMs: 60_000 });
      restarted.send.mockResolvedValue(offline);
      await restarted.outbox.flush();
      expect(restarted.states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], epoch));
      restarted.send.mockResolvedValue(fail);
      await nextOf(restarted.states);
      // The next answer resumes it, leaving out the pause since the restart.
      expect(Date.now()).toBeGreaterThan(restoredAt);
      expect(restarted.states.at(-1)?.stuck).toEqual(stuckOf([lone.commandId], epoch + Date.now() - restoredAt));
    });

    it('requeue() clears it', async () => {
      const rejected: PosOrder = { ...order(0), syncStatus: 'rejected', error: { code: 'unknown_variant', message: 'gone' },
        serverFailures: { since: epoch, reason: 'status_503', isolated: true } };
      await collection.insert(rejected);
      const { outbox, send } = timed();
      send.mockResolvedValue(offline);
      expect(await outbox.requeue()).toBe(1);
      await vi.advanceTimersByTimeAsync(0);
      expect(send).toHaveBeenCalledTimes(1);
      expect(await stored(rejected)).toMatchObject({ syncStatus: 'pending' });
      expect((await stored(rejected)).serverFailures).toBeUndefined();
    });

    it('a retry with nothing new does no write, and the payload bytes are the same with the field stored', async () => {
      const lone = order(0);
      await collection.insert(lone);
      const { outbox, send, next } = timed();
      send.mockResolvedValue(fail);
      await outbox.flush();
      const first = await stored(lone);
      expect(first.serverFailures).toEqual({ since: epoch, reason: 'status_503', isolated: false });
      await next();
      await next();
      expect(send).toHaveBeenCalledTimes(3);
      expect((await stored(lone))._rev).toBe(first._rev);
      // The first send had no serverFailures stored, the later ones had.
      const [without, withField] = send.mock.calls.map(([batch]) => batch[0]);
      expect(commandFingerprint(withField)).toBe(commandFingerprint(without));
    });

    it("the outbox's own serverFailures write is not a new sale: a refusal that resumes a paused clock sends once", async () => {
      const lone = order(0);
      await collection.insert(lone);
      const { outbox, send, next } = timed();
      send.mockResolvedValueOnce(fail).mockResolvedValueOnce(offline).mockResolvedValue({ kind: 'refused', status: 400, reason: 'bad' });
      outbox.start();
      await vi.advanceTimersByTimeAsync(0);
      await next();
      const { since } = (await stored(lone)).serverFailures!;
      await next();
      // The refusal resumed the clock, so `since` moved on and was written; that write sends nothing more.
      expect((await stored(lone)).serverFailures!.since).toBeGreaterThan(since);
      await vi.advanceTimersByTimeAsync(10 * 60_000);
      expect(send).toHaveBeenCalledTimes(3);
    });
  });
});
