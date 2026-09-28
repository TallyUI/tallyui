// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { checkSchema } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { readFresh } from '../rxdb';
import { ensureRegister, readRegister, type RegisterDocument } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCollection, type CashMovement, type Closure, type RegisterSession } from './schemas';
import { backToSelling, closeSession, openSession, recordMovement, startCounting, voidMovement, writeClosure,
  type CashMovementCollection, type ClosureCollection, type RegisterSessionCollection } from './session-store';
import { closureCommand, movementCommand, reconcileRegisterCommands, registerCommandCollection, registerCommandSchema,
  sessionOpenCommand, sessionTransitionCommand, type RegisterCommandCollection } from './register-commands';

const openedAt = '2026-09-28T08:00:00.000Z';
const session: RegisterSession = {
  id: 'session', register_id: 'register', status: 'open', opened_at_gmt: openedAt,
  store_key: null, opened_by: null, expected_float_minor: null, counted_float_minor: 10000, opening_variance_minor: null,
};
const movement: CashMovement = {
  id: 'movement', session_id: session.id, type: 'paid_out', amountMinor: 700, reason: 'Milk',
  created_at_gmt: openedAt, created_by: null,
};
const closure: Closure = {
  id: 'closure', session_id: session.id, register_id: 'register', number: 2,
  opened_at: openedAt, closed_at: '2026-09-28T18:00:00.000Z', closed_by: null,
  till_expected: { cash: 9300 }, expected: { cash: 9500 }, counted: { cash: 9400 }, variance: { cash: -100 },
  period_sales_total_minor: 100, period_refunds_total_minor: 0, perpetual_sales_total_minor: 500,
  perpetual_refunds_total_minor: 0, unsynced_count: 1, unsynced_total_minor: 100, software_version: '1.0.0',
  breakdowns: { approved_by: 'manager', payment_methods: {} }, order_ids: ['order'], movement_ids: ['movement'],
  print_count: 2, printed_at: openedAt, server_closure_id: 'server',
};

describe('sessionOpenCommand', () => {
  it("builds each command's payload from its row, omitting null fields", () => {
    expect(sessionOpenCommand(session)).toStrictEqual({
      key: 'session.open:session', type: 'register.session.open', version: 1,
      payload: { sessionId: 'session', registerId: 'register', openedAt, countedFloatMinor: 10000 },
    });
    expect(sessionOpenCommand({ ...session, store_key: 'store', business_day: '2026-09-28', opened_by: '7',
      expected_float_minor: 10000, opening_variance_minor: 0 }).payload).toStrictEqual({
      sessionId: 'session', registerId: 'register', storeKey: 'store', businessDay: '2026-09-28', openedAt,
      openedBy: '7', expectedFloatMinor: 10000, countedFloatMinor: 10000, openingVarianceMinor: 0,
    });
  });
});
describe('sessionTransitionCommand', () => {
  it("builds each command's payload from its row, omitting null fields", () => {
    expect(sessionTransitionCommand({ ...session, status: 'counting', status_at: openedAt,
      counted: null, closed_by: null, approved_by: null })).toStrictEqual({
      key: `session.transition:session:${openedAt}`, type: 'register.session.transition', version: 1,
      payload: { sessionId: 'session', status: 'counting', at: openedAt },
    });
    expect(sessionTransitionCommand({ ...session, status: 'closed', status_at: openedAt,
      counted: { cash: 10000 }, closed_by: '7', approved_by: 'manager' }).payload).toStrictEqual({
      sessionId: 'session', status: 'closed', at: openedAt, counted: { cash: 10000 }, closedBy: '7', approvedBy: 'manager',
    });
    expect(sessionTransitionCommand({ ...session, status: 'closed', status_at: openedAt,
      counted: null, closed_by: null, approved_by: null }).payload).toStrictEqual({
      sessionId: 'session', status: 'closed', at: openedAt,
    });
  });
});
describe('movementCommand', () => {
  it("builds each command's payload from its row, omitting null fields", () => {
    expect(movementCommand(movement)).toStrictEqual({
      key: 'movement.record:movement', type: 'register.movement.record', version: 1,
      payload: { movementId: 'movement', sessionId: 'session', type: 'paid_out', amountMinor: 700, reason: 'Milk', createdAt: openedAt },
    });
    expect(movementCommand({ ...movement, id: 'reversal', type: 'void', voids: movement.id })).toStrictEqual({
      key: 'movement.void:reversal', type: 'register.movement.void', version: 1,
      payload: { movementId: 'reversal', sessionId: 'session', voids: 'movement', createdAt: openedAt },
    });
    expect(movementCommand({ ...movement, type: 'void', voids: 'original', created_by: '7' }).payload).toStrictEqual({
      movementId: 'movement', sessionId: 'session', voids: 'original', createdAt: openedAt, createdBy: '7',
    });
  });
});
describe('closureCommand', () => {
  it("builds each command's payload from its row, omitting null fields", () => {
    const payload = {
      closureId: 'closure', sessionId: 'session', registerId: 'register', number: 2,
      openedAt, closedAt: closure.closed_at, tillExpected: { cash: 9300 }, counted: { cash: 9400 },
      periodSalesTotalMinor: 100, periodRefundsTotalMinor: 0, perpetualSalesTotalMinor: 500, perpetualRefundsTotalMinor: 0,
      unsyncedCount: 1, unsyncedTotalMinor: 100, softwareVersion: '1.0.0', orderIds: ['order'], movementIds: ['movement'],
    };
    expect(closureCommand(closure)).toStrictEqual({ key: 'closure.submit:closure', type: 'register.closure.submit',
      version: 1, payload: { ...payload, approvedBy: 'manager' } });
    for (const approved_by of [undefined, null, '', 7]) {
      expect(closureCommand({ ...closure, breakdowns: { approved_by } }).payload).toStrictEqual(payload);
    }
    expect(closureCommand({ ...closure, closed_by: '7', business_day: '2026-09-28' }).payload).toStrictEqual({
      ...payload, approvedBy: 'manager', closedBy: '7', businessDay: '2026-09-28',
    });
  });
});

