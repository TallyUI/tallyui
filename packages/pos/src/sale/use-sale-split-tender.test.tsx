import type { ReactNode } from 'react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { PosOrder } from '../pos-order';
import { heldUnitsByLine } from '../tender';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import { catalogueEntries } from './catalogue';
import { PAYMENT_TAKEN, SALE_SAVING, useSale } from './use-sale';

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
      paidMinor: 2250, balanceDueMinor: 0, changeDueMinor: 0,
      payments: [{ id: cardId, method: 'external', amountMinor: 1000 }, { id: cashId, method: 'cash', amountMinor: 1250 }],
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

  it('refuses removing a taken tender with PAYMENT_TAKEN and leaves unknown ids alone (ADR-072 d3, amended 2026-11-22)', () => {
    const { result } = renderSale();
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000 });
      result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    const [card, cash] = result.current.order.payments;
    act(() => result.current.removeTender(card.id));
    expect(result.current.error).toBe(PAYMENT_TAKEN);
    expect(result.current.order.payments).toEqual([card, cash]);
    const before = result.current.order;
    act(() => result.current.removeTender('unknown'));
    expect(result.current.order).toBe(before);
  });

  it.each(['pending', 'authorized'] as const)('N4: removes a %s tender, which took no money (desk Q4)', (status) => {
    const { result } = renderSale();
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000, status });
      result.current.addTender({ method: 'cash', amountMinor: 500 });
    });
    const [card, cash] = result.current.order.payments;
    act(() => result.current.removeTender(card.id));
    expect(result.current.error).toBeNull();
    expect(result.current.order.payments).toEqual([cash]);
    expect(result.current.order.balanceDueMinor).toBe(1750);
  });

  it('setTender keeps taken payments: a tender is added beside them and null clears neither', () => {
    const { result } = renderSale();
    act(() => {
      result.current.addTender({ method: 'external', amountMinor: 1000 });
      result.current.addTender({ method: 'cash', amountMinor: 1500 });
    });
    const taken = result.current.order.payments;
    act(() => result.current.setTender({ method: 'cash', amountMinor: 2250 }));
    expect(result.current.order.payments).toMatchObject([taken[0], taken[1], { method: 'cash', amountMinor: 2250 }]);
    expect(result.current.error).toBeNull();
    act(() => result.current.setTender(null));
    expect(result.current.order.payments).toEqual(taken);
  });

  it.each([false, true])('keeps a dropped-reference warning only while its payment remains (removed: %s)', async (removed) => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => {
      result.current.addTender({ method: 'cash', amountMinor: 1000 });
      // A taken leg is never removed (ADR-072 d3, amended 2026-11-22), so the removed case drops a pending one.
      result.current.addTender({ method: 'external', amountMinor: 500, reference: 'bad\u0000reference', ...(removed ? { status: 'pending' as const } : {}) });
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

  it('a taken leg kept by Back and Pay keeps its dropped-reference warning', async () => {
    const onSaleCompleted = vi.fn<(order: PosOrder) => void>();
    const { result } = renderSale({ onSaleCompleted });
    act(() => { result.current.addTender({ method: 'external', amountMinor: 500, reference: 'bad\u0000reference' }); });
    const external = result.current.order.payments[0];
    expect(external).toMatchObject({ method: 'external', amountMinor: 500, takenAt: expect.any(String) });
    expect(external.status ?? 'captured').toBe('captured');
    act(() => result.current.cancelTender());
    act(() => result.current.setTender({ method: 'cash', amountMinor: 1750 }));
    await act(async () => { await result.current.complete(); });
    const stored = onSaleCompleted.mock.calls[0][0];
    expect(stored.payments.map((payment) => payment.method)).toEqual(['external', 'cash']);
    expect(stored.localWarnings).toEqual([{ code: 'payment_reference_dropped', paymentId: stored.payments[0].id }]);
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

  it('N1: Back then Pay keeps a taken cash leg and pre-fills the card for the rest', () => {
    const { result } = renderSale();
    let cash: string | null = null;
    act(() => { result.current.startTender('cash'); cash = result.current.addTender({ method: 'cash', amountMinor: 500 }); });
    act(() => result.current.cancelTender());
    act(() => result.current.startTender('external'));
    expect(result.current.order.payments).toMatchObject([{ id: cash, method: 'cash', amountMinor: 500 }, { method: 'external', amountMinor: 1750 }]);
    expect(result.current.order.payments).toHaveLength(2);
  });

  it('N2: a voided taken leg is kept on Back and Pay, and counts nothing toward the card pre-fill', () => {
    const { result } = renderSale();
    let cash: string | null = null;
    act(() => { result.current.startTender('cash'); cash = result.current.addTender({ method: 'cash', amountMinor: 500 }); });
    act(() => { expect(result.current.voidTender(cash!)).toBe(true); });
    act(() => result.current.cancelTender());
    act(() => result.current.startTender('external'));
    expect(result.current.order.payments).toMatchObject([{ id: cash, method: 'cash', status: 'voided' }, { method: 'external', amountMinor: 2250 }]);
    expect(result.current.order.payments).toHaveLength(2);
  });

  it('N3: Back drops startTender(\'external\')\'s unstamped pre-fill', () => {
    const { result } = renderSale();
    act(() => result.current.startTender('external'));
    expect(result.current.order.payments[0].takenAt).toBeUndefined();
    act(() => result.current.cancelTender());
    expect(result.current.order.payments).toEqual([]);
  });

  it('Back keeps a pending card leg, and the terminal capture is recorded (BUG 2)', () => {
    const { result } = renderSale();
    expect(result.current.order.totalMinor).toBe(2250);
    act(() => result.current.startTender('external'));
    const prefill = result.current.order.payments[0].id;
    act(() => { result.current.removeTender(prefill); });
    let id: string | null = null;
    act(() => { id = result.current.addTender({ method: 'external', amountMinor: 600, status: 'pending' }); });
    expect(result.current.order.payments).toMatchObject([{ id, amountMinor: 600, status: 'pending' }]);
    act(() => result.current.cancelTender());
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).toMatchObject({ id, amountMinor: 600, status: 'pending' });
    act(() => { expect(result.current.setTenderStatus(id!, 'captured')).toBe(true); });
    expect(result.current.order.paidMinor).toBe(600);
    expect(result.current.order.balanceDueMinor).toBe(1650);
  });

  it('Back keeps an authorized card leg (BUG 2)', () => {
    const { result } = renderSale();
    expect(result.current.order.totalMinor).toBe(2250);
    act(() => result.current.startTender('external'));
    const prefill = result.current.order.payments[0].id;
    act(() => { result.current.removeTender(prefill); });
    let id: string | null = null;
    act(() => { id = result.current.addTender({ method: 'external', amountMinor: 600, status: 'pending' }); });
    act(() => { expect(result.current.setTenderStatus(id!, 'authorized')).toBe(true); });
    expect(result.current.order.payments).toMatchObject([{ id, amountMinor: 600, status: 'authorized' }]);
    act(() => result.current.cancelTender());
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).toMatchObject({ id, amountMinor: 600, status: 'authorized' });
    act(() => { expect(result.current.setTenderStatus(id!, 'captured')).toBe(true); });
    expect(result.current.order.paidMinor).toBe(600);
    expect(result.current.order.balanceDueMinor).toBe(1650);
  });

  it('a repeat startTender keeps a pending leg and fills only the remainder (BUG 2)', () => {
    const { result } = renderSale();
    act(() => result.current.startTender('external'));
    const prefill = result.current.order.payments[0].id;
    act(() => { result.current.removeTender(prefill); });
    let id: string | null = null;
    act(() => { id = result.current.addTender({ method: 'external', amountMinor: 600, status: 'pending' }); });
    act(() => result.current.startTender('external'));
    expect(result.current.order.payments).toHaveLength(2);
    expect(result.current.order.payments).toMatchObject([{ id, amountMinor: 600, status: 'pending' }, { method: 'external', amountMinor: 1650 }]);
  });
});


