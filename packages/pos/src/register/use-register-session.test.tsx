// Ported from WCPOS `next` `3b5331b5c` `use-register-session.test.tsx` (ADR-032 amendment 1).
// Only the harness changes: memory RxDB with the real a2 collections and `pos_orders` instead of
// a mocked session store, collections and engine; a capturing sink on `registerFactsLogger`
// instead of a mocked `getLogger`. Money is minor units at exponent 2 ('100' becomes 10000), and
// actors are string ids.
//
// The source has 33 declarations: 26 `it` and 7 `it.each`. Ported (9): 'logs %s with the cashier
// only after it succeeds', 'keeps repeated %s actions as distinct audit attempts', 'logs the
// closed snapshot with its count and variance', 'records %s under movementType, not the event
// type', 'logs a void with the reversal id and the current cashier', 'does not report an open
// when its write fails', 'records a no-sale without claiming cash moved', 'passes the store
// opening day across the session writer boundary', 'derives expected locally while a movement is
// still on its way to the server'.
//
// Not ported (24), each for the reason given:
// - server figures (`server_expected`, `sync_status`; registers job c2):
//   'keeps deriving expected locally when the server permanently refused the movement',
//   'trusts the server total once every local row is delivered'.
// - movement retry and refused movements (c2): 'counts a refused movement as outstanding and
//   keeps it in the list for retry', the three `refusedMovements` tests ('outlives the session
//   it belonged to', 'ignores a refused movement belonging to another register', 'is empty once
//   the row is accepted'), 'logs a manual retry with the current cashier and the movement
//   session', 'does not log a manual retry when resetting the movement fails'.
// - refunds and refund parents (no refund model yet): 'keeps the initial empty snapshot, then
//   recomputes inserts, updates and deletion and permits server re-anchoring' (also server
//   anchoring), 'observes old held parents and later allocations without importing their sales
//   count', 'loads another session stamp referenced by this session payment allocations',
//   'deduplicates parents also returned by the recent sales query', 'requests missing stamped
//   refund parents, releases on arrival, and keeps resident parents local', 'replaces missing
//   parent demand and releases it when the session scope changes or unmounts', 'includes a
//   refund emitted during the session write, with a missing parent %s', 'derives the closure
//   before anchor clearing settles, allocation-only %s' (also server anchoring), 'waits for
//   missing refund parents before computing the closure tender', 'ignores an unrelated resident
//   parent emission while awaiting the missing parent tender', 'waits for the parent emission
//   after readiness, with same-parent replacement %s', 'follows replacement refund parent handles
//   before computing the closure tender', 'shares one close deadline across replacement refund
//   parent handles', 'queries refunds by the promoted session field and referenced ids' (also
//   the WooCommerce ledger and engine query).
// - server anchoring: 'keeps processing after anchor patch failures and derives the closure'.
// - WooCommerce ledger and credentials: 'persists closure actor names for opener $opened_by and
//   approver $approved_by (recovered: $recovered)' reads `wp_credentials` through `site.populate`
//   and renders WCPOS's receipt template; the app supplies `labels.resolveCashierName` here, and
//   the close test below checks the names it persists.
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { LogEntry } from '../logging';
import { addPosOrderCollection } from '../pos-order/open';
import type { PosOrder, PosOrderPayment } from '../pos-order/types';
import { registerFactsLogger } from './facts';
import { registerCommandCollection, registerCommandsLogger, type RegisterCommandCollection } from './register-commands';
import { readFresh } from '../rxdb';
import { ensureRegister, readRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCollection } from './schemas';
import { serverClose } from './server-close.test-helper';
import {
  closeSession,
  openSession,
  recordMovement,
  RegisterSessionRequiredError,
  RegisterMovementStrandedError,
  stampSession,
  startCounting,
  sweepOrphanStamps,
  SWEEP_GRACE_MS,
  backToSelling,
  writeClosure,
  type CashMovementCollection,
  type ClosureCollection,
  type RegisterSessionCollection,
} from './session-store';
import { RegisterApprovalRequiredError, RegisterCloseIncompleteError, RegisterSessionAlreadyOpenError, RegisterTenderInProgressError, useRegisterSession, type UseRegisterSessionOptions } from './use-register-session';

let db: RxDatabase<{
  register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection; closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>;
  register_commands: RegisterCommandCollection;
}>;
const logs: LogEntry[] = [];
const commandLogs: LogEntry[] = [];
registerCommandsLogger.addSink({ id: 'commands-capture', levels: ['error'], write: (entry) => commandLogs.push(entry) });
registerFactsLogger.addSink({ id: 'hook-capture', levels: ['debug', 'info', 'warn', 'error'], write: (e) => logs.push(e) });
const actor = { id: '7', name: 'Pat' };

