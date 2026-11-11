import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { SPLIT_FIXED_DISCOUNT } from './index';
import { SALE_SAVING, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const [entry] = catalogueEntries([{
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12, currency_code: 'eur' }] },
  ],
}], traits);
const pricing: StoreSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 200000 } };

function renderSale(overrides: Partial<Parameters<typeof useSale>[1]> = {}) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
  }
  return renderHook(() => useSale(pricing, { registerId: 'register-1', cashierRef: 'cashier@store.test',
    capabilities: { orderCreate: 3 }, ...overrides }), { wrapper: Wrapper });
}

describe('useSale().splitLine', () => {
  afterEach(() => { cleanup(); });

  it('splits a quantity-2 line into 2 lines and returns null', () => {
    const { result } = renderSale();
    act(() => { result.current.add(entry, traits); result.current.add(entry, traits); });
    const lineId = result.current.order.lineItems[0].id;
    let refused: string | null = 'unset';
    act(() => { refused = result.current.splitLine(lineId); });
    expect(refused).toBeNull();
    expect(result.current.order.lineItems.map((line) => line.quantity)).toEqual([1, 1]);
  });

  it('returns SPLIT_FIXED_DISCOUNT for a line with a fixed discount and leaves the sale unchanged', () => {
    const { result } = renderSale();
    act(() => { result.current.add(entry, traits); result.current.add(entry, traits); });
    const lineId = result.current.order.lineItems[0].id;
    act(() => { expect(result.current.applyDiscount(lineId, { type: 'fixed', value: 100 })).toBeNull(); });
    const before = result.current.order;
    let refused: string | null = null;
    act(() => { refused = result.current.splitLine(lineId); });
    expect(refused).toBe(SPLIT_FIXED_DISCOUNT);
    expect(result.current.order).toEqual(before);
  });

  it('returns SALE_SAVING while a save is pending', async () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const { result } = renderSale({ onSaleCompleted: () => gate });
    act(() => {
      result.current.add(entry, traits);
      result.current.add(entry, traits);
      result.current.addTender({ method: 'cash', amountMinor: 2880 });
    });
    const before = result.current.order;
    const lineId = before.lineItems[0].id;
    let completion!: Promise<void>;
    act(() => { completion = result.current.complete(); });
    act(() => { expect(result.current.splitLine(lineId)).toBe(SALE_SAVING); });
    expect(result.current.order).toEqual(before);
    await act(async () => { release(); await completion; });
  });
});
