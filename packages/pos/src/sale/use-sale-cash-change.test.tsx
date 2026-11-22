import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxCollection } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { createOrderBuilder, orderDraftSchema, writeOrderDraft } from '../order';
import { finalizeOrder, posOrderCollection, uuidv7, type PosOrder } from '../pos-order';
import { reopenRefusedOrder } from '../pos-order/reopen';
import { buildReceiptData } from '../receipt/build-receipt-data';
import { registerSessionCreator } from '../register/schemas';
import type { RegisterSessionCollection } from '../register/session-store';
import { createTaxContext, TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { NOTHING_DUE, useSale } from './use-sale';

// Row 500: a cash leg taken through addTender records the amount applied, the amount handed over and the change.
const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 15, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const taxContext = createTaxContext(taxProviderProps(pricing));

function Wrapper({ children }: { children: ReactNode }) {
  return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
}
function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}, withLine = true) {
  const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, onSaleCompleted, ...overrides,
  }), { wrapper: Wrapper });
  if (withLine) act(() => { hook.result.current.add(entries[0], traits); });
  if (withLine) expect(hook.result.current.order.totalMinor).toBe(1500);
  return { result: hook.result, onSaleCompleted };
}
async function withDb(run: (db: { pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }) => Promise<void>) {
  const db = await createRxDatabase<{ pos_orders: RxCollection<PosOrder>; order_drafts: RxCollection; register_sessions: RegisterSessionCollection }>({
    name: `cashchange${uuidv7().replaceAll('-', '')}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
  try {
    await db.addCollections({ pos_orders: posOrderCollection(), order_drafts: { schema: orderDraftSchema }, register_sessions: registerSessionCreator() });
    await run(db);
  } finally { cleanup(); await db.remove(); }
}
function grossBuilder() {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext });
  builder.addLine({ productId: 'shirt', name: 'Shirt', unitPrice: { amount: 1500, currency: 'EUR' } });
  return builder;
}

afterEach(cleanup);

describe('useSale cash leg records its change (row 500)', () => {
  it('C1: card 1000 + cash 1000 on 1500, then the card is voided: the till asks 1000', () => {
    const { result } = renderSale();
    let cardId: string | null = null;
    act(() => {
      cardId = result.current.addTender({ method: 'external', amountMinor: 1000 });
      expect(result.current.addTender({ method: 'cash', amountMinor: 1000 })).toEqual(expect.any(String));
    });
    expect(result.current.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 500, tenderedMinor: 1000, changeMinor: 500 });
    act(() => { expect(result.current.voidTender(cardId!)).toBe(true); });
    expect(result.current.order).toMatchObject({ paidMinor: 500, balanceDueMinor: 1000 });
  });

  it('C2a: refuses cash with NOTHING_DUE once a captured card covers the total', () => {
    const { result } = renderSale();
    act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 1500 })).toEqual(expect.any(String)); });
    const payments = result.current.order.payments;
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toBeNull(); });
    expect(result.current.error).toBe(NOTHING_DUE);
    expect(result.current.order.payments).toEqual(payments);
  });

  it('C2b: refuses cash with NOTHING_DUE once a pending external leg covers the total', () => {
    const { result } = renderSale();
    act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 1500, status: 'pending' })).toEqual(expect.any(String)); });
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 500 })).toBeNull(); });
    expect(result.current.error).toBe(NOTHING_DUE);
    expect(result.current.order.payments).toHaveLength(1);
  });

  it('C3: judges cash against the balance less a pending external leg', () => {
    const { result } = renderSale();
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000, status: 'pending' });
      expect(result.current.addTender({ method: 'cash', amountMinor: 1000 })).toEqual(expect.any(String));
    });
    expect(result.current.order.payments[1]).toMatchObject({ method: 'cash', amountMinor: 500, tenderedMinor: 1000, changeMinor: 500 });
  });

  it('C4: cash 2000 on 1500 stores 1500/2000/500 and the receipt prints 20.00 tendered, 5.00 change, 15.00 paid', async () => {
    const { result, onSaleCompleted } = renderSale();
    act(() => { expect(result.current.addTender({ method: 'cash', amountMinor: 2000 })).toEqual(expect.any(String)); });
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toMatchObject([{ method: 'cash', amountMinor: 1500, tenderedMinor: 2000, changeMinor: 500 }]);
    const stage = result.current.stage;
    if (stage.kind !== 'receipt') throw new Error('Sale did not complete');
    const receipt = buildReceiptData(stage.order, { storeName: 'Test Shop' });
    expect(receipt.payments).toMatchObject([{ method: 'cash', amountMinor: 2000, changeMinor: 500 }]);
    expect(receipt.changeDueMinor).toBe(500);
    expect(stage.order.paidMinor).toBe(1500);
  });

  it('C5: two cash legs of 1000 on 1500 store 1000/1000/0 and 500/1000/500', async () => {
    const { result, onSaleCompleted } = renderSale();
    act(() => {
      result.current.addTender({ method: 'cash', amountMinor: 1000 });
      result.current.addTender({ method: 'cash', amountMinor: 1000 });
    });
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted.mock.calls[0][0].payments).toMatchObject([
      { method: 'cash', amountMinor: 1000, tenderedMinor: 1000, changeMinor: 0 },
      { method: 'cash', amountMinor: 500, tenderedMinor: 1000, changeMinor: 500 },
    ]);
  });

  it('C6: a parked draft with a gross cash leg totals and finalizes as before', async () => {
    await withDb(async (db) => {
      const builder = grossBuilder();
      builder.addPayment({ method: 'cash', amountMinor: 2000, takenAt: '2026-11-22T10:00:00.000Z' });
      await writeOrderDraft(db.order_drafts, builder.getSnapshot());
      const { result, onSaleCompleted } = renderSale({ drafts: db.order_drafts }, false);
      await act(async () => { expect(await result.current.resume(builder.getSnapshot().id)).toBeNull(); });
      expect(result.current.order).toMatchObject({ paidMinor: 2000, changeDueMinor: 500 });
      expect(result.current.order.payments[0].tenderedMinor).toBeUndefined();
      await act(async () => { await result.current.complete(); });
      expect(onSaleCompleted.mock.calls[0][0].payments).toMatchObject([{ method: 'cash', amountMinor: 1500, tenderedMinor: 2000, changeMinor: 500 }]);
    });
  });

  it('C7: a reopened order whose cash leg gave change finalizes as before', async () => {
    await withDb(async (db) => {
      const builder = grossBuilder();
      builder.addPayment({ method: 'cash', amountMinor: 2000 });
      const refused: PosOrder = { ...finalizeOrder(builder.getSnapshot()), syncStatus: 'rejected', error: { code: 'total_mismatch', message: 'x' } };
      expect(refused.payments).toMatchObject([{ method: 'cash', amountMinor: 1500, tenderedMinor: 2000, changeMinor: 500 }]);
      await db.pos_orders.insert(refused);
      const id = await reopenRefusedOrder(refused.id, { orders: db.pos_orders, drafts: db.order_drafts, sessions: db.register_sessions, taxContext });
      const { result, onSaleCompleted } = renderSale({ drafts: db.order_drafts }, false);
      await act(async () => { expect(await result.current.resume(id)).toBeNull(); });
      await act(async () => { await result.current.complete(); });
      expect(onSaleCompleted.mock.calls[0][0].payments).toEqual([{ id: expect.any(String), method: 'cash', amountMinor: 1500, tenderedMinor: 1500, changeMinor: 0 }]);
    });
  });
});
