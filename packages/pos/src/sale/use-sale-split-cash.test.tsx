import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { PosOrder } from '../pos-order';
import { buildReceiptData } from '../receipt/build-receipt-data';
import { buildReceiptDataFromPosOrder } from '../receipt/reprint';
import { wcposSourceFromPosOrder, wcposSourceFromSentOrder } from '../receipt-template/wcpos/from-orders';
import { deriveExpected, paymentLedgerRows } from '../register/expected';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 5, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const config = { storeName: 'Test Shop' };

function renderSale(quantity = 2) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
  const { result } = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, onSaleCompleted,
  }), { wrapper: Wrapper });
  act(() => { result.current.add(entries[0], traits); });
  const lineId = result.current.order.lineItems[0].id;
  act(() => { result.current.setQuantity(lineId, quantity); });
  expect(result.current.order.lineItems).toHaveLength(1);
  expect(result.current.order).toMatchObject({ totalMinor: quantity * 500, taxMinor: 0 });
  return { result, lineId, onSaleCompleted };
}

async function completeSale(quantity: number, amountMinor: number, picked = false) {
  const { result, lineId, onSaleCompleted } = renderSale(quantity);
  act(() => {
    if (picked) {
      expect(result.current.addTender({ method: 'cash', amountMinor: 500, tenderedMinor: 2000, units: { [lineId]: 1 } }))
        .toEqual(expect.any(String));
    }
    expect(result.current.addTender({ method: 'cash', amountMinor })).toEqual(expect.any(String));
  });
  const plain = result.current.order.payments.at(-1)!;
  expect(plain).not.toHaveProperty('tenderedMinor');
  expect(plain).not.toHaveProperty('changeMinor');
  expect(plain).not.toHaveProperty('units');
  await act(async () => { await result.current.complete(); });
  expect(onSaleCompleted).toHaveBeenCalledTimes(1);
  const stage = result.current.stage;
  expect(stage.kind).toBe('receipt');
  if (stage.kind !== 'receipt') throw new Error('Sale did not complete');
  expect(stage.posOrder).toEqual(onSaleCompleted.mock.calls[0][0]);
  return stage;
}

afterEach(cleanup);