describe('payment units (#1133 prerequisite 3)', () => {
  function pendingUnitsSale() {
    const { result } = renderSale();
    const lineId = result.current.order.lineItems[0].id;
    act(() => { result.current.setQuantity(lineId, 3); result.current.startTender('cash'); });
    let first: string | null = null;
    act(() => {
      first = result.current.addTender({ method: 'external', amountMinor: 300, status: 'pending', units: { [lineId]: 2 } });
    });
    expect(first).toEqual(expect.any(String));
    return { result, lineId, first };
  }

  it.each(['pending', 'authorized'] as const)('P3-H2: a %s leg holds its units and leaves one free', (status) => {
    const { result, lineId, first } = pendingUnitsSale();
    if (status === 'authorized') act(() => { expect(result.current.setTenderStatus(first!, status)).toBe(true); });
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 300, units: { [lineId]: 2 } })).toBeNull();
    });
    expect(result.current.order.payments).toHaveLength(1);
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 100, units: { [lineId]: 1 } })).toEqual(expect.any(String));
    });
  });

  it.each(['failed', 'void', 'captured'] as const)('P3-H4: a pending leg becomes %s', (release) => {
    const { result, lineId, first } = pendingUnitsSale();
    act(() => {
      expect(release === 'void' ? result.current.voidTender(first!) : result.current.setTenderStatus(first!, release)).toBe(true);
    });
    act(() => {
      const next = result.current.addTender({ method: 'cash', amountMinor: 300, units: { [lineId]: 2 } });
      if (release === 'captured') {
        expect(next).toBeNull();
        expect(result.current.addTender({ method: 'cash', amountMinor: 100, units: { [lineId]: 1 } })).toEqual(expect.any(String));
      } else expect(next).toEqual(expect.any(String));
    });
  });

  it('P3-H5: two legs in motion can hold all three units without overlap', () => {
    const { result, lineId } = pendingUnitsSale();
    act(() => {
      expect(result.current.addTender({ method: 'external', amountMinor: 100, status: 'authorized', units: { [lineId]: 2 } })).toBeNull();
      expect(result.current.addTender({ method: 'external', amountMinor: 100, status: 'authorized', units: { [lineId]: 1 } })).toEqual(expect.any(String));
      expect(result.current.addTender({ method: 'cash', amountMinor: 100, units: { [lineId]: 1 } })).toBeNull();
    });
    expect(result.current.order.payments).toHaveLength(2);
    expect(heldUnitsByLine(result.current.order.payments)[lineId]).toBe(3);
  });
});

