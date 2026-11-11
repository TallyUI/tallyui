// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { readFresh } from '../rxdb';
import { abandonSession, adoptRegisterResults, closureApprovalStatus, isLiveAtStore, reapproveClosure, RegisterReapproveError,
  takeOverSession } from './register-adoption';
import { reconcileRegisterCommands, registerCommandCollection, type RegisterCommand, type RegisterCommandCollection } from './register-commands';
import { advancePerpetual, ensureRegister, mintClosureNumber, readRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCreator, type RegisterSession } from './schemas';
import { closeSession, openSession, recordMovement, startCounting, RegisterSessionRequiredError, RegisterTakeOverError,
  type CashMovementCollection, type ClosureCollection, type RegisterSessionCollection } from './session-store';

describe('adoptRegisterResults', () => {
  let db: RxDatabase<{
    register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection;
    closures: ClosureCollection; register_commands: RegisterCommandCollection;
  }>;
  beforeEach(async () => {
    db = await createRxDatabase({ name: `adoption${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    await db.addCollections({ register_sessions: registerSessionCreator(), cash_movements: { schema: cashMovementSchema },
      closures: { schema: closureSchema }, register_commands: registerCommandCollection() });
    await ensureRegister(db.register_sessions, 'web');
  });
  afterEach(async () => { await db.remove(); });
  const open = () => openSession(db.register_sessions, { registerId: 'register', expectedFloatMinor: 10000,
    countedFloatMinor: 10000, openedBy: '7', businessDay: { year: 2026, month: 9, day: 28 } });
  const reconcile = () => reconcileRegisterCommands({ commands: db.register_commands, sessions: db.register_sessions,
    movements: db.cash_movements, closures: db.closures, host: db.register_sessions, storeKey: 'store', registerId: 'register' });
  const adopt = () => adoptRegisterResults({ commands: db.register_commands, sessions: db.register_sessions, registerId: 'register' });
  const command = (id: string) => db.register_commands.findOne(`session.open:${id}`).exec(true);
  const stored = async (id: string) => (await db.register_sessions.storageInstance.findDocumentsById([id], false))[0];
  const refused = { syncStatus: 'rejected' as const, error: { code: 'register_session_already_open', message: 'Already open' } };
  const now = '2026-10-06T12:00:00.000Z';
  const takeOver = (sessionId: string) => takeOverSession({ commands: db.register_commands, sessions: db.register_sessions, sessionId, now, registerContract: 2 });
  const abandon = (sessionId: string) => abandonSession({ commands: db.register_commands, sessions: db.register_sessions, sessionId, now });
  const conflict = async (sessionId: string) => {
    await reconcile();
    await (await command(sessionId)).incrementalPatch({ ...refused, error: { ...refused.error, data: { sessionId: 'other' } } });
    await adopt();
  };

  it('take over refuses below register contract 2 and writes nothing', async () => {
    const session = await open();
    await conflict(session.id);
    const beforeCommand = (await command(session.id)).toJSON();
    const beforeSession = await stored(session.id);
    for (const contract of [{ registerContract: 1 }, { registerContract: 0 }, {}]) {
      const attempt = takeOverSession({ commands: db.register_commands, sessions: db.register_sessions,
        sessionId: session.id, now, ...contract });
      await expect(attempt).rejects.toBeInstanceOf(RegisterTakeOverError);
      await expect(attempt).rejects.toMatchObject({ code: 'REGISTER_TAKEOVER_UNSUPPORTED' });
    }
    expect((await command(session.id)).toJSON()).toStrictEqual(beforeCommand);
    expect(beforeCommand).toMatchObject({ syncStatus: 'rejected', error: { code: 'register_session_already_open' } });
    expect(await stored(session.id)).toStrictEqual(beforeSession);
    expect(beforeSession.status).toBe('conflict');
    await takeOver(session.id);
    expect((await command(session.id)).syncStatus).toBe('pending');
  });

  it('take over requeues the refused open in its ledger place with a new command id, version 2 and supersedes, and keeps the session in conflict', async () => {
    const s = await open();
    await conflict(s.id);
    const before = (await command(s.id)).toJSON();
    const session = await stored(s.id);
    await takeOver(s.id);
    const after = (await command(s.id)).toJSON();
    expect(after).toMatchObject({ key: before.key, seq: before.seq, version: 2, syncStatus: 'pending', updatedAt: now,
      payload: { ...before.payload, sessionId: s.id, supersedes: 'other' } });
    expect(after.commandId).not.toBe(before.commandId);
    expect(after).not.toHaveProperty('error');
    expect(await stored(s.id)).toStrictEqual(session);
    expect(session.status).toBe('conflict');
    await expect(takeOver(s.id)).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    expect((await command(s.id)).toJSON()).toStrictEqual(after);
  });

  it('take over refused a second time stays in conflict with the new data', async () => {
    const s = await open();
    await conflict(s.id);
    const firstId = (await command(s.id)).commandId;
    await takeOver(s.id);
    const secondId = (await command(s.id)).commandId;
    await (await command(s.id)).incrementalPatch({ ...refused, error: { ...refused.error,
      data: { sessionId: 'other-2', deviceName: 'Back till' } } });
    await adopt();
    expect((await stored(s.id)).status).toBe('conflict');
    expect((await command(s.id)).toJSON().error?.data).toStrictEqual({ sessionId: 'other-2', deviceName: 'Back till' });
    await takeOver(s.id);
    expect((await command(s.id)).payload.supersedes).toBe('other-2');
    expect([firstId, secondId]).not.toContain((await command(s.id)).commandId);
  });

  it('an applied take-over moves the session out of conflict', async () => {
    const s = await open();
    await conflict(s.id);
    await takeOver(s.id);
    await (await command(s.id)).incrementalPatch({ syncStatus: 'applied' });
    await adopt();
    expect((await stored(s.id)).status).toBe('open');
    const before = (await command(s.id)).toJSON();
    await expect(takeOver(s.id)).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    await expect(abandon(s.id)).rejects.toBeInstanceOf(RegisterSessionRequiredError);
    expect((await command(s.id)).toJSON()).toStrictEqual(before);
  });

  it('abandon marks every pending command of the session register_session_abandoned, then the session abandoned', async () => {
    const s = await open();
    const movement = await recordMovement(db.register_sessions, db.cash_movements, db.closures,
      { sessionId: s.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7' });
    const other = await open();
    await conflict(s.id);
    const before = await stored(s.id);
    const otherOpen = (await command(other.id)).toJSON();
    const refusedOpen = (await command(s.id)).toJSON();
    await abandon(s.id);
    expect((await db.register_commands.findOne(`movement.record:${movement.id}`).exec(true)).toJSON()).toMatchObject({
      syncStatus: 'rejected', error: { code: 'register_session_abandoned', message: 'The cashier chose another register.' }, updatedAt: now,
    });
    expect((await command(s.id)).toJSON()).toStrictEqual(refusedOpen);
    expect((await command(other.id)).toJSON()).toStrictEqual(otherOpen);
    const after = await stored(s.id);
    expect({ ...after, _rev: before._rev, _meta: before._meta }).toStrictEqual({ ...before, status: 'abandoned' });
  });

  it('abandon while a take-over is pending refuses and writes nothing', async () => {
    const s = await open();
    await conflict(s.id);
    await takeOver(s.id);
    const session = await stored(s.id);
    const rows = await readFresh(db.register_commands, { selector: {} });
    await expect(abandon(s.id)).rejects.toEqual(new RegisterTakeOverError('REGISTER_TAKEOVER_PENDING'));
    expect(await stored(s.id)).toStrictEqual(session);
    expect(await readFresh(db.register_commands, { selector: {} })).toStrictEqual(rows);
  });

  it('a half-done abandon is finished by adoption', async () => {
    const s = await open();
    const movement = await recordMovement(db.register_sessions, db.cash_movements, db.closures,
      { sessionId: s.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7' });
    await startCounting(db.register_sessions, s.id);
    await conflict(s.id);
    await (await db.register_commands.findOne(`movement.record:${movement.id}`).exec(true)).incrementalPatch({
      syncStatus: 'rejected', error: { code: 'register_session_abandoned', message: 'The cashier chose another register.' },
    });
    expect((await stored(s.id)).status).toBe('conflict');
    await adopt();
    expect((await stored(s.id)).status).toBe('abandoned');
    const [transition] = await readFresh(db.register_commands, { selector: { type: 'register.session.transition' } });
    expect(transition).toMatchObject({ syncStatus: 'rejected', error: { code: 'register_session_abandoned' } });
  });

  it('an abandoned session stays abandoned over its refused open', async () => {
    const s = await open();
    await conflict(s.id);
    await abandon(s.id);
    const before = await stored(s.id);
    await abandon(s.id);
    await adopt();
    expect(await stored(s.id)).toStrictEqual(before);
    expect(before.status).toBe('abandoned');
  });

  it('terminal and unknown statuses ignore a superseded rejection too', async () => {
    for (const status of ['abandoned', 'later-state'] as const) {
      const s = await db.register_sessions.insert({ id: status, register_id: 'register',
        status: (status === 'abandoned' ? 'conflict' : status) as unknown as RegisterSession['status'],
        opened_at_gmt: '2026-09-28T08:00:00.000Z', counted_float_minor: 10000 });
      await reconcile();
      if (status === 'abandoned') await s.incrementalPatch({ status: 'abandoned' });
      const before = await stored(s.id);
      await (await command(s.id)).incrementalPatch({ syncStatus: 'rejected', error: { code: 'register_session_superseded', message: 'Superseded' } });
      await adopt();
      expect(await stored(s.id)).toStrictEqual(before);
      expect((await stored(s.id)).status).toBe(status);
    }
  });

  it('a refused open moves an open session to conflict, and running again writes nothing', async () => {
    const s = await open();
    const before = (await readFresh(db.register_sessions, { selector: { id: s.id } }))[0];
    await reconcile();
    await (await command(s.id)).incrementalPatch(refused);
    await adopt();
    expect((await readFresh(db.register_sessions, { selector: { id: s.id } }))[0]).toStrictEqual({ ...before, status: 'conflict' });
    const revision = (await stored(s.id))._rev;
    await adopt();
    expect((await stored(s.id))._rev).toBe(revision);
  });

  it('a counting session whose open is refused becomes conflict, and an applied take-over brings it back to counting', async () => {
    const s = await open();
    await startCounting(db.register_sessions, s.id);
    const before = (await readFresh(db.register_sessions, { selector: { id: s.id } }))[0];
    await reconcile();
    await (await command(s.id)).incrementalPatch(refused);
    await adopt();
    expect((await stored(s.id)).status).toBe('conflict');
    await (await command(s.id)).incrementalPatch({ syncStatus: 'applied' });
    await adopt();
    expect((await readFresh(db.register_sessions, { selector: { id: s.id } }))[0]).toStrictEqual(before);
    const revision = (await stored(s.id))._rev;
    await adopt();
    expect((await stored(s.id))._rev).toBe(revision);
  });

  it('an applied open of a conflict session with no counting transition goes back to open', async () => {
    const s = await open();
    await reconcile();
    await (await command(s.id)).incrementalPatch(refused);
    await adopt();
    expect((await stored(s.id)).status).toBe('conflict');
    await (await command(s.id)).incrementalPatch({ syncStatus: 'applied' });
    await adopt();
    expect((await stored(s.id)).status).toBe('open');
  });

  it('a pending open leaves a conflict session in conflict', async () => {
    const s = await open();
    await reconcile();
    await (await command(s.id)).incrementalPatch(refused);
    await adopt();
    const before = await stored(s.id);
    await (await command(s.id)).incrementalPatch({ syncStatus: 'pending' });
    await adopt();
    expect(await stored(s.id)).toStrictEqual(before);
    expect((await stored(s.id)).status).toBe('conflict');
  });

  it('an applied open that resumed records server_session_id and never overwrites a different one', async () => {
    for (const server_session_id of [undefined, null, 'server-0']) {
      const s = await open();
      if (server_session_id !== undefined) await s.incrementalPatch({ server_session_id });
      await reconcile();
      await (await command(s.id)).incrementalPatch({ syncStatus: 'applied', result: { resumed: { fromSessionId: 'server-1' } } });
      await adopt();
      expect(await stored(s.id)).toMatchObject({ status: 'open', server_session_id: server_session_id ?? 'server-1' });
      const revision = (await stored(s.id))._rev;
      await adopt();
      expect((await stored(s.id))._rev).toBe(revision);
    }
  });

  it('a superseded rejection on any command moves open or counting to superseded, and leaves a conflict session in conflict', async () => {
    for (const status of ['open', 'counting', 'conflict'] as const) {
      const s = await open();
      let key = `session.open:${s.id}`;
      if (status === 'counting') {
        const movement = await recordMovement(db.register_sessions, db.cash_movements, db.closures,
          { sessionId: s.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7' });
        key = `movement.record:${movement.id}`;
        await startCounting(db.register_sessions, s.id);
      }
      await reconcile();
      if (status === 'conflict') {
        await (await command(s.id)).incrementalPatch(refused);
        await adopt();
      }
      expect((await stored(s.id)).status).toBe(status);
      if (status === 'counting') await (await command(s.id)).incrementalPatch({ syncStatus: 'applied', result: { resumed: { fromSessionId: 'server-1' } } });
      await (await db.register_commands.findOne(key).exec(true)).incrementalPatch({
        syncStatus: 'rejected', error: { code: 'register_session_superseded', message: 'Superseded' },
      });
      const before = await stored(s.id);
      await adopt();
      if (status === 'conflict') {
        expect((await stored(s.id)).status).toBe('conflict');
        expect((await stored(s.id))._rev).toBe(before._rev);
      } else expect((await stored(s.id)).status).toBe('superseded');
      if (status === 'counting') expect((await stored(s.id)).server_session_id).toBe('server-1');
      const revision = (await stored(s.id))._rev;
      await adopt();
      expect((await stored(s.id))._rev).toBe(revision);
    }
  });

  it('an applied take-over then a superseded answer in one walk ends superseded', async () => {
    const s = await open();
    await reconcile();
    await (await command(s.id)).incrementalPatch({ ...refused, error: { ...refused.error, data: { sessionId: 'other-1' } } });
    await adopt();
    expect((await stored(s.id)).status).toBe('conflict');
    await takeOver(s.id);
    await (await command(s.id)).incrementalPatch({ syncStatus: 'applied' });
    const openRow = (await command(s.id)).toJSON();
    const later = await db.register_commands.insert({ ...openRow, key: `session.transition:${s.id}:open`,
      commandId: 'later-answer', seq: openRow.seq + 1, type: 'register.session.transition' });
    await later.incrementalPatch({ syncStatus: 'rejected', error: { code: 'register_session_superseded', message: 'Superseded' } });
    await adopt();
    expect((await stored(s.id)).status).toBe('superseded');
  });

  it('terminal statuses are never moved', async () => {
    const closed = await open();
    const superseded = await open();
    const abandoned = await db.register_sessions.insert({ id: 'abandoned', register_id: 'register', status: 'conflict',
      opened_at_gmt: '2026-09-28T08:00:00.000Z', counted_float_minor: 10000 });
    await reconcile();
    await abandoned.incrementalPatch({ status: 'abandoned' });
    await closeSession(db.register_sessions, closed.id, { counted: { cash: 10000 } });
    await (await command(superseded.id)).incrementalPatch({ syncStatus: 'rejected', error: { code: 'register_session_superseded', message: 'Superseded' } });
    await adopt();
    expect((await stored(superseded.id)).status).toBe('superseded');
    const before = await Promise.all([closed, abandoned, superseded].map((s) => stored(s.id)));
    await (await command(closed.id)).incrementalPatch(refused);
    await (await command(abandoned.id)).incrementalPatch(refused);
    await (await command(superseded.id)).incrementalPatch({ syncStatus: 'applied', result: { resumed: { fromSessionId: 'server-1' } } });
    await adopt();
    expect(await Promise.all([closed, abandoned, superseded].map((s) => stored(s.id)))).toStrictEqual(before);
  });

  it('a status this build does not know is left alone', async () => {
    const s = await db.register_sessions.insert({ id: 'unknown', register_id: 'register',
      status: 'later-state' as unknown as RegisterSession['status'], opened_at_gmt: '2026-09-28T08:00:00.000Z', counted_float_minor: 10000 });
    await reconcile();
    const before = await stored(s.id);
    await (await command(s.id)).incrementalPatch(refused);
    await adopt();
    expect(await stored(s.id)).toStrictEqual(before);
    expect((await stored(s.id)).status).toBe('later-state');
  });

  describe("the store's counters (#651)", () => {
    const adoptWithCounters = () => adoptRegisterResults({ commands: db.register_commands, sessions: db.register_sessions,
      registerId: 'register', host: db.register_sessions, storeKey: 'store' });
    const bucket = async () => (await readRegister(db.register_sessions))?.stores.store?.registers?.register;
    const mint = () => mintClosureNumber(db.register_sessions, 'store', 'register');
    const counters = (lastClosureNumber: number, perpetualSalesTotalMinor: number, perpetualRefundsTotalMinor: number) =>
      ({ counters: { lastClosureNumber, perpetualSalesTotalMinor, perpetualRefundsTotalMinor } });
    const answer = async (type: RegisterCommand['type'], patch: Partial<RegisterCommand>) => {
      const [row] = await readFresh(db.register_commands, { selector: { type } });
      await (await db.register_commands.findOne(row.key).exec(true)).incrementalPatch(patch);
    };

    it("fresh storage takes the store's counters from an applied open, and numbers its next closure after them", async () => {
      await open();
      await reconcile();
      await answer('register.session.open', { syncStatus: 'applied', result: counters(41, 500000, 2000) });
      await adoptWithCounters();
      expect(await bucket()).toMatchObject({ last_closure_number: 41, perpetual_sales_total_minor: 500000, perpetual_refunds_total_minor: 2000 });
      expect(await mint()).toBe(42);
    });

    it('never lowers a counter, and raises each one on its own, from any applied row', async () => {
      for (let i = 0; i < 5; i++) await mint();
      await advancePerpetual(db.register_sessions, 'store', 'register', { salesMinor: 1000, refundsMinor: 0 });
      const s = await open();
      await startCounting(db.register_sessions, s.id);
      await reconcile();
      await answer('register.session.open', { syncStatus: 'applied' });
      await answer('register.session.transition', { syncStatus: 'applied', result: counters(3, 500, 300) });
      await adoptWithCounters();
      expect(await bucket()).toMatchObject({ last_closure_number: 5, perpetual_sales_total_minor: 1000, perpetual_refunds_total_minor: 300 });
      expect(await mint()).toBe(6);
    });

    it('is idempotent, a stale duplicate regresses nothing, and malformed or rejected counters are ignored', async () => {
      const s = await open();
      await recordMovement(db.register_sessions, db.cash_movements, db.closures,
        { sessionId: s.id, type: 'paid_out', amountMinor: 700, reason: 'Milk', actor: '7' });
      await startCounting(db.register_sessions, s.id);
      await reconcile();
      await answer('register.session.open', { syncStatus: 'applied', result: counters(41, 500000, 2000) });
      // A duplicate replays the counters recorded when its command was applied: older than the open's here.
      await answer('register.session.transition', { syncStatus: 'applied', result: counters(2, 10, 0) });
      await answer('register.movement.record', { syncStatus: 'rejected',
        error: { code: 'register_session_closed', message: 'Closed', data: counters(99, 900000, 9000) } });
      await adoptWithCounters();
      const first = await readRegister(db.register_sessions);
      expect(await bucket()).toMatchObject({ last_closure_number: 41, perpetual_sales_total_minor: 500000, perpetual_refunds_total_minor: 2000 });
      await adoptWithCounters();
      expect(await readRegister(db.register_sessions)).toStrictEqual(first);
      await answer('register.session.transition', { syncStatus: 'applied', result: { counters: { lastClosureNumber: 100.5,
        perpetualSalesTotalMinor: '900000', perpetualRefundsTotalMinor: Number.MAX_SAFE_INTEGER + 2 } } as unknown as RegisterCommand['result'] });
      await adoptWithCounters();
      expect(await readRegister(db.register_sessions)).toStrictEqual(first);
    });
  });
});

describe('ADR-082 unit 4: live at the store, approval status and reapproval', () => {
  const caps = { register: 3, registerApproval: { thresholdMinor: 500 } };
  const over = { counted: { cash: 9000 }, till_expected: { cash: 10000 } };
  const row = (syncStatus: RegisterCommand['syncStatus'], version: number, approval?: string) =>
    ({ syncStatus, version, payload: approval === undefined ? {} : { approval } });

  it('isLiveAtStore is true for an applied open of an open, counting or closed session', () => {
    for (const status of ['open', 'counting', 'closed'] as const) {
      expect(isLiveAtStore({ id: 's1', status }, { key: 'session.open:s1', syncStatus: 'applied' })).toBe(true);
    }
  });

  it('isLiveAtStore is false with no open row, a pending or refused one, another session\'s, or a conflict, superseded or abandoned session', () => {
    expect(isLiveAtStore(null, { key: 'session.open:s1', syncStatus: 'applied' })).toBe(false);
    expect(isLiveAtStore({ id: 's1', status: 'open' }, undefined)).toBe(false);
    expect(isLiveAtStore({ id: 's1', status: 'open' }, { key: 'session.open:s1', syncStatus: 'pending' })).toBe(false);
    expect(isLiveAtStore({ id: 's1', status: 'open' }, { key: 'session.open:s1', syncStatus: 'rejected' })).toBe(false);
    expect(isLiveAtStore({ id: 's1', status: 'open' }, { key: 'session.open:s2', syncStatus: 'applied' })).toBe(false);
    for (const status of ['conflict', 'superseded', 'abandoned'] as const) {
      expect(isLiveAtStore({ id: 's1', status }, { key: 'session.open:s1', syncStatus: 'applied' })).toBe(false);
    }
  });

  it('closureApprovalStatus is verified only once the store applies a version 3 row with a proof', () => {
    expect(closureApprovalStatus(over, null, caps)).toBe('unverified'); // offline: no row yet
    expect(closureApprovalStatus(over, row('pending', 1), caps)).toBe('unverified'); // queued without a proof
    expect(closureApprovalStatus(over, row('pending', 3, 'proof'), caps)).toBe('unverified');
    expect(closureApprovalStatus(over, row('rejected', 3, 'proof'), caps)).toBe('unverified');
    expect(closureApprovalStatus(over, row('rejected', 1), caps)).toBe('unverified');
    expect(closureApprovalStatus(over, row('applied', 1), caps)).toBe('unverified'); // recorded without a check
    expect(closureApprovalStatus(over, row('applied', 1, 'proof'), caps)).toBe('unverified'); // a version 1 row is never checked
    expect(closureApprovalStatus(over, row('applied', 3, ''), caps)).toBe('unverified');
    expect(closureApprovalStatus(over, row('applied', 3, 'proof'), caps)).toBe('verified');
  });

  it('closureApprovalStatus is not_required below the threshold, below contract 3 or without the store\'s registerApproval', () => {
    const applied = row('applied', 1);
    expect(closureApprovalStatus({ counted: { cash: 9500 }, till_expected: { cash: 10000 } }, applied, caps)).toBe('not_required');
    expect(closureApprovalStatus({ counted: { cash: 9499 }, till_expected: { cash: 10000 } }, applied, caps)).toBe('unverified');
    expect(closureApprovalStatus(over, applied, { register: 2, registerApproval: { thresholdMinor: 500 } })).toBe('not_required');
    expect(closureApprovalStatus(over, applied, { register: 3 })).toBe('not_required');
    expect(closureApprovalStatus(over, applied, undefined)).toBe('not_required');
  });

  describe('reapproveClosure', () => {
    let db: RxDatabase<{ register_commands: RegisterCommandCollection }>;
    const now = '2026-11-10T12:00:00.000Z';
    const key = 'closure.submit:c1';
    const payload = { closureId: 'c1', sessionId: 's1', registerId: 'register', number: 4, counted: { cash: 9000 },
      tillExpected: { cash: 10000 }, approvedBy: '8', approval: 'old-proof', orderIds: ['o1'] };
    beforeEach(async () => {
      db = await createRxDatabase({ name: `reapprove${Math.random().toString(36).slice(2)}`,
        storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
      await db.addCollections({ register_commands: registerCommandCollection() });
    });
    afterEach(async () => { await db.remove(); });
    const seed = (patch: Partial<RegisterCommand> = {}) => db.register_commands.insert({ key, registerId: 'register', seq: 7,
      commandId: 'old-command', type: 'register.closure.submit', version: 3, payload, createdAt: '2026-11-10T09:00:00.000Z',
      updatedAt: '2026-11-10T10:00:00.000Z', syncStatus: 'rejected',
      error: { code: 'register_approval_invalid', message: 'Refused', data: { reason: 'expired' } }, ...patch });
    const reapprove = (input: Partial<Parameters<typeof reapproveClosure>[0]> = {}) => reapproveClosure({ commands: db.register_commands,
      closureId: 'c1', approval: 'new-proof', approvedBy: '9', registerContract: 3, now, ...input });
    const current = async () => (await db.register_commands.findOne(key).exec(true)).toJSON();

    for (const code of ['register_approval_required', 'register_approval_invalid']) {
      it(`requeues a closure refused ${code} in its ledger place with a new command id, version 3 and the new proof`, async () => {
        const { error: _refused, ...before } = (await seed({ version: 1, error: { code, message: 'Refused' } })).toJSON();
        await reapprove();
        const after = await current();
        expect(after).toStrictEqual({ ...before, commandId: after.commandId, version: 3, syncStatus: 'pending', updatedAt: now,
          payload: { ...payload, approval: 'new-proof', approvedBy: '9' } });
        expect(after.commandId).not.toBe('old-command');
        expect(after).not.toHaveProperty('error');
        expect(await db.register_commands.find().exec()).toHaveLength(1);
      });
    }

    it('refuses below contract 3, without a proof or approver, and for a row the store did not refuse for its approval, writing nothing', async () => {
      await expect(reapprove()).rejects.toMatchObject({ code: 'REGISTER_REAPPROVE_NOT_REFUSED' }); // no row
      const before = (await seed()).toJSON();
      const refusals: Array<[Partial<Parameters<typeof reapproveClosure>[0]>, string]> = [
        [{ registerContract: 2 }, 'REGISTER_REAPPROVE_UNSUPPORTED'], [{ registerContract: undefined }, 'REGISTER_REAPPROVE_UNSUPPORTED'],
        [{ approval: '' }, 'REGISTER_REAPPROVE_PROOF_MISSING'], [{ approvedBy: '' }, 'REGISTER_REAPPROVE_PROOF_MISSING'],
      ];
      for (const [input, code] of refusals) {
        const attempt = reapprove(input);
        await expect(attempt).rejects.toBeInstanceOf(RegisterReapproveError);
        await expect(attempt).rejects.toMatchObject({ code });
      }
      expect(await current()).toStrictEqual(before);
      for (const patch of [{ error: { code: 'register_session_superseded', message: 'Superseded' } }, { syncStatus: 'pending' as const }]) {
        await (await db.register_commands.findOne(key).exec(true)).incrementalPatch(patch);
        const unchanged = await current();
        await expect(reapprove()).rejects.toMatchObject({ code: 'REGISTER_REAPPROVE_NOT_REFUSED' });
        expect(await current()).toStrictEqual(unchanged);
      }
    });
  });
});
