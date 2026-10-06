// Gap (#172 re-review): #172's own tests keep useSale's `session` option undefined by hand, to show
// the race (Open then Cash in the same tick pins the session requireOpen confirmed, not the stale
// render). Nothing runs useRegisterSession and useSale together, as an app actually wires them
// (`session: register.saleSession`). This file does, on real memory RxDB collections.
import type { ReactNode } from 'react';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings as PricingSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { LogEntry } from '../logging';
import { catalogueEntries, saleLogger, useSale } from '../sale';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { addPosOrderCollection, type PosOrder } from '../pos-order';
import { ensureRegister } from './register-document';
import { cashMovementSchema, closureSchema, registerSessionCreator } from './schemas';
import type { CashMovementCollection, ClosureCollection, RegisterSessionCollection } from './session-store';
import { useRegisterSession, type UseRegisterSessionOptions } from './use-register-session';

const traits = medusaConnector.traits.product;
const product = { id: 'shirt', title: 'Shirt', status: 'published', variants: [
  { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
] };
const entries = catalogueEntries([product], traits);
const pricing: PricingSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };
const registerId = 'register-1';
const cashierRef = 'cashier@store.test';
const actor = { id: cashierRef, name: 'Cashier' };

let db: RxDatabase<{
  register_sessions: RegisterSessionCollection; cash_movements: CashMovementCollection; closures: ClosureCollection;
  pos_orders: RxCollection<PosOrder>;
}>;

beforeEach(async () => {
  const created: RxDatabase = await createRxDatabase({
    name: `pin${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await created.addCollections({
    register_sessions: registerSessionCreator(),
    cash_movements: { schema: cashMovementSchema },
    closures: { schema: closureSchema },
  });
  await addPosOrderCollection(created);
  db = created as unknown as typeof db;
  await ensureRegister(db.register_sessions, 'web');
});
afterEach(async () => {
  cleanup();
  await db.remove();
});

function registerOptions(overrides: Partial<UseRegisterSessionOptions> = {}): UseRegisterSessionOptions {
  return {
    sessions: db.register_sessions, movements: db.cash_movements, closures: db.closures, orders: db.pos_orders,
    register: db.register_sessions, storeKey: 'store', registerId, enabled: true, actor,
    timezone: 'UTC', softwareVersion: '1.0.0', tenderInProgress: false, ...overrides,
  };
}

/** Renders `useRegisterSession` and `useSale` together, as an app wires them: `session: register.saleSession`. */
function renderRegisterAndSale(onSaleCompleted: (posOrder: PosOrder) => void = vi.fn()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  return renderHook(() => {
    const register = useRegisterSession(registerOptions());
    const sale = useSale(pricing, { registerId, cashierRef, onSaleCompleted, session: register.saleSession });
    return { register, sale };
  }, { wrapper: Wrapper });
}

describe('the tender pins its session, through the real hooks (#172 race)', () => {
  const saleWarnings: LogEntry[] = [];
  saleLogger.addSink({ id: 'register-sale-pin-warn', levels: ['warn'], write: (entry) => saleWarnings.push(entry) });
  beforeEach(() => { saleWarnings.length = 0; });

  it('a tender started right after opening, with the confirmed session, is stamped to the new session', async () => {
    const onSaleCompleted = vi.fn();
    const view = renderRegisterAndSale(onSaleCompleted);
    act(() => { view.result.current.sale.add(entries[0], traits); });
    const before = view.result.current;
    expect(before.register.saleSession).toBeUndefined();
    let confirmed: { id: string; sessions: RegisterSessionCollection } | null = null;
    await act(async () => {
      await before.register.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 0 });
      confirmed = await before.register.requireSaleSession();
      before.sale.startTender('cash', { session: confirmed ?? undefined });
      before.sale.setTender({ method: 'cash', amountMinor: before.sale.order.totalMinor });
    });
    await waitFor(() => expect(view.result.current.register.saleSession?.id).toBe(confirmed!.id));
    await act(async () => { await view.result.current.sale.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    const order = onSaleCompleted.mock.calls[0][0] as PosOrder;
    expect(order.sessionId).toBe(confirmed!.id);
    expect(order).not.toHaveProperty('lateSessionId');
    expect(saleWarnings).toEqual([]);
  });

  it('the same sequence without the confirmed session is still stamped, by the backstop, with a warning', async () => {
    const onSaleCompleted = vi.fn();
    const view = renderRegisterAndSale(onSaleCompleted);
    act(() => { view.result.current.sale.add(entries[0], traits); });
    const before = view.result.current;
    let confirmed: { id: string; sessions: RegisterSessionCollection } | null = null;
    await act(async () => {
      await before.register.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 0 });
      confirmed = await before.register.requireSaleSession();
      before.sale.startTender('cash');
      before.sale.setTender({ method: 'cash', amountMinor: before.sale.order.totalMinor });
    });
    await waitFor(() => expect(view.result.current.register.saleSession?.id).toBe(confirmed!.id));
    await act(async () => { await view.result.current.sale.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    const order = onSaleCompleted.mock.calls[0][0] as PosOrder;
    expect(order.sessionId).toBe(confirmed!.id);
    expect(order).not.toHaveProperty('lateSessionId');
    expect(saleWarnings).toHaveLength(1);
  });
});
