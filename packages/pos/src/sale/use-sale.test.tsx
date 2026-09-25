// Ported from medusapos/app `a1b981d` `sale.test.tsx` (ADR-052, TV5), rewritten against the
// hook's API instead of the screen. Dropped (screen/app only, belong to TV6 or the app):
//   - "pads the receipt immediately by the fixed %s strip height, on screen only": the outbox strip
//     is a screen layout concern, not the hook.
//   - "shows the cashier display name when supplied to the receipt": exercises the <Receipt>
//     component directly, not useSale.
//   - the whole `describe('store settings on the POS screen')` block: renders the app's
//     ProductsScreen and fetchStoreSettings, not the hook.
import type { ReactNode } from 'react';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandEnvelope, OrderCreatePayload, StoreSettings as PricingSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { LogEntry } from '../logging';
import { createOrderBuilder } from '../order';
import { createOrderOutbox } from '../outbox';
import { addPosOrderCollection, finalizeOrder, type PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import {
  closeSession, closureSchema, ensureRegister, openSession, registerFactsLogger, registerSessionCollection, writeClosure,
  type ClosureCollection, type RegisterSessionCollection,
} from '../register';
import { catalogueEntries } from './catalogue';
import { DISCOUNTS_UNSUPPORTED, useSale } from './use-sale';

const traits = medusaConnector.traits.product;
const product = {
  id: 'shirt', title: 'Shirt', status: 'published', variants: [
    { id: 'blue', title: 'Blue', sku: 'BLUE', prices: [{ amount: 12.5, currency_code: 'eur' }] },
    { id: 'red', title: 'Red', sku: 'RED', prices: [{ amount: 10, currency_code: 'eur' }] },
  ],
};
const entries = catalogueEntries([product], traits);
const pricing: PricingSettings = { currency: 'EUR', pricesIncludeTax: false, taxRatesPpm: { default: 250000 } };
const taxContext = { getTaxRatePpm: () => 250000, pricesIncludeTax: false };
const registerId = 'register-1';
const cashierRef = 'cashier@store.test';

function saleOpts(overrides: Partial<Parameters<typeof useSale>[1]> = {}): Parameters<typeof useSale>[1] {
  return { registerId, cashierRef, ...overrides };
}

/** Renders `useSale` under a `TaxProvider` fed by `settings`, fixed for the hook's lifetime. */
function renderSale(settings: PricingSettings, opts = saleOpts()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <TaxProvider {...taxProviderProps(settings)}>{children}</TaxProvider>;
  }
  return renderHook(() => useSale(settings, opts), { wrapper: Wrapper });
}

function addSaleLines(result: { current: ReturnType<typeof useSale> }) {
  act(() => {
    result.current.add(entries[0], traits);
    result.current.add(entries[1], traits);
    result.current.add(entries[0], traits);
  });
}

async function withOpenSession() {
  const db = await createRxDatabase({
    name: `sale${Math.random().toString(36).slice(2)}`,
    storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    multiInstance: false,
  });
  await db.addCollections({ register_sessions: registerSessionCollection() });
  const sessions = db.register_sessions as RegisterSessionCollection;
  const session = await openSession(sessions, {
    registerId, expectedFloatMinor: 0, countedFloatMinor: 0, openedBy: cashierRef,
    businessDay: { year: 2026, month: 9, day: 25 },
  });
  return { db, sessions, sessionId: session.id };
}

