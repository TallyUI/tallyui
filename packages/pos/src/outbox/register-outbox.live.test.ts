// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import { createRxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { uuidv7 } from '../pos-order';
import { ensureRegister, readRegister } from '../register/register-document';
import { reconcileRegisterCommands, registerCommandCollection, type RegisterCommandCollection } from '../register/register-commands';
import { cashMovementSchema, closureSchema, registerSessionCreator } from '../register/schemas';
import { closeSession, openSession, recordMovement, startCounting, writeClosure,
  type CashMovementCollection, type ClosureCollection, type RegisterSessionCollection } from '../register/session-store';
import { readFresh } from '../rxdb';
import { createHttpCommandTransport } from './http-transport';
import { createRegisterOutbox, type RegisterOutbox } from './register-outbox';

const { TALLY_LIVE_BASE_URL: baseUrl, TALLY_LIVE_TOKEN: token } = process.env;
describe.skipIf(!baseUrl || !token)('live register outbox', () => {
  it('applies a fresh session, paid_in, counting, closed and numbered closure', async () => {
    const db = await createRxDatabase<{
      register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection;
      closures: ClosureCollection; register_commands: RegisterCommandCollection;
    }>({ name: `liveregister${uuidv7().replaceAll('-', '')}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    let outbox: RegisterOutbox | undefined;
    try {
      await db.addCollections({ register_sessions: registerSessionCreator(), cash_movements: { schema: cashMovementSchema },
        closures: { schema: closureSchema }, register_commands: registerCommandCollection() });
      const device = await ensureRegister(db.register_sessions, 'web');
      const registerId = uuidv7(), storeKey = 'live-check';
      const at = new Date();
      // Separate transition timestamps ensure their deterministic ledger keys are distinct.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(at);
      const reconcile = () => reconcileRegisterCommands({ commands: db.register_commands, sessions: db.register_sessions,
        movements: db.cash_movements, closures: db.closures, host: db.register_sessions, storeKey, registerId });
      const session = await openSession(db.register_sessions, { registerId, storeKey, openedBy: 'live-check',
        expectedFloatMinor: 0, countedFloatMinor: 0,
        businessDay: { year: at.getUTCFullYear(), month: at.getUTCMonth() + 1, day: at.getUTCDate() } });
      await reconcile();
      vi.setSystemTime(at.getTime() + 1000);
      const movement = await recordMovement(db.register_sessions, db.cash_movements, db.closures,
        { sessionId: session.id, type: 'paid_in', amountMinor: 500, reason: 'live check', actor: 'live-check' });
      await reconcile();
      vi.setSystemTime(at.getTime() + 2000);
      await startCounting(db.register_sessions, session.id);
      await reconcile();
      vi.setSystemTime(at.getTime() + 3000);
      const closed = await closeSession(db.register_sessions, session.id, { counted: { cash: 500 }, closedBy: 'live-check' });
      const before = await readRegister(db.register_sessions);
      const number = (before?.stores[storeKey]?.registers?.[registerId]?.last_closure_number ?? 0) + 1;
      const closure = await writeClosure({ closures: db.closures, register: db.register_sessions, storeKey,
        session: closed, counted: 500, otherTenders: {}, movements: [movement], orders: [], softwareVersion: '2.1.0' });
      expect(closure.number).toBe(number);
      await reconcile();
      vi.useRealTimers();
      const commands = await readFresh(db.register_commands, { selector: {}, sort: [{ seq: 'asc' }] });
      expect(commands.map(({ type }) => type)).toEqual(['register.session.open', 'register.movement.record',
        'register.session.transition', 'register.session.transition', 'register.closure.submit']);
      outbox = createRegisterOutbox({ collection: db.register_commands, deviceId: device.id,
        transport: createHttpCommandTransport({ baseUrl: baseUrl!, getHeaders: () => ({ Authorization: `Bearer ${token}` }) }) });
      await outbox.flush();
      const after = await readFresh(db.register_commands, { selector: {}, sort: [{ seq: 'asc' }] });
      expect(after.map(({ syncStatus, error }) => ({ syncStatus, error }))).toEqual(
        commands.map(() => ({ syncStatus: 'applied', error: undefined })),
      );
    } finally {
      outbox?.stop();
      vi.useRealTimers();
      await db.remove();
    }
  }, 60000);
});
