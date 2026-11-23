import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { createOrderBuilder, orderDraftSchema } from '../order';
import { finalizeOrder, posOrderCollection, uuidv7, type PosOrder } from '../pos-order';
import { reopenRefusedOrder } from '../pos-order/reopen';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import { createTaxContext, TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { useSale } from './use-sale';

// A payment leg records when the money was taken (`takenAt`): as it is added captured, on capture, or at complete().
const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const first = '2026-11-21T10:15:00.000Z', later = '2026-11-21T10:20:00.000Z', last = '2026-11-21T10:25:00.000Z';

function Wrapper({ children }: { children: ReactNode }) {
  return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
}
function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}, withLine = true) {
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, ...overrides,
  }), { wrapper: Wrapper });
  if (withLine) act(() => { hook.result.current.add(entries[0], traits); });
  return hook;
}
const at = (iso: string) => vi.setSystemTime(new Date(iso));

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  at(first);
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useSale payment takenAt', () => {
  it('T1 stamps a cash and an external addTender leg at the call; a setTender leg has none', () => {
    const { result } = renderSale();
    act(() => { result.current.addTender({ method: 'external', amountMinor: 500 }); });
    at(later);
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 750 }); });
    expect(result.current.order.payments.map((payment) => payment.takenAt)).toEqual([first, later]);
    // The taken legs stay (ADR-072 d3, amended 2026-11-22); setTender's leg is added beside them, unstamped.
    act(() => { result.current.setTender({ method: 'external', amountMinor: 1250 }); });
    expect(result.current.order.payments.map((payment) => payment.takenAt)).toEqual([first, later, undefined]);
    expect(result.current.order.payments[2]).not.toHaveProperty('takenAt');
  });

  it('T2 keeps takenAt on a leg whose reference is dropped', () => {
    const { result } = renderSale();
    act(() => { result.current.addTender({ method: 'external', amountMinor: 1250, reference: 'bad\u0000ref' }); });
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).not.toHaveProperty('reference');
    expect(result.current.order.payments[0].takenAt).toBe(first);
  });

  it('T3 a pending leg has no takenAt until it is captured, then the capture instant', () => {
    const { result } = renderSale();
    let id: string | null = null;
    act(() => { id = result.current.addTender({ method: 'external', amountMinor: 1250, status: 'pending' }); });
    expect(result.current.order.payments[0]).not.toHaveProperty('takenAt');
    at(later);
    act(() => { expect(result.current.setTenderStatus(id!, 'authorized')).toBe(true); });
    expect(result.current.order.payments[0]).not.toHaveProperty('takenAt');
    at(last);
    act(() => { expect(result.current.setTenderStatus(id!, 'captured')).toBe(true); });
    expect(result.current.order.payments[0]).toMatchObject({ status: 'captured', takenAt: last });
  });

  it('T4 finalize puts takenAt on the stored order payment', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 1250 }); });
    at(later);
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toEqual([expect.objectContaining({ method: 'cash', amountMinor: 1250, takenAt: first })]);
  });

  it('T5 the card tender opened at t0 and completed at t1 stores t1', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => { result.current.startTender('external'); });
    at(later);
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted.mock.calls[0][0].payments).toEqual([expect.objectContaining({ method: 'external', amountMinor: 1250, takenAt: later })]);
  });

  it('T6 a pending leg captured at t1 and completed at t2 stores t1', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    let id: string | null = null;
    act(() => { id = result.current.addTender({ method: 'external', amountMinor: 1250, status: 'pending' }); });
    at(later);
    act(() => { expect(result.current.setTenderStatus(id!, 'captured')).toBe(true); });
    at(last);
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted.mock.calls[0][0].payments).toEqual([expect.objectContaining({ takenAt: later })]);
  });

  it('T7 a reopened leg with no takenAt completes without one', async () => {
    const db = await createRxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>({
      name: `takenat${uuidv7().replaceAll('-', '')}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema }, register_sessions: registerSessionCreator() });
      const taxContext = createTaxContext(taxProviderProps(pricing));
      const builder = createOrderBuilder({ currency: 'EUR', taxContext });
      builder.addLine({ productId: 'shirt', name: 'Shirt', unitPrice: { amount: 1250, currency: 'EUR' } });
      builder.addPayment({ method: 'cash', amountMinor: 1250 });
      const refused: PosOrder = { ...finalizeOrder(builder.getSnapshot()), syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'x' } };
      expect(refused.payments[0]).not.toHaveProperty('takenAt');
      await db.pos_orders.insert(refused);
      const id = await reopenRefusedOrder(refused.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext });
      const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
      const { result } = renderSale({ onSaleCompleted, drafts: db.order_drafts }, false);
      await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
      expect(result.current.order.payments[0]).toMatchObject({ reopened: true });
      at(later);
      await act(async () => { await result.current.complete(); });
      expect(onSaleCompleted).toHaveBeenCalledTimes(1);
      expect(onSaleCompleted.mock.calls[0][0].payments).toHaveLength(1);
      expect(onSaleCompleted.mock.calls[0][0].payments[0]).not.toHaveProperty('takenAt');
    } finally { cleanup(); await db.remove(); }
  });

  it("a captured leg is stamped with its tender's session; a resumed leg keeps its stamp", async () => {
    const db = await createRxDatabase<{ order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>({
      name: `legsession${uuidv7().replaceAll('-', '')}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    try {
      await db.addCollections({ order_drafts: { schema: orderDraftSchema }, register_sessions: registerSessionCreator() });
      const { result } = renderSale({ drafts: db.order_drafts, session: { id: 'session-a', sessions: db.register_sessions } });
      act(() => { result.current.startTender('cash'); });
      act(() => { result.current.addTender({ method: 'cash', amountMinor: 500 }); });
      act(() => { result.current.cancelTender(); });
      expect(result.current.order.payments).toEqual([expect.objectContaining({ takenAt: first, sessionId: 'session-a' })]);
      const id = result.current.order.id;
      await act(async () => { expect(await result.current.park()).toBeNull(); });
      await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
      act(() => { result.current.startTender('cash', { session: { id: 'session-b', sessions: db.register_sessions } }); });
      act(() => { result.current.addTender({ method: 'cash', amountMinor: 750 }); });
      expect(result.current.order.payments.map((payment) => payment.sessionId)).toEqual(['session-a', 'session-b']);
    } finally { cleanup(); await db.remove(); }
  });
});
