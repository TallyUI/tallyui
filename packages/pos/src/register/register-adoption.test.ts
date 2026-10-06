// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { readFresh } from '../rxdb';
import { abandonSession, adoptRegisterResults, takeOverSession } from './register-adoption';
import { reconcileRegisterCommands, registerCommandCollection, type RegisterCommandCollection } from './register-commands';
import { ensureRegister } from './register-document';
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
});