describe('payment units (#1133 prerequisite 2)', () => {
  it.each([['a', undefined], ['d', 'x'.repeat(256)]])('P2-U3(%s): stores units even when a reference is dropped', (_case, reference) => {
    const { result } = renderSale();
    const lineId = result.current.order.lineItems[0].id;
    act(() => result.current.setQuantity(lineId, 3));
    act(() => {
      expect(result.current.addTender({ method: reference ? 'external' : 'cash', amountMinor: 300, reference, units: { [lineId]: 2 } })).not.toBeNull();
    });
    expect(result.current.order.payments[0].units).toEqual({ [lineId]: 2 });
    expect(result.current.order.payments[0].reference).toBeUndefined();
  });

  it.each([['b', 0], ['b', -1], ['b', 1.5], ['b', NaN], ['b', 'empty'], ['e', 'unknown']])('P2-U3(%s): refuses invalid units (%s) without recording a leg', (_case, value) => {
    const { result } = renderSale();
    const lineId = result.current.order.lineItems[0].id;
    const units = typeof value === 'number' ? { [lineId]: value } : { [value === 'empty' ? '' : 'unknown']: 1 };
    act(() => result.current.setQuantity(lineId, 3));
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 300, units })).toBeNull();
    });
    expect(result.current.order.payments).toEqual([]);
  });

  it('P2-U3(c): an empty units map records an amount-only leg', () => {
    const { result } = renderSale();
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 300, units: {} })).not.toBeNull();
    });
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).not.toHaveProperty('units');
  });

  it.each(['Back', 'void'])('P2-U3(f): refuses over-allocation; %s keeps the taken leg, and only its void frees the units (ADR-072 d3, amended 2026-11-22)', (release) => {
    const { result } = renderSale();
    const lineId = result.current.order.lineItems[0].id;
    act(() => { result.current.setQuantity(lineId, 3); result.current.startTender('cash'); });
    let first: string | null = null;
    act(() => {
      first = result.current.addTender({ method: 'external', amountMinor: 300, units: { [lineId]: 2 } });
    });
    expect(first).not.toBeNull();
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 300, units: { [lineId]: 2 } })).toBeNull();
    });
    expect(result.current.order.payments).toHaveLength(1);
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 150, units: { [lineId]: 1 } })).not.toBeNull();
    });
    if (release === 'Back') {
      act(() => result.current.cancelTender());
      act(() => result.current.startTender('cash'));
      expect(result.current.order.payments.some((payment) => payment.id === first)).toBe(true);
      expect(result.current.order.balanceDueMinor).toBe(result.current.order.totalMinor - 300 - 150);
    } else {
      act(() => { expect(result.current.voidTender(first!)).toBe(true); });
      expect(result.current.order.payments[0].status).toBe('voided');
    }
    act(() => {
      const again = result.current.addTender({ method: 'cash', amountMinor: 300, units: { [lineId]: 2 } });
      if (release === 'Back') expect(again).toBeNull();
      else expect(again).not.toBeNull();
    });
    expect(result.current.order.payments).toHaveLength(release === 'Back' ? 2 : 3);
  });

  it('P2-U3(g): a failed leg\'s units are free to take again', () => {
    const { result } = renderSale();
    const lineId = result.current.order.lineItems[0].id;
    act(() => { result.current.setQuantity(lineId, 3); result.current.startTender('cash'); });
    let first: string | null = null;
    act(() => {
      first = result.current.addTender({ method: 'external', amountMinor: 300, status: 'pending', units: { [lineId]: 2 } });
    });
    expect(first).not.toBeNull();
    act(() => { expect(result.current.setTenderStatus(first!, 'failed')).toBe(true); });
    act(() => {
      expect(result.current.addTender({ method: 'cash', amountMinor: 300, units: { [lineId]: 2 } })).not.toBeNull();
    });
    expect(result.current.order.payments).toHaveLength(2);
    expect(result.current.order.payments).toMatchObject([
      { id: first, status: 'failed' }, { method: 'cash', amountMinor: 300, units: { [lineId]: 2 } },
    ]);
  });
});
