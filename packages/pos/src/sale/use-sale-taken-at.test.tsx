import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { useSale } from './use-sale';

// A payment leg records when the till took it (`takenAt`), once, as it is recorded.
const traits = medusaConnector.traits.product;
const entries = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 0 } };
const first = '2026-11-21T10:15:00.000Z', later = '2026-11-21T10:20:00.000Z';

function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  const hook = renderHook(() => useSale(pricing, {
    registerId: 'register-1', cashierRef: 'cashier@store.test', capabilities: { orderCreate: 2 }, ...overrides,
  }), { wrapper: Wrapper });
  act(() => { hook.result.current.add(entries[0], traits); });
  return hook;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(first));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe('useSale payment takenAt', () => {
  it('T1 stamps the system time on a cash leg, an external leg and a setTender leg', () => {
    const { result } = renderSale();
    act(() => { result.current.addTender({ method: 'external', amountMinor: 500 }); });
    vi.setSystemTime(new Date(later));
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 750 }); });
    expect(result.current.order.payments.map((payment) => payment.takenAt)).toEqual([first, later]);
    act(() => { result.current.setTender({ method: 'external', amountMinor: 1250 }); });
    expect(result.current.order.payments.map((payment) => payment.takenAt)).toEqual([later]);
  });

  it('T2 keeps takenAt on a leg whose reference is dropped', () => {
    const { result } = renderSale();
    act(() => { result.current.addTender({ method: 'external', amountMinor: 1250, reference: 'bad\u0000ref' }); });
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).not.toHaveProperty('reference');
    expect(result.current.order.payments[0].takenAt).toBe(first);
  });

  it('T3 keeps the original takenAt when a pending leg is captured', () => {
    const { result } = renderSale();
    let id: string | null = null;
    act(() => { id = result.current.addTender({ method: 'external', amountMinor: 1250, status: 'pending' }); });
    vi.setSystemTime(new Date(later));
    act(() => { expect(result.current.setTenderStatus(id!, 'captured')).toBe(true); });
    expect(result.current.order.payments[0]).toMatchObject({ takenAt: first });
    expect(result.current.order.payments[0].status).not.toBe('pending');
  });

  it('T4 finalize puts takenAt on the stored order payment', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => { result.current.addTender({ method: 'cash', amountMinor: 1250 }); });
    vi.setSystemTime(new Date(later));
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0].payments).toEqual([expect.objectContaining({ method: 'cash', amountMinor: 1250, takenAt: first })]);
  });
});
