/**
 * A real `useRegisterSession` over a fresh memory-RxDB register, for the `pos/register/*` demo
 * screens (register-screens-a). Each demo page gets its own throwaway database and seeds it
 * itself — a real app owns one database for the whole session, not one per screen.
 */
import { useEffect, useRef, useState } from 'react';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import {
  addPosOrderCollection,
  cashMovementSchema,
  closureSchema,
  ensureRegister,
  registerSessionCollection,
  useRegisterSession,
  type CashMovementCollection,
  type ClosureCollection,
  type PosOrder,
  type RegisterHost,
  type RegisterSessionCollection,
  type UseRegisterSessionOptions,
} from '@tallyui/pos';

export type DemoRegisterDb = RxDatabase<{
  register_sessions: RegisterSessionCollection;
  cash_movements: CashMovementCollection;
  closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>;
}>;

export const DEMO_ACTOR = { id: 'demo-cashier', name: 'Demo cashier' };
export const DEMO_CURRENCY = 'EUR';

export function useDemoRegister({
  registerId = 'demo-register',
  seed,
  ...overrides
}: Partial<Omit<UseRegisterSessionOptions, 'sessions' | 'movements' | 'closures' | 'orders' | 'register'>> & {
  registerId?: string | null;
  seed?: (db: DemoRegisterDb) => Promise<void>;
} = {}) {
  const [db, setDb] = useState<DemoRegisterDb | null>(null);
  const seededRef = useRef(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const created = await createRxDatabase({
        name: `demo-register-${Math.random().toString(36).slice(2)}`,
        storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
        multiInstance: false,
      });
      await created.addCollections({
        register_sessions: registerSessionCollection(),
        cash_movements: { schema: cashMovementSchema },
        closures: { schema: closureSchema },
      });
      await addPosOrderCollection(created);
      const typed = created as unknown as DemoRegisterDb;
      await ensureRegister(typed.register_sessions, 'web');
      if (seed && !seededRef.current) {
        seededRef.current = true;
        await seed(typed);
      }
      if (!cancelled) setDb(typed);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  const register = useRegisterSession({
    sessions: db?.register_sessions ?? null,
    movements: db?.cash_movements ?? null,
    closures: db?.closures ?? null,
    orders: db?.pos_orders ?? null,
    register: (db?.register_sessions ?? null) as unknown as RegisterHost,
    storeKey: 'store',
    registerId,
    enabled: !!db,
    actor: DEMO_ACTOR,
    timezone: 'UTC',
    softwareVersion: '1.0.0',
    tenderInProgress: false,
    ...overrides,
  });
  return { register, ready: !!db, db };
}
