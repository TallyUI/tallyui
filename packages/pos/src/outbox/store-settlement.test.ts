// @vitest-environment node
// #1101 slice 1b: cancelling on the store the order a refused sale left behind, and how the outbox treats a settled row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderCreateEnvelope, SettleCancelRequest, SettleOutcome } from '@tallyui/core';
import { callbackSink, type LogEntry } from '../logging';
import { needsAttention, posOrderCollection, uuidv7, type PosOrder, type PosOrderStoreSettlement } from '../pos-order';
import { createOrderOutbox, type OrderOutbox } from './order-outbox';
import { outboxLogger } from './logger';
import { cancelOnStore } from './store-settlement';
import type { CommandTransport, OutboxState } from './types';

const name = `storesettle${uuidv7().replaceAll('-', '')}`;
let db: RxDatabase<{ pos_orders: RxCollection<PosOrder> }>;
let orders: RxCollection<PosOrder>;
let outboxes: OrderOutbox[];
const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const open = async () => {
  db = await createRxDatabase({ name, storage, multiInstance: false });
  ({ pos_orders: orders } = await db.addCollections({ pos_orders: posOrderCollection() }));
};

beforeEach(async () => { outboxes = []; await open(); });
afterEach(async () => { outboxes.forEach((outbox) => outbox.stop()); await db.remove(); });

const at = new Date('2026-11-25T10:00:00.000Z');
function refused(overrides: Partial<PosOrder> = {}, data: Record<string, unknown> = { orderId: '115', displayId: '1001' }): PosOrder {
  const createdAt = '2026-11-25T09:00:00.000Z';
  return {
    id: uuidv7(), commandId: uuidv7(), createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: uuidv7(), productId: 'p', name: 'Item', sku: 'SKU', quantity: 1, unitPriceMinor: 1000, discountMinor: 0, netMinor: 1000, taxLines: [] }],
    payments: [{ id: uuidv7(), method: 'cash', amountMinor: 600 }, { id: uuidv7(), method: 'external', amountMinor: 400 }], customer: null,
    subtotalMinor: 1000, discountMinor: 0, taxMinor: 0, totalMinor: 1000, syncStatus: 'rejected',
    error: { code: 'invalid_payload', message: 'created, not paid', data }, taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    ...overrides,
  };
}
const stored = async (id: string) => (await orders.findOne(id).exec())!.toJSON() as PosOrder;
const settlement = (state: PosOrderStoreSettlement['state'], kind: PosOrderStoreSettlement['kind'] = 'cancel'): PosOrderStoreSettlement =>
  ({ kind, state, attemptId: uuidv7(), at: at.toISOString() });
/** The money-bearing fields cancelOnStore never changes. */
const untouched = ({ syncStatus, error, commandId, payments, subtotalMinor, discountMinor, taxMinor, totalMinor, lines }: PosOrder) =>
  ({ syncStatus, error, commandId, payments, subtotalMinor, discountMinor, taxMinor, totalMinor, lines });
/** Collects the outbox's log entries; the returned function removes the sink. */
function capture(entries: LogEntry[]) {
  const id = `capture-${uuidv7()}`;
  outboxLogger.addSink(callbackSink({ id, levels: ['debug', 'info', 'warn', 'error'], callback: (entry) => entries.push(entry) }));
  return () => outboxLogger.removeSink(id);
}
function outboxOf() {
  const send = vi.fn<CommandTransport<OrderCreateEnvelope>['send']>();
  const outbox = createOrderOutbox({ collection: orders, transport: { send }, deviceId: 'device-1', random: () => 0.5 });
  outboxes.push(outbox);
  const states: OutboxState[] = [];
  outbox.state$.subscribe((state) => states.push(state));
  return { outbox, send, states };
}

