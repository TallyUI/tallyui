// Shared harness for the register/ component tests (register-screens-a, ADR-032 amendment 1):
// a real useRegisterSession over a real memory-RxDB register-sessions/cash_movements/closures
// set, the same shape as packages/pos/src/register/use-register-session.test.tsx, rendering the
// lifted RegisterBar/OpenRegisterCard/MovementSheet/RegisterPanel instead of a mocked hook.
import type { ReactNode } from 'react';
import { PortalHost } from '@tallyui/primitives';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  addPosOrderCollection,
  addRegisterSessionCollection,
  cashMovementSchema,
  closureSchema,
  ensureRegister,
  openSession,
  recordMovement,
  useRegisterSession,
  type CashMovementCollection,
  type ClosureCollection,
  type RegisterSessionCollection,
  type UseRegisterSessionOptions,
} from '@tallyui/pos';
import type { RxCollection } from 'rxdb';
import type { PosOrder } from '@tallyui/pos';

export type RegisterDb = RxDatabase<{
  register_sessions: RegisterSessionCollection;
  cash_movements: CashMovementCollection;
  closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>;
}>;

export async function createRegisterDb(): Promise<RegisterDb> {
  const db: RxDatabase = await createRxDatabase({
    name: `register-harness${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
  });
  await addRegisterSessionCollection(db);
  await addPosOrderCollection(db);
  await ensureRegister(db.register_sessions as RegisterSessionCollection, 'web');
  return db as unknown as RegisterDb;
}

export const actor = { id: '7', name: 'Pat' };

export function registerOptions(db: RegisterDb, overrides: Partial<UseRegisterSessionOptions> = {}): UseRegisterSessionOptions {
  return {
    sessions: db.register_sessions, movements: db.cash_movements, closures: db.closures, orders: db.pos_orders,
    register: db.register_sessions, storeKey: 'store', registerId: 'register', enabled: true, actor,
    timezone: 'UTC', softwareVersion: '1.0.0', tenderInProgress: false, ...overrides,
  };
}

export function seedSession(db: RegisterDb, countedFloatMinor = 10000, registerId = 'register') {
  return openSession(db.register_sessions, {
    registerId, expectedFloatMinor: null, countedFloatMinor, openedBy: actor.id,
    businessDay: { year: 2026, month: 9, day: 20 },
  });
}

export function seedMovement(
  db: RegisterDb,
  sessionId: string,
  type: 'paid_in' | 'paid_out' | 'no_sale',
  amountMinor: number,
  reason = 'Float top-up',
) {
  return recordMovement(db.register_sessions, db.cash_movements, db.closures, {
    sessionId, type, amountMinor, reason, actor: actor.id,
  });
}

/** Renders `children` with a real `useRegisterSession`, options overridable per test. */
export function RegisterHarness({
  db,
  overrides,
  children,
}: {
  db: RegisterDb;
  overrides?: Partial<UseRegisterSessionOptions>;
  children: (register: ReturnType<typeof useRegisterSession>) => ReactNode;
}) {
  const register = useRegisterSession(registerOptions(db, overrides));
  return (
    <>
      {children(register)}
      {/* RegisterPanel/MovementSheet render through Dialog's Portal, which needs a host
          mounted in the tree (as every Dialog/Popover/... consumer in this repo does once
          per screen) — without it, the portalled content silently never appears. */}
      <PortalHost />
    </>
  );
}
