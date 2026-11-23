import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { useSale } from './use-sale';

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
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 10 }, ...overrides,
  }), { wrapper: Wrapper });
  act(() => {
    hook.result.current.add(entries[0], traits);
    hook.result.current.add(entries[1], traits);
  });
  return hook;
}

afterEach(cleanup);

describe('useSale payment method ids (condition 5: method decides cash, methodId only rides along)', () => {
  it('takes a cash-kind leg with an id as cash: not capped, change as for a plain cash leg, stored with its id', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    expect(result.current.order.totalMinor).toBe(2250);
    act(() => { expect(result.current.addTender({ method: 'cash', methodId: 'cod', amountMinor: 3000 })).toEqual(expect.any(String)); });
    expect(result.current.order).toMatchObject({ paidMinor: 2250, balanceDueMinor: 0, changeDueMinor: 0,
      payments: [{ method: 'cash', methodId: 'cod', amountMinor: 2250 }] });
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toStrictEqual([
      { id: expect.any(String), takenAt: expect.any(String), method: 'cash', methodId: 'cod', amountMinor: 2250, tenderedMinor: 3000, changeMinor: 750 }]);
  });

  it('caps an external leg with an id at the balance and stores it with its id; setTender keeps the id', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    // setTender replaces only a leg that took no money and is not in motion (ADR-072 d3, amended 2026-11-22; BUG 2), so the capped leg is failed first.
    let leg: string | null = null;
    act(() => { leg = result.current.addTender({ method: 'external', methodId: 'stripe', amountMinor: 5000, status: 'pending' }); });
    expect(result.current.order.payments).toMatchObject([{ method: 'external', methodId: 'stripe', amountMinor: 2250 }]);
    act(() => { expect(result.current.setTenderStatus(leg!, 'failed')).toBe(true); });
    act(() => result.current.setTender({ method: 'external', methodId: 'pp_system_default', amountMinor: 2250, reference: 'T-9' }));
    expect(result.current.order.payments).toMatchObject([{ method: 'external', methodId: 'pp_system_default', amountMinor: 2250, reference: 'T-9' }]);
    await act(async () => { await result.current.complete(); });
    const [stored] = onSaleCompleted.mock.calls[0][0].payments;
    expect(stored).toStrictEqual({ id: expect.any(String), takenAt: expect.any(String), method: 'external', methodId: 'pp_system_default', amountMinor: 2250, reference: 'T-9' });
  });

  it('keeps the methodId of a leg whose reference is dropped', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      result.current.addTender({ method: 'external', methodId: 'stripe', amountMinor: 1000, reference: 'bad\u0000reference' });
      result.current.addTender({ method: 'cash', amountMinor: 1250 });
    });
    expect(result.current.error).toContain('reference');
    await act(async () => { await result.current.complete(); });
    const stored = onSaleCompleted.mock.calls[0][0];
    expect(stored.payments[0]).toStrictEqual({ id: expect.any(String), takenAt: expect.any(String), method: 'external', methodId: 'stripe', amountMinor: 1000 });
    expect(stored.localWarnings).toEqual([{ code: 'payment_reference_dropped', paymentId: stored.payments[0].id }]);
  });
});
