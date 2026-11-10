import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { PAYMENT_IN_MOTION, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };

function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, ...overrides,
  }), { wrapper: Wrapper });
  act(() => {
    hook.result.current.add(entries[0], traits);
    hook.result.current.add(entries[1], traits);
  });
  return hook;
}

afterEach(cleanup);

describe('useSale payment legs', () => {
  it('captures a cash or external leg at once', () => {
    const { result } = renderSale();
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000 });
      result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    expect(result.current.order.payments).toHaveLength(2);
    for (const payment of result.current.order.payments) expect(payment).not.toHaveProperty('status');
    expect(result.current.order).toMatchObject({ paidMinor: 2500, balanceDueMinor: 0, changeDueMinor: 250 });
  });

  it('voids one leg, which stays on the sale and counts nothing', () => {
    const { result } = renderSale();
    act(() => { result.current.addTender({ method: 'external', amountMinor: 1000 }); });
    const id = result.current.order.payments[0].id;
    act(() => { expect(result.current.voidTender(id)).toBe(true); });
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0].status).toBe('voided');
    expect(result.current.order).toMatchObject({ paidMinor: 0, balanceDueMinor: 2250 });
    act(() => {
      expect(result.current.voidTender(id)).toBe(false);
      expect(result.current.voidTender('nope')).toBe(false);
    });
  });

  it('sends only captured legs', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      const id = result.current.addTender({ method: 'external', amountMinor: 1000 });
      expect(result.current.voidTender(id!)).toBe(true);
      result.current.addTender({ method: 'cash', amountMinor: 2250 });
    });
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toHaveLength(1);
    expect(onSaleCompleted.mock.calls[0][0].payments[0]).toMatchObject({ method: 'cash', amountMinor: 2250 });
    expect(result.current.stage.kind).toBe('receipt');
    if (result.current.stage.kind === 'receipt') expect(result.current.stage.order.payments).toHaveLength(1);
  });

  it('holds a leg in motion against the external cap and refuses to complete', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => { result.current.addTender({ method: 'external', amountMinor: 1000, status: 'pending' }); });
    const pendingId = result.current.order.payments[0].id;
    expect(result.current.order).toMatchObject({ paidMinor: 0, balanceDueMinor: 2250 });
    act(() => { result.current.addTender({ method: 'external', amountMinor: 5000 }); });
    expect(result.current.order.payments[1].amountMinor).toBe(1250);
    const stage = result.current.stage;
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe(PAYMENT_IN_MOTION);
    expect(result.current.saving).toBe(false);
    expect(result.current.stage).toBe(stage);
    expect(result.current.stage.kind).toBe('cart');
    expect(onSaleCompleted).not.toHaveBeenCalled();
    act(() => { expect(result.current.setTenderStatus(pendingId, 'captured')).toBe(true); });
    expect(result.current.order.paidMinor).toBe(2250);
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toHaveLength(2);
  });

  it('leaves a failed leg out of the sale', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      const id = result.current.addTender({ method: 'external', amountMinor: 1000, status: 'pending' });
      expect(result.current.setTenderStatus(id!, 'failed')).toBe(true);
      result.current.addTender({ method: 'cash', amountMinor: 2250 });
    });
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toHaveLength(1);
    expect(onSaleCompleted.mock.calls[0][0].payments[0].method).toBe('cash');
  });

  it('refuses a cash leg that is not captured and a move the table refuses', () => {
    const { result } = renderSale();
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 100, status: 'pending' })).toBeNull();
      const id = result.current.addTender({ method: 'external', amountMinor: 1000 });
      expect(result.current.setTenderStatus(id!, 'authorized')).toBe(false);
    });
  });
});
