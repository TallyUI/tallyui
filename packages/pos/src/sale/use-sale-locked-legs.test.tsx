import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { createOrderBuilder, orderDraftSchema, writeOrderDraft } from '../order';
import { posOrderCollection } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { useSale } from './use-sale';

const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const taxContext = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
let db: RxDatabase | undefined;

async function resumeSale(covered = false) {
  db = await createRxDatabase({
    name: `lockedlegs${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  const { pos_drafts: drafts, pos_orders: orders } = await db.addCollections({
    pos_drafts: { schema: orderDraftSchema }, pos_orders: posOrderCollection(),
  });
  const builder = createOrderBuilder({ currency: 'EUR', taxContext, storeOrder: { id: '41', revision: 'sha256:a' } });
  builder.addLine({ productId: 'coffee', name: 'Coffee', storeLineId: '7', unitPrice: { amount: 1000, currency: 'EUR' } });
  builder.addPayment({
    method: 'external', amountMinor: covered ? builder.getSnapshot().totalMinor : 500,
    reference: 'Cash', storePaymentId: 'p1', locked: true,
  });
  const snapshot = builder.getSnapshot();
  await writeOrderDraft(drafts, snapshot);
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, drafts,
    onSaleCompleted: async (order) => { await orders.insert(order); },
  }), { wrapper: Wrapper });
  await act(async () => { expect(await hook.result.current.resume(snapshot.id)).toBeNull(); });
  const lockedLeg = hook.result.current.order.payments.find((payment) => payment.storePaymentId === 'p1')!;
  return { ...hook, lockedLeg, orders };
}

afterEach(async () => {
  cleanup();
  if (db) await db.remove();
  db = undefined;
});

describe('useSale locked legs', () => {
  it('resume keeps the store order, the kept line id and the locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    expect(result.current.order.storeOrder).toEqual({ id: '41', revision: 'sha256:a' });
    expect(result.current.order.lineItems).toMatchObject([{ storeLineId: '7' }]);
    expect(lockedLeg).toEqual({
      id: expect.any(String), method: 'external', amountMinor: 500,
      reference: 'Cash', storePaymentId: 'p1', locked: true,
    });
    expect(result.current.order.payments).toEqual([lockedLeg]);
  });

  it('removeTender leaves a locked leg on the sale', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { expect(() => result.current.removeTender(lockedLeg.id)).not.toThrow(); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    expect(result.current.error).toBeNull();
  });

  it('voidTender refuses a locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { expect(result.current.voidTender(lockedLeg.id)).toBe(false); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    expect(result.current.order.payments[0]).not.toHaveProperty('status');
  });

  it('an external tender takes only the balance after the locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.payments).toEqual([
      lockedLeg, { id: expect.any(String), method: 'external', amountMinor: result.current.order.totalMinor - 500 },
    ]);
    expect(result.current.order.payments[1]).not.toHaveProperty('storePaymentId');
    expect(result.current.order.payments[1]).not.toHaveProperty('locked');
  });

  it.each([
    ['addFee', 'fees', 'f9'], ['addShipping', 'shipping', 's9'],
  ] as const)('%s drops a caller-supplied store id', async (add, collection, storeLineId) => {
    const { result } = await resumeSale();
    act(() => {
      expect(result.current[add]({ name: 'Handling', amountMinor: 100, storeLineId })).toEqual({ id: expect.any(String) });
    });
    expect(result.current.order[collection]).toHaveLength(1);
    expect(result.current.order[collection]![0]).not.toHaveProperty('storeLineId');
  });

  it('complete refuses a fully tendered reopened cart without writing an order', async () => {
    const { result, orders } = await resumeSale();
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.balanceDueMinor).toBe(0);
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe('finalize: a reopened store order cannot be completed by this version of TallyUI');
    expect(await orders.find().exec()).toEqual([]);
  });

  it('a cash tender and a cancelled tender keep the locked leg', async () => {
    const { result, lockedLeg } = await resumeSale();
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.payments).toHaveLength(2);
    act(() => { result.current.startTender('cash'); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 100 }); });
    expect(result.current.order.payments).toHaveLength(2);
    act(() => { result.current.cancelTender(); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
    expect(result.current.stage.kind).toBe('cart');
  });

  it('a locked leg that covers the total adds no external leg', async () => {
    const { result, lockedLeg } = await resumeSale(true);
    expect(lockedLeg.amountMinor).toBe(result.current.order.totalMinor);
    act(() => { result.current.startTender('external'); });
    expect(result.current.order.payments).toEqual([lockedLeg]);
  });
});
