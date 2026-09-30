// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { AnyCommandEnvelope, CommandError, CommandResult, OrderCreateEnvelope, RegisterCommandEnvelope } from '@tallyui/core';
import { posOrderCollection, uuidv7, type PosOrder } from '../pos-order';
import { registerCommandCollection, registerCommandsLogger, type RegisterCommand } from '../register/register-commands';
import { readFresh } from '../rxdb';
import { createBackendNotFound } from './backend-not-found';
import { createOrderOutbox, ISOLATE_AFTER_ATTEMPTS, STUCK_AFTER_MS } from './order-outbox';
import { createRegisterOutbox, type RegisterOutbox, type RegisterOutboxOptions } from './register-outbox';
import type { CommandTransport, OutboxState, TransportOutcome } from './types';

let db: RxDatabase<{ register_commands: RxCollection<RegisterCommand>; pos_orders: RxCollection<PosOrder> }>;
let collection: RxCollection<RegisterCommand>;
let outboxes: RegisterOutbox[];
const epoch = Date.parse('2026-09-28T12:00:00.000Z');
const error = { code: 'unsupported_version', message: 'Unsupported register version', data: { register: 1 } };
function command(seq: number, registerId = 'a', patch: Partial<RegisterCommand> = {}): RegisterCommand {
  return { key: `session.open:${registerId}-${String(seq).padStart(3, '0')}`, registerId, seq, commandId: uuidv7(),
    type: 'register.session.open', version: 1, payload: { sessionId: `${registerId}-${seq}`, registerId, countedFloatMinor: 0 },
    createdAt: new Date(epoch - seq * 1000).toISOString(), updatedAt: new Date(epoch).toISOString(),
    syncStatus: 'pending', ...patch };
}
const applied = (batch: RegisterCommandEnvelope[]): CommandResult[] => batch.map(({ id }) => ({ id, status: 'applied' }));
function setup(overrides: Partial<RegisterOutboxOptions> = {}) {
  const send = vi.fn<CommandTransport<RegisterCommandEnvelope>['send']>()
    .mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
  const outbox = createRegisterOutbox({ collection, transport: { send }, deviceId: 'device-1', random: () => 0.5, ...overrides });
  outboxes.push(outbox);
  const states: OutboxState[] = [];
  outbox.state$.subscribe((state) => states.push(state));
  return { outbox, send, states };
}
const stored = async (key: string) => (await readFresh(collection, { selector: { key } }))[0];
beforeEach(async () => {
  outboxes = [];
  db = await createRxDatabase({ name: `registeroutbox${uuidv7().replaceAll('-', '')}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  ({ register_commands: collection } = await db.addCollections({ register_commands: registerCommandCollection(), pos_orders: posOrderCollection() }));
});
afterEach(async () => {
  outboxes.forEach((outbox) => outbox.stop());
  vi.useRealTimers();
  vi.restoreAllMocks();
  await db.remove();
});

describe('register outbox', () => {
  it('accepts a transport for AnyCommandEnvelope without a cast', () => {
    const transport: CommandTransport<AnyCommandEnvelope> = { send: async () => ({ kind: 'results', results: [] }) };
    const option: RegisterOutboxOptions['transport'] = transport;
    expect(option).toBe(transport);
  });

  it("sends each register's commands in ledger order, in batches of at most 10", async () => {
    const inputs = Array.from({ length: 23 }, (_, i) => command(i * 2 + 1));
    await collection.bulkInsert([...inputs].reverse());
    const { outbox, send, states } = setup({ batchSize: 50 });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual([10, 10, 3]);
    expect(send.mock.calls.flatMap(([batch]) => batch.map(({ id }) => id))).toEqual(inputs.map(({ commandId }) => commandId));
    expect((await readFresh(collection, { selector: {} })).every((doc) => doc.syncStatus === 'applied')).toBe(true);
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false });
  });

  it.each([0, NaN, Infinity])('batchSize 0, NaN or Infinity still sends at most 10 per batch (%s)', async (batchSize) => {
    await collection.bulkInsert(Array.from({ length: 23 }, (_, i) => command(i + 1)));
    const { outbox, send } = setup({ batchSize });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.length)).toEqual(batchSize === 0 ? Array(23).fill(1) : [10, 10, 3]);
  });

  it('a command requeued while onResult runs keeps its new id and gets no stale result', async () => {
    const input = command(1);
    const row = await collection.insert(input);
    const commandId = uuidv7();
    const { outbox, send } = setup({ now: () => epoch + 1000, onResult: async () => {
      await row.incrementalPatch({ commandId, syncStatus: 'pending' });
      outbox.stop();
    } });
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: input.commandId, status: 'applied', register: {
      counters: { lastClosureNumber: 1, perpetualSalesTotalMinor: 100, perpetualRefundsTotalMinor: 0 },
    } }] });
    await outbox.flush();
    expect(await stored(input.key)).toStrictEqual({ ...input, commandId });
  });

  it('onResult receives a plain command without RxDB metadata', async () => {
    const input = command(1, 'a', { error, result: { counters: {
      lastClosureNumber: 1, perpetualSalesTotalMinor: 100, perpetualRefundsTotalMinor: 0,
    } } });
    await collection.insert(input);
    let received: RegisterCommand | undefined;
    const { outbox } = setup({ onResult: (doc) => {
      received = structuredClone(doc);
      doc.payload.sessionId = 'callback-mutation';
    } });
    await outbox.flush();
    expect(received).toStrictEqual(input);
    expect((await stored(input.key)).payload).toStrictEqual({ sessionId: 'a-1', registerId: 'a', countedFloatMinor: 0 });
  });

  it('a rejection with extra error fields stores only code, message and data', async () => {
    const input = command(1);
    await collection.insert(input);
    const serverError = { ...error, extra: 'not in the ledger schema' };
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: input.commandId, status: 'rejected', error: serverError }] });
    await outbox.flush();
    expect((await stored(input.key)).syncStatus).toBe('rejected');
    expect((await stored(input.key)).error).toStrictEqual(error);
  });

  it('onResult sees a duplicate carrying an error as rejected, without figures', async () => {
    const input = command(1);
    await collection.insert(input);
    const serverError: CommandError & Record<string, unknown> = { ...error, extra: 'not in the ledger schema' };
    const onResult = vi.fn();
    const { outbox, send } = setup({ onResult });
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: input.commandId, status: 'duplicate',
      error: serverError, register: { counters: {
        lastClosureNumber: 1, perpetualSalesTotalMinor: 100, perpetualRefundsTotalMinor: 0,
      } } }] });
    await outbox.flush();
    expect(onResult).toHaveBeenCalledExactlyOnceWith(input, { id: input.commandId, status: 'rejected', error });
    expect(await stored(input.key)).toStrictEqual({ ...input, syncStatus: 'rejected', error, updatedAt: expect.any(String) });
  });

  it('a duplicate with an error is treated as rejected and stops the register', async () => {
    const inputs = [command(1), command(2), command(1, 'b')];
    await collection.bulkInsert(inputs);
    const { outbox, send } = setup({ batchSize: 1, now: () => epoch + 1000 });
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: inputs[0].commandId, status: 'duplicate', error }] });
    await outbox.flush();
    await outbox.flush();
    expect(await stored(inputs[0].key)).toStrictEqual({ ...inputs[0], syncStatus: 'rejected', error,
      updatedAt: new Date(epoch + 1000).toISOString() });
    expect(await stored(inputs[1].key)).toStrictEqual(inputs[1]);
    expect(send.mock.calls.flatMap(([batch]) => batch.map(({ id }) => id))).toEqual([inputs[0].commandId, inputs[2].commandId]);
  });

  it('orders equal seqs by key', async () => {
    const inputs = [command(1, 'a', { key: 'session.open:b' }), command(1, 'a', { key: 'session.open:a' })];
    await collection.bulkInsert(inputs);
    const { outbox, send } = setup();
    await outbox.flush();
    expect(send.mock.calls[0][0].map(({ id }) => id)).toEqual([inputs[1].commandId, inputs[0].commandId]);
  });

  it('sends registers in ascending order without parallel sends', async () => {
    const inputs = [command(1, 'z'), command(1, 'a'), command(1, 'm')];
    await collection.bulkInsert(inputs);
    const { outbox, send } = setup();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    send.mockImplementationOnce(async (batch) => { await gate; return { kind: 'results', results: applied(batch) }; });
    const run = outbox.flush();
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    expect(outbox.flush()).toBe(run);
    expect(send.mock.calls[0][0][0].id).toBe(inputs[1].commandId);
    release();
    await run;
    expect(send.mock.calls.map(([batch]) => batch.map(({ id }) => id))).toEqual([
      [inputs[1].commandId], [inputs[2].commandId], [inputs[0].commandId],
    ]);
  });

  it('sends the stored bytes on every attempt', async () => {
    const input = command(1, 'a', { version: 7, payload: { sessionId: 'stored', nested: { amount: 500, reason: 'unchanged' } } });
    await collection.insert(input);
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' });
    await outbox.flush();
    await outbox.flush();
    const stable = { id: input.commandId, type: input.type, version: input.version, payload: input.payload,
      createdAt: input.createdAt, deviceId: 'device-1' };
    expect(send.mock.calls.map(([batch]) => batch)).toStrictEqual([
      [{ ...stable, attempt: 1 }], [{ ...stable, attempt: 2 }],
    ]);
    expect(await stored(input.key)).toMatchObject({ ...input, syncStatus: 'applied', updatedAt: expect.any(String) });
  });

  it('stops a register at its first rejected command, and later commands wait', async () => {
    const inputs = [command(1), command(2), command(3), command(1, 'b')];
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup({ batchSize: 1 });
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: inputs[0].commandId, status: 'rejected', error }] });
    await outbox.flush();
    await outbox.flush();
    expect(send.mock.calls.flatMap(([batch]) => batch.map(({ id }) => id))).toEqual([inputs[0].commandId, inputs[3].commandId]);
    expect(await stored(inputs[0].key)).toMatchObject({ syncStatus: 'rejected', error });
    for (const input of inputs.slice(1, 3)) expect(await stored(input.key)).toMatchObject({ syncStatus: 'pending' });
    expect(await stored(inputs[3].key)).toMatchObject({ syncStatus: 'applied' });
    expect(states.at(-1)).toMatchObject({ pending: 2, nextAttemptAt: undefined });
  });

  it('a rejected movement blocks its register too', async () => {
    const inputs = [command(1), command(3, 'a', { key: 'movement.record:m', type: 'register.movement.record' }),
      command(5, 'a', { key: 'session.transition:s:closed', type: 'register.session.transition' }),
      command(9, 'a', { key: 'closure.submit:c', type: 'register.closure.submit' })];
    await collection.bulkInsert(inputs);
    const { outbox, send } = setup({ batchSize: 1 });
    send.mockImplementation(async (batch) => ({ kind: 'results', results: batch.map(({ id }) => id === inputs[1].commandId
      ? { id, status: 'rejected', error } : { id, status: 'applied' }) }));
    await outbox.flush();
    await outbox.flush();
    expect(send.mock.calls.flatMap(([batch]) => batch.map(({ id }) => id))).toEqual(inputs.slice(0, 2).map(({ commandId }) => commandId));
    expect(await stored(inputs[1].key)).toMatchObject({ syncStatus: 'rejected' });
    for (const input of inputs.slice(2)) expect(await stored(input.key)).toMatchObject({ syncStatus: 'pending' });
  });

  it('applied and duplicate both mark the command applied; rejected keeps its error', async () => {
    const inputs = [command(1), command(2), command(3), command(4)];
    await collection.bulkInsert(inputs);
    const register = { session: { id: 'session', status: 'open' as const, expected: { cash: 500 }, salesCount: 2 } };
    const conflict = { code: 'register_closure_exists', message: 'Already closed', data: { closureId: 'server-closure' } };
    const { outbox, send } = setup({ now: () => epoch + 1000 });
    send.mockResolvedValueOnce({ kind: 'results', results: [
      { id: inputs[3].commandId, status: 'rejected', error: conflict },
      { id: inputs[2].commandId, status: 'duplicate', register },
      { id: inputs[1].commandId, status: 'rejected', error },
      { id: inputs[0].commandId, status: 'applied', register },
    ] });
    await outbox.flush();
    for (const input of [inputs[0], inputs[2]]) expect(await stored(input.key)).toMatchObject({
      syncStatus: 'applied', result: register, updatedAt: new Date(epoch + 1000).toISOString(),
    });
    expect(await stored(inputs[1].key)).toMatchObject({ syncStatus: 'rejected', error });
    expect(await stored(inputs[3].key)).toMatchObject({ syncStatus: 'rejected', error: conflict });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('onResult runs before the command is marked, and its throw is logged, not fatal', async () => {
    const inputs = [command(1), command(2), command(3)];
    await collection.bulkInsert(inputs);
    const cause = new Error('callback failed');
    const log = vi.spyOn(registerCommandsLogger, 'warn');
    const observed: { command: RegisterCommand; result: CommandResult; syncStatus: string }[] = [];
    const onResult = vi.fn(async (doc: RegisterCommand, result: CommandResult) => {
      observed.push({ command: doc, result, syncStatus: (await stored(doc.key)).syncStatus });
      throw cause;
    });
    const { outbox, send } = setup({ onResult });
    send.mockResolvedValueOnce({ kind: 'results', results: [
      { id: inputs[0].commandId, status: 'applied' }, { id: inputs[1].commandId, status: 'duplicate' },
      { id: inputs[2].commandId, status: 'rejected', error },
    ] });
    await outbox.flush();
    expect(onResult).toHaveBeenCalledTimes(3);
    expect(observed.map(({ command, result, syncStatus }) => ({ commandId: command.commandId, id: result.id, syncStatus })))
      .toEqual(inputs.map(({ commandId }) => ({ commandId, id: commandId, syncStatus: 'pending' })));
    observed.forEach(({ command }, i) => expect(command).toMatchObject(inputs[i]));
    expect(log).toHaveBeenCalledTimes(3);
    expect(log).toHaveBeenCalledWith(expect.any(String), { commandId: inputs[0].commandId, cause });
    expect((await readFresh(collection, { selector: { syncStatus: 'pending' } }))).toHaveLength(0);
  });

  it.each(['terminal', 'commandId'] as const)('a command changed while in flight is left alone (%s)', async (change) => {
    const input = command(1);
    await collection.insert(input);
    const onResult = vi.fn();
    const { outbox, send } = setup({ onResult });
    const nextId = uuidv7();
    send.mockImplementationOnce(async (batch) => {
      await (await collection.findOne(input.key).exec())!.incrementalPatch(change === 'terminal'
        ? { syncStatus: 'rejected', error } : { commandId: nextId });
      return { kind: 'results', results: applied(batch) };
    });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    expect(onResult).not.toHaveBeenCalled();
    expect(await stored(input.key)).toMatchObject(change === 'terminal'
      ? { syncStatus: 'rejected', error } : { syncStatus: 'pending', commandId: nextId });
    if (change === 'commandId') {
      await outbox.flush();
      expect(send.mock.calls[1][0][0].id).toBe(nextId);
      expect((await stored(input.key)).syncStatus).toBe('applied');
    }
  });

  it('isEnabled false sends nothing', async () => {
    await collection.bulkInsert([command(1), command(1, 'b')]);
    let enabled = false;
    const { outbox, send, states } = setup({ isEnabled: () => enabled });
    await outbox.flush();
    expect(send).not.toHaveBeenCalled();
    expect(states.at(-1)).toMatchObject({ pending: 2, sending: false });
    enabled = true;
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(2);
    expect(states.at(-1)?.pending).toBe(0);
  });

  it('the register outbox never isolates', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const inputs = [command(1), command(2), command(3)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'retry', reason: 'status_503' });
    await outbox.flush();
    for (let i = 0; i < ISOLATE_AFTER_ATTEMPTS + 2; i++) await vi.advanceTimersByTimeAsync(states.at(-1)!.nextAttemptAt! - Date.now());
    expect(send.mock.calls.map(([batch]) => batch.map(({ id }) => id)))
      .toEqual(Array(ISOLATE_AFTER_ATTEMPTS + 3).fill(inputs.map(({ commandId }) => commandId)));
    expect(states.some((state) => state.stuck)).toBe(false);
  });

  it('retry behaves as the order outbox', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    await collection.insert(command(1));
    const { outbox, send, states } = setup();
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' }).mockResolvedValueOnce({ kind: 'retry', reason: 'status_409' });
    await outbox.flush();
    expect(states.at(-1)).toMatchObject({ pending: 1, nextAttemptAt: epoch + 1000 });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)).toMatchObject({ pending: 1, nextAttemptAt: epoch + 3000 });
    await vi.advanceTimersByTimeAsync(2000);
    expect(send.mock.calls.map(([batch]) => batch[0].attempt)).toEqual([1, 2, 3]);
    expect(states.at(-1)).toMatchObject({ pending: 0, lastRetryReason: undefined });
    await collection.insert(command(2));
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'network' });
    await outbox.flush();
    expect(states.at(-1)?.nextAttemptAt).toBe(epoch + 4000);
    outbox.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(send).toHaveBeenCalledTimes(4);
  });

  it('uses jitter, floors retries at retryAfterMs and caps them at maxBackoffMs', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    await collection.insert(command(1));
    const { outbox, send, states } = setup({ random: () => 0, maxBackoffMs: 5000 });
    send.mockResolvedValue({ kind: 'retry', reason: 'busy' });
    await outbox.flush();
    expect(states.at(-1)?.nextAttemptAt).toBe(epoch + 900);
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'busy', retryAfterMs: 3000 });
    await outbox.flush();
    expect(states.at(-1)?.nextAttemptAt).toBe(epoch + 3000);
    send.mockResolvedValueOnce({ kind: 'retry', reason: 'busy', retryAfterMs: 30 * 86400000 });
    await outbox.flush();
    expect(states.at(-1)?.nextAttemptAt).toBe(epoch + 5000);
  });

  it('401 behaves as the order outbox and halts every register', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    await collection.bulkInsert([command(1), command(1, 'b')]);
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'unauthorized' });
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.some((state) => state.authRequired)).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(send).toHaveBeenCalledTimes(3);
    expect(states.at(-1)).toMatchObject({ authRequired: true, pending: 2, nextAttemptAt: undefined });
    expect(send.mock.calls.every(([batch]) => batch[0].payload.registerId === 'a')).toBe(true);
    await vi.advanceTimersByTimeAsync(60000);
    expect(send).toHaveBeenCalledTimes(3);
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await outbox.flush();
    expect(states.at(-1)).toMatchObject({ authRequired: false, pending: 0 });
    await collection.insert(command(2));
    send.mockResolvedValueOnce({ kind: 'unauthorized' }).mockResolvedValueOnce({ kind: 'unauthorized' });
    await outbox.flush();
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)?.authRequired).toBe(false);
    await vi.advanceTimersByTimeAsync(2000);
    expect(states.at(-1)).toMatchObject({ authRequired: false, pending: 0 });
  });

  it('whole-batch refusal behaves as the order outbox and halts every register', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const inputs = Array.from({ length: 23 }, (_, i) => command(i + 1));
    inputs.push(command(1, 'b'));
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup();
    send.mockResolvedValue({ kind: 'refused', status: 400, reason: 'unsupported_protocol' });
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(1);
    for (const input of inputs) expect(await stored(input.key)).toEqual(input);
    expect(states.at(-1)).toMatchObject({ pending: 24, sending: false, lastRetryReason: 'refused',
      refused: { status: 400, reason: 'unsupported_protocol' }, nextAttemptAt: undefined });
    await vi.advanceTimersByTimeAsync(600000);
    expect(send).toHaveBeenCalledTimes(1);
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await outbox.flush();
    expect(states.at(-1)).toMatchObject({ pending: 0, refused: undefined });
  });

  it('matches result ids, leaves missing results pending and retries no_progress', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    const inputs = [command(1), command(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup();
    send.mockResolvedValueOnce({ kind: 'results', results: [{ id: 'unknown', status: 'applied' },
      { id: inputs[1].commandId, status: 'applied' }] }).mockResolvedValueOnce({ kind: 'results', results: [] });
    await outbox.flush();
    expect(send.mock.calls.map(([batch]) => batch.map(({ id }) => id))).toEqual([
      inputs.map(({ commandId }) => commandId), [inputs[0].commandId],
    ]);
    expect((await stored(inputs[0].key)).syncStatus).toBe('pending');
    expect((await stored(inputs[1].key)).syncStatus).toBe('applied');
    expect(states.at(-1)).toMatchObject({ pending: 1, lastRetryReason: 'no_progress' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(states.at(-1)?.pending).toBe(0);
  });

  it('starts immediately, watches pending commands and unsubscribes on stop', async () => {
    await collection.insert(command(1));
    const { outbox, send, states } = setup();
    outbox.start();
    await outbox.flush();
    expect(states.at(-1)).toMatchObject({ pending: 0, sending: false });
    expect(send).toHaveBeenCalledTimes(1);
    await collection.insert(command(2));
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(2));
    await outbox.flush();
    outbox.stop();
    await collection.insert(command(3));
    expect(send).toHaveBeenCalledTimes(2);
    outbox.start();
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("never reads or writes pos_orders, and patches only a command's sync fields", async () => {
    const at = new Date(epoch).toISOString();
    const order: PosOrder = { id: uuidv7(), commandId: uuidv7(), createdAt: at, updatedAt: at, currency: 'EUR',
      pricesIncludeTax: false, customer: null, lines: [{ id: uuidv7(), productId: 'product', name: 'Item', sku: 'SKU', quantity: 1,
        unitPriceMinor: 100, discountMinor: 0, netMinor: 100, taxLines: [] }],
      payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 }],
      subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 100, syncStatus: 'pending' };
    await db.pos_orders.insert(order);
    const orderStorage = db.pos_orders.storageInstance;
    const spies = [vi.spyOn(orderStorage, 'query'), vi.spyOn(orderStorage, 'count'),
      vi.spyOn(orderStorage, 'findDocumentsById'), vi.spyOn(orderStorage, 'bulkWrite')];
    const inputs = [command(1), command(2), command(3)];
    await collection.bulkInsert(inputs);
    const { outbox, send } = setup();
    send.mockResolvedValueOnce({ kind: 'results', results: [
      { id: inputs[0].commandId, status: 'applied', register: { counters: {
        lastClosureNumber: 1, perpetualSalesTotalMinor: 100, perpetualRefundsTotalMinor: 0,
      } } }, { id: inputs[1].commandId, status: 'duplicate' }, { id: inputs[2].commandId, status: 'rejected', error },
    ] });
    await outbox.flush();
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect((await readFresh(db.pos_orders, { selector: {} }))[0]).toStrictEqual(order);
    for (const input of inputs) {
      const after = await stored(input.key);
      for (const field of Object.keys(input) as (keyof RegisterCommand)[]) {
        if (!['syncStatus', 'result', 'error', 'updatedAt'].includes(field)) {
          expect(JSON.stringify(after[field])).toBe(JSON.stringify(input[field]));
        }
      }
      expect(Object.keys(after).filter((field) => !(field in input))).toEqual(
        after.result ? ['result'] : after.error ? ['error'] : [],
      );
    }
  });
});

describe('register outbox stuck clock (answered time only, in memory)', () => {
  const fail = (reason: string) => ({ kind: 'retry', reason } as const);
  const at = async (outbox: RegisterOutbox, ms: number) => { vi.setSystemTime(epoch + ms); await outbox.flush(); };
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
  });

  it('a sent command failing 503 is stuck at STUCK_AFTER_MS, not 1 ms before: since its first failure, the latest reason', async () => {
    const inputs = [command(1), command(2)];
    await collection.bulkInsert(inputs);
    const { outbox, send, states } = setup({ batchSize: 1 });
    send.mockResolvedValueOnce(fail('status_503')).mockResolvedValueOnce(fail('status_503')).mockResolvedValueOnce(fail('status_502'));
    await at(outbox, 0);
    await at(outbox, STUCK_AFTER_MS - 1);
    expect(states.some((state) => state.stuck)).toBe(false);
    await at(outbox, STUCK_AFTER_MS);
    const { commandId } = inputs[0];
    expect(states.at(-1)?.stuck).toEqual({ commandIds: [commandId], since: epoch, reason: 'status_502',
      orders: [{ commandId, since: epoch, reason: 'status_502' }] });
  });

  it.each<[string, TransportOutcome]>([['timeout', fail('timeout')], ['no_progress', { kind: 'results', results: [] }]])(
    'a %s starts the clock, like a 503', async (reason, outcome) => {
      await collection.insert(command(1));
      const { outbox, send, states } = setup();
      send.mockResolvedValue(outcome);
      await at(outbox, 0);
      await at(outbox, STUCK_AFTER_MS);
      expect(states.at(-1)?.stuck).toMatchObject({ since: epoch, reason });
    });

  it('ten minutes offline in the middle pause the clock: stuck ten minutes later, since moved on by the gap', async () => {
    await collection.insert(command(1));
    const { outbox, send, states } = setup();
    send.mockResolvedValue(fail('status_503'));
    await at(outbox, 0);
    send.mockResolvedValue(fail('network'));
    for (let minute = 5; minute < 15; minute++) await at(outbox, minute * 60_000);
    send.mockResolvedValue(fail('status_503'));
    await at(outbox, 15 * 60_000);
    await at(outbox, 25 * 60_000 - 1);
    expect(states.some((state) => state.stuck)).toBe(false);
    await at(outbox, 25 * 60_000);
    expect(states.at(-1)?.stuck).toMatchObject({ since: epoch + 10 * 60_000, reason: 'status_503' });
  });

  it.each(['applied', 'rejected'] as const)('a batch that marks the stuck command %s clears it', async (status) => {
    const input = command(1);
    await collection.insert(input);
    const { outbox, send, states } = setup();
    send.mockResolvedValueOnce(fail('status_503')).mockResolvedValueOnce(fail('status_503'))
      .mockResolvedValueOnce({ kind: 'results', results: [status === 'applied' ? { id: input.commandId, status } : { id: input.commandId, status, error }] });
    await at(outbox, 0);
    await at(outbox, STUCK_AFTER_MS);
    expect(states.at(-1)?.stuck?.commandIds).toEqual([input.commandId]);
    await at(outbox, STUCK_AFTER_MS + 1000);
    expect((await stored(input.key)).syncStatus).toBe(status);
    expect(states.at(-1)).toMatchObject({ pending: 0, stuck: undefined });
  });

  it('a restart forgets the clock: a new outbox has no stuck, and its first answered failure starts it afresh', async () => {
    await collection.insert(command(1));
    const first = setup();
    first.send.mockResolvedValue(fail('status_503'));
    await at(first.outbox, 0);
    await at(first.outbox, STUCK_AFTER_MS);
    expect(first.states.at(-1)?.stuck).toMatchObject({ since: epoch });
    first.outbox.stop();
    const { outbox, send, states } = setup();
    send.mockResolvedValue(fail('status_503'));
    await at(outbox, STUCK_AFTER_MS + 1000);
    expect(states.some((state) => state.stuck)).toBe(false);
    await at(outbox, 2 * STUCK_AFTER_MS + 1000);
    expect(states.at(-1)?.stuck).toMatchObject({ since: epoch + STUCK_AFTER_MS + 1000 });
  });
});

describe('register outbox backend missing (repeated 404s)', () => {
  const notFound = { kind: 'retry', reason: 'status_404' } as const;

  it('alone, with its own tracker, sets backendMissing on the third 404, since the first', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    await collection.insert(command(1));
    const { outbox, send, states } = setup();
    send.mockResolvedValue(notFound);
    await outbox.flush();
    vi.setSystemTime(epoch + 1000);
    await outbox.flush();
    expect(states.some((state) => state.backendMissing)).toBe(false);
    await outbox.flush();
    expect(send).toHaveBeenCalledTimes(3);
    expect(states.at(-1)).toMatchObject({ pending: 1, lastRetryReason: 'status_404', backendMissing: { since: epoch } });
  });

  it('a shared tracker: two 404s to the order outbox and one here show it on both; a 200 here clears both', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(epoch);
    const backendNotFound = createBackendNotFound();
    const at = new Date(epoch).toISOString();
    await db.pos_orders.insert({ id: uuidv7(), commandId: uuidv7(), createdAt: at, updatedAt: at, currency: 'EUR',
      pricesIncludeTax: false, customer: null, lines: [{ id: uuidv7(), productId: 'product', name: 'Item', sku: 'SKU', quantity: 1,
        unitPriceMinor: 100, discountMinor: 0, netMinor: 100, taxLines: [] }], payments: [{ id: uuidv7(), method: 'cash', amountMinor: 100 }],
      subtotalMinor: 100, discountMinor: 0, taxMinor: 0, totalMinor: 100, syncStatus: 'pending' });
    const orderSend = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>().mockResolvedValue(notFound);
    const orders = createOrderOutbox({ collection: db.pos_orders, transport: { send: orderSend }, deviceId: 'device-1',
      random: () => 0.5, backendNotFound });
    outboxes.push(orders);
    const orderStates: OutboxState[] = [];
    orders.state$.subscribe((state) => orderStates.push(state));
    await collection.insert(command(1));
    const { outbox, send, states } = setup({ backendNotFound });
    send.mockResolvedValue(notFound);
    await orders.flush();
    await orders.flush();
    expect([...orderStates, ...states].some((state) => state.backendMissing)).toBe(false);
    await outbox.flush();
    expect(states.at(-1)?.backendMissing).toEqual({ since: epoch });
    expect(orderStates.at(-1)?.backendMissing).toEqual({ since: epoch });
    send.mockImplementation(async (batch) => ({ kind: 'results', results: applied(batch) }));
    await outbox.flush();
    expect(states.at(-1)).toMatchObject({ pending: 0, backendMissing: undefined });
    expect(orderStates.at(-1)).toMatchObject({ pending: 1, backendMissing: undefined });
    expect(orderSend).toHaveBeenCalledTimes(2);
  });

  it.each(['order', 'register'] as const)('a stopped %s outbox lets go of the shared tracker; start() takes it up again', async (which) => {
    const backendNotFound = createBackendNotFound();
    const orders = createOrderOutbox({ collection: db.pos_orders, transport: { send: vi.fn() }, deviceId: 'device-1', backendNotFound });
    outboxes.push(orders);
    const orderStates: OutboxState[] = [];
    orders.state$.subscribe((state) => orderStates.push(state));
    const { outbox, states } = setup({ backendNotFound });
    await Promise.all([orders.flush(), outbox.flush()]);
    const [stopped, stoppedStates, liveStates] = which === 'order' ? [orders, orderStates, states] : [outbox, states, orderStates];
    stopped.stop();
    const seen = stoppedStates.length;
    for (let i = 0; i < 3; i++) backendNotFound.record({ kind: 'retry', reason: 'status_404' }, epoch + i);
    expect(liveStates.at(-1)?.backendMissing).toEqual({ since: epoch });
    expect(stoppedStates).toHaveLength(seen);
    stopped.start();
    expect(stoppedStates.at(-1)?.backendMissing).toEqual({ since: epoch });
  });
});
