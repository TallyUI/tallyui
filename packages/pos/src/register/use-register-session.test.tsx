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
import { ensureRegister, readRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCollection } from './schemas';
import {
  closeSession,
  openSession,
  recordMovement,
  RegisterSessionRequiredError,
  startCounting,
  backToSelling,
  type CashMovementCollection,
  type ClosureCollection,
  type RegisterSessionCollection,
} from './session-store';
import { RegisterSessionAlreadyOpenError, RegisterTenderInProgressError, useRegisterSession, type UseRegisterSessionOptions } from './use-register-session';

let db: RxDatabase<{
  register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection; closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>;
}>;
const logs: LogEntry[] = [];
registerFactsLogger.addSink({ id: 'hook-capture', levels: ['debug', 'info', 'warn', 'error'], write: (e) => logs.push(e) });
const actor = { id: '7', name: 'Pat' };

beforeEach(async () => {
  logs.length = 0;
  const created: RxDatabase = await createRxDatabase({
    name: `hook${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await created.addCollections({
    register_sessions: registerSessionCollection(),
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
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
function movement(sessionId: string, type: 'paid_in' | 'paid_out' | 'no_sale', amountMinor: number, reason = 'Float top-up') {
  return recordMovement(db.register_sessions, db.cash_movements, db.closures, { sessionId, type, amountMinor, reason, actor: '7' });
}
/** A hand-built pending sale stamped with `sessionId`: only what the hook and a closure read. */
function sale(id: string, sessionId: string, payments: Omit<PosOrderPayment, 'id'>[]) {
  const total = payments.reduce((sum, payment) => sum + payment.amountMinor, 0);
  return db.pos_orders.insert({
    id, commandId: `command-${id}`, createdAt: '2026-09-16T10:00:00.000Z', updatedAt: '2026-09-16T10:00:00.000Z',
    currency: 'EUR', pricesIncludeTax: false, lines: [], subtotalMinor: total, discountMinor: 0, taxMinor: 0,
    totalMinor: total, customer: null, syncStatus: 'pending', sessionId, cashierRef: '7',
    payments: payments.map((payment, i) => ({ ...payment, id: `${id}-payment-${i}` })),
  });
}
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
    const session = await seed();
    const other = await seed('7', 'other-register');
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
