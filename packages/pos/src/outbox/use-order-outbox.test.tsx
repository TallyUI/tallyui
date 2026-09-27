// @vitest-environment jsdom
// The `describe('useOutbox with the TallyUI HTTP transport')` block is ported from medusapos/app `563b03c4`
// `tests/outbox.test.tsx` (ADR-052, TV7), titles and bodies unchanged: all six of its cases are hook-level. Its
// `Harness` component became `renderHook` over `useOrderOutbox`, wired the way medusapos's `use-outbox` wires it
// (base URL as `storeKey`, an HTTP transport reading the latest token), with memory RxDB in place of `openOrderStore`.
// The second block covers the hook's own options and guards.
import { useRef } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { createOrderBuilder } from '../order';
import type { LogEntry } from '../logging';
import { addPosOrderCollection, finalizeOrder, needsAttention, OrderContentMismatchError, uuidv7, type PosOrder } from '../pos-order';
import { createHttpCommandTransport } from './http-transport';
import type { CommandTransport } from './types';
import { outboxLogger, useOrderOutbox, type UseOrderOutboxOptions } from './use-order-outbox';

type Session = { baseUrl: string; email: string; token: string };
let outbox: ReturnType<typeof useOrderOutbox>;
let session: Session;
let sequence = 0;
const fetchStub = vi.fn<typeof fetch>();
const run = uuidv7().replaceAll('-', '').slice(-12);
const names = new Map<string, string>();
const closing = new Map<string, Promise<unknown>>();

/** A memory-storage order store per key; memory storage keeps each store's orders after it closes. Waits for the
 * key's last close, since RxDB refuses a second open database of the same name (as an app's store cache would). */
async function openStore(storeKey: string) {
  if (!names.has(storeKey)) names.set(storeKey, `useoutbox${run}${names.size}`);
  await closing.get(storeKey);
  const db = await createRxDatabase({ name: names.get(storeKey)!,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  const close = () => { const closed = db.close(); closing.set(storeKey, closed); return closed.then(() => {}); };
  return { orders: await addPosOrderCollection(db), close };
}
function useHarness(session: Session | null, deviceId = 'register-1') {
  const tokenRef = useRef(session?.token);
  tokenRef.current = session?.token;
  return useOrderOutbox({ storeKey: session?.baseUrl ?? null, deviceId, open: openStore,
    transport: (baseUrl) => createHttpCommandTransport({ baseUrl,
      getHeaders: () => ({ Authorization: `Bearer ${tokenRef.current ?? ''}` }) }) });
}
function renderHarness(initial: Session | null) {
  const view = renderHook(({ session }: { session: Session | null }) => { outbox = useHarness(session); return outbox; },
    { initialProps: { session: initial } });
  return { rerender: (next: Session | null) => view.rerender({ session: next }) };
}
function sale(now?: Date): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'shirt', variantId: 'blue', name: 'Blue shirt', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 1200 });
  return finalizeOrder(builder.getSnapshot(), { registerId: 'register-1', now });
}
function applied(order: PosOrder) {
  return new Response(JSON.stringify({ results: [{ id: order.commandId, status: 'applied',
    serverRefs: { orderId: 'server-order', displayId: '42', totalMinor: order.totalMinor } }] }));
}
beforeEach(() => {
  session = { baseUrl: `https://outbox-${++sequence}.test`, email: 'cashier@test.com', token: 'old-token' };
  fetchStub.mockReset();
  vi.stubGlobal('fetch', fetchStub);
});
afterEach(async () => {
  const db = outbox.orders?.database;
  cleanup();
  if (db) await waitFor(() => expect(db.closed).toBe(true));
  vi.unstubAllGlobals();
});