describe('cancelOnStore', () => {
  it('1: stores sending before the call, then done; the row leaves attention and state.rejected, its money untouched', async () => {
    const order = refused();
    await orders.insert(order);
    const { outbox, states } = outboxOf();
    await outbox.flush();
    expect(states.at(-1)?.rejected).toBe(1);
    let seenDuringCall: PosOrder | undefined;
    const cancel = vi.fn(async (_request: SettleCancelRequest): Promise<SettleOutcome> => {
      seenDuringCall = await stored(order.id);
      return { kind: 'done', status: 'cancelled' };
    });
    expect(await cancelOnStore({ orders, cancel, now: () => at }, order.id)).toEqual({ kind: 'done', status: 'cancelled' });
    const [request] = cancel.mock.calls[0];
    expect(request).toEqual({ storeOrderId: '115', clientOrderId: order.id, attemptId: expect.any(String) });
    expect(seenDuringCall?.storeSettlement).toEqual({ kind: 'cancel', state: 'sending', attemptId: request.attemptId, at: at.toISOString() });
    const after = await stored(order.id);
    expect(after.storeSettlement).toEqual({ kind: 'cancel', state: 'done', attemptId: request.attemptId, at: at.toISOString(), storeStatus: 'cancelled' });
    expect(after.updatedAt).toBe(at.toISOString());
    expect(JSON.stringify(untouched(after))).toBe(JSON.stringify(untouched(order)));
    expect(needsAttention([after])).toEqual([]);
    await outbox.flush();
    await outbox.requeue([]);
    expect(states.at(-1)?.rejected).toBe(0);
  });

  it.each<[string, SettleOutcome, Partial<PosOrderStoreSettlement>]>([
    ['2: changed (pos-partial, 500)', { kind: 'changed', status: 'pos-partial', capturedMinor: 500 }, { state: 'changed', storeStatus: 'pos-partial', capturedMinor: 500 }],
    ['3: refused', { kind: 'refused', code: 'not_cancellable', message: 'No.' }, { state: 'refused', code: 'not_cancellable', message: 'No.' }],
  ])('%s: stored, the row stays in attention and in state.rejected, and a new tap mints a new attemptId', async (_name, outcome, expected) => {
    const order = refused();
    await orders.insert(order);
    const { outbox, states } = outboxOf();
    const entries: LogEntry[] = [];
    const sink = capture(entries);
    const cancel = vi.fn(async (_request: SettleCancelRequest): Promise<SettleOutcome> => outcome);
    try {
      expect(await cancelOnStore({ orders, cancel }, order.id)).toEqual(outcome);
    } finally { sink(); }
    const after = await stored(order.id);
    expect(after.storeSettlement).toMatchObject({ kind: 'cancel', attemptId: cancel.mock.calls[0][0].attemptId, ...expected });
    expect(needsAttention([after])).toEqual([after]);
    await outbox.requeue([]);
    expect(states.at(-1)?.rejected).toBe(1);
    expect(entries).toEqual([expect.objectContaining({ level: 'warn', data: expect.objectContaining({ orderId: order.id }) })]);
    await cancelOnStore({ orders, cancel }, order.id);
    expect(cancel.mock.calls[1][0].attemptId).not.toBe(cancel.mock.calls[0][0].attemptId);
  });

  it('4: gone is stored and the row leaves attention', async () => {
    const order = refused();
    await orders.insert(order);
    expect(await cancelOnStore({ orders, cancel: async () => ({ kind: 'gone' }) }, order.id)).toEqual({ kind: 'gone' });
    const after = await stored(order.id);
    expect(after.storeSettlement?.state).toBe('gone');
    expect(needsAttention([after])).toEqual([]);
  });

  it('5: retry writes nothing, the row stays sending, and the next call sends the same attemptId', async () => {
    const order = refused();
    await orders.insert(order);
    const cancel = vi.fn<(request: SettleCancelRequest) => Promise<SettleOutcome>>()
      .mockResolvedValueOnce({ kind: 'retry', reason: 'network' }).mockResolvedValueOnce({ kind: 'done', status: 'cancelled' });
    expect(await cancelOnStore({ orders, cancel }, order.id)).toEqual({ kind: 'retry', reason: 'network' });
    expect((await stored(order.id)).storeSettlement?.state).toBe('sending');
    expect(needsAttention([await stored(order.id)])).toHaveLength(1);
    await cancelOnStore({ orders, cancel }, order.id);
    expect(cancel.mock.calls[1][0].attemptId).toBe(cancel.mock.calls[0][0].attemptId);
    expect((await stored(order.id)).storeSettlement?.state).toBe('done');
  });

  it.each([new Error('crash'), Object.assign(new Error('unauthorized'), { status: 401 })])(
    '6: a rejected cancel (%s) leaves the row sending, reaches the caller, and after close and reopen the same attemptId goes again', async (error) => {
      const order = refused();
      await orders.insert(order);
      const cancel = vi.fn<(request: SettleCancelRequest) => Promise<SettleOutcome>>().mockRejectedValueOnce(error);
      await expect(cancelOnStore({ orders, cancel }, order.id)).rejects.toBe(error);
      expect((await stored(order.id)).storeSettlement?.state).toBe('sending');
      await db.close();
      await open();
      cancel.mockResolvedValueOnce({ kind: 'done', status: 'cancelled' });
      await cancelOnStore({ orders, cancel }, order.id);
      expect(cancel.mock.calls[1][0].attemptId).toBe(cancel.mock.calls[0][0].attemptId);
    });

  it.each<[string, () => PosOrder | undefined]>([
    ['7: recorded 1', () => refused({}, { orderId: '115', recorded: 1 })],
    ['8: pending', () => refused({ syncStatus: 'pending' })],
    ['8: applied', () => refused({ syncStatus: 'applied' })],
    ['8: rejected without orderId', () => refused({}, { storeCode: 'x' })],
    ['8: unknown id', () => undefined],
    ['9: done', () => refused({ storeSettlement: settlement('done') })],
    ['9: gone', () => refused({ storeSettlement: settlement('gone') })],
    ['10: kind pay in sending', () => refused({ storeSettlement: settlement('sending', 'pay') })],
  ])('%s: not offered, cancel never called, the row unchanged', async (_name, make) => {
    const order = make();
    if (order) await orders.insert(order);
    const cancel = vi.fn(async (): Promise<SettleOutcome> => ({ kind: 'done', status: 'cancelled' }));
    expect(await cancelOnStore({ orders, cancel }, order?.id ?? 'missing')).toEqual({ kind: 'not_offered' });
    expect(cancel).not.toHaveBeenCalled();
    if (order) expect(await stored(order.id)).toEqual(order);
  });

  it('15: an outcome that arrives after the row took another attemptId leaves the stored settlement untouched', async () => {
    const order = refused();
    await orders.insert(order);
    const other = settlement('sending');
    const cancel = vi.fn(async (): Promise<SettleOutcome> => {
      await (await orders.findOne(order.id).exec())!.incrementalPatch({ storeSettlement: other });
      return { kind: 'done', status: 'cancelled' };
    });
    await cancelOnStore({ orders, cancel }, order.id);
    expect((await stored(order.id)).storeSettlement).toEqual(other);
  });

  it('16: two overlapping calls send one attemptId, and the outcome decides the final state', async () => {
    const order = refused();
    await orders.insert(order);
    const answers: ((outcome: SettleOutcome) => void)[] = [];
    const cancel = vi.fn((_request: SettleCancelRequest) => new Promise<SettleOutcome>((resolve) => { answers.push(resolve); }));
    const first = cancelOnStore({ orders, cancel }, order.id);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(1));
    const second = cancelOnStore({ orders, cancel }, order.id);
    await vi.waitFor(() => expect(cancel).toHaveBeenCalledTimes(2));
    expect(cancel.mock.calls[1][0].attemptId).toBe(cancel.mock.calls[0][0].attemptId);
    answers[0]({ kind: 'changed', status: 'processing', capturedMinor: 0 });
    answers[1]({ kind: 'done', status: 'cancelled' });
    await Promise.all([first, second]);
    expect((await stored(order.id)).storeSettlement).toMatchObject({ state: 'changed', storeStatus: 'processing', capturedMinor: 0 });
  });

  it('logs a retry at info, with no write', async () => {
    const order = refused();
    await orders.insert(order);
    const entries: LogEntry[] = [];
    const sink = capture(entries);
    try {
      await cancelOnStore({ orders, cancel: async () => ({ kind: 'retry', reason: 'status_503' }) }, order.id);
    } finally { sink(); }
    expect(entries).toEqual([expect.objectContaining({ level: 'info', data: expect.objectContaining({ orderId: order.id, reason: 'status_503' }) })]);
  });
});

describe('the outbox and a settled row', () => {
  it.each(['sending', 'done', 'changed', 'refused', 'gone'] as const)('11: requeue() and requeue([id]) never resend a row whose settlement is %s', async (state) => {
    const order = refused({ error: { code: 'insufficient_stock', message: 'x', data: { orderId: '115' } }, storeSettlement: settlement(state) });
    await orders.insert(order);
    const { outbox, send } = outboxOf();
    expect(await outbox.requeue()).toBe(0);
    expect(await outbox.requeue([order.id])).toBe(0);
    expect(send).not.toHaveBeenCalled();
    expect((await stored(order.id)).commandId).toBe(order.commandId);
  });

  it('12: discard keeps a refused row whose order the store created', async () => {
    const order = refused();
    await orders.insert(order);
    const { outbox } = outboxOf();
    expect(await outbox.discard(order.id)).toBe(false);
    expect(await stored(order.id)).toEqual(order);
  });

  it('13: discard still removes a refused row without a store order', async () => {
    const order = refused({}, { storeCode: 'x' });
    await orders.insert(order);
    const { outbox } = outboxOf();
    expect(await outbox.discard(order.id)).toBe(true);
    expect(await orders.findOne(order.id).exec()).toBeNull();
  });
});