beforeEach(async () => {
  logs.length = 0;
  commandLogs.length = 0;
  const created: RxDatabase = await createRxDatabase({
    name: `hook${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await created.addCollections({
    register_sessions: registerSessionCollection(),
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
    register_commands: registerCommandCollection(),
  });
  await addPosOrderCollection(created);
  db = created as unknown as typeof db;
  await ensureRegister(db.register_sessions, 'web');
});
afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await db.remove();
});

function options(overrides: Partial<UseRegisterSessionOptions> = {}): UseRegisterSessionOptions {
  return {
    sessions: db.register_sessions, movements: db.cash_movements, closures: db.closures, orders: db.pos_orders,
    register: db.register_sessions, storeKey: 'store', registerId: 'register', enabled: true, actor,
    timezone: 'UTC', softwareVersion: '1.0.0', tenderInProgress: false, ...overrides,
  };
}
function render(overrides: Partial<UseRegisterSessionOptions> = {}) {
  return renderHook((props: UseRegisterSessionOptions) => useRegisterSession(props), { initialProps: options(overrides) });
}
async function settled(overrides: Partial<UseRegisterSessionOptions> = {}) {
  const view = render(overrides);
  await waitFor(() => expect(view.result.current.session).not.toBeNull());
  return view.result;
}
function seed(openedBy = '7', registerId = 'register') {
  return openSession(db.register_sessions, {
    registerId, expectedFloatMinor: 10000, countedFloatMinor: 10000, openedBy, businessDay: { year: 2026, month: 9, day: 16 },
  });
}

describe('register commands', () => {
  const ledger = async () => (await readFresh(db.register_commands, { selector: {} })).sort((a, b) => a.seq - b.seq);
  const keys = async () => (await ledger()).map((row) => row.key);

  it.each([undefined, { orderCreate: 3 }, { orderCreate: 3, register: 0 }])(
    'records no register command without the register capability', async (capabilities) => {
      const read = vi.spyOn(db.register_commands.storageInstance, 'findDocumentsById');
      const insert = vi.spyOn(db.register_commands, 'insert');
      const { result } = render({ commands: db.register_commands, capabilities });
      await act(() => result.current.actions.openSession({ expectedFloatMinor: 10000, countedFloatMinor: 10000 }));
      await waitFor(() => expect(result.current.session?.status).toBe('open'));
      await act(() => result.current.actions.recordMovement({ type: 'paid_out', amountMinor: 700, reason: 'Milk' }));
      await act(() => result.current.actions.closeSession({ counted: { cash: 9300 } }));
      expect(read).not.toHaveBeenCalled();
      expect(insert).not.toHaveBeenCalled();
      expect(await ledger()).toStrictEqual([]);
    },
  );

  it('records every register fact as a command when the server has the register capability', async () => {
    const { result } = render({ commands: db.register_commands, capabilities: { orderCreate: 1, register: 1 } });
    let id = '';
    await act(async () => { id = (await result.current.actions.openSession({ expectedFloatMinor: 10000, countedFloatMinor: 10000 })).id; });
    const expected = [`session.open:${id}`];
    await waitFor(async () => expect(await keys()).toStrictEqual(expected));
    await waitFor(() => expect(result.current.session?.id).toBe(id));
    let movementId = '';
    await act(async () => {
      movementId = (await result.current.actions.recordMovement({ type: 'paid_out', amountMinor: 700, reason: 'Milk' })).id;
    });
    expected.push(`movement.record:${movementId}`);
    await waitFor(async () => expect(await keys()).toStrictEqual(expected));
    await act(async () => { expected.push(`movement.void:${(await result.current.actions.voidMovement(movementId)).id}`); });
    await waitFor(async () => expect(await keys()).toStrictEqual(expected));
    await act(async () => {
      const row = await result.current.actions.startCounting();
      expected.push(`session.transition:${id}:${row.status_at}`);
    });
    await waitFor(async () => expect(await keys()).toStrictEqual(expected));
    await waitFor(() => expect(result.current.session?.status).toBe('counting'));
    await act(() => result.current.actions.closeSession({ counted: { cash: 9500 }, approvedBy: 'manager' }));
    const [closed] = await db.register_sessions.storageInstance.findDocumentsById([id], false);
    expected.push(`session.transition:${id}:${closed.status_at}`, `closure.submit:${id}`);
    await waitFor(async () => expect(await keys()).toStrictEqual(expected));
    const rows = await ledger();
    expect(rows.at(-2)?.payload).toStrictEqual({ sessionId: id, status: 'closed', at: closed.status_at,
      counted: { cash: 9500 }, closedBy: '7', approvedBy: 'manager' });
    expect(rows.at(-1)?.payload.approvedBy).toBe('manager');
  });

  it('a failing reconcile never fails the register action', async () => {
    vi.spyOn(db.register_commands, 'insert').mockRejectedValue(new Error('command disk failure'));
    const { result } = render({ commands: db.register_commands, capabilities: { orderCreate: 1, register: 1 } });
    await act(async () => {
      await expect(result.current.actions.openSession({ expectedFloatMinor: 10000, countedFloatMinor: 10000 }))
        .resolves.toMatchObject({ status: 'open', counted_float_minor: 10000, opening_variance_minor: 0 });
    });
    await waitFor(() => expect(commandLogs).toContainEqual(expect.objectContaining({
      scope: 'register-commands', level: 'error', message: 'Register command reconcile failed',
      data: { context: { registerId: 'register', error: 'Error: command disk failure' } },
    })));
    expect(await ledger()).toStrictEqual([]);
    expect(await readFresh(db.register_sessions, { selector: { status: 'open' } })).toHaveLength(1);
  });

  it('a stranded movement still gets its command', async () => {
    const s = await seed();
    const result = await settled({ commands: db.register_commands, capabilities: { orderCreate: 1, register: 1 } });
    await waitFor(async () => expect(await keys()).toStrictEqual([`session.open:${s.id}`]));
    // The existing stranded-movement race: a real close between the insert and its re-read, with no Z yet.
    const insert = db.cash_movements.insert.bind(db.cash_movements);
    vi.spyOn(db.cash_movements, 'insert').mockImplementationOnce((async (doc: Parameters<typeof insert>[0]) => {
      const row = await insert(doc);
      await closeSession(db.register_sessions, s.id, { counted: { cash: 10000 }, closedBy: '7' });
      return row;
    }) as typeof insert);
    await act(async () => {
      await expect(result.current.actions.recordMovement({ type: 'paid_out', amountMinor: 700, reason: 'Milk' }))
        .rejects.toBeInstanceOf(RegisterMovementStrandedError);
    });
    const [m] = await readFresh(db.cash_movements, { selector: { session_id: s.id } });
    const [closed] = await db.register_sessions.storageInstance.findDocumentsById([s.id], false);
    await waitFor(async () => expect(await keys()).toStrictEqual([
      `session.open:${s.id}`, `movement.record:${m.id}`, `session.transition:${s.id}:${closed.status_at}`,
    ]));
  });

  it('reconciles when the capability turns on or the commands collection becomes available', async () => {
    const s = await seed();
    const view = render({ commands: db.register_commands, capabilities: { orderCreate: 1 } });
    await waitFor(() => expect(view.result.current.session?.id).toBe(s.id));
    expect(await ledger()).toStrictEqual([]);
    view.rerender(options({ commands: null, capabilities: { orderCreate: 1, register: 1 } }));
    expect(await ledger()).toStrictEqual([]);
    view.rerender(options({ commands: db.register_commands, capabilities: { orderCreate: 1, register: 1 } }));
    await waitFor(async () => expect(await keys()).toStrictEqual([`session.open:${s.id}`]));
  });
});
function movement(sessionId: string, type: 'paid_in' | 'paid_out' | 'no_sale', amountMinor: number, reason = 'Float top-up') {
  return recordMovement(db.register_sessions, db.cash_movements, db.closures, { sessionId, type, amountMinor, reason, actor: '7' });
}
/** A hand-built pending sale, stamped with `sessionId` when given: only what the hook and a closure read. */
function sale(id: string, sessionId: string | undefined, payments: Omit<PosOrderPayment, 'id'>[], extra: Partial<PosOrder> = {}) {
  const total = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return db.pos_orders.insert({
    id, commandId: `command-${id}`, createdAt: '2026-09-16T10:00:00.000Z', updatedAt: '2026-09-16T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: total, discountMinor: 0, taxMinor: 0,
    totalMinor: total, customer: null, syncStatus: 'pending', ...(sessionId ? { sessionId } : {}), cashierRef: '7',
    payments: payments.map((payment, i) => ({ ...payment, id: `${id}-payment-${i}` })), ...extra,
  });
}
/** Closes a session and writes its closure straight through the store, as an earlier day's close. */
async function closeFully(id: string) {
  const closed = await closeSession(db.register_sessions, id, { counted: { cash: 10000 } });
  return writeClosure({
    closures: db.closures, register: db.register_sessions, storeKey: 'store', session: closed, counted: 10000,
    otherTenders: {}, movements: [], orders: await db.pos_orders.find().exec(), softwareVersion: '1.0.0',
  });
}
const reservation = async () => (await readRegister(db.register_sessions))?.stores.store?.registers?.register?.closure_reservation;
const openInput = { expectedFloatMinor: null, countedFloatMinor: 10000 };
const attempt = expect.stringMatching(/^[0-9a-f]{32}$/);
const logged = (message: string, context: Record<string, unknown>) =>
  expect(logs).toContainEqual(expect.objectContaining({
    message, data: expect.objectContaining({ actor, context: expect.objectContaining(context) }),
  }));

it('derives expected locally while a movement is still on its way to the server', async () => {
  const session = await seed();
  await movement(session.id, 'paid_in', 2000);
  const result = await settled();
  await waitFor(() => expect(result.current.expected.cash).toBe(12000));
});

// Removing any of the action's log calls must lose its typed, cashier-attributed row.
it.each([
  ['openSession', 'Register session opened', 'register.session-opened'],
  ['startCounting', 'Register session counting started', 'register.counting-started'],
  ['backToSelling', 'Register session counting abandoned', 'register.counting-abandoned'],
] as const)('logs %s with the cashier only after it succeeds', async (action, message, type) => {
  if (action !== 'openSession') {
    const session = await seed();
    if (action === 'backToSelling') await startCounting(db.register_sessions, session.id);
  }
  const result = action === 'openSession' ? render().result : await settled();
  let id = '';
  await act(async () => {
    const row = action === 'openSession'
      ? await result.current.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 10000 })
      : await result.current.actions[action]();
    id = row.id;
  });
  logged(message, { type, sessionId: id, registerId: 'register' });
});

it.each(['startCounting', 'backToSelling'] as const)(
  'keeps repeated %s actions as distinct audit attempts',
  async (action) => {
    const session = await seed();
    if (action === 'backToSelling') await startCounting(db.register_sessions, session.id);
    const result = await settled();
    // The store refuses a repeated transition, so the opposite one is made directly, unlogged.
    const undo = action === 'startCounting' ? backToSelling : startCounting;
    await act(() => result.current.actions[action]());
    await undo(db.register_sessions, session.id);
    await act(() => result.current.actions[action]());
    expect(logs).toHaveLength(2);
    const ids = logs.map((entry) => (entry.data?.terminal as { operationId: string }).operationId);
    for (const id of ids) expect(id).toEqual(attempt);
    expect(new Set(ids).size).toBe(2);
  },
);

it('logs the closed snapshot with its count and variance', async () => {
  const session = await seed();
  await movement(session.id, 'paid_in', 2000);
  const result = await settled();
  let closureId = '';
  await act(async () => {
    closureId = (await result.current.actions.closeSession({ counted: { cash: 11500 } })).id;
  });
  logged('Register session closed', {
    type: 'register.session-closed', sessionId: session.id, registerId: 'register', closureId,
    counted: { cash: 11500 }, variance: { cash: -500 },
  });
});

it.each(['paid_in', 'paid_out'] as const)(
  'records %s under movementType, not the event type',
  async (movementType) => {
    const session = await seed();
    const result = await settled();
    let id = '';
    await act(async () => {
      id = (await result.current.actions.recordMovement({ type: movementType, amountMinor: 2000, reason: 'Private reason' })).id;
    });
    expect(logs).toContainEqual(expect.objectContaining({
      message: 'Register cash movement recorded',
      data: expect.objectContaining({
        actor,
        terminal: { operationId: id.replace(/-/g, '') },
        context: expect.objectContaining({
          type: 'register.movement-recorded', sessionId: session.id, registerId: 'register',
          movementId: id, movementType, amount: 2000,
        }),
      }),
    }));
    expect(JSON.stringify(logs)).not.toContain('Private reason');
  },
);

it('logs a void with the reversal id and the current cashier', async () => {
  const session = await seed();
  const target = await movement(session.id, 'paid_in', 2000);
  const result = await settled();
  let reversal = '';
  await act(async () => {
    reversal = (await result.current.actions.voidMovement(target.id)).id;
  });
  expect(reversal).not.toBe(target.id);
  logged('Register cash movement voided', {
    type: 'register.movement-voided', movementId: reversal, sessionId: session.id, registerId: 'register',
    movementType: 'void', amount: 2000, voids: target.id,
  });
});

it('does not report an open when its write fails', async () => {
  vi.spyOn(db.register_sessions, 'insert').mockRejectedValueOnce(new Error('disk'));
  const { result } = render();
  await expect(result.current.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 10000 })).rejects.toThrow('disk');
  expect(logs.filter((entry) => entry.level === 'info')).toEqual([]);
});

it('records a no-sale without claiming cash moved', async () => {
  await seed();
  const result = await settled();
  let row!: Awaited<ReturnType<typeof result.current.actions.recordMovement>>;
  await act(async () => {
    row = await result.current.actions.recordMovement({ type: 'no_sale', amountMinor: 0, reason: '' });
  });
  expect(row.type).toBe('no_sale');
  expect(logs).not.toContainEqual(expect.objectContaining({
    data: expect.objectContaining({ context: expect.objectContaining({ type: 'register.movement-recorded' }) }),
  }));
  // ...but the cashier's action is still on the audit, drawer hardware or not.
  logged('Register no-sale recorded', { type: 'register.no-sale-recorded', movementId: row.id });
});

it('passes the store opening day across the session writer boundary', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-17T01:00:00Z'));
  const { result } = render({ timezone: 'America/Los_Angeles' });
  let id = '';
  await act(async () => {
    id = (await result.current.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 10000 })).id;
  });
  expect((await db.register_sessions.findOne(id).exec())?.business_day).toBe('2026-09-16');
});

describe('the session', () => {
  it('is the open or counting one, or an interrupted close, but never a closed session with its closure', async () => {
    const session = await seed();
    const { result } = render();
    await waitFor(() => expect(result.current.session?.status).toBe('open'));
    await startCounting(db.register_sessions, session.id);
    await waitFor(() => expect(result.current.session?.status).toBe('counting'));
    // The session is closed but its closure write was interrupted: the close can finish.
    await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } });
    await waitFor(() => expect(result.current.session?.status).toBe('closed'));
    expect(result.current.session?.id).toBe(session.id);
    await act(() => result.current.actions.closeSession({ counted: { cash: 10000 } }));
    await waitFor(() => expect(result.current.session).toBeNull());
    expect(result.current.lastClosure?.id).toBe(session.id);
    expect(result.current.lastClosed?.id).toBe(session.id);
  });

  it('expects the float plus cash sales plus pay-ins minus pay-outs, from its own orders only', async () => {
    // An earlier session on this register, closed with its own sale.
    const earlier = await seed();
    await sale('earlier', earlier.id, [{ method: 'cash', amountMinor: 4444 }]);
    await closeFully(earlier.id);
    const session = await seed();
    const other = await seed('7', 'other-register');
    // A late sale (ADR-032): taken for this session but refused the stamp, so it's not its sale.
    await sale('unstamped', undefined, [{ method: 'cash', amountMinor: 8888 }], { lateSessionId: session.id });
    await sale('sale-1', session.id, [{ method: 'cash', amountMinor: 1500, tenderedMinor: 2000, changeMinor: 500 }]);
    await sale('sale-2', session.id, [{ method: 'external', amountMinor: 3000 }]);
    await sale('elsewhere', other.id, [{ method: 'cash', amountMinor: 9999 }]);
    await movement(session.id, 'paid_in', 2000);
    await movement(session.id, 'paid_out', 500);
    await movement(other.id, 'paid_in', 7777);
    const result = await settled();
    await waitFor(() => expect(result.current.expected).toEqual({ cash: 13000, external: 3000 }));
    expect(result.current.salesCount).toBe(2);
    expect(result.current.movements).toHaveLength(2);
  });

  it('is offered to the sale only while it is open or counting', async () => {
    const { result } = render();
    await waitFor(() => expect(result.current.saleSession).toBeUndefined());
    const session = await seed();
    await waitFor(() => expect(result.current.saleSession).toEqual({ id: session.id, sessions: db.register_sessions }));
    await startCounting(db.register_sessions, session.id);
    await waitFor(() => expect(result.current.session?.status).toBe('counting'));
    expect(result.current.saleSession?.id).toBe(session.id);
    await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } });
    await waitFor(() => expect(result.current.session?.status).toBe('closed'));
    expect(result.current.saleSession).toBeUndefined();
  });

  it('requires an open session unless sessions are off', async () => {
    const { result } = render();
    await expect(result.current.requireOpen()).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    const session = await seed();
    await expect(result.current.requireOpen()).resolves.toBe(session.id);
    await startCounting(db.register_sessions, session.id);
    await expect(result.current.requireOpen()).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } });
    await expect(result.current.requireOpen()).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    await expect(render({ enabled: false }).result.current.requireOpen()).resolves.toBeNull();
  });

  it('requireSaleSession returns the open session\'s id and collection, like requireOpen', async () => {
    const { result } = render();
    await expect(result.current.requireSaleSession()).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    const session = await seed();
    await session.incrementalPatch({ server_expected: { cash: 10000 }, server_sales_count: 2 });
    await expect(result.current.requireSaleSession()).resolves.toEqual({ id: session.id, sessions: db.register_sessions });
    // The server anchor is cleared, as requireOpen clears it (checked before requireOpen runs).
    expect((await db.register_sessions.findOne(session.id).exec())!.toJSON()).toMatchObject({ server_expected: null, server_sales_count: null });
    await expect(result.current.requireOpen()).resolves.toBe(session.id);
    await expect(render({ enabled: false }).result.current.requireSaleSession()).resolves.toBeNull();
  });

  it('is off with enabled false', async () => {
    await seed();
    const { result } = render({ enabled: false });
    // Give the collections a chance to emit: nothing may appear.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.session).toBeNull();
    expect(result.current.saleSession).toBeUndefined();
    await expect(result.current.requireOpen()).resolves.toBeNull();
  });
});

describe('a sale at tender', () => {
  it('blocks counting and closing before any write, and lets them through once it is done', async () => {
    const session = await seed();
    const view = render({ tenderInProgress: true });
    await waitFor(() => expect(view.result.current.session).not.toBeNull());
    const before = session.getLatest().toJSON();
    await expect(view.result.current.actions.startCounting()).rejects.toBeInstanceOf(RegisterTenderInProgressError);
    await expect(view.result.current.actions.closeSession({ counted: { cash: 10000 } }))
      .rejects.toThrow('Finish or cancel the sale in progress first.');
    expect((await db.register_sessions.findOne(session.id).exec())?.toJSON()).toEqual(before);
    expect(await db.closures.find().exec()).toEqual([]);
    view.rerender(options({ tenderInProgress: false }));
    await act(() => view.result.current.actions.startCounting());
    expect(session.getLatest().status).toBe('counting');
    await act(() => view.result.current.actions.closeSession({ counted: { cash: 10000 } }));
    expect(session.getLatest().status).toBe('closed');
    expect(await db.closures.findOne(session.id).exec()).not.toBeNull();
  });

  it('is seen by actions captured before it started', async () => {
    const session = await seed();
    const view = render();
    await waitFor(() => expect(view.result.current.session).not.toBeNull());
    const { closeSession: close, startCounting: count } = view.result.current.actions;
    view.rerender(options({ tenderInProgress: true }));
    await expect(close({ counted: { cash: 10000 } })).rejects.toBeInstanceOf(RegisterTenderInProgressError);
    await expect(count()).rejects.toBeInstanceOf(RegisterTenderInProgressError);
    expect(session.getLatest().status).toBe('open');
    expect(await db.closures.find().exec()).toEqual([]);
  });
});

// TallyUI (approved-by, ADR-032): the hook is the approval gate as well as RegisterCount, and the
// approver reaches the Z. The float is 10000 with no sales, so expected cash is 10000.
describe('the approval gate', () => {
  const counting = async (overrides: Partial<UseRegisterSessionOptions> = {}) => {
    const session = await seed();
    await startCounting(db.register_sessions, session.id);
    const result = await settled({ varianceThreshold: 500, ...overrides });
    await waitFor(() => expect(result.current.expected.cash).toBe(10000));
    return { session, result };
  };

  // Revert: drop the hook's gate.
  it.each([false, true])('refuses an over-threshold close without approvedBy before any write (blind: %s)', async (blind) => {
    const { session, result } = await counting({ blind });
    const before = session.getLatest().toJSON();
    await expect(result.current.actions.closeSession({ counted: { cash: 9000 } })).rejects.toBeInstanceOf(RegisterApprovalRequiredError);
    await expect(result.current.actions.closeSession({ counted: { cash: 9000 } }))
      .rejects.toThrow('Manager approval needed. Ask a manager to approve, or count again.');
    const stored = (await db.register_sessions.findOne(session.id).exec())?.toJSON();
    expect(stored).toEqual(before);
    expect(stored?.status).toBe('counting');
    expect(await db.closures.find().exec()).toEqual([]);
    expect(await reservation()).toBeUndefined();
    expect((await readRegister(db.register_sessions))?.stores.store?.registers?.register?.last_closure_number ?? 0).toBe(0);
  });

  it('puts approvedBy and approvedByName on the Z, and logs approval-granted', async () => {
    const { session, result } = await counting();
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash: 9000 }, approvedBy: 'mgr-1', approvedByName: 'Morgan Lee' });
    });
    expect(closure.breakdowns).toMatchObject({ approved_by: 'mgr-1', approved_by_name: 'Morgan Lee' });
    expect((await db.register_sessions.findOne(session.id).exec())?.approved_by).toBe('mgr-1');
    logged('Register session approval granted', { type: 'register.approval-granted', sessionId: session.id, approvedBy: 'mgr-1' });
  });

  it("names the approver through labels.resolveCashierName when the close gives no approvedByName", async () => {
    const { result } = await counting({ labels: { resolveCashierName: (id) => (id === 'mgr-1' ? 'Morgan Lee' : id) } });
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash: 9000 }, approvedBy: 'mgr-1' });
    });
    expect(closure.breakdowns).toMatchObject({ approved_by: 'mgr-1', approved_by_name: 'Morgan Lee' });
  });

  it.each([
    ['under the threshold', { varianceThreshold: 500 }, 9500],
    ['with no threshold', { varianceThreshold: undefined }, 1],
  ] as const)('closes %s without approval, leaving approved_by unset', async (_, overrides, cash) => {
    const { session, result } = await counting(overrides);
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash } });
    });
    expect(closure.breakdowns).toMatchObject({ approved_by: null, approved_by_name: '' });
    expect((await db.register_sessions.findOne(session.id).exec())?.toJSON().approved_by).toBeUndefined();
    expect(logs.some((entry) => entry.message === 'Register session approval granted')).toBe(false);
  });

  // #168 review: the gate reads the Z's own inputs, not the render's `expected`.
  // Revert: gate on the snapshot `expected` again.
  it('gates on a sale stored after the actions were rendered, not on their stale expected', async () => {
    const { session, result } = await counting();
    const { closeSession: close } = result.current.actions;
    // Stored straight to the database, with no wait for the hook to see it.
    await sale('late-cash', session.id, [{ method: 'cash', amountMinor: 1000 }]);
    await expect(close({ counted: { cash: 10000 } })).rejects.toBeInstanceOf(RegisterApprovalRequiredError);
    expect(await db.closures.find().exec()).toEqual([]);
    expect((await db.register_sessions.findOne(session.id).exec())?.status).toBe('counting');
    expect(await reservation()).toBeUndefined();
  });

  // #168 review: a close already stored as closed is a resumed close, whatever the render says.
  // Revert: gate on the snapshot `open.status`.
  it('lets a retry through stale actions finish a close interrupted after it was stored as closed', async () => {
    const { session, result } = await counting();
    const { closeSession: close } = result.current.actions;
    // The till dies at the first register-document read after the closure row exists: `advancePerpetual`.
    const getLocal = db.register_sessions.getLocal.bind(db.register_sessions);
    vi.spyOn(db.register_sessions, 'getLocal').mockImplementation((async (id: string) => {
      if ((await db.closures.storageInstance.findDocumentsById([session.id], false)).length) throw new Error('killed');
      return getLocal(id);
    }) as typeof getLocal);
    await expect(close({ counted: { cash: 9000 }, approvedBy: 'mgr-1' })).rejects.toThrow('killed');
    vi.restoreAllMocks();
    expect(await reservation()).toMatchObject({ applied: false });
    // At once, through the actions rendered while the session was counting, with no approver.
    const closure = await close({ counted: { cash: 9000 } });
    expect(closure.toJSON()).toMatchObject({ id: session.id, counted: { cash: 9000 }, breakdowns: { approved_by: 'mgr-1' } });
    expect(await reservation()).toMatchObject({ applied: true });
    expect((await db.register_sessions.findOne(session.id).exec())?.approved_by).toBe('mgr-1');
  });

  it('does not gate a resumed close again, and keeps its approver', async () => {
    const session = await seed();
    await closeSession(db.register_sessions, session.id, { counted: { cash: 9000 }, approvedBy: 'mgr-1' });
    const result = await settled({ varianceThreshold: 500 });
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash: 9000 } });
    });
    expect(closure.breakdowns.approved_by).toBe('mgr-1');
  });
});

describe('a null register host (its collection still opening)', () => {
  it('renders no session, and every action refuses', async () => {
    await seed();
    const { result } = render({ register: null });
    // Give the collections a chance to emit: nothing may appear.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(result.current.session).toBeNull();
    const { actions } = result.current;
    await expect(actions.openSession(openInput)).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    await expect(actions.startCounting()).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    await expect(actions.closeSession({ counted: { cash: 10000 } })).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    await expect(actions.recordMovement({ type: 'paid_in', amountMinor: 100, reason: 'x' })).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    expect(await db.closures.find().exec()).toEqual([]);
  });

  // #168 review: `live()` runs before `requireOpen`, whose gate clears the server figures.
  // Revert: call `requireOpen()` before `live()` again.
  it('refuses a movement before requireOpen writes to the session', async () => {
    const session = await seed();
    await session.incrementalPatch({ server_expected: { cash: 10000 }, server_sales_count: 2 });
    const before = (await db.register_sessions.findOne(session.id).exec())!.toJSON(true);
    const { result } = render({ register: null });
    await expect(result.current.actions.recordMovement({ type: 'paid_in', amountMinor: 100, reason: 'x' }))
      .rejects.toBeInstanceOf(RegisterSessionRequiredError);
    expect((await db.register_sessions.findOne(session.id).exec())!.toJSON(true)).toEqual(before);
    expect(await db.cash_movements.find().exec()).toEqual([]);
  });
});

describe('a second open', () => {
  it.each(['open', 'counting'] as const)('is refused while the register has a session that is %s', async (status) => {
    const session = await seed();
    if (status === 'counting') await startCounting(db.register_sessions, session.id);
    // Straight after the seed: the refusal must not depend on the rendered snapshot.
    const { result } = render();
    await expect(result.current.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 10000 }))
      .rejects.toThrow(new RegisterSessionAlreadyOpenError().message);
    expect(await db.register_sessions.find().exec()).toHaveLength(1);
    expect(logs).toEqual([]);
  });

  it('is refused on a double tap, which opens exactly one session', async () => {
    const { result } = render();
    const { openSession: open } = result.current.actions;
    let outcomes!: PromiseSettledResult<unknown>[];
    await act(async () => {
      outcomes = await Promise.allSettled([
        open({ expectedFloatMinor: null, countedFloatMinor: 10000 }),
        open({ expectedFloatMinor: null, countedFloatMinor: 10000 }),
      ]);
    });
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
    expect((outcomes[1] as PromiseRejectedResult).reason).toBeInstanceOf(RegisterSessionAlreadyOpenError);
    expect(await db.register_sessions.find({ selector: { register_id: 'register' } }).exec()).toHaveLength(1);
  });

  it('is refused from a second hook instance for the same register', async () => {
    const one = render();
    const two = render();
    let outcomes!: PromiseSettledResult<unknown>[];
    await act(async () => {
      outcomes = await Promise.allSettled([one.result.current.actions.openSession(openInput), two.result.current.actions.openSession(openInput)]);
    });
    expect(outcomes.map((outcome) => outcome.status)).toEqual(['fulfilled', 'rejected']);
    expect((outcomes[1] as PromiseRejectedResult).reason).toBeInstanceOf(RegisterSessionAlreadyOpenError);
    expect(await db.register_sessions.find({ selector: { register_id: 'register' } }).exec()).toHaveLength(1);
  });
});

describe('an interrupted close', () => {
  // Each ends with the first session's close finished, then a new session opening.
  async function finish(result: { current: ReturnType<typeof useRegisterSession> }, id: string) {
    await expect(result.current.actions.openSession(openInput)).rejects.toBeInstanceOf(RegisterCloseIncompleteError);
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    // The retry's count is ignored: the close resumes with the count persisted on the session.
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash: 1 } });
    });
    expect(closure.toJSON()).toMatchObject({ id, number: 1, counted: { cash: 11500 }, order_ids: ['a-sale'], variance: { cash: 0 } });
    expect(await reservation()).toMatchObject({ applied: true });
    expect((await readRegister(db.register_sessions))?.stores.store.registers?.register.perpetual_sales_total_minor).toBe(1500);
    await waitFor(() => expect(result.current.session).toBeNull());
    await act(() => result.current.actions.openSession(openInput));
    await waitFor(() => expect(result.current.session?.status).toBe('open'));
  }

  it('at the closure insert blocks a new open, and finishes on the next close', async () => {
    const a = await seed();
    await sale('a-sale', a.id, [{ method: 'cash', amountMinor: 1500 }]);
    const result = await settled();
    vi.spyOn(db.closures, 'insert').mockRejectedValueOnce(new Error('killed'));
    await expect(result.current.actions.closeSession({ counted: { cash: 11500 } })).rejects.toThrow('killed');
    vi.restoreAllMocks();
    expect(await db.closures.storageInstance.findDocumentsById([a.id], false)).toEqual([]);
    expect(await reservation()).toMatchObject({ applied: false });
    await waitFor(() => expect(result.current.session?.status).toBe('closed'));
    await finish(result, a.id);
  });

  it('after the closure insert, before the totals, stays current, blocks a new open, and finishes on the next close', async () => {
    const a = await seed();
    await sale('a-sale', a.id, [{ method: 'cash', amountMinor: 1500 }]);
    const result = await settled();
    // The till dies at the first register-document read after the closure row exists: `advancePerpetual`.
    const getLocal = db.register_sessions.getLocal.bind(db.register_sessions);
    vi.spyOn(db.register_sessions, 'getLocal').mockImplementation((async (id: string) => {
      if ((await db.closures.storageInstance.findDocumentsById([a.id], false)).length) throw new Error('killed');
      return getLocal(id);
    }) as typeof getLocal);
    await expect(result.current.actions.closeSession({ counted: { cash: 11500 } })).rejects.toThrow('killed');
    vi.restoreAllMocks();
    expect(await db.closures.storageInstance.findDocumentsById([a.id], false)).toHaveLength(1);
    expect(await reservation()).toMatchObject({ applied: false });
    // Its closure row exists, but the unapplied reservation names it, so it is still current.
    await waitFor(() => expect(result.current.session?.id).toBe(a.id));
    await finish(result, a.id);
  });

  it('with no reservation yet resumes with the persisted count, not the retry\'s', async () => {
    const session = await seed();
    await closeSession(db.register_sessions, session.id, { counted: { cash: 10000 } });
    const result = await settled();
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash: 5 } });
    });
    expect(closure.counted).toEqual({ cash: 10000 });
  });
});

it('freezes a sale and a movement that RxDB\'s query cache missed (RxDB 16.21.1, bug 4)', async () => {
  const session = await seed();
  // A document written a microtask after its query first subscribes never reaches that query.
  const orders = db.pos_orders.find({ selector: { sessionId: session.id } });
  const moves = db.cash_movements.find({ selector: { session_id: session.id } });
  const subscriptions = [orders.$.subscribe()];
  await Promise.resolve();
  await sale('missed', session.id, [{ method: 'cash', amountMinor: 100 }]);
  subscriptions.push(moves.$.subscribe());
  await Promise.resolve();
  await db.cash_movements.insert({
    id: 'missed-move', session_id: session.id, type: 'paid_out', amountMinor: 30, reason: 'Milk', created_at_gmt: '2026-09-16T10:00:00.000Z',
  });
  await new Promise((resolve) => setTimeout(resolve, 50));
  // The precondition: the cached queries are stale (if RxDB fixes this, these fail first).
  expect(await orders.exec()).toHaveLength(0);
  expect(await moves.exec()).toHaveLength(0);
  const result = await settled();
  let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
  await act(async () => {
    closure = await result.current.actions.closeSession({ counted: { cash: 10070 } });
  });
  expect(closure.toJSON()).toMatchObject({
    order_ids: ['missed'], movement_ids: ['missed-move'], till_expected: { cash: 10070 }, variance: { cash: 0 },
  });
  subscriptions.forEach((subscription) => subscription.unsubscribe());
});

it('counts a sale the query cache missed, once its change event arrives, in live salesCount and expected (RxDB 16.21.1 bug 4)', async () => {
  const session = await seed();
  // A second, separately-created query for the same selector the hook's own orders query uses: a
  // write landing while its storage read is in flight (the repro's timing) never reaches it, and
  // RxDB's query cache never heals it (a `find().$`-driven `salesCount`/`expected` would stay 0).
  const stale = db.pos_orders.find({ selector: { sessionId: session.id } });
  const subscription = stale.$.subscribe();
  await Promise.resolve();
  await sale('missed', session.id, [{ method: 'cash', amountMinor: 4200 }]);
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(await stale.exec()).toHaveLength(0); // the premise: this cached query stays stale
  const result = await settled();
  await waitFor(() => expect(result.current.salesCount).toBe(1));
  // The float (10000, from `seed()`) plus the missed sale's cash.
  expect(result.current.expected).toEqual({ cash: 14200 });
  subscription.unsubscribe();
});

it('logs a double-tapped close once', async () => {
  await seed();
  const result = await settled();
  const { closeSession: close } = result.current.actions;
  let closed!: Awaited<ReturnType<typeof close>>[];
  await act(async () => {
    closed = await Promise.all([close({ counted: { cash: 10000 } }), close({ counted: { cash: 10000 } })]);
  });
  expect(closed[1].id).toBe(closed[0].id);
  expect(await db.closures.find().exec()).toHaveLength(1);
  expect(logs.filter((entry) => entry.message === 'Register session closed')).toHaveLength(1);
});

// TallyUI (close-in-flight): `closeSession` stores the session closed before its closure lands,
// so a second close (a tap on the Finish-closing card, say) joins the one in flight.
describe('one close in flight per register', () => {
  /** Holds every closure insert until `release()`, counting them. */
  function holdInserts() {
    const insert = db.closures.insert.bind(db.closures);
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const spy = vi.spyOn(db.closures, 'insert').mockImplementation((async (row: Parameters<typeof insert>[0]) => {
      await gate;
      return insert(row);
    }) as typeof insert);
    return { spy, release };
  }
  const closureNumber = async () => (await readRegister(db.register_sessions))?.stores.store?.registers?.register?.last_closure_number ?? 0;

  it.each(['one hook', 'two hook instances'])('two overlapping closes of one register make one closure with one number (%s)', async (mode) => {
    await seed();
    const one = await settled();
    const two = mode === 'one hook' ? one : await settled();
    const before = await closureNumber();
    const { spy, release } = holdInserts();
    const first = one.current.actions.closeSession({ counted: { cash: 10000 } });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
    // Not awaiting the first: the joining call's count is ignored.
    const second = two.current.actions.closeSession({ counted: { cash: 12345 } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    release();
    let closed!: Awaited<typeof first>[];
    await act(async () => {
      closed = await Promise.all([first, second]);
    });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(closed[1].id).toBe(closed[0].id);
    expect(closed[1].number).toBe(closed[0].number);
    expect(closed[0].counted).toEqual({ cash: 10000 });
    expect(await db.closures.find().exec()).toHaveLength(1);
    expect(await closureNumber()).toBe(before + 1);
    expect(logs.filter((entry) => entry.message === 'Register session closed')).toHaveLength(1);
  });

  it('closing is true while a close is in flight, and false after', async () => {
    await seed();
    const result = await settled();
    const other = render();
    const elsewhere = render({ registerId: 'elsewhere' });
    expect(result.current.closing).toBe(false);
    const { spy, release } = holdInserts();
    const close = result.current.actions.closeSession({ counted: { cash: 10000 } });
    await waitFor(() => expect(spy).toHaveBeenCalled());
    // The session is already stored closed, its closure held: the state the card used to flash in.
    await waitFor(() => expect(result.current.session?.status).toBe('closed'));
    expect(result.current.closing).toBe(true);
    expect(other.result.current.closing).toBe(true);
    expect(elsewhere.result.current.closing).toBe(false);
    release();
    await act(() => close);
    expect(result.current.closing).toBe(false);
    expect(other.result.current.closing).toBe(false);
  });

  it('a failed close leaves closing false, so the Finish-closing card can show', async () => {
    const session = await seed();
    const result = await settled();
    vi.spyOn(db.closures, 'insert').mockRejectedValueOnce(new Error('killed'));
    await act(async () => {
      await expect(result.current.actions.closeSession({ counted: { cash: 10000 } })).rejects.toThrow('killed');
    });
    await waitFor(() => expect(result.current.session?.status).toBe('closed'));
    expect(result.current.session?.id).toBe(session.id);
    expect(result.current.closing).toBe(false);
    expect(await db.closures.find().exec()).toEqual([]);
  });
});

it('writes the closure once, and a repeated close returns the same closure', async () => {
  const session = await seed('8');
  await sale('sale-1', session.id, [{ method: 'cash', amountMinor: 1500 }, { method: 'external', amountMinor: 500 }]);
  const result = await settled({ labels: { registerName: 'Front', resolveCashierName: (id) => (id === '8' ? 'Alex' : id) } });
  // A retry from the same screen, after the first close re-rendered the hook.
  const { closeSession: close } = result.current.actions;
  let first!: Awaited<ReturnType<typeof close>>;
  let second!: Awaited<ReturnType<typeof close>>;
  await act(async () => {
    first = await close({ counted: { cash: 11500, external: 500 } });
    second = await close({ counted: { cash: 11500, external: 500 } });
  });
  expect(second.toJSON()).toEqual(first.toJSON());
  expect(await db.closures.find().exec()).toHaveLength(1);
  expect(first.toJSON()).toMatchObject({
    number: 1, counted: { cash: 11500, external: 500 }, till_expected: { cash: 11500, external: 500 },
    period_sales_total_minor: 2000, software_version: '1.0.0', order_ids: ['sale-1'],
    breakdowns: { register_name: 'Front', opened_by_name: 'Alex', closed_by_name: 'Pat', approved_by_name: '' },
  });
  const register = await readRegister(db.register_sessions);
  expect(register?.stores.store.registers?.register.perpetual_sales_total_minor).toBe(2000);
});

it('is overdue after the close time while open, and not while counting', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(2026, 8, 25, 12, 0));
  const session = await seed();
  const early = await settled({ expectedCloseTime: '13:00' });
  expect(early.current.overdue).toBe(false);
  cleanup();
  const result = await settled({ expectedCloseTime: '11:00' });
  expect(result.current.overdue).toBe(true);
  await startCounting(db.register_sessions, session.id);
  await waitFor(() => expect(result.current.session?.status).toBe('counting'));
  expect(result.current.overdue).toBe(false);
});

// ADR-032 (the #156 review): `stampSession`'s check and the app's insert aren't atomic, so a close
// can freeze its closure between them. The sweep makes such an order a late sale, and never
// touches the closure or an order it counts.
describe('the orphan-stamp sweep', () => {
  const lateFacts = () => logs.filter((entry) => (entry.data?.context as { type?: string })?.type === 'register.late-sale');
  const stored = async (id: string) => (await db.pos_orders.storageInstance.findDocumentsById([id], false))[0];
  const storedJson = async (ids: string[]) => Promise.all(ids.map(async (id) => JSON.stringify(await stored(id))));
  const storedClosure = async (id: string) => JSON.stringify((await db.closures.storageInstance.findDocumentsById([id], false))[0]);
  const target = () => ({
    sessions: db.register_sessions, closures: db.closures, orders: db.pos_orders, registerId: 'register',
    register: db.register_sessions, storeKey: 'store',
  });
  const cash = [{ method: 'cash' as const, amountMinor: 1500 }];
  /** A server close, then its closure, frozen from the orders stored by then. */
  async function closedOnServer(id: string) {
    await serverClose(db.register_sessions, id);
    const [session] = await db.register_sessions.storageInstance.findDocumentsById([id], false);
    return writeClosure({
      closures: db.closures, register: db.register_sessions, storeKey: 'store', session, counted: 10000,
      otherTenders: {}, movements: [], orders: await readFresh(db.pos_orders, {}), softwareVersion: '1.0.0',
    });
  }

  // Revert: drop the sweep on start.
  it('makes a sale stamped before a server close, and stored after its closure, a late sale on the next start', async () => {
    const session = await seed();
    const stamped = await stampSession({ id: 'orphan' } as PosOrder, session.id, db.register_sessions);
    await closedOnServer(session.id); // while the app is closed: the Z freezes without the sale
    await sale('orphan', stamped.sessionId, cash); // then the insert lands
    const frozen = await storedClosure(session.id);
    render(); // the restart
    await waitFor(async () => expect((await stored('orphan'))?.lateSessionId).toBe(session.id));
    expect(await stored('orphan')).not.toHaveProperty('sessionId');
    expect(lateFacts()).toEqual([expect.objectContaining({
      level: 'warn',
      data: expect.objectContaining({ actor: { id: '7', name: '' }, context: { type: 'register.late-sale', orderId: 'orphan', sessionId: session.id, registerId: 'register' } }),
    })]);
    expect(await storedClosure(session.id)).toBe(frozen);
  });

  // Revert: sweep every stamped order of a closed session with a closure, listed or not.
  it('never touches a sale its closure counts: at start, after a close, or on a repeat sweep', async () => {
    const session = await seed();
    await sale('legit', session.id, cash);
    const before = await storedJson(['legit']);
    const result = await settled();
    await act(() => result.current.actions.closeSession({ counted: { cash: 11500 } }));
    expect((await db.closures.findOne(session.id).exec())?.order_ids).toEqual(['legit']);
    expect(await storedJson(['legit'])).toEqual(before);
    expect(await sweepOrphanStamps(target())).toEqual([]);
    cleanup();
    render(); // a restart
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(await storedJson(['legit'])).toEqual(before);
    expect(lateFacts()).toEqual([]);
  });

  it("never touches an order whose session's closure isn't written, a late order, or another register's order", async () => {
    const unwrittenClosure = await seed();
    await sale('unclosed', unwrittenClosure.id, cash);
    await serverClose(db.register_sessions, unwrittenClosure.id);
    const closed = await seed();
    await closedOnServer(closed.id);
    await sale('already-late', undefined, cash, { lateSessionId: closed.id });
    const elsewhere = await seed('7', 'other-register');
    await closedOnServer(elsewhere.id);
    await sale('elsewhere', elsewhere.id, cash);
    await sale('orphan', closed.id, cash); // the control: this one is swept
    const untouched = ['unclosed', 'already-late', 'elsewhere'];
    const before = await storedJson(untouched);
    expect(await sweepOrphanStamps(target())).toEqual(['orphan']);
    expect(await storedJson(untouched)).toEqual(before);
    expect(lateFacts()).toHaveLength(1);
  });

  it('patches an orphan once, with one fact, however many sweeps run', async () => {
    const session = await seed();
    await closedOnServer(session.id);
    await sale('orphan', session.id, cash);
    const runs = await Promise.all([sweepOrphanStamps(target()), sweepOrphanStamps(target())]);
    expect(runs.flat()).toEqual(['orphan']);
    expect(await sweepOrphanStamps(target())).toEqual([]);
    expect(await stored('orphan')).toMatchObject({ lateSessionId: session.id });
    expect(lateFacts()).toHaveLength(1);
  });

  it('sweeps a sale stored after the close read its orders, before that close returns', async () => {
    const session = await seed();
    const stamped = await stampSession({ id: 'raced' } as PosOrder, session.id, db.register_sessions);
    const result = await settled();
    // The insert lands after `writeClosure` read the orders, just before its closure row.
    const insert = db.closures.insert.bind(db.closures);
    vi.spyOn(db.closures, 'insert').mockImplementationOnce((async (row: Parameters<typeof insert>[0]) => {
      await sale('raced', stamped.sessionId, cash);
      return insert(row);
    }) as typeof insert);
    let closure!: Awaited<ReturnType<typeof result.current.actions.closeSession>>;
    await act(async () => {
      closure = await result.current.actions.closeSession({ counted: { cash: 10000 } });
    });
    expect(closure.order_ids).toEqual([]);
    expect(await stored('raced')).toMatchObject({ lateSessionId: session.id });
    expect(await stored('raced')).not.toHaveProperty('sessionId');
    expect(lateFacts()).toHaveLength(1);
  });

  // TallyUI (the #158 follow-ups): bounded by `swept_closure_ids` on the register document, so a
  // closure past the grace and already checked costs no `pos_orders` query. Revert: drop the
  // swept-set filter (sweep every closure every time).
  it('queries pos_orders only for a closure past the grace it has not swept before', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const first = await seed();
    await closedOnServer(first.id);
    await sale('orphan-1', first.id, cash);
    expect(await sweepOrphanStamps(target())).toEqual(['orphan-1']); // within the grace: unswept still
    vi.setSystemTime(Date.now() + SWEEP_GRACE_MS + 1); // first's closure is now past the grace
    expect(await sweepOrphanStamps(target())).toEqual([]); // this sweep marks it swept
    const second = await seed();
    await closedOnServer(second.id);
    await sale('orphan-2', second.id, cash);
    const query = vi.spyOn(db.pos_orders.storageInstance, 'query');
    // first's closure costs nothing (swept); second's is new, so it is queried, but is still
    // within its own grace and so stays unswept.
    expect(await sweepOrphanStamps(target())).toEqual(['orphan-2']);
    expect(query).toHaveBeenCalledTimes(1);
    query.mockClear();
    vi.setSystemTime(Date.now() + SWEEP_GRACE_MS + 1); // second's closure is now past the grace too
    expect(await sweepOrphanStamps(target())).toEqual([]); // this sweep marks it swept
    query.mockClear();
    expect(await sweepOrphanStamps(target())).toEqual([]); // both closures are swept and past the grace
    expect(query).not.toHaveBeenCalled();
  });

  // TallyUI (the #158 follow-ups): a crash between the patch and the swept-set write (never here:
  // the write is the last step) leaves the next sweep re-checking that closure; the patch is
  // idempotent, so it patches nothing twice and logs no second fact. Revert: write the swept set
  // before the patch loop.
  it('re-checks a closure after a crash before the swept-set write, without patching twice', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const session = await seed();
    await closedOnServer(session.id);
    await sale('crash-orphan', session.id, cash);
    vi.setSystemTime(Date.now() + SWEEP_GRACE_MS + 1); // past the grace: this sweep tries to mark it swept
    const getLocal = db.register_sessions.getLocal.bind(db.register_sessions);
    let calls = 0;
    vi.spyOn(db.register_sessions, 'getLocal').mockImplementation((async (id: string) => {
      calls += 1;
      if (calls === 2) throw new Error('killed'); // the second call is markClosuresSwept's write
      return getLocal(id);
    }) as typeof getLocal);
    await expect(sweepOrphanStamps(target())).rejects.toThrow('killed');
    vi.restoreAllMocks();
    expect(await stored('crash-orphan')).toMatchObject({ lateSessionId: session.id });
    expect(lateFacts()).toHaveLength(1);
    expect(await sweepOrphanStamps(target())).toEqual([]); // re-checked, patched nothing twice
    expect(lateFacts()).toHaveLength(1);
  });

  // TallyUI (the #158 follow-ups): `closeSession` awaits its own sweep, however slow, before its
  // promise resolves. Revert: drop `await sweep()` in `closeSession`.
  it("closeSession awaits its own sweep before its promise resolves", async () => {
    const session = await seed();
    const stamped = await stampSession({ id: 'slow' } as PosOrder, session.id, db.register_sessions);
    const result = await settled();
    const insert = db.closures.insert.bind(db.closures);
    vi.spyOn(db.closures, 'insert').mockImplementationOnce((async (row: Parameters<typeof insert>[0]) => {
      await sale('slow', stamped.sessionId, cash);
      return insert(row);
    }) as typeof insert);
    const findOne = db.pos_orders.findOne.bind(db.pos_orders);
    vi.spyOn(db.pos_orders, 'findOne').mockImplementation(((id: string) => {
      const query = findOne(id);
      if (id !== 'slow') return query;
      const exec = query.exec.bind(query);
      query.exec = (() => new Promise((resolve) => setTimeout(() => resolve(exec()), 20))) as typeof query.exec;
      return query;
    }) as typeof findOne);
    await act(async () => {
      await result.current.actions.closeSession({ counted: { cash: 10000 } });
    });
    // Checked the instant closeSession's promise resolves, with no waitFor: a dropped `await`
    // would let this run before the delayed patch lands.
    expect(await stored('slow')).toMatchObject({ lateSessionId: session.id });
  });

  // TallyUI (the #158 follow-ups, the hole the bound left open): a closure isn't marked swept
  // until it is past the grace, so an insert racing the close that lands only after the post-close
  // sweep already ran and found nothing is still caught by the next sweep. Revert: mark closures
  // swept immediately, with no grace.
  it('catches an order whose insert lands only after the post-close sweep already ran and found nothing', async () => {
    const session = await seed();
    const stamped = await stampSession({ id: 'race' } as PosOrder, session.id, db.register_sessions);
    await closedOnServer(session.id); // the closure freezes with no orders
    expect(await sweepOrphanStamps(target())).toEqual([]); // the post-close sweep: finds nothing, marks nothing
    await sale('race', stamped.sessionId, cash); // the insert lands only now
    expect(await sweepOrphanStamps(target())).toEqual(['race']); // still unswept: the next sweep catches it
    expect(await stored('race')).toMatchObject({ lateSessionId: session.id });
  });

  // TallyUI (the #158 follow-ups): past the grace the closure joins the set, and the bounded,
  // fast-path sweep then skips it with no query; but a save that hangs longer than the grace and
  // lands only after that still reaches the till, and the next app start's full sweep, which
  // ignores the set, still catches it. Revert: make the start sweep honour the set.
  it("the app start's full sweep still catches a save that hung past the grace and landed after its closure was marked swept", async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const session = await seed();
    const stamped = await stampSession({ id: 'hung' } as PosOrder, session.id, db.register_sessions);
    await closedOnServer(session.id);
    vi.setSystemTime(Date.now() + SWEEP_GRACE_MS + 1); // past the grace
    expect(await sweepOrphanStamps(target())).toEqual([]); // this sweep marks the closure swept
    const query = vi.spyOn(db.pos_orders.storageInstance, 'query');
    expect(await sweepOrphanStamps(target())).toEqual([]); // the fast path skips a swept closure: no query
    expect(query).not.toHaveBeenCalled();
    query.mockRestore();
    await sale('hung', stamped.sessionId, cash); // the hung save's insert lands only now
    render(); // the app start: a full sweep, ignoring the set
    await waitFor(async () => expect((await stored('hung'))?.lateSessionId).toBe(session.id));
  });
});
