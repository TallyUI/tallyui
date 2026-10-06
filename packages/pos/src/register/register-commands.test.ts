// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { checkSchema } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { readFresh } from '../rxdb';
import { ensureRegister, readRegister, type RegisterDocument } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCreator, type CashMovement, type Closure, type RegisterSession } from './schemas';
import { backToSelling, closeSession, openSession, recordMovement, startCounting, voidMovement, writeClosure,
  type CashMovementCollection, type ClosureCollection, type RegisterSessionCollection } from './session-store';
import { closureCommand, deviceNameOf, movementCommand, reconcileRegisterCommands, registerCommandCollection, registerCommandSchema,
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
  it('a v2 open has version 2 and the trimmed device name, and never supersedes', () => {
    const v1 = sessionOpenCommand(session);
    const v2 = sessionOpenCommand(session, { deviceName: '  Front till  ' });
    expect(v2).toStrictEqual({ ...v1, version: 2, payload: { ...v1.payload, deviceName: 'Front till' } });
    expect(v2.payload).not.toHaveProperty('supersedes');
  });

  it('a v2 open with no usable device name omits it', () => {
    for (const options of [{}, { deviceName: '   ' }, { deviceName: undefined }]) {
      const command = sessionOpenCommand(session, options);
      expect(command.version).toBe(2);
      expect(command.payload).not.toHaveProperty('deviceName');
      expect(command.payload).toStrictEqual(sessionOpenCommand(session).payload);
    }
  });

  it('deviceNameOf keeps at most 64 UTF-16 units and never splits a surrogate pair', () => {
    expect(deviceNameOf('a'.repeat(70))).toBe('a'.repeat(64));
    const straddling = deviceNameOf('a'.repeat(63) + '😀' + 'b')!;
    expect(straddling).toBe('a'.repeat(63));
    expect(straddling).toHaveLength(63);
    expect(straddling.charCodeAt(straddling.length - 1) >= 0xd800
      && straddling.charCodeAt(straddling.length - 1) <= 0xdbff).toBe(false);
    const fitting = deviceNameOf('a'.repeat(62) + '😀');
    expect(fitting).toBe('a'.repeat(62) + '😀');
    expect(fitting).toHaveLength(64);
    expect(deviceNameOf('a'.repeat(60) + '    ' + 'b'.repeat(10))).toBe('a'.repeat(60));
    expect(deviceNameOf(null)).toBeUndefined();
  });

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
      key: `session.transition:session:counting:${openedAt}`, type: 'register.session.transition', version: 1,
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
    await db.addCollections({ register_sessions: registerSessionCreator(), cash_movements: { schema: cashMovementSchema },
      closures: { schema: closureSchema }, register_commands: registerCommandCollection() });
    await ensureRegister(db.register_sessions, 'web');
  });
  afterEach(async () => { vi.useRealTimers(); vi.restoreAllMocks(); await db.remove(); });
  const advance = () => vi.setSystemTime(Date.now() + 1000);
  const open = () => openSession(db.register_sessions, { registerId: 'register', storeKey: 'store', openedBy: '7',
    expectedFloatMinor: 10000, countedFloatMinor: 10000, businessDay: { year: 2026, month: 9, day: 28 } });
  const record = (sessionId: string) => recordMovement(db.register_sessions, db.cash_movements, db.closures,
    { sessionId, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7' });
  const reconcile = (observed?: RegisterSession[], now = openedAt, options: { registerContract?: number; deviceName?: string | null } = {}) => reconcileRegisterCommands({ commands: db.register_commands, sessions: db.register_sessions,
    movements: db.cash_movements, closures: db.closures, host: db.register_sessions, storeKey: 'store', registerId: 'register', now, observed, ...options });
  const ledger = async () => (await readFresh(db.register_commands, { selector: {} })).sort((a, b) => a.seq - b.seq);
  const write = (closed: RegisterSession) => writeClosure({ closures: db.closures, register: db.register_sessions, storeKey: 'store',
    session: closed, counted: 8600, otherTenders: {}, movements: [], orders: [], softwareVersion: '1.0.0' });

  it('reconcile appends nothing for an abandoned session', async () => {
    const s = await open();
    await reconcile();
    const before = await ledger();
    const movement = await record(s.id);
    await s.incrementalPatch({ status: 'abandoned' });
    expect(await reconcile()).toStrictEqual([]);
    expect(await ledger()).toStrictEqual(before);
    expect(await db.register_commands.findOne(`movement.record:${movement.id}`).exec()).toBeNull();
  });

  it('a register v2 store gets a version 2 open with the device name; every other command stays version 1', async () => {
    const s = await open();
    const movement = await record(s.id);
    await reconcile(undefined, undefined, { registerContract: 2, deviceName: 'Front till' });
    const rows = await ledger();
    expect(rows.find((row) => row.key === `session.open:${s.id}`)).toMatchObject({
      version: 2, payload: { deviceName: 'Front till' },
    });
    expect(rows.find((row) => row.key === `movement.record:${movement.id}`)?.version).toBe(1);
  });

  it('a v1 store, or no contract, gets the v1 open unchanged even with a device name', async () => {
    for (const options of [{ registerContract: 1 }, {}]) {
      const s = await open();
      await reconcile(undefined, undefined, { ...options, deviceName: 'Front till' });
      const row = (await ledger()).find((row) => row.key === `session.open:${s.id}`)!;
      expect(row.version).toBe(1);
      expect(row.payload).not.toHaveProperty('deviceName');
      expect(row.payload).toStrictEqual(sessionOpenCommand(s).payload);
      await closeSession(db.register_sessions, s.id, { counted: { cash: 10000 } });
    }
  });

  it('an open already stored is never rewritten when the contract later rises', async () => {
    await open();
    await reconcile(undefined, undefined, { registerContract: 1 });
    const [before] = await ledger();
    await reconcile(undefined, undefined, { registerContract: 2, deviceName: 'Front till' });
    const [after] = await ledger();
    expect(after.version).toBe(1);
    expect(after.payload).not.toHaveProperty('deviceName');
    expect(after).toStrictEqual(before);
  });

  it('a session whose status this build does not know is never sent as a transition', async () => {
    await db.register_sessions.insert({
      ...session, status: 'abandoned-by-till' as unknown as RegisterSession['status'], status_at: openedAt,
    });
    await reconcile();
    expect((await ledger()).filter((row) => row.type === 'register.session.transition' && row.payload.sessionId === session.id)).toEqual([]);
  });

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
      `session.open:${s.id}`, `movement.record:${first.id}`, `session.transition:${s.id}:counting:${counting.status_at}`,
      `session.transition:${s.id}:open:${selling.status_at}`, `movement.record:${second.id}`, `movement.void:${reversal.id}`,
      `session.transition:${s.id}:closed:${closed.status_at}`, `closure.submit:${z.id}`,
    ]);
    expect(rows.map((row) => row.seq)).toStrictEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(rows.every((row) => row.version === 1 && row.syncStatus === 'pending' && row.createdAt === openedAt && row.updatedAt === openedAt)).toBe(true);
    expect(rows.every((row) => /^[0-9a-f-]{14}7[0-9a-f-]{21}$/.test(row.commandId))).toBe(true);
  });

  it('closed sessions are sequenced before the open session, whatever their ids', async () => {
    await db.register_sessions.bulkInsert([
      { ...session, id: 'a-open' },
      { ...session, id: 'z-closed', status: 'closed', status_at: openedAt, closure_id: closure.id },
      { ...session, id: 'y-awaiting-closure', status: 'closed', status_at: openedAt },
    ]);
    await db.closures.insert({ ...closure, session_id: 'z-closed' });
    await reconcile();
    const rows = await ledger();
    expect(rows).toHaveLength(6);
    expect(rows.filter((row) => row.payload.sessionId === 'z-closed').map((row) => row.key))
      .toContain(`closure.submit:${closure.id}`);
    const openSeq = rows.find((row) => row.key === 'session.open:a-open')!.seq;
    for (const row of rows.filter((row) => row.payload.sessionId !== 'a-open')) expect(row.seq).toBeLessThan(openSeq);
  });

  it('an observed row with the current status, or a closed one, is not appended separately', async () => {
    await db.register_sessions.insert({ ...session, status: 'counting', status_at: openedAt });
    await db.cash_movements.insert(movement);
    expect(await reconcile([
      { ...session, status: 'counting', status_at: '2026-09-28T08:10:00.000Z' },
      { ...session, status: 'closed', status_at: '2026-09-28T08:05:00.000Z' },
    ])).toStrictEqual(['session.open:session', 'movement.record:movement', `session.transition:session:counting:${openedAt}`]);
    expect((await ledger()).map((row) => row.payload.status)).toStrictEqual([undefined, undefined, 'counting']);
  });

  it('reconcile is idempotent: a second run appends nothing and keeps every seq and commandId', async () => {
    const s = await open();
    await record(s.id);
    expect(await reconcile()).toHaveLength(2);
    const before = await ledger();
    expect(await reconcile()).toStrictEqual([]);
    expect(await ledger()).toStrictEqual(before);
  });

  describe('transition keys (#258)', () => {
    const transitions = async () => (await ledger()).filter((row) => row.type === 'register.session.transition')
      .map(({ key, payload }) => ({ key, payload }));

    it('counting then closed in the same millisecond queues both, in order, the closed one with its count', async () => {
      const s = await open();
      await reconcile();
      const counting = await startCounting(db.register_sessions, s.id);
      await reconcile();
      const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 9300 }, closedBy: '7', approvedBy: 'manager' });
      expect(closed.status_at).toBe(counting.status_at);
      expect(await reconcile()).toStrictEqual([`session.transition:${s.id}:closed:${closed.status_at}`]);
      expect(await transitions()).toStrictEqual([
        { key: `session.transition:${s.id}:counting:${counting.status_at}`,
          payload: { sessionId: s.id, status: 'counting', at: counting.status_at } },
        { key: `session.transition:${s.id}:closed:${closed.status_at}`, payload: { sessionId: s.id, status: 'closed',
          at: closed.status_at, counted: { cash: 9300 }, closedBy: '7', approvedBy: 'manager' } },
      ]);
    });

    it('open, counting, closed at different times queues each transition once; a rerun adds nothing', async () => {
      const s = await open();
      await reconcile();
      advance();
      const counting = await startCounting(db.register_sessions, s.id);
      expect(await reconcile()).toStrictEqual([`session.transition:${s.id}:counting:${counting.status_at}`]);
      advance();
      const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 9300 } });
      expect(await reconcile()).toStrictEqual([`session.transition:${s.id}:closed:${closed.status_at}`]);
      const before = await ledger();
      expect(await reconcile()).toStrictEqual([]);
      expect(await ledger()).toStrictEqual(before);
      expect((await transitions()).map(({ payload }) => payload.status)).toStrictEqual(['counting', 'closed']);
    });
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
      `session.open:${s.id}`, `session.transition:${s.id}:closed:${closed.status_at}`, `closure.submit:${z.id}`,
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
    const m = await record(s.id);
    vi.setSystemTime(new Date('2026-09-28T08:10:00.000Z'));
    const counting = await startCounting(db.register_sessions, s.id);
    vi.setSystemTime(new Date('2026-09-28T08:05:00.000Z'));
    const selling = await backToSelling(db.register_sessions, s.id);
    expect(await reconcile([counting.toJSON()])).toStrictEqual([
      `session.open:${s.id}`, `session.transition:${s.id}:counting:${counting.status_at}`,
      `movement.record:${m.id}`, `session.transition:${s.id}:open:${selling.status_at}`,
    ]);
    expect((await ledger()).map((row) => row.payload.status)).toStrictEqual([undefined, 'counting', undefined, 'open']);
  });

  it('an observed transition is superseded once any transition is already recorded', async () => {
    const s = await open();
    vi.setSystemTime(new Date('2026-09-28T08:10:00.000Z'));
    const counting = await startCounting(db.register_sessions, s.id);
    vi.setSystemTime(new Date('2026-09-28T08:05:00.000Z'));
    const selling = await backToSelling(db.register_sessions, s.id);
    expect(await reconcile()).toStrictEqual([`session.open:${s.id}`, `session.transition:${s.id}:open:${selling.status_at}`]);
    expect(await reconcile([counting.toJSON()])).toStrictEqual([]);
    expect((await ledger()).map((row) => row.key)).toStrictEqual([
      `session.open:${s.id}`, `session.transition:${s.id}:open:${selling.status_at}`,
    ]);
  });

  it('a close made after the device clock stepped back is appended, with the closure after it', async () => {
    const s = await open();
    await reconcile();
    vi.setSystemTime(new Date('2026-09-28T08:10:00.000Z'));
    await startCounting(db.register_sessions, s.id);
    await reconcile();
    vi.setSystemTime(new Date('2026-09-28T08:05:00.000Z'));
    const closed = await closeSession(db.register_sessions, s.id, { counted: { cash: 8600 }, closedBy: '7', approvedBy: 'manager' });
    const z = await write(closed);
    expect(await reconcile()).toStrictEqual([`session.transition:${s.id}:closed:${closed.status_at}`, `closure.submit:${z.id}`]);
    const rows = await ledger();
    expect(rows.at(-2)?.payload).toStrictEqual({ sessionId: s.id, status: 'closed', at: closed.status_at,
      counted: { cash: 8600 }, closedBy: '7', approvedBy: 'manager' });
    expect(rows.at(-1)?.key).toBe(`closure.submit:${z.id}`);
  });

  it('back to selling after the clock stepped back leaves the ledger on the current state', async () => {
    const s = await open();
    vi.setSystemTime(new Date('2026-09-28T08:10:00.000Z'));
    await startCounting(db.register_sessions, s.id);
    await reconcile();
    vi.setSystemTime(new Date('2026-09-28T08:05:00.000Z'));
    const selling = await backToSelling(db.register_sessions, s.id);
    await reconcile();
    expect((await ledger()).filter((row) => row.type === 'register.session.transition' && row.payload.sessionId === s.id)
      .at(-1)?.payload).toStrictEqual({ sessionId: s.id, status: 'open', at: selling.status_at });
  });

  it('a void is sequenced after its target even when its timestamp is earlier', async () => {
    await db.register_sessions.insert(session);
    await db.cash_movements.insert({ ...movement, id: 'z-target', created_at_gmt: '2026-09-28T08:10:00.000Z' });
    await db.cash_movements.insert({ ...movement, id: 'a-void', type: 'void', voids: 'z-target',
      created_at_gmt: '2026-09-28T08:05:00.000Z' });
    await reconcile();
    const rows = await ledger();
    expect(rows.map((row) => row.key)).toStrictEqual(['session.open:session', 'movement.record:z-target', 'movement.void:a-void']);
    expect(rows.find((row) => row.key === 'movement.void:a-void')!.seq)
      .toBeGreaterThan(rows.find((row) => row.key === 'movement.record:z-target')!.seq);
  });

  it('sessions are sequenced by closure number, not by opening time', async () => {
    for (const { id, number, opened } of [
      { id: 'z-first', number: 1, opened: '2026-09-28T09:00:00.000Z' }, { id: 'a-second', number: 2, opened: openedAt },
    ]) {
      await db.register_sessions.insert({ ...session, id, status: 'closed', opened_at_gmt: opened,
        status_at: closure.closed_at, closure_id: id });
      await db.closures.insert({ ...closure, id, session_id: id, number, opened_at: opened });
      await db.cash_movements.insert({ ...movement, id, session_id: id });
    }
    await reconcile();
    const rows = await ledger();
    expect(rows.map((row) => row.payload.sessionId)).toStrictEqual([
      'z-first', 'z-first', 'z-first', 'z-first', 'a-second', 'a-second', 'a-second', 'a-second',
    ]);
    expect(Math.max(...rows.filter((row) => row.payload.sessionId === 'z-first').map((row) => row.seq)))
      .toBeLessThan(Math.min(...rows.filter((row) => row.payload.sessionId === 'a-second').map((row) => row.seq)));
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
      `session.transition:${s.id}:closed:${closed.status_at}`, `closure.submit:${z.id}`,
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
    expect(await reconcile()).toStrictEqual([`movement.record:${m.id}`, `session.transition:${s.id}:closed:${closed.status_at}`]);
    expect((await ledger()).map((row) => row.key)).toStrictEqual([
      `session.open:${s.id}`, `movement.record:${m.id}`, `session.transition:${s.id}:closed:${closed.status_at}`,
    ]);
  });

  it('orders closed sessions without closure rows by primary key, then the open session, with current state after movements', async () => {
    await db.register_sessions.insert({ ...session, id: 'later', opened_at_gmt: '2026-09-28T09:00:00.000Z' });
    await db.register_sessions.insert({ ...session, id: 'earlier', status: 'closed', status_at: openedAt });
    await db.register_sessions.insert({ ...session, id: 'before', status: 'closed', status_at: openedAt,
      opened_at_gmt: '2026-09-28T10:00:00.000Z' });
    await db.register_sessions.insert({ ...session, id: 'other-register', register_id: 'other' });
    await db.cash_movements.insert({ ...movement, session_id: 'earlier', created_at_gmt: '2026-09-28T11:00:00.000Z' });
    expect(await reconcile()).toStrictEqual([
      'session.open:before', `session.transition:before:closed:${openedAt}`,
      'session.open:earlier', 'movement.record:movement', `session.transition:earlier:closed:${openedAt}`, 'session.open:later',
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
      `session.transition:${s.id}:closed:${closed.status_at}`, `closure.submit:${z.id}`,
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
