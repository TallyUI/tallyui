// @vitest-environment node
// #1101 slice 1b: cancelling on the store the order a refused sale left behind, and how the outbox treats a settled row.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { OrderCreateEnvelope, SettleCancelRequest, SettleOutcome, SettlePayRequest, SettlePayResult } from '@tallyui/core';
import { callbackSink, type LogEntry } from '../logging';
import { needsAttention, posOrderCollection, uuidv7, type PosOrder, type PosOrderStoreSettlement } from '../pos-order';
import { createOrderOutbox, type OrderOutbox } from './order-outbox';
import { outboxLogger } from './logger';
import { cancelOnStore, payRestOnStore, reverseOnStore } from './store-settlement';
import type { SettleReverseRequest, SettleReverseResult } from '@tallyui/core';
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

// #1101 slice 3: the till's cash 10.00 is recorded on store order 115, its card 20.00 and (row 2) cash legs are not.
describe('payRestOnStore', () => {
  const partPaid = (payments: PosOrder['payments'], overrides: Partial<PosOrder> = {}) =>
    refused({ payments, totalMinor: payments.reduce((sum, leg) => sum + leg.amountMinor, 0), ...overrides }, { orderId: '115', displayId: '1001', recorded: 1 });
  const cash10 = () => ({ id: uuidv7(), method: 'cash' as const, amountMinor: 1000 });
  const card = (amountMinor: number) => ({ id: uuidv7(), method: 'external' as const, amountMinor });
  type Pay = (request: SettlePayRequest) => Promise<SettlePayResult>;
  const answering = (outcome: SettleOutcome, recorded: (request: SettlePayRequest) => string[] = () => []) =>
    vi.fn<Pay>(async (request) => ({ outcome, recorded: recorded(request) }));
  const all = (request: SettlePayRequest) => request.payments.map(({ id }) => id);

  it('row 1: stores sending with new ids before the call, then done with each payment done; the row leaves attention, money untouched', async () => {
    const order = partPaid([cash10(), card(2000)]);
    await orders.insert(order);
    let seenDuringCall: PosOrder | undefined;
    const pay = vi.fn<Pay>(async (request) => {
      seenDuringCall = await stored(order.id);
      return { outcome: { kind: 'done', status: 'completed' }, recorded: all(request) };
    });
    expect(await payRestOnStore({ orders, pay, now: () => at }, order.id)).toEqual({ kind: 'done', status: 'completed' });
    const [request] = pay.mock.calls[0];
    expect(request).toEqual({ storeOrderId: '115', clientOrderId: order.id, attemptId: expect.any(String), currency: 'EUR',
      payments: [{ id: expect.any(String), method: 'external', amountMinor: 2000 }] });
    expect(request.payments[0].id).not.toBe(order.payments[1].id);
    expect(seenDuringCall?.storeSettlement).toEqual({ kind: 'pay', state: 'sending', attemptId: request.attemptId, at: at.toISOString(),
      payments: [{ id: request.payments[0].id, method: 'external', amountMinor: 2000 }] });
    const after = await stored(order.id);
    expect(after.storeSettlement).toEqual({ kind: 'pay', state: 'done', attemptId: request.attemptId, at: at.toISOString(), storeStatus: 'completed',
      payments: [{ id: request.payments[0].id, method: 'external', amountMinor: 2000, done: true }] });
    expect(JSON.stringify(untouched(after))).toBe(JSON.stringify(untouched(order)));
    expect(needsAttention([after])).toEqual([]);
  });

  it('row 2: a cash leg copies tenderedMinor and never the change; a card leg carries no tendered', async () => {
    const order = partPaid([cash10(), { id: uuidv7(), method: 'cash', amountMinor: 2000, tenderedMinor: 5000, changeMinor: 3000 },
      { ...card(500), tenderedMinor: 900 }]);
    await orders.insert(order);
    const pay = answering({ kind: 'done', status: 'completed' }, all);
    await payRestOnStore({ orders, pay }, order.id);
    expect(pay.mock.calls[0][0].payments).toEqual([{ id: expect.any(String), method: 'cash', amountMinor: 2000, tenderedMinor: 5000 },
      { id: expect.any(String), method: 'external', amountMinor: 500 }]);
  });

  it('row 7: refused keeps the payments, marks the recorded ones done, and the row stays in attention', async () => {
    const order = partPaid([cash10(), card(500), card(1500)]);
    await orders.insert(order);
    const pay = answering({ kind: 'refused', code: 'wcpos_amount_exceeds_balance', message: 'No.' }, (request) => [request.payments[0].id]);
    await payRestOnStore({ orders, pay }, order.id);
    const after = await stored(order.id);
    expect(after.storeSettlement).toMatchObject({ kind: 'pay', state: 'refused', code: 'wcpos_amount_exceeds_balance', message: 'No.' });
    expect(after.storeSettlement?.payments?.map((payment) => payment.done)).toEqual([true, undefined]);
    expect(needsAttention([after])).toEqual([after]);
  });

  it('row 8: a pay still sending is resent with the same attemptId and both ids', async () => {
    const order = partPaid([card(1000), { id: uuidv7(), method: 'cash', amountMinor: 500 }, card(1500)]);
    await orders.insert(order);
    const pay = vi.fn<Pay>().mockRejectedValueOnce(new Error('crash'))
      .mockImplementationOnce(async (request) => ({ outcome: { kind: 'done', status: 'completed' }, recorded: all(request) }));
    await expect(payRestOnStore({ orders, pay }, order.id)).rejects.toThrow('crash');
    expect((await stored(order.id)).storeSettlement?.state).toBe('sending');
    await db.close();
    await open();
    await payRestOnStore({ orders, pay }, order.id);
    expect(pay.mock.calls[1][0]).toEqual(pay.mock.calls[0][0]);
    expect(pay.mock.calls[1][0].payments.map(({ amountMinor }) => amountMinor)).toEqual([500, 1500]);
    expect((await stored(order.id)).storeSettlement?.payments?.every((payment) => payment.done)).toBe(true);
  });

  it.each(['network', 'status_503', 'woo_rxdb_sync_record_locked'])('row 9: retry %s keeps sending and the ids; the next call sends the same ids', async (reason) => {
    const order = partPaid([cash10(), card(2000)]);
    await orders.insert(order);
    const pay = answering({ kind: 'retry', reason });
    expect(await payRestOnStore({ orders, pay, now: () => at }, order.id)).toEqual({ kind: 'retry', reason });
    const sending = (await stored(order.id)).storeSettlement;
    expect(sending).toMatchObject({ kind: 'pay', state: 'sending', attemptId: pay.mock.calls[0][0].attemptId });
    await payRestOnStore({ orders, pay, now: () => at }, order.id);
    expect(pay.mock.calls[1][0]).toEqual(pay.mock.calls[0][0]);
    expect((await stored(order.id)).storeSettlement).toEqual(sending);
  });

  it('row 10: gone is stored, and the row with 10.00 recorded stays in attention', async () => {
    const order = partPaid([cash10(), card(2000)]);
    await orders.insert(order);
    expect(await payRestOnStore({ orders, pay: answering({ kind: 'gone' }) }, order.id)).toEqual({ kind: 'gone' });
    const after = await stored(order.id);
    expect(after.storeSettlement?.state).toBe('gone');
    expect(needsAttention([after])).toEqual([after]);
  });

  it('row 13: retry not_completed with the id recorded marks it done and keeps sending', async () => {
    const order = partPaid([cash10(), card(2000)]);
    await orders.insert(order);
    const pay = answering({ kind: 'retry', reason: 'not_completed' }, all);
    await payRestOnStore({ orders, pay }, order.id);
    const after = (await stored(order.id)).storeSettlement;
    expect(after).toMatchObject({ state: 'sending', attemptId: pay.mock.calls[0][0].attemptId });
    expect(after?.payments).toEqual([{ id: pay.mock.calls[0][0].payments[0].id, method: 'external', amountMinor: 2000, done: true }]);
    expect(needsAttention([await stored(order.id)])).toHaveLength(1);
  });

  it('changed stores the store figures, and a new tap mints a new attemptId and keeps the ids', async () => {
    const order = partPaid([cash10(), card(2000)]);
    await orders.insert(order);
    const pay = answering({ kind: 'changed', status: 'pos-partial', capturedMinor: 1500 });
    await payRestOnStore({ orders, pay }, order.id);
    expect((await stored(order.id)).storeSettlement).toMatchObject({ state: 'changed', storeStatus: 'pos-partial', capturedMinor: 1500 });
    await payRestOnStore({ orders, pay }, order.id);
    expect(pay.mock.calls[1][0].attemptId).not.toBe(pay.mock.calls[0][0].attemptId);
    expect(pay.mock.calls[1][0].payments[0].id).toBe(pay.mock.calls[0][0].payments[0].id);
  });

  it('a repeat after refused keeps the stored ids and done flags, under a new attemptId', async () => {
    const legs = [{ id: uuidv7(), method: 'cash' as const, amountMinor: 500, done: true }, { id: uuidv7(), method: 'external' as const, amountMinor: 1500 }];
    const before = { ...settlement('refused', 'pay'), code: 'wcpos_amount_exceeds_balance', message: 'No.', payments: legs };
    const order = partPaid([cash10(), { id: uuidv7(), method: 'cash', amountMinor: 500 }, card(1500)], { storeSettlement: before });
    await orders.insert(order);
    const pay = answering({ kind: 'done', status: 'completed' }, all);
    await payRestOnStore({ orders, pay }, order.id);
    const [request] = pay.mock.calls[0];
    expect(request.payments).toEqual([{ id: legs[0].id, method: 'cash', amountMinor: 500 }, { id: legs[1].id, method: 'external', amountMinor: 1500 }]);
    expect(request.attemptId).not.toBe(before.attemptId);
    expect((await stored(order.id)).storeSettlement).toMatchObject({ state: 'done', attemptId: request.attemptId,
      payments: [{ ...legs[0], done: true }, { ...legs[1], done: true }] });
  });

  it.each<[string, () => PosOrder | undefined]>([
    ['row 12: recorded 0', () => refused({}, { orderId: '115', recorded: 0 })],
    ['a pay done', () => partPaid([cash10(), card(2000)], { storeSettlement: settlement('done', 'pay') })],
    ['a cancel sending', () => partPaid([cash10(), card(2000)], { storeSettlement: settlement('sending') })],
    ['an unknown id', () => undefined],
  ])('%s: not offered, pay never called, the row unchanged', async (_name, make) => {
    const order = make();
    if (order) await orders.insert(order);
    const pay = answering({ kind: 'done', status: 'completed' });
    expect(await payRestOnStore({ orders, pay }, order?.id ?? 'missing')).toEqual({ kind: 'not_offered' });
    expect(pay).not.toHaveBeenCalled();
    if (order) expect(await stored(order.id)).toEqual(order);
  });

  it('an outcome that arrives after the row took another attemptId leaves the stored settlement untouched', async () => {
    const order = partPaid([cash10(), card(2000)]);
    await orders.insert(order);
    const other = settlement('sending', 'pay');
    const pay = vi.fn<Pay>(async (request) => {
      await (await orders.findOne(order.id).exec())!.incrementalPatch({ storeSettlement: other });
      return { outcome: { kind: 'done', status: 'completed' }, recorded: all(request) };
    });
    await payRestOnStore({ orders, pay }, order.id);
    expect((await stored(order.id)).storeSettlement).toEqual(other);
  });
});