describe('cash tender for picked units', () => {
  it.each([undefined, 'bad\u0000reference'])('C0-1: keeps the pick, tender and change (reference: %s)', (reference) => {
    const { result, lineId } = renderSale();
    let id: string | null = null;
    act(() => {
      id = result.current.addTender({ method: 'cash', amountMinor: 500, tenderedMinor: 2000, units: { [lineId]: 1 }, reference });
    });
    expect(id).toEqual(expect.any(String));
    expect(result.current.order).toMatchObject({
      paidMinor: 500, balanceDueMinor: 500, changeDueMinor: 0,
      payments: [{ id, method: 'cash', amountMinor: 500, tenderedMinor: 2000, changeMinor: 1500, units: { [lineId]: 1 } }],
    });
    expect(result.current.order.payments[0].reference).toBeUndefined();
  });

  it('C0-2: refuses invalid tendered amounts and accepts exact cash with zero change', () => {
    const { result, lineId } = renderSale();
    const tender = { method: 'cash' as const, amountMinor: 500, tenderedMinor: 2000, units: { [lineId]: 1 } };
    for (const refused of [
      { ...tender, tenderedMinor: 400 },
      { ...tender, units: undefined },
      { ...tender, units: {} },
      { ...tender, method: 'external' as const },
      { ...tender, tenderedMinor: 1500.5 },
    ]) {
      act(() => { expect(result.current.addTender(refused)).toBeNull(); });
      expect(result.current.order.payments).toEqual([]);
    }
    act(() => { expect(result.current.addTender({ ...tender, tenderedMinor: 500 })).toEqual(expect.any(String)); });
    expect(result.current.order.payments).toMatchObject([
      { method: 'cash', amountMinor: 500, tenderedMinor: 500, changeMinor: 0, units: { [lineId]: 1 } },
    ]);
  });

  it('C0-3: finalizes the picked leg like a non-split sale and gives remaining change from plain cash', async () => {
    const saleB = await completeSale(2, 600, true);
    const saleA = await completeSale(1, 2000);
    const money = { method: 'cash', amountMinor: 500, tenderedMinor: 2000, changeMinor: 1500 };
    expect(saleA.posOrder.payments).toHaveLength(1);
    expect(saleA.posOrder.payments[0]).toMatchObject(money);
    expect(saleB.posOrder.payments).toHaveLength(2);
    expect(saleB.posOrder.payments[0]).toMatchObject(money);
    expect(saleB.posOrder.payments[1]).toMatchObject({
      method: 'cash', amountMinor: 500, tenderedMinor: 600, changeMinor: 100,
    });
    expect(saleB.posOrder.payments.reduce((sum, p) => sum + p.amountMinor, 0)).toBe(1000);
  });

  it('C0-4: the drawer matches two non-split cash sales of the same money', async () => {
    const saleB = await completeSale(2, 600, true);
    const saleA = await completeSale(1, 2000);
    const other = await completeSale(1, 600);
    const expected = (orders: PosOrder[]) => deriveExpected({
      session: { id: 'session', countedFloatMinor: 0 }, movements: [],
      ledgerRowsBySession: paymentLedgerRows(orders.map((order) => ({ ...order, sessionId: 'session' }))),
    });
    expect(expected([saleB.posOrder])).toEqual({ cash: 1000 });
    expect(expected([saleA.posOrder, other.posOrder])).toEqual({ cash: 1000 });
  });

  it('C0-5: live and reprinted receipts show the tender and all change handed back', async () => {
    const saleB = await completeSale(2, 600, true);
    const saleA = await completeSale(1, 2000);
    expect(saleB.order.changeDueMinor).toBe(100);
    const live = buildReceiptData(saleB.order, config);
    const reprint = buildReceiptDataFromPosOrder(saleB.posOrder, config);
    expect(live.payments.map((p) => p.amountMinor)).toEqual([2000, 600]);
    expect(live.changeDueMinor).toBe(1600);
    expect(reprint.payments.map((p) => p.amountMinor)).toEqual([2000, 600]);
    expect(reprint.changeDueMinor).toBe(1600);
    const plain = buildReceiptData(saleA.order, config);
    expect(plain.payments.map((p) => p.amountMinor)).toEqual([2000]);
    expect(plain.changeDueMinor).toBe(1500);
  });

  it('C0-5b: live and stored WCPOS sources agree on tender and change', async () => {
    const saleB = await completeSale(2, 600, true);
    const saleA = await completeSale(1, 2000);
    const live = wcposSourceFromSentOrder(saleB.order, config);
    const stored = wcposSourceFromPosOrder(saleB.posOrder, config);
    expect(live.payments.map((p) => p.amountMinor)).toEqual([2000, 600]);
    expect(live.changeMinor).toBe(1600);
    expect(live.payments[0]).toMatchObject({ tenderedMinor: 2000, changeMinor: 1500 });
    expect(stored.payments.map((p) => p.amountMinor)).toEqual([2000, 600]);
    expect(stored.changeMinor).toBe(1600);
    const plain = wcposSourceFromSentOrder(saleA.order, config);
    expect(plain.payments.map((p) => p.amountMinor)).toEqual([2000]);
    expect(plain.changeMinor).toBe(1500);
  });

  it('C0-6: plain cash retains its live and stored figures', async () => {
    const sale = await completeSale(2, 2000);
    const live = buildReceiptData(sale.order, config);
    expect(live.payments.map((p) => p.amountMinor)).toEqual([2000]);
    expect(live.changeDueMinor).toBe(1000);
    expect(sale.posOrder.payments).toMatchObject([
      { method: 'cash', amountMinor: 1000, tenderedMinor: 2000, changeMinor: 1000 },
    ]);
  });
});