describe('register command ledger', () => {
  let db: RxDatabase<{
    register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection;
    closures: ClosureCollection; register_commands: RegisterCommandCollection;
  }>;
  beforeEach(async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(openedAt));
    db = await createRxDatabase({ name: `commands${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ register_sessions: registerSessionCollection(), cash_movements: { schema: cashMovementSchema },
      closures: { schema: closureSchema }, register_commands: registerCommandCollection() });
    await ensureRegister(db.register_sessions, 'web');
  });
  afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await db.remove(); });
  const advance = () => vi.setSystemTime(Date.now() + 1000);
  const open = () => openSession(db.register_sessions, { registerId: 'register', storeKey: 'store', openedBy: '7',
    expectedFloatMinor: 10000, countedFloatMinor: 10000, businessDay: { year: 2026, month: 9, day: 28 } });
  const record = (sessionId: string) => recordMovement(db.register_sessions, db.cash_movements, db.closures,
    { sessionId, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7' });
  const reconcile = (observed?: RegisterSession[], now = openedAt) => reconcileRegisterCommands({ commands: db.register_commands, sessions: db.register_sessions,
    movements: db.cash_movements, closures: db.closures, host: db.register_sessions, storeKey: 'store', registerId: 'register', now, observed });
  const ledger = async () => (await readFresh(db.register_commands, { selector: {} })).sort((a, b) => a.seq - b.seq);
  const write = (closed: RegisterSession) => writeClosure({ closures: db.closures, register: db.register_sessions, storeKey: 'store',
    session: closed, counted: 8600, otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0' });

  it("appends the register's facts in fact order", async () => {
    const s = await open();
    await reconcile();
    advance();
    const first = await record(s.id);
    await reconcile();
    advance();
    const counting = await startCounting(db.register_sessions, s.id);
    await reconcile();
    advance();
    const selling = await backToSelling(db.register_sessions, s.id);
    await reconcile();
    advance();
    const second = await record(s.id);
    await reconcile();
    advance();
    const reversal = await voidMovement(db.register_sessions, db.cash_movements, second.id, '7', db.closures);
    await reconcile();
    advance();
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 9300 } });
    const z = await write(closed);
    await reconcile();
    const rows = await ledger();
    expect(rows.map((row) => row.key)).toStrictEqual([
      `session.open:${s.id}`, `movement.record:${first.id}`, `session.transition:${s.id}:${counting.status_at}`,
      `session.transition:${s.id}:${selling.status_at}`, `movement.record:${second.id}`, `movement.void:${reversal.id}`,
      `session.transition:${s.id}:${closed.status_at}`, `closure.submit:${z.id}`,
    ]);
    expect(rows.map((row) => row.seq)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.every((row) => row.version === 1 && row.syncStatus === 'pending' && row.createdAt === openedAt && row.updatedAt === openedAt)).toBe(true);
    expect(rows.every((row) => /^[0-9a-f-]{14}7[0-9a-f-]{21}$/.test(row.commandId))).toBe(true);
  });

  it('reconcile is idempotent: a second run appends nothing and keeps every seq and commandId', async () => {
    const s = await open();
    await record(s.id);
    expect(await reconcile()).toHaveLength(2);
    const before = await ledger();
    expect(await reconcile()).toStrictEqual([]);
    expect(await ledger()).toStrictEqual(before);
  });

  it('two concurrent reconciles append each key once', async () => {
    const s = await open();
    const m = await record(s.id);
    const results = await Promise.all([reconcile(), reconcile()]);
    expect(results).toStrictEqual([[`session.open:${s.id}`, `movement.record:${m.id}`], []]);
    const rows = await ledger();
    expect(rows.map((row) => row.seq)).toStrictEqual([1, 2]);
    expect(new Set(rows.map((row) => row.commandId)).size).toBe(2);
  });

  it('backfills a session closed after the gate turned on even without its open command', async () => {
    await reconcile();
    advance();
    const s = await open();
    advance();
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 10000 } });
    const z = await write(closed);
    expect(await ledger()).toStrictEqual([]);
    expect(await reconcile()).toStrictEqual([
      `session.open:${s.id}`, `session.transition:${s.id}:${closed.status_at}`, `closure.submit:${z.id}`,
    ]);
  });

  it('never backfills a session closed before the gate first turned on', async () => {
    const s = await open();
    await record(s.id);
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 9300 } });
    await write(closed);
    advance();
    expect(await reconcile(undefined, new Date().toISOString())).toStrictEqual([]);
    expect(await ledger()).toStrictEqual([]);
  });

  it('commands_since is set once', async () => {
    await reconcile();
    const since = async () => (await readRegister(db.register_sessions))?.stores.store.registers?.register.commands_since;
    expect(await since()).toBe(openedAt);
    advance();
    await reconcile(undefined, new Date().toISOString());
    expect(await since()).toBe(openedAt);
  });

  it('an observed transition is appended even after the row moved on', async () => {
    const s = await open();
    advance();
    const counting = await startCounting(db.register_sessions, s.id);
    advance();
    const selling = await backToSelling(db.register_sessions, s.id);
    expect(await reconcile([counting.toJSON()])).toStrictEqual([
      `session.open:${s.id}`, `session.transition:${s.id}:${counting.status_at}`, `session.transition:${s.id}:${selling.status_at}`,
    ]);
    expect((await ledger()).map((row) => row.payload.status)).toStrictEqual([undefined, 'counting', 'open']);
  });

  it('a transition older than one already recorded is never appended', async () => {
    const s = await open();
    advance();
    const counting = await startCounting(db.register_sessions, s.id);
    advance();
    const selling = await backToSelling(db.register_sessions, s.id);
    expect(await reconcile()).toStrictEqual([`session.open:${s.id}`, `session.transition:${s.id}:${selling.status_at}`]);
    expect(await reconcile([counting.toJSON()])).toStrictEqual([]);
    expect((await ledger()).map((row) => row.key)).toStrictEqual([
      `session.open:${s.id}`, `session.transition:${s.id}:${selling.status_at}`,
    ]);
  });

  it('a session whose open is recorded is never skipped, even after the register document is reset', async () => {
    const s = await open();
    await reconcile();
    const doc = await db.register_sessions.getLocal<RegisterDocument>('register');
    await doc!.incrementalModify((data) => ({ ...data,
      stores: { ...data.stores, store: { ...data.stores.store, registers: {} } } }));
    advance();
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 10000 } });
    const z = await write(closed);
    advance();
    expect(await reconcile(undefined, new Date().toISOString())).toStrictEqual([
      `session.transition:${s.id}:${closed.status_at}`, `closure.submit:${z.id}`,
    ]);
  });

  it('seq continues from the ledger after the register document is reset', async () => {
    const s = await open();
    await record(s.id);
    await reconcile();
    const before = await ledger();
    const doc = await db.register_sessions.getLocal<RegisterDocument>('register');
    await doc!.incrementalModify((data) => ({ ...data,
      stores: { ...data.stores, store: { ...data.stores.store, registers: {} } } }));
    const m = await record(s.id);
    expect(await reconcile()).toStrictEqual([`movement.record:${m.id}`]);
    expect((await ledger()).at(-1)?.seq).toBe(before.at(-1)!.seq + 1);
  });

  it('a session whose closure command exists is skipped', async () => {
    const s = await open();
    await reconcile();
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 10000 } });
    const z = await write(closed);
    expect(await reconcile()).toContain(`closure.submit:${z.id}`);
    const movements = vi.spyOn(db.cash_movements.storageInstance, 'query');
    const closures = vi.spyOn(db.closures.storageInstance, 'findDocumentsById');
    expect(await reconcile()).toStrictEqual([]);
    expect(movements).not.toHaveBeenCalled();
    expect(closures).not.toHaveBeenCalled();
  });

  it('recovers after a crash between a write and its append', async () => {
    const s = await open();
    await reconcile();
    advance();
    const m = await record(s.id);
    advance();
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 9300 } });
    expect(await reconcile()).toStrictEqual([`movement.record:${m.id}`, `session.transition:${s.id}:${closed.status_at}`]);
    expect((await ledger()).map((row) => row.key)).toStrictEqual([
      `session.open:${s.id}`, `movement.record:${m.id}`, `session.transition:${s.id}:${closed.status_at}`,
    ]);
  });

  it('orders sessions by opening time and a transition after movements on a tie', async () => {
    await db.register_sessions.insert({ ...session, id: 'later', opened_at_gmt: '2026-09-28T09:00:00.000Z' });
    await db.register_sessions.insert({ ...session, id: 'earlier', status: 'counting', status_at: openedAt });
    await db.register_sessions.insert({ ...session, id: 'other-register', register_id: 'other' });
    await db.cash_movements.insert({ ...movement, session_id: 'earlier' });
    expect(await reconcile()).toStrictEqual([
      'session.open:earlier', 'movement.record:movement', `session.transition:earlier:${openedAt}`, 'session.open:later',
    ]);
  });

  it('the closing transition sorts after every movement, even one timestamped after it', async () => {
    const s = await open();
    await reconcile();
    advance();
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 10000 } });
    advance();
    await db.cash_movements.insert({ ...movement, session_id: s.id, created_at_gmt: new Date().toISOString() });
    advance();
    await db.cash_movements.insert({ ...movement, id: 'reversal', type: 'void', voids: movement.id,
      session_id: s.id, created_at_gmt: new Date().toISOString() });
    const z = await write(closed);
    expect(await reconcile()).toStrictEqual([
      `movement.record:${movement.id}`, 'movement.void:reversal',
      `session.transition:${s.id}:${closed.status_at}`, `closure.submit:${z.id}`,
    ]);
  });

  it("the schema passes RxDB's dev-mode checks", async () => {
    expect(() => checkSchema(registerCommandSchema)).not.toThrow();
    const row = await db.register_commands.insert({ ...sessionOpenCommand(session), registerId: 'register', seq: 1,
      commandId: 'command', createdAt: openedAt, updatedAt: openedAt, syncStatus: 'rejected',
      error: { code: 'register_session_already_open', message: 'Already open', data: { sessionId: 'winner' } },
      result: { session: { id: 'winner', status: 'open' }, closure: { serverClosureId: 'server', number: 2 } } });
    const stored = row.toJSON();
    expect(stored.error?.data).toStrictEqual({ sessionId: 'winner' });
    expect(stored.result?.closure).toStrictEqual({ serverClosureId: 'server', number: 2 });
  });
});