describe('reverseOnStore', () => {
  const insert = async (recorded: number, storeSettlement?: PosOrderStoreSettlement) => {
    const order = refused({ payments: [{ id: uuidv7(), method: 'cash', amountMinor: 1000 }, { id: uuidv7(), method: 'external', amountMinor: 500 }],
      ...(storeSettlement ? { storeSettlement } : {}) }, { orderId: '115', recorded });
    await orders.insert(order);
    return order;
  };
  type Reverse = (request: SettleReverseRequest) => Promise<SettleReverseResult>;
  const done = { kind: 'done' as const, status: 'cancelled' };
  const retry = { kind: 'retry' as const, reason: 'network' };
  it('row 3: persist the refused step with only the cash voided', async () => {
    const order = await insert(2);
    const outcome = { kind: 'refused' as const, code: 'wcpos_invalid_transition', message: 'No.' };
    const reverse: Reverse = async (request) => {
      expect(request).toEqual({ storeOrderId: '115', clientOrderId: order.id, attemptId: expect.any(String),
        legs: order.payments.map(({ id }) => ({ paymentId: id, commandId: expect.any(String) })) });
      expect((await stored(order.id)).storeSettlement).toMatchObject({ kind: 'reverse', state: 'sending', attemptId: request.attemptId, legs: request.legs });
      return { outcome, voided: [order.payments[0].id] };
    };
    expect(await reverseOnStore({ orders, reverse }, order.id)).toEqual(outcome);
    const after = await stored(order.id);
    expect(after.storeSettlement).toMatchObject({ state: 'refused', code: outcome.code, message: outcome.message });
    expect(after.storeSettlement?.legs?.map(({ done }) => done)).toEqual([true, undefined]);
    expect(untouched(after)).toEqual(untouched(order));
  });
  it.each([[4, 1], [13, 2]])('row %i: a sending repeat keeps its attempt, command ids and confirmed leg', async (_row, count) => {
    const order = await insert(count);
    const reverse = vi.fn<Reverse>().mockResolvedValueOnce({ outcome: retry, voided: [order.payments[0].id] }).mockImplementationOnce(async (request) => {
      expect((await stored(order.id)).storeSettlement?.legs?.[0].done).toBe(true);
      return { outcome: done, voided: request.legs.map(({ paymentId }) => paymentId) };
    });
    expect(await reverseOnStore({ orders, reverse }, order.id)).toEqual(retry);
    const pending = (await stored(order.id)).storeSettlement;
    expect(pending?.state).toBe('sending');
    expect(pending?.legs?.map(({ done }) => done)).toEqual(count === 2 ? [true, undefined] : [true]);
    expect(await reverseOnStore({ orders, reverse }, order.id)).toEqual(done);
    expect(reverse.mock.calls[1]).toEqual(reverse.mock.calls[0]);
    expect((await stored(order.id)).storeSettlement).toMatchObject({ state: 'done', storeStatus: 'cancelled' });
  });
  it('row 8: a changed cancel still marks the voided leg done', async () => {
    const order = await insert(1);
    const outcome = { kind: 'changed' as const, status: 'pos-partial', capturedMinor: 500 };
    await reverseOnStore({ orders, reverse: async () => ({ outcome, voided: [order.payments[0].id] }) }, order.id);
    expect((await stored(order.id)).storeSettlement).toMatchObject({ state: 'changed', storeStatus: outcome.status, capturedMinor: 500, legs: [{ done: true }] });
  });
  it('row 9: gone with money stays in attention', async () => {
    const order = await insert(1);
    await reverseOnStore({ orders, reverse: async () => ({ outcome: { kind: 'gone' }, voided: [] }) }, order.id);
    const after = await stored(order.id);
    expect(after.storeSettlement?.state).toBe('gone');
    expect(needsAttention([after])).toEqual([after]);
  });
  it('row 12: a rejected void leaves sending and rejects with the same error', async () => {
    const order = await insert(1), error = new Error('unauthorized');
    await expect(reverseOnStore({ orders, reverse: async () => { throw error; } }, order.id)).rejects.toBe(error);
    expect((await stored(order.id)).storeSettlement?.state).toBe('sending');
  });
  it('row 14: an ineligible row never calls reverse', async () => {
    const order = await insert(0), reverse = vi.fn<Reverse>();
    expect(await reverseOnStore({ orders, reverse }, order.id)).toEqual({ kind: 'not_offered' });
    expect(reverse).not.toHaveBeenCalled();
  });
  it('row 15: after refusal keep only confirmed command ids under a new attempt', async () => {
    const order = await insert(2);
    const reverse = vi.fn<Reverse>().mockResolvedValueOnce({ outcome: { kind: 'refused', code: 'no', message: 'No.' }, voided: [order.payments[0].id] })
      .mockResolvedValueOnce({ outcome: retry, voided: [] });
    await reverseOnStore({ orders, reverse }, order.id);
    await reverseOnStore({ orders, reverse }, order.id);
    const [[first], [second]] = reverse.mock.calls;
    expect(second.attemptId).not.toBe(first.attemptId);
    expect(second.legs[0]).toEqual(first.legs[0]);
    expect(second.legs[1].commandId).not.toBe(first.legs[1].commandId);
    expect((await stored(order.id)).storeSettlement?.legs?.[0].done).toBe(true);
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