describe('sale', () => {
  it('merges variants and displays builder quantities, unit prices, line totals and order totals', () => {
    const { result } = renderSale(pricing);
    addSaleLines(result);
    const expected = createOrderBuilder({ currency: pricing.currency, taxContext });
    expected.addLine({ productId: 'shirt', variantId: 'blue', name: 'Shirt · Blue', unitPrice: { amount: 1250, currency: 'EUR' }, quantity: 2 });
    expected.addLine({ productId: 'shirt', variantId: 'red', name: 'Shirt · Red', unitPrice: { amount: 1000, currency: 'EUR' } });
    const order = expected.getSnapshot();
    expect(result.current.order.lineItems.map((line) => line.quantity)).toEqual([2, 1]);
    expect(result.current.order.lineItems.map((line) => line.unitPriceMinor)).toEqual(order.lineItems.map((line) => line.unitPriceMinor));
    expect(result.current.order.lineItems.map((line) => line.netMinor)).toEqual(order.lineItems.map((line) => line.netMinor));
    expect(result.current.order.subtotalMinor).toBe(order.subtotalMinor);
    expect(result.current.order.taxMinor).toBe(order.taxMinor);
    expect(result.current.order.totalMinor).toBe(order.totalMinor);
    const redId = result.current.order.lineItems[1].id;
    act(() => result.current.setQuantity(redId, 2));
    expect(result.current.order.lineItems[1].quantity).toBe(2);
  });

  it('removes at zero or with Remove and cannot tender an empty cart', () => {
    const { result } = renderSale(pricing);
    addSaleLines(result);
    const redId = result.current.order.lineItems[1].id;
    act(() => result.current.setQuantity(redId, 0));
    expect(result.current.order.lineItems.map((line) => line.variantId)).toEqual(['blue']);
    const blueId = result.current.order.lineItems[0].id;
    act(() => result.current.remove(blueId));
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.idle).toBe(true);
    act(() => result.current.startTender('cash'));
    expect(result.current.stage.kind).toBe('cart');
  });

  it('completes cash with builder change and a finalized payment, prints, then starts a fresh sale', async () => {
    const completed = vi.fn();
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed }));
    addSaleLines(result);
    const before = result.current.order;
    expect(before.totalMinor).toBe(4375);
    act(() => result.current.startTender('cash'));
    act(() => result.current.setTender({ method: 'cash', amountMinor: 5000 }));
    expect(result.current.order.changeDueMinor).toBe(625);
    await act(async () => { await result.current.complete(); });
    expect(result.current.stage.kind).toBe('receipt');
    expect(completed).toHaveBeenCalledTimes(1);
    expect(completed.mock.calls[0][0]).toMatchObject({
      registerId, cashierRef, totalMinor: 4375,
      payments: [{ method: 'cash', amountMinor: 4375, tenderedMinor: 5000, changeMinor: 625 }],
    });
    act(() => result.current.newSale());
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.order.id).not.toBe(before.id);
    expect(result.current.order.lineItems).toEqual([]);
    expect(result.current.order.payments).toEqual([]);
  });

  it('keeps an underpaid tender on finalize failure, replaces amounts and removes it on Back', async () => {
    const completed = vi.fn();
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed }));
    addSaleLines(result);
    act(() => result.current.startTender('cash'));
    act(() => result.current.setTender({ method: 'cash', amountMinor: 1000 }));
    expect(result.current.order.balanceDueMinor).toBeGreaterThan(0);
    const tender = result.current.order.payments[0];
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe('finalize: underpaid');
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'cash' });
    expect(result.current.order.payments).toEqual([tender]);
    expect(completed).not.toHaveBeenCalled();
    act(() => result.current.setTender({ method: 'cash', amountMinor: 2000 }));
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0].amountMinor).toBe(2000);
    act(() => result.current.setTender({ method: 'cash', amountMinor: 5000 }));
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0].amountMinor).toBe(5000);
    expect(result.current.error).toBeNull();
    act(() => result.current.cancelTender());
    expect(result.current.stage.kind).toBe('cart');
    expect(result.current.order.payments).toEqual([]);
    expect(result.current.order.balanceDueMinor).toBe(result.current.order.totalMinor);
  });

  it('records quick cash amounts through the same single pending payment', async () => {
    const { result } = renderSale(pricing);
    addSaleLines(result);
    act(() => result.current.startTender('cash'));
    const total = result.current.order.totalMinor;
    act(() => result.current.setTender({ method: 'cash', amountMinor: total }));
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0].amountMinor).toBe(total);
    expect(result.current.order.balanceDueMinor).toBe(0);
    await act(async () => { await result.current.complete(); });
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('completes a card terminal payment with its optional reference', async () => {
    const completed = vi.fn();
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    expect(result.current.order.payments).toHaveLength(1);
    expect(result.current.order.payments[0]).toMatchObject({ method: 'external', amountMinor: result.current.order.totalMinor });
    const total = result.current.order.totalMinor;
    act(() => result.current.setTender({ method: 'external', amountMinor: total, reference: 'A1B2' }));
    expect(result.current.order.payments).toHaveLength(1);
    await act(async () => { await result.current.complete(); });
    expect(completed.mock.calls[0][0].payments).toEqual([expect.objectContaining({ method: 'external', amountMinor: 4375, reference: 'A1B2' })]);
  });

  it('waits for the sale to be saved before showing the receipt', async () => {
    let saved!: () => void;
    const completed = vi.fn(() => new Promise<void>((resolve) => { saved = resolve; }));
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    let completion!: Promise<void>;
    act(() => { completion = result.current.complete(); });
    expect(completed).toHaveBeenCalledTimes(1);
    expect(result.current.stage.kind).toBe('tender');
    await act(async () => { saved(); await completion; });
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('keeps the tender and reports a saving failure', async () => {
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: async () => { throw new Error('Storage full'); } }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    const before = result.current.order;
    await act(async () => { await result.current.complete(); });
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
    expect(result.current.order).toEqual(before);
    expect(result.current.error).toBe('The sale could not be saved: Storage full');
  });

  it('reports CartError without adding an unpriced line', () => {
    const { result } = renderSale(pricing);
    act(() => result.current.add({ ...entries[0], variant: { ...entries[0].variant, prices: [] } }, traits));
    expect(result.current.error).toBe('No EUR price for Shirt · Blue');
    expect(result.current.order.lineItems).toEqual([]);
  });

  it('takes its tax from the TaxProvider: inclusive settings give pricesIncludeTax with the default rate', () => {
    const inclusive: PricingSettings = { currency: 'EUR', pricesIncludeTax: true, taxRatesPpm: { default: 190000, reduced: 70000 } };
    const { result } = renderSale(inclusive);
    act(() => result.current.add(entries[1], traits));
    expect(result.current.order.pricesIncludeTax).toBe(true);
    expect(result.current.order.lineItems[0]).toMatchObject({ taxInclusive: true, taxLines: [expect.objectContaining({ ratePpm: 190000 })] });
    expect(result.current.order.totalMinor).toBe(1000);
    expect(result.current.order.taxMinor).toBe(160); // 1000 × 19/119, rounded
  });

  it('holds new tax settings while a card sale is in progress: it completes on the old ones, the next sale uses the new', async () => {
    const completed = vi.fn();
    const inclusive: PricingSettings = { currency: 'EUR', pricesIncludeTax: true, taxRatesPpm: { default: 190000 } };
    let current: PricingSettings = pricing;
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(current)}>{children}</TaxProvider>;
    }
    const { result, rerender } = renderHook(() => useSale(current, saleOpts({ onSaleCompleted: completed })), { wrapper: Wrapper });
    act(() => result.current.add(entries[1], traits));
    expect(result.current.order.lineItems).toHaveLength(1);
    act(() => result.current.startTender('external'));
    const before = result.current.order;
    current = inclusive;
    rerender();
    expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
    expect(result.current.order).toBe(before);
    expect(result.current.idle).toBe(false);
    await act(async () => { await result.current.complete(); });
    expect(completed).toHaveBeenCalledOnce();
    expect(completed.mock.calls[0][0]).toMatchObject({
      pricesIncludeTax: false, subtotalMinor: 1000, taxMinor: 250, totalMinor: 1250,
      lines: [expect.objectContaining({ netMinor: 1000, taxLines: [expect.objectContaining({ ratePpm: 250000 })] })],
      payments: [expect.objectContaining({ method: 'external', amountMinor: 1250 })],
    });
    act(() => result.current.newSale());
    expect(result.current.order.id).not.toBe(before.id);
    expect(result.current.order.pricesIncludeTax).toBe(true);
    act(() => result.current.add(entries[1], traits));
    expect(result.current.order.totalMinor).toBe(1000);
    expect(result.current.order.taxMinor).toBe(160);
  });

  it('holds new settings while the cart has lines, and applies them once it is empty', () => {
    let current: PricingSettings = pricing;
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(current)}>{children}</TaxProvider>;
    }
    const { result, rerender } = renderHook(() => useSale(current, saleOpts()), { wrapper: Wrapper });
    act(() => result.current.add(entries[1], traits));
    const before = result.current.order.id;
    current = { ...pricing, pricesIncludeTax: true };
    rerender();
    expect(result.current.order.id).toBe(before);
    expect(result.current.order.pricesIncludeTax).toBe(false);
    const lineId = result.current.order.lineItems[0].id;
    act(() => result.current.remove(lineId));
    expect(result.current.idle).toBe(true);
    expect(result.current.order.id).not.toBe(before);
    expect(result.current.order.pricesIncludeTax).toBe(true);
  });

  // From medusapos #63: applyDiscount's discount behaviours, not covered by sale.test.tsx.
  it('below capability 2, applyDiscount returns DISCOUNTS_UNSUPPORTED', () => {
    const { result } = renderSale(pricing, saleOpts({ capabilities: { orderCreate: 1 } }));
    act(() => result.current.add(entries[1], traits));
    let refusal: string | null = null;
    act(() => { refusal = result.current.applyDiscount(null, { type: 'percentage', value: 10 }); });
    expect(refusal).toBe(DISCOUNTS_UNSUPPORTED);
    expect(result.current.order.discounts).toEqual([]);
  });

  it('a fixed discount larger than the line or the order is refused and removed', () => {
    const { result } = renderSale(pricing, saleOpts({ capabilities: { orderCreate: 2 } }));
    act(() => result.current.add(entries[1], traits));
    const lineId = result.current.order.lineItems[0].id;
    let lineRefusal: string | null = null;
    act(() => { lineRefusal = result.current.applyDiscount(lineId, { type: 'fixed', value: 999999 }); });
    expect(lineRefusal).toBe('The discount is more than the line');
    expect(result.current.order.lineItems[0].discounts).toEqual([]);
    let orderRefusal: string | null = null;
    act(() => { orderRefusal = result.current.applyDiscount(null, { type: 'fixed', value: 999999 }); });
    expect(orderRefusal).toBe('The discount is more than the order');
    expect(result.current.order.discounts).toEqual([]);
  });

  it("DISCOUNTS_UNSUPPORTED equals finalizeOrder's own refusal message", () => {
    const noTax = { getTaxRatePpm: () => 0, pricesIncludeTax: false };
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: noTax });
    builder.addLine({ productId: 'p1', name: 'Item', unitPrice: { amount: 1000, currency: 'EUR' } });
    builder.applyOrderDiscount({ type: 'fixed', value: 100 });
    builder.addPayment({ method: 'cash', amountMinor: 900 });
    expect(() => finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 1 } })).toThrow(DISCOUNTS_UNSUPPORTED);
  });

  // New, TallyUI-only (#126): stampSession is the only sanctioned way to set a sale's session.
  it("with session, a completed sale's posOrder.sessionId is the session's id", async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const completed = vi.fn();
      const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, session: { id: sessionId, sessions } }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      await act(async () => { await result.current.complete(); });
      expect(result.current.stage.kind).toBe('receipt');
      if (result.current.stage.kind === 'receipt') expect(result.current.stage.posOrder.sessionId).toBe(sessionId);
      expect(completed.mock.calls[0][0].sessionId).toBe(sessionId);
    } finally {
      await db.remove();
    }
  });

});

