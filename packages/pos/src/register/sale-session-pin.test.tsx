// Gap (#172 re-review): #172's own tests keep useSale's `session` option undefined by hand, to show
// the race (Open then Cash in the same tick pins the session requireOpen confirmed, not the stale
// render). Nothing runs useRegisterSession and useSale together, as an app actually wires them
// (`session: register.saleSession`). This file does, on real memory RxDB collections.
import { useRef, type ReactNode } from 'react';
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
import { orderDraftSchema } from '../order/order-drafts';
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
    timezone: 'UTC', softwareVersion: '1.0.0', tenderInProgress: false, drafts: null, liveSale: null, ...overrides,
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

  // DECISIONS.md:4210 lets a sale holding a captured leg park, so the drawer side is asserted (desk ruling, batch 9 Q1).
  it('a part-paid sale parked across a close counts its cash once, in the session that took it (S3)', async () => {
    const { order_drafts } = await db.addCollections({ order_drafts: { schema: orderDraftSchema } });
    const completed: PosOrder[] = [];
    const view = renderHook(() => {
      const register = useRegisterSession(registerOptions({ drafts: order_drafts }));
      const sale = useSale(pricing, { registerId, cashierRef, capabilities: { orderCreate: 12 }, drafts: order_drafts,
        onSaleCompleted: async (posOrder) => { completed.push(posOrder); await db.pos_orders.insert(posOrder); }, session: register.saleSession });
      return { register, sale };
    }, { wrapper: ({ children }: { children: ReactNode }) => <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider> });
    const now = () => view.result.current;
    let a: { id: string; sessions: RegisterSessionCollection } | null = null;
    await act(async () => {
      await now().register.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 0 });
      a = await now().register.requireSaleSession();
    });
    act(() => { expect(now().sale.addCustomLine({ name: 'Item', priceMinor: 1000, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
    act(() => { now().sale.startTender('cash', { session: a ?? undefined }); });
    act(() => { expect(now().sale.addTender({ method: 'cash', amountMinor: 400 })).toEqual(expect.any(String)); });
    act(() => { now().sale.cancelTender(); });
    const id = now().sale.order.id;
    await act(async () => { expect(await now().sale.park()).toBeNull(); });
    let closureA: Awaited<ReturnType<ReturnType<typeof useRegisterSession>['actions']['closeSession']>> | undefined;
    await act(async () => { closureA = await now().register.actions.closeSession({ counted: { cash: 400 } }); });
    let b: { id: string; sessions: RegisterSessionCollection } | null = null;
    await act(async () => {
      await now().register.actions.openSession({ expectedFloatMinor: null, countedFloatMinor: 0 });
      b = await now().register.requireSaleSession();
    });
    await act(async () => { expect(await now().sale.resume(id)).toBeNull(); });
    act(() => { now().sale.startTender('cash', { session: b ?? undefined }); });
    act(() => { expect(now().sale.addTender({ method: 'cash', amountMinor: 600 })).toEqual(expect.any(String)); });
    await act(async () => { await now().sale.complete(); });
    expect({ stage: now().sale.stage.kind, error: now().sale.error }).toEqual({ stage: 'receipt', error: null });
    expect(completed).toMatchObject([{ sessionId: b!.id, totalMinor: 1000 }]);
    expect(await db.pos_orders.findOne(completed[0].id).exec()).not.toBeNull();
    expect(closureA!.till_expected.cash).toBe(400);
    await waitFor(() => expect(now().register.expected.cash).toBe(600));
  });

  type Pinned = { id: string; sessions: RegisterSessionCollection };
  type Closed = Awaited<ReturnType<ReturnType<typeof useRegisterSession>['actions']['closeSession']>>;
  /** A Z's `payment_methods` sales for one method (writeClosure freezes it in `breakdowns`). */
  const sales = (closure: Closed, method: string) =>
    (closure.breakdowns.payment_methods as Record<string, { sales_minor: number }> | undefined)?.[method]?.sales_minor;
  /** The register and the sale wired as an app does, with `liveSale` reading the sale through a ref (S3). */
  async function wired() {
    const { order_drafts } = await db.addCollections({ order_drafts: { schema: orderDraftSchema } });
    const completed: PosOrder[] = [];
    const view = renderHook(() => {
      const saleRef = useRef<ReturnType<typeof useSale> | null>(null);
      const register = useRegisterSession(registerOptions({ drafts: order_drafts, liveSale: () => saleRef.current?.takenLegs() ?? [] }));
      const sale = useSale(pricing, { registerId, cashierRef, capabilities: { orderCreate: 12 }, drafts: order_drafts,
        onSaleCompleted: async (posOrder) => { completed.push(posOrder); await db.pos_orders.insert(posOrder); }, session: register.saleSession });
      saleRef.current = sale;
      return { register, sale };
    }, { wrapper: ({ children }: { children: ReactNode }) => <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider> });
    const now = () => view.result.current;
    const open = async (countedFloatMinor: number) => {
      let pinned: Pinned | null = null;
      await act(async () => {
        await now().register.actions.openSession({ expectedFloatMinor: null, countedFloatMinor });
        pinned = await now().register.requireSaleSession();
      });
      return pinned! as Pinned;
    };
    const close = async (cash: number) => {
      let closure: Closed | undefined;
      await act(async () => { closure = await now().register.actions.closeSession({ counted: { cash } }); });
      return closure!;
    };
    return { now, open, close, completed };
  }
  /** F1's steps: A, a line, cash 400, cancelTender (the leg stays, DECISIONS.md:4210), close A. */
  async function cashLeftInCart() {
    const till = await wired();
    const a = await till.open(1000);
    act(() => { expect(till.now().sale.addCustomLine({ name: 'Item', priceMinor: 1000, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
    act(() => { till.now().sale.startTender('cash', { session: a }); });
    act(() => { expect(till.now().sale.addTender({ method: 'cash', amountMinor: 400 })).toEqual(expect.any(String)); });
    act(() => { till.now().sale.cancelTender(); });
    return { ...till, a };
  }

  it('F1 S3: a taken leg left in the cart by cancelTender counts on the closing session\'s Z', async () => {
    const { now, close } = await cashLeftInCart();
    await waitFor(() => expect(now().register.expected.cash).toBe(1400));
    const closureA = await close(1400);
    expect(closureA.till_expected.cash).toBe(1400);
    expect(sales(closureA, 'cash')).toBe(400);
  });

  it('F2 S3: ... and is not counted again on the next session\'s Z when the sale completes there', async () => {
    const { now, open, close, completed } = await cashLeftInCart();
    await close(1400);
    const b = await open(500);
    act(() => { now().sale.startTender('cash', { session: b }); });
    act(() => { expect(now().sale.addTender({ method: 'cash', amountMinor: 600 })).toEqual(expect.any(String)); });
    await act(async () => { await now().sale.complete(); });
    expect({ stage: now().sale.stage.kind, error: now().sale.error }).toEqual({ stage: 'receipt', error: null });
    expect(completed).toMatchObject([{ sessionId: b.id, totalMinor: 1000 }]);
    const closureB = await close(1100);
    expect(closureB.till_expected.cash).toBe(1100);
    expect(sales(closureB, 'cash')).toBe(600);
  });

  it('F3 S3: a pending leg is stamped with the session that captures it', async () => {
    const { now, open, close, completed } = await wired();
    const a = await open(0);
    act(() => { expect(now().sale.addCustomLine({ name: 'Item', priceMinor: 1000, taxStatus: 'none' })).toMatchObject({ id: expect.any(String) }); });
    act(() => { now().sale.startTender('cash', { session: a }); });
    let leg: string | null = null;
    act(() => { leg = now().sale.addTender({ method: 'external', amountMinor: 1000, status: 'pending' }); });
    act(() => { now().sale.cancelTender(); });
    const id = now().sale.order.id;
    await act(async () => { expect(await now().sale.park()).toBeNull(); });
    const closureA = await close(0);
    expect(sales(closureA, 'external')).toBeUndefined();
    const b = await open(0);
    await act(async () => { expect(await now().sale.resume(id)).toBeNull(); });
    act(() => { now().sale.startTender('cash', { session: b }); });
    act(() => { expect(now().sale.setTenderStatus(leg!, 'captured')).toBe(true); });
    expect(now().sale.order.payments).toEqual([expect.objectContaining({ id: leg, status: 'captured', sessionId: b.id })]);
    await act(async () => { await now().sale.complete(); });
    expect(completed).toMatchObject([{ sessionId: b.id, payments: [{ method: 'external', amountMinor: 1000, sessionId: b.id }] }]);
    const closureB = await close(0);
    expect(sales(closureB, 'external')).toBe(1000);
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