describe('useOutbox with the TallyUI HTTP transport', () => {
  it('stores pending before returning and sends one command, then stores applied server refs', async () => {
    let respond!: (response: Response) => void;
    fetchStub.mockImplementation(() => new Promise((resolve) => { respond = resolve; }));
    renderHarness(session);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const order = sale();
    await act(async () => { await outbox.record(order); });
    expect((await outbox.orders!.findOne(order.id).exec())?.syncStatus).toBe('pending');
    await waitFor(() => expect(fetchStub).toHaveBeenCalledTimes(1));
    expect(outbox.state).toMatchObject({ pending: 1, sending: true });
    const [url, init] = fetchStub.mock.calls[0];
    expect(url).toBe(`${session.baseUrl}/tally/v1/commands`);
    expect(init).toMatchObject({ method: 'POST', headers: { 'X-Tally-Protocol': '1', Authorization: 'Bearer old-token' } });
    expect(JSON.parse(init!.body as string).commands).toEqual([expect.objectContaining({
      id: order.commandId, type: 'order.create', deviceId: 'register-1', attempt: 1,
      payload: expect.objectContaining({ clientOrderId: order.id, totalMinor: order.totalMinor }),
    })]);
    await act(async () => { respond(applied(order)); });
    await waitFor(() => expect(outbox.recent[0]).toMatchObject({ syncStatus: 'applied',
      serverRefs: { orderId: 'server-order', displayId: '42', totalMinor: 1200 } }));
    await waitFor(() => expect(outbox.state).toMatchObject({ pending: 0, sending: false }));
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it('leaves a network failure pending and exposes a retry reason and deadline', async () => {
    fetchStub.mockRejectedValue(new TypeError('Failed to fetch'));
    renderHarness(session);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const order = sale();
    await act(async () => { await outbox.record(order); });
    await waitFor(() => expect(outbox.state).toMatchObject({ pending: 1, sending: false, lastRetryReason: 'network' }));
    expect(outbox.state.nextAttemptAt).toBeGreaterThan(Date.now());
    expect((await outbox.orders!.findOne(order.id).exec())?.syncStatus).toBe('pending');
  });

  it('uses the refreshed token on the automatic retry without reopening the collection', async () => {
    const order = sale();
    fetchStub.mockResolvedValueOnce(new Response(null, { status: 401 })).mockResolvedValue(applied(order));
    const view = renderHarness(session);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const collection = outbox.orders;
    await act(async () => { await outbox.record(order); });
    await waitFor(() => expect(outbox.state.lastRetryReason).toBe('unauthorized'));
    view.rerender({ ...session, token: 'refreshed-token' });
    expect(outbox.orders).toBe(collection);
    await waitFor(() => expect(outbox.recent[0]?.syncStatus).toBe('applied'), { timeout: 3000 });
    expect(fetchStub).toHaveBeenCalledTimes(2);
    expect(fetchStub.mock.calls[1][1]?.headers).toMatchObject({ Authorization: 'Bearer refreshed-token' });
    const commands = fetchStub.mock.calls.map(([, init]) => JSON.parse(init!.body as string).commands[0]);
    expect(commands.map((command) => command.id)).toEqual([order.commandId, order.commandId]);
    expect(commands.map((command) => command.attempt)).toEqual([1, 2]);
  });

  it('puts rejected responses in needs attention', async () => {
    const order = sale();
    const error = { code: 'unknown_variant', message: 'Variant was removed' };
    fetchStub.mockResolvedValue(new Response(JSON.stringify({ results: [{ id: order.commandId, status: 'rejected', error }] })));
    renderHarness(session);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    await act(async () => { await outbox.record(order); });
    await waitFor(() => expect(needsAttention(outbox.recent)).toEqual([expect.objectContaining({ id: order.id, syncStatus: 'rejected', error })]));
    await waitFor(() => expect(outbox.state.pending).toBe(0));
  });

  it('closes on sign-out and sends the preserved pending order after signing in again', async () => {
    fetchStub.mockRejectedValue(new TypeError('offline'));
    const view = renderHarness(null);
    expect(outbox.orders).toBeNull();
    expect(outbox.state).toEqual({ pending: 0, sending: false });
    await expect(outbox.record(sale())).rejects.toThrow('Orders are not ready');
    expect(fetchStub).not.toHaveBeenCalled();
    view.rerender(session);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const order = sale();
    const oldDb = outbox.orders!.database;
    await act(async () => { await outbox.record(order); });
    await waitFor(() => expect(outbox.state.lastRetryReason).toBe('network'));
    view.rerender(null);
    expect(outbox.orders).toBeNull();
    expect(outbox.recent).toEqual([]);
    expect(outbox.state).toEqual({ pending: 0, sending: false });
    await waitFor(() => expect(oldDb.closed).toBe(true));
    fetchStub.mockResolvedValue(applied(order));
    view.rerender({ ...session, token: 'signed-in-again' });
    await waitFor(() => expect(outbox.recent[0]).toMatchObject({ id: order.id, syncStatus: 'applied' }));
    expect(fetchStub.mock.lastCall?.[1]?.headers).toMatchObject({ Authorization: 'Bearer signed-in-again' });
    expect(JSON.parse(fetchStub.mock.lastCall![1]!.body as string).commands[0].id).toBe(order.commandId);
  });

  it('keeps a live list limited to the newest 50 and closes when switching stores', async () => {
    fetchStub.mockRejectedValue(new TypeError('offline'));
    const view = renderHarness(session);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const collection = outbox.orders!;
    const orders = Array.from({ length: 51 }, (_, i) => sale(new Date(2026, 0, 1, 0, i)));
    await act(async () => { await collection.bulkInsert(orders); });
    await waitFor(() => expect(outbox.recent).toHaveLength(50));
    expect(outbox.recent.map((order) => order.id)).toEqual(orders.slice(1).reverse().map((order) => order.id));
    view.rerender({ ...session, baseUrl: `${session.baseUrl}/other` });
    expect(outbox.recent).toEqual([]);
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    expect(outbox.orders).not.toBe(collection);
    expect(collection.database.closed).toBe(true);
    expect(outbox.recent).toEqual([]);
  });
});

describe('useOrderOutbox options', () => {
  function deferred<T>() {
    let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
    const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
    return { promise, resolve, reject };
  }
  function renderOptions(initial: UseOrderOutboxOptions) {
    const view = renderHook((options: UseOrderOutboxOptions) => { outbox = useOrderOutbox(options); return outbox; },
      { initialProps: initial });
    return view;
  }
  const fakeTransport = (send: CommandTransport['send']) => () => ({ send });
  const appliedResults: CommandTransport['send'] = async (batch) => ({ kind: 'results', results: batch.map((command) =>
    ({ id: command.id, status: 'applied', serverRefs: { orderId: `server-${command.id}`, totalMinor: command.payload.totalMinor } })) });

  it('records then flushes through the given transport, reporting busy while sending and idle after', async () => {
    const sending = deferred<void>();
    const send = vi.fn<CommandTransport['send']>(async (batch) => { await sending.promise; return appliedResults(batch); });
    const onBusy = vi.fn();
    const view = renderOptions({ storeKey: session.baseUrl, deviceId: 'device-7', open: openStore, transport: fakeTransport(send), onBusy });
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    expect(onBusy).toHaveBeenLastCalledWith(false);
    const order = sale();
    await act(async () => { await outbox.record(order); });
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(true));
    expect(send).toHaveBeenCalledWith([expect.objectContaining({ id: order.commandId, deviceId: 'device-7' })]);
    await act(async () => { sending.resolve(); });
    await waitFor(() => expect(outbox.recent[0]?.syncStatus).toBe('applied'));
    await waitFor(() => expect(onBusy).toHaveBeenLastCalledWith(false));
    onBusy.mockClear();
    const db = outbox.orders!.database;
    view.unmount();
    expect(onBusy).toHaveBeenCalledWith(false);
    await waitFor(() => expect(db.closed).toBe(true));
  });

  it('requeues a rejected order and resends it under a new command id; resolves to 0 before the store is ready', async () => {
    const order = sale();
    const send = vi.fn<CommandTransport['send']>()
      .mockResolvedValueOnce({ kind: 'results', results: [{ id: order.commandId, status: 'rejected', error: { code: 'unknown_variant', message: 'gone' } }] })
      .mockImplementation(appliedResults);
    const view = renderOptions({ storeKey: null, deviceId: 'register-1', open: openStore, transport: fakeTransport(send) });
    expect(await outbox.requeue()).toBe(0);
    view.rerender({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(send) });
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    await act(async () => { await outbox.record(order); });
    await waitFor(() => expect(outbox.recent[0]?.syncStatus).toBe('rejected'));
    await act(async () => { expect(await outbox.requeue([order.id])).toBe(1); });
    await waitFor(() => expect(outbox.recent[0]?.syncStatus).toBe('applied'));
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[1][0][0].id).not.toBe(order.commandId);
  });

  it('reopens when the device id changes and sends under the new one', async () => {
    const send = vi.fn<CommandTransport['send']>(appliedResults);
    const options = { storeKey: session.baseUrl, open: openStore, transport: fakeTransport(send) };
    const view = renderOptions({ ...options, deviceId: 'device-a' });
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const collection = outbox.orders!;
    view.rerender({ ...options, deviceId: 'device-b' });
    expect(outbox.orders).toBeNull();
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    expect(outbox.orders).not.toBe(collection);
    expect(collection.database.closed).toBe(true);
    await act(async () => { await outbox.record(sale()); });
    await waitFor(() => expect(send).toHaveBeenCalledWith([expect.objectContaining({ deviceId: 'device-b' })]));
  });

  it('closes and ignores a store that finishes opening after its key has changed', async () => {
    const stale = deferred<Awaited<ReturnType<typeof openStore>>>();
    const staleClose = vi.fn(async () => {});
    const open = vi.fn((key: string) => key === 'stale' ? stale.promise : openStore(key));
    const transport = vi.fn((_storeKey: string) => ({ send: appliedResults }));
    const view = renderOptions({ storeKey: 'stale', deviceId: 'register-1', open, transport });
    view.rerender({ storeKey: session.baseUrl, deviceId: 'register-1', open, transport });
    await waitFor(() => expect(outbox.orders).not.toBeNull());
    const collection = outbox.orders;
    const opened = await openStore('stale-db');
    await act(async () => { stale.resolve({ orders: opened.orders, close: staleClose }); });
    await waitFor(() => expect(staleClose).toHaveBeenCalledTimes(1));
    expect(outbox.orders).toBe(collection);
    expect(transport.mock.calls.map(([key]) => key)).toEqual([session.baseUrl]);
    await opened.close();
  });

  it('shows an order the query cache missed, once its change event arrives (RxDB 16.21.1 bug 4)', async () => {
    const opened = await openStore(session.baseUrl);
    // Poison the query `recent` runs, before the hook (which runs the identical query) ever
    // subscribes to it: a write landing while its storage read is in flight (the repro's timing)
    // never reaches it, and RxDB's query cache never heals it (a `find().$`-driven `recent`
    // would stay empty forever). A transport that never accepts: nothing else writes to the
    // collection to mask that.
    const stale = opened.orders.find({ sort: [{ createdAt: 'desc' }], limit: 50 });
    const subscription = stale.$.subscribe();
    await Promise.resolve();
    const order = sale();
    await opened.orders.insert(order);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await stale.exec()).toHaveLength(0); // the premise: this cached query stays stale
    const retryLater: CommandTransport['send'] = async () => ({ kind: 'retry', reason: 'offline', retryAfterMs: 60_000 });
    renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: async () => opened, transport: fakeTransport(retryLater) });
    await waitFor(() => expect(outbox.recent).toHaveLength(1));
    expect(outbox.recent[0]?.id).toBe(order.id);
    subscription.unsubscribe();
  });

  // complete() is idempotent for one tender (ADR-052): its retry records the order a failed save already stored.
  describe('recording an order that is already stored', () => {
    const retryLater: CommandTransport['send'] = async () => ({ kind: 'retry', reason: 'offline', retryAfterMs: 60_000 });

    it('under the same commandId gives one stored order and still flushes', async () => {
      const send = vi.fn<CommandTransport['send']>(retryLater);
      renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(send) });
      await waitFor(() => expect(outbox.orders).not.toBeNull());
      const order = sale();
      await act(async () => { await outbox.record(order); });
      await waitFor(() => expect(outbox.state).toMatchObject({ pending: 1, sending: false, lastRetryReason: 'offline' }));
      const sends = send.mock.calls.length;
      await act(async () => { await outbox.record(order); });
      await waitFor(() => expect(send).toHaveBeenCalledTimes(sends + 1));
      expect(send.mock.lastCall![0].map((command) => command.id)).toEqual([order.commandId]);
      expect(await outbox.orders!.count().exec()).toBe(1);
    });

    // Replaces #145's "under another commandId rejects": a requeue mints a new commandId (medusapos #79).
    it('under another commandId with the same content counts as stored, never overwrites it, and logs the difference at warn', async () => {
      const logged: LogEntry[] = [];
      outboxLogger.addSink({ id: 'requeued-capture', levels: ['warn', 'error'], write: (entry) => logged.push(entry) });
      try {
        const send = vi.fn<CommandTransport['send']>(retryLater);
        renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(send) });
        await waitFor(() => expect(outbox.orders).not.toBeNull());
        const order = sale();
        await act(async () => { await outbox.record(order); });
        const before = (await outbox.orders!.findOne(order.id).exec())!.toJSON();
        const retried = uuidv7();
        await act(async () => { await outbox.record({ ...order, commandId: retried }); });
        expect((await outbox.orders!.findOne(order.id).exec())!.toJSON()).toEqual(before);
        expect(await outbox.orders!.count().exec()).toBe(1);
        expect(logged).toEqual([expect.objectContaining({ level: 'warn',
          data: { orderId: order.id, storedCommandId: order.commandId, recordedCommandId: retried } })]);
      } finally {
        outboxLogger.removeSink('requeued-capture');
      }
    });

    it('with different content under the same id throws OrderContentMismatchError, and keeps the stored order', async () => {
      renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(retryLater) });
      await waitFor(() => expect(outbox.orders).not.toBeNull());
      const order = sale();
      await act(async () => { await outbox.record(order); });
      const before = (await outbox.orders!.findOne(order.id).exec())!.toJSON();
      const recording = outbox.record({ ...order, totalMinor: order.totalMinor + 100 });
      await expect(recording).rejects.toBeInstanceOf(OrderContentMismatchError);
      await expect(recording).rejects.toMatchObject({ orderId: order.id });
      expect((await outbox.orders!.findOne(order.id).exec())!.toJSON()).toEqual(before);
      expect(await outbox.orders!.count().exec()).toBe(1);
    });
  });

  describe('isStored', () => {
    const retryLater: CommandTransport['send'] = async () => ({ kind: 'retry', reason: 'offline', retryAfterMs: 60_000 });

    it('is false before the store is ready', async () => {
      renderOptions({ storeKey: null, deviceId: 'register-1', open: openStore, transport: fakeTransport(retryLater) });
      expect(await outbox.isStored(sale())).toBe(false);
    });

    it('is true for the same id and content, including after a requeue changed the commandId', async () => {
      const order = sale();
      const send = vi.fn<CommandTransport['send']>().mockResolvedValueOnce({ kind: 'results',
        results: [{ id: order.commandId, status: 'rejected', error: { code: 'unknown_variant', message: 'gone' } }] })
        .mockImplementation(retryLater);
      renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(send) });
      await waitFor(() => expect(outbox.orders).not.toBeNull());
      await act(async () => { await outbox.record(order); });
      expect(await outbox.isStored(order)).toBe(true);
      await waitFor(() => expect(outbox.recent[0]?.syncStatus).toBe('rejected'));
      await act(async () => { expect(await outbox.requeue([order.id])).toBe(1); });
      expect((await outbox.orders!.findOne(order.id).exec())!.commandId).not.toBe(order.commandId);
      expect(await outbox.isStored(order)).toBe(true);
    });

    it('is false, logged at error, for a content mismatch; false for a missing order and a deleted one', async () => {
      const logged: LogEntry[] = [];
      outboxLogger.addSink({ id: 'mismatch-capture', levels: ['error'], write: (entry) => logged.push(entry) });
      try {
        renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(retryLater) });
        await waitFor(() => expect(outbox.orders).not.toBeNull());
        const order = sale();
        await act(async () => { await outbox.record(order); });
        expect(await outbox.isStored({ ...order, totalMinor: order.totalMinor + 1 })).toBe(false);
        expect(logged).toEqual([expect.objectContaining({ level: 'error', data: { orderId: order.id } })]);
        expect(await outbox.isStored(sale())).toBe(false);
        await act(async () => { await (await outbox.orders!.findOne(order.id).exec())!.remove(); });
        expect(await outbox.isStored(order)).toBe(false);
      } finally {
        outboxLogger.removeSink('mismatch-capture');
      }
    });

    // medusapos's #85 review: a hung save's poll re-asks isStored every few seconds, and a mismatched
    // order shouldn't get a fresh error log entry on every one of those.
    it('logs a content mismatch once per order id, not on every isStored call', async () => {
      const logged: LogEntry[] = [];
      outboxLogger.addSink({ id: 'mismatch-once-capture', levels: ['error'], write: (entry) => logged.push(entry) });
      try {
        renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(retryLater) });
        await waitFor(() => expect(outbox.orders).not.toBeNull());
        const order = sale();
        await act(async () => { await outbox.record(order); });
        const mismatched = { ...order, totalMinor: order.totalMinor + 1 };
        expect(await outbox.isStored(mismatched)).toBe(false);
        expect(await outbox.isStored(mismatched)).toBe(false);
        expect(await outbox.isStored(mismatched)).toBe(false);
        expect(logged).toEqual([expect.objectContaining({ level: 'error', data: { orderId: order.id } })]);
      } finally {
        outboxLogger.removeSink('mismatch-once-capture');
      }
    });
  });

  // medusapos's #85 review: an app holds sign-out while a save is in flight, so a close under a
  // write stuck in storage never lands mid-write.
  describe('savesInFlight', () => {
    /** Gates `collection.insert` on `gate`, so a `record()` call can be observed while still in flight. */
    function gateInsert(collection: RxCollection<PosOrder>, gate: Promise<void>) {
      const original = collection.insert.bind(collection);
      collection.insert = ((doc: PosOrder) => gate.then(() => original(doc))) as unknown as typeof collection.insert;
    }

    it('is 1 while a record is in flight, and 0 once it resolves', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(appliedResults) });
      await waitFor(() => expect(outbox.orders).not.toBeNull());
      gateInsert(outbox.orders!, gate);
      expect(outbox.savesInFlight).toBe(0);
      let recording!: Promise<void>;
      act(() => { recording = outbox.record(sale()); });
      await waitFor(() => expect(outbox.savesInFlight).toBe(1));
      await act(async () => { release(); await recording; });
      expect(outbox.savesInFlight).toBe(0);
    });

    it('is 0 after a record rejects', async () => {
      renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(appliedResults) });
      await waitFor(() => expect(outbox.orders).not.toBeNull());
      const order = sale();
      await act(async () => { await outbox.record(order); });
      expect(outbox.savesInFlight).toBe(0);
      const mismatched = { ...order, totalMinor: order.totalMinor + 100 };
      await act(async () => { await expect(outbox.record(mismatched)).rejects.toBeInstanceOf(OrderContentMismatchError); });
      expect(outbox.savesInFlight).toBe(0);
    });

    it('is 2 for two concurrent records', async () => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: openStore, transport: fakeTransport(appliedResults) });
      await waitFor(() => expect(outbox.orders).not.toBeNull());
      gateInsert(outbox.orders!, gate);
      let first!: Promise<void>; let second!: Promise<void>;
      act(() => { first = outbox.record(sale()); second = outbox.record(sale()); });
      await waitFor(() => expect(outbox.savesInFlight).toBe(2));
      await act(async () => { release(); await Promise.all([first, second]); });
      expect(outbox.savesInFlight).toBe(0);
    });
  });

  it('throws the opening error from record and reports it to onOpenError', async () => {
    const failure = new Error('worker failed to start');
    const onOpenError = vi.fn();
    renderOptions({ storeKey: session.baseUrl, deviceId: 'register-1', open: () => Promise.reject(failure),
      transport: fakeTransport(appliedResults), onOpenError });
    await waitFor(() => expect(onOpenError).toHaveBeenCalledWith(failure));
    expect(outbox.orders).toBeNull();
    expect(outbox.state).toEqual({ pending: 0, sending: false });
    await expect(outbox.record(sale())).rejects.toBe(failure);
    await expect(outbox.flush()).resolves.toBeUndefined();
  });
});
