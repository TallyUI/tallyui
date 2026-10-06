import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { SALE_SAVING, useSale } from './use-sale';

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

describe('useSale split tender', () => {
  it('completes card then cash with change only from cash', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    expect(result.current.order.totalMinor).toBe(2250);
    let cardId: string | null = null;
    let cashId: string | null = null;
    act(() => {
      cardId = result.current.addTender({ method: 'external', amountMinor: 1000 });
      cashId = result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    expect(cardId).toEqual(expect.any(String));
    expect(cashId).toEqual(expect.any(String));
    expect(result.current.order).toMatchObject({
      paidMinor: 2500, balanceDueMinor: 0, changeDueMinor: 250,
      payments: [{ id: cardId, method: 'external', amountMinor: 1000 }, { id: cashId, method: 'cash', amountMinor: 1500 }],
    });
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(onSaleCompleted.mock.calls[0][0]).toMatchObject({
      totalMinor: 2250,
      payments: [{ method: 'external', amountMinor: 1000 }, { method: 'cash', amountMinor: 1250, tenderedMinor: 1500, changeMinor: 250 }],
    });
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('caps an external tender at the balance due and refuses another when paid', () => {
    const { result } = renderSale();
    act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 5000 })).toEqual(expect.any(String)); });
    expect(result.current.order.payments).toMatchObject([{ method: 'external', amountMinor: 2250 }]);
    expect(result.current.order.balanceDueMinor).toBe(0);
    const before = result.current.order;
    act(() => { expect(result.current.addTender({ method: 'external', amountMinor: 100 })).toBeNull(); });
    expect(result.current.order).toEqual(before);
  });

  it.each([0, -100, 12.5])('refuses invalid amount %s for either method', (amountMinor) => {
    const { result } = renderSale();
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor })).toBeNull();
      expect(result.current.addTender({ method: 'external', amountMinor })).toBeNull();
    });
    expect(result.current.order.payments).toEqual([]);
  });

  it('removes one tender and leaves unknown ids alone', () => {
    const { result } = renderSale();
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000 });
      result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    const [card, cash] = result.current.order.payments;
    act(() => result.current.removeTender(card.id));
    expect(result.current.order.payments).toEqual([cash]);
    expect(result.current.order.balanceDueMinor).toBe(750);
    const before = result.current.order;
    act(() => result.current.removeTender('unknown'));
    expect(result.current.order).toEqual(before);
  });

  it('setTender replaces every payment and clears dropped-reference warnings', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000, reference: 'bad\u0000reference' });
      result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    act(() => result.current.setTender({ method: 'cash', amountMinor: 2250 }));
    expect(result.current.order.payments).toMatchObject([{ method: 'cash', amountMinor: 2250 }]);
    expect(result.current.error).toBeNull();
    act(() => result.current.setTender(null));
    expect(result.current.order.payments).toEqual([]);
    act(() => result.current.setTender({ method: 'cash', amountMinor: 2250 }));
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted.mock.calls[0][0].localWarnings).toBeUndefined();
  });

  it.each([false, true])('keeps a dropped-reference warning only while its payment remains (removed: %s)', async (removed) => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      result.current.addTender({ method: 'cash', amountMinor: 1000 });
      result.current.addTender({ method: 'external', amountMinor: 500, reference: 'bad\u0000reference' });
    });
    const external = result.current.order.payments[1];
    expect(external).toMatchObject({ method: 'external', amountMinor: 500 });
    expect(external.reference).toBeUndefined();
    expect(result.current.error).toContain('reference');
    const referenceError = result.current.error;
    if (removed) act(() => result.current.removeTender(external.id));
    act(() => { result.current.addTender({ method: 'cash', amountMinor: removed ? 1250 : 750 }); });
    expect(result.current.error).toBe(referenceError);
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    const stored = onSaleCompleted.mock.calls[0][0];
    if (removed) {
      expect(stored.payments.map((payment) => payment.method)).toEqual(['cash', 'cash']);
      expect(stored.localWarnings).toBeUndefined();
    } else {
      expect(stored.payments[1]).toMatchObject({ method: 'external', amountMinor: 500 });
      expect(stored.payments[1].reference).toBeUndefined();
      expect(stored.localWarnings).toEqual([{ code: 'payment_reference_dropped', paymentId: stored.payments[1].id }]);
    }
  });

  it('records every dropped reference in payment order', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 400, reference: '\u0000' });
      result.current.addTender({ method: 'cash', amountMinor: 1350 });
      result.current.addTender({ method: 'external', amountMinor: 500, reference: '\u0000' });
    });
    await act(async () => { await result.current.complete(); });
    const stored = onSaleCompleted.mock.calls[0][0];
    expect(stored.localWarnings).toEqual([stored.payments[0], stored.payments[2]].map((payment) => ({
      code: 'payment_reference_dropped', paymentId: payment.id,
    })));
  });

  it('refuses adding and removing tenders while completion is in flight', async () => {
    let saved!: () => void;
    const { result } = renderSale({ onSaleCompleted: () => new Promise<void>((resolve) => { saved = resolve; }) });
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000 });
      result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    const before = result.current.order;
    let completion!: Promise<void>;
    act(() => { completion = result.current.complete(); });
    expect(result.current.saving).toBe(true);
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 100 })).toBeNull();
      expect(result.current.addTender({ method: 'external', amountMinor: 100 })).toBeNull();
      result.current.removeTender(before.payments[0].id);
    });
    expect(result.current.order).toEqual(before);
    expect(result.current.error).toBe(SALE_SAVING);
    await act(async () => { saved(); await completion; });
  });

  it('startTender external still sets one payment of the total', () => {
    const { result } = renderSale();
    act(() => result.current.startTender('external'));
    expect(result.current.order.payments).toMatchObject([{ method: 'external', amountMinor: 2250 }]);
  });
});