// Registers c1a (ADR-032, late sale): complete() runs after the money is taken, so a refused stamp
// keeps the sale, outside every closure. This replaces "a closed session makes complete() set error
// and keep the tender, and onSaleCompleted isn't called". Revert: restore "setError and return" there.
describe('late sale', () => {
  const facts: LogEntry[] = [];
  registerFactsLogger.addSink({ id: 'late-sale-capture', levels: ['debug', 'info', 'warn', 'error'], write: (entry) => facts.push(entry) });
  const lateFacts = () => facts.filter((entry) => (entry.data?.context as { type?: string })?.type === 'register.late-sale');
  beforeEach(() => { facts.length = 0; });

  /** Completes a card sale on `sessionId`, and returns the hook and the order `onSaleCompleted` got. */
  async function completeOn(sessions: RegisterSessionCollection, sessionId: string, onSaleCompleted = vi.fn()) {
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted, session: { id: sessionId, sessions } }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledTimes(1);
    return { result, completed: onSaleCompleted.mock.calls[0][0] as PosOrder };
  }

  it.each(['closed', 'missing'])('a %s session: the sale reaches onSaleCompleted and the receipt with lateSessionId and no sessionId, and a late-sale fact is logged', async (kind) => {
    const { db, sessions, sessionId: opened } = await withOpenSession();
    try {
      if (kind === 'closed') await closeSession(sessions, opened, { counted: { cash: 0 } });
      const sessionId = kind === 'closed' ? opened : 'missing-session';
      const { result, completed } = await completeOn(sessions, sessionId);
      expect(completed).toMatchObject({ lateSessionId: sessionId, syncStatus: 'pending', registerId });
      expect(completed).not.toHaveProperty('sessionId');
      expect(result.current.stage).toEqual({ kind: 'receipt', order: expect.anything(), posOrder: completed });
      expect(result.current.error).toBeNull();
      expect(lateFacts()).toHaveLength(1);
      expect(lateFacts()[0]).toMatchObject({ level: 'warn', data: {
        actor: { id: cashierRef },
        terminal: { operationId: completed.id.replace(/-/g, '') },
        context: { type: 'register.late-sale', orderId: completed.id, sessionId, registerId },
      } });
    } finally {
      await db.remove();
    }
  });

  it('a log sink that throws on the late-sale fact never stops the sale', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    const failing = { id: 'failing', levels: ['warn' as const], write: () => { throw new Error('sink down'); } };
    registerFactsLogger.addSink(failing);
    try {
      await closeSession(sessions, sessionId, { counted: { cash: 0 } });
      const { result, completed } = await completeOn(sessions, sessionId);
      expect(completed.lateSessionId).toBe(sessionId);
      expect(result.current.stage.kind).toBe('receipt');
    } finally {
      registerFactsLogger.removeSink('failing');
      await db.remove();
    }
  });

  it('an open session still stamps sessionId, and logs no late-sale fact', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const { completed } = await completeOn(sessions, sessionId);
      expect(completed.sessionId).toBe(sessionId);
      expect(completed).not.toHaveProperty('lateSessionId');
      expect(lateFacts()).toEqual([]);
    } finally {
      await db.remove();
    }
  });

  it("the late order is stored pending with lateSessionId through a real outbox, and the closed session's closure doesn't count it", async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    await db.addCollections({ closures: { schema: closureSchema } });
    const orders = await addPosOrderCollection(db);
    const sent: CommandEnvelope<OrderCreatePayload>[] = [];
    const outbox = createOrderOutbox({ collection: orders, deviceId: 'device-1', random: () => 0.5,
      transport: { send: async (batch) => { sent.push(...batch); return { kind: 'retry', reason: 'offline' }; } } });
    try {
      await ensureRegister(sessions, 'web');
      const closed = await closeSession(sessions, sessionId, { counted: { cash: 0 } });
      const { completed } = await completeOn(sessions, sessionId, vi.fn(async (posOrder: PosOrder) => {
        await orders.insert(posOrder);
        await outbox.flush();
      }));
      expect((await orders.findOne(completed.id).exec())?.toJSON()).toMatchObject({ syncStatus: 'pending', lateSessionId: sessionId });
      expect(sent.map((command) => command.payload.clientOrderId)).toEqual([completed.id]);
      const closure = await writeClosure({ closures: db.closures as ClosureCollection, register: sessions, storeKey: 'store', session: closed,
        counted: 0, otherTenders: {}, movements: [], orders: [completed], softwareVersion: '1.0.0' });
      expect(closure.toJSON()).toMatchObject({ order_ids: [], period_sales_total_minor: 0, unsynced_count: 0, till_expected: { cash: 0 } });
    } finally {
      outbox.stop();
      await db.remove();
    }
  });
});
