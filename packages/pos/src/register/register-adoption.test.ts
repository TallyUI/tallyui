// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { readFresh } from '../rxdb';
import { adoptRegisterResults } from './register-adoption';
import { reconcileRegisterCommands, registerCommandCollection, type RegisterCommandCollection } from './register-commands';
import { ensureRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCreator, type RegisterSession } from './schemas';
import { closeSession, openSession, recordMovement, startCounting,
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

  it('a superseded rejection on any command moves open, counting or conflict to superseded', async () => {
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
      await adopt();
      expect((await stored(s.id)).status).toBe('superseded');
      if (status === 'counting') expect((await stored(s.id)).server_session_id).toBe('server-1');
      const revision = (await stored(s.id))._rev;
      await adopt();
      expect((await stored(s.id))._rev).toBe(revision);
    }
  });

  it('terminal statuses are never moved', async () => {
    const closed = await open();
    const superseded = await open();
    const abandoned = await db.register_sessions.insert({ id: 'abandoned', register_id: 'register', status: 'abandoned',
      opened_at_gmt: '2026-09-28T08:00:00.000Z', counted_float_minor: 10000 });
    await reconcile();
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
