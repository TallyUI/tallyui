// Ported from medusapos/app `a1b981d` `sale.test.tsx` (ADR-052, TV5), rewritten against the
// hook's API instead of the screen. Dropped (screen/app only, belong to TV6 or the app):
//   - "pads the receipt immediately by the fixed %s strip height, on screen only": the outbox strip
//     is a screen layout concern, not the hook.
//   - "shows the cashier display name when supplied to the receipt": exercises the <Receipt>
//     component directly, not useSale.
//   - the whole `describe('store settings on the POS screen')` block: renders the app's
//     ProductsScreen and fetchStoreSettings, not the hook.
import type { ReactNode } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRxDatabase, type RxDatabase } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { CommandEnvelope, OrderCreateEnvelope, OrderCreatePayload, StoreSettings as PricingSettings } from '@tallyui/core';
import { medusaConnector } from '@tallyui/connector-medusa';
import type { LogEntry } from '../logging';
import { createOrderBuilder } from '../order';
import { createOrderOutbox, outboxLogger, useOrderOutbox, type CommandTransport } from '../outbox';
import { addPosOrderCollection, finalizeOrder, type PosOrder } from '../pos-order';
import { TaxProvider } from '../tax';
import { taxProviderProps } from '../store-settings';
import {
  closeSession, closureSchema, ensureRegister, openSession, registerFactsLogger, registerSessionCollection, writeClosure,
  type ClosureCollection, type RegisterSessionCollection,
} from '../register';
import { catalogueEntries } from './catalogue';
import { DISCOUNTS_UNSUPPORTED, HUNG_SAVE_CHECK_MS, SALE_SAVING, saleLogger, useSale } from './use-sale';

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
type IsStored = (posOrder: PosOrder) => Promise<boolean>;
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
  it('setCustomer is refused while the sale is locked', async () => {
    let saved!: () => void;
    const customer = { id: 'customer-1', name: 'Jane Smith', email: 'jane@test.com' };
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: () => new Promise<void>((resolve) => { saved = resolve; }) }));
    addSaleLines(result);
    act(() => result.current.setCustomer(customer));
    act(() => result.current.startTender('external'));
    let completion!: Promise<void>;
    act(() => { completion = result.current.complete(); });
    expect(result.current.saving).toBe(true);
    act(() => result.current.setCustomer(null));
    expect(result.current.order.customer).toEqual(customer);
    act(() => result.current.setCustomer({ id: 'other', name: 'Other' }));
    expect(result.current.order.customer).toEqual(customer);
    await act(async () => { saved(); await completion; });
  });

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

  it('a settings change on an idle cart keeps the customer', () => {
    const customer = { id: 'customer-1', name: 'Jane Smith', email: 'jane@test.com' };
    let current: PricingSettings = pricing;
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(current)}>{children}</TaxProvider>;
    }
    const { result, rerender } = renderHook(() => useSale(current, saleOpts()), { wrapper: Wrapper });
    act(() => result.current.setCustomer(customer));
    for (const next of [{ ...pricing, pricesIncludeTax: true }, { ...pricing, currency: 'USD' }]) {
      const previousId = result.current.order.id;
      current = next;
      rerender();
      expect(result.current.idle).toBe(true);
      expect(result.current.order.id).not.toBe(previousId);
      expect(result.current.order.currency).toBe(current.currency);
      expect(result.current.order.pricesIncludeTax).toBe(current.pricesIncludeTax);
      expect(result.current.order.customer).toEqual(customer);
    }
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

// The tender pins its session (medusapos #88 review): useRegisterSession's saleSession goes undefined
// once the session closes, so a close between startTender and complete() skipped the stamp, and the
// order landed on no Z, unflagged. complete() now stamps the session in force when the tender started.
describe('the tender pins its session', () => {
  const facts: LogEntry[] = [];
  registerFactsLogger.addSink({ id: 'pin-capture', levels: ['warn'], write: (entry) => facts.push(entry) });
  const lateFacts = () => facts.filter((entry) => (entry.data?.context as { type?: string })?.type === 'register.late-sale');
  const saleWarnings: LogEntry[] = [];
  saleLogger.addSink({ id: 'pin-sale-warn', levels: ['warn'], write: (entry) => saleWarnings.push(entry) });
  beforeEach(() => { facts.length = 0; saleWarnings.length = 0; });

  type Session = Parameters<typeof useSale>[1]['session'];
  /** Renders useSale whose `session` option the test changes by `rerender`, as the app's saleSession changes. */
  function renderWithSession(session: Session, onSaleCompleted = vi.fn()) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    const view = renderHook(({ session: current }: { session: Session }) => useSale(pricing, saleOpts({ onSaleCompleted, session: current })),
      { wrapper: Wrapper, initialProps: { session } });
    addSaleLines(view.result);
    return { ...view, onSaleCompleted };
  }
  async function completed(view: ReturnType<typeof renderWithSession>) {
    await act(async () => { await view.result.current.complete(); });
    expect(view.onSaleCompleted).toHaveBeenCalledTimes(1);
    expect(view.result.current.stage.kind).toBe('receipt');
    return view.onSaleCompleted.mock.calls[0][0] as PosOrder;
  }

  it("a session closed mid-tender (saleSession gone undefined) makes a late sale on it, not an unstamped one", async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession({ id: sessionId, sessions });
      act(() => view.result.current.startTender('external'));
      await closeSession(sessions, sessionId, { counted: { cash: 0 } });
      view.rerender({ session: undefined });
      const order = await completed(view);
      expect(order.lateSessionId).toBe(sessionId);
      expect(order).not.toHaveProperty('sessionId');
      expect(lateFacts()).toHaveLength(1);
      expect(lateFacts()[0]).toMatchObject({ data: { context: { type: 'register.late-sale', orderId: order.id, sessionId, registerId } } });
    } finally {
      await db.remove();
    }
  });

  it('a session open throughout stamps sessionId', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession({ id: sessionId, sessions });
      act(() => view.result.current.startTender('external'));
      view.rerender({ session: { id: sessionId, sessions } });
      const order = await completed(view);
      expect(order.sessionId).toBe(sessionId);
      expect(order).not.toHaveProperty('lateSessionId');
      expect(lateFacts()).toEqual([]);
    } finally {
      await db.remove();
    }
  });

  // Changed meaning (the Front desk's backstop, #170 race): this used to stay unstamped.
  it('a tender started with no session, with a session present at complete(), now stamps the current session and warns', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession(undefined);
      act(() => view.result.current.startTender('external'));
      view.rerender({ session: { id: sessionId, sessions } });
      const order = await completed(view);
      expect(order.sessionId).toBe(sessionId);
      expect(order).not.toHaveProperty('lateSessionId');
      expect(lateFacts()).toEqual([]);
      expect(saleWarnings).toHaveLength(1);
    } finally {
      await db.remove();
    }
  });

  it('a repeat startTender mid-tender keeps the pinned session', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession({ id: sessionId, sessions });
      act(() => view.result.current.startTender('external'));
      await closeSession(sessions, sessionId, { counted: { cash: 0 } });
      view.rerender({ session: undefined });
      act(() => view.result.current.startTender('external'));
      const order = await completed(view);
      expect(order.lateSessionId).toBe(sessionId);
      expect(lateFacts()).toHaveLength(1);
    } finally {
      await db.remove();
    }
  });

  it('a cancelled tender drops its pin: a new tender after the app switches to session B stamps B', async () => {
    const { db, sessions, sessionId: first } = await withOpenSession();
    try {
      const view = renderWithSession({ id: first, sessions });
      act(() => view.result.current.startTender('external'));
      act(() => view.result.current.cancelTender());
      expect(view.result.current.stage.kind).toBe('cart');
      await closeSession(sessions, first, { counted: { cash: 0 } });
      const second = await openSession(sessions, {
        registerId, expectedFloatMinor: 0, countedFloatMinor: 0, openedBy: cashierRef, businessDay: { year: 2026, month: 9, day: 26 },
      });
      view.rerender({ session: { id: second.id, sessions } });
      act(() => view.result.current.startTender('external'));
      const order = await completed(view);
      expect(order.sessionId).toBe(second.id);
      expect(order).not.toHaveProperty('lateSessionId');
      expect(lateFacts()).toEqual([]);
    } finally {
      await db.remove();
    }
  });

  it("newSale() drops the pin: the next sale's tender pins the session then in force", async () => {
    const { db, sessions, sessionId: first } = await withOpenSession();
    try {
      const view = renderWithSession({ id: first, sessions });
      act(() => view.result.current.startTender('external'));
      expect((await completed(view)).sessionId).toBe(first);
      act(() => view.result.current.newSale());
      view.rerender({ session: undefined });
      addSaleLines(view.result);
      act(() => view.result.current.startTender('external'));
      await act(async () => { await view.result.current.complete(); });
      const next = view.onSaleCompleted.mock.calls[1][0] as PosOrder;
      expect(next).not.toHaveProperty('sessionId');
      expect(next).not.toHaveProperty('lateSessionId');
    } finally {
      await db.remove();
    }
  });

  // medusapos #88 re-review: the cashier taps Open, then Cash at once. requireSaleSession() has
  // resolved, but the rendered session option is still undefined when startTender runs.
  it.each([
    ['rerendered with the session before complete()', true],
    ['with no rerender before complete()', false],
  ])('pins the session passed to startTender, even before it renders (%s)', async (_label, rerender) => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession(undefined);
      act(() => {
        view.result.current.startTender('cash', { session: { id: sessionId, sessions } });
        view.result.current.setTender({ method: 'cash', amountMinor: view.result.current.order.totalMinor });
      });
      if (rerender) view.rerender({ session: { id: sessionId, sessions } });
      const order = await completed(view);
      expect(order.sessionId).toBe(sessionId);
      expect(order).not.toHaveProperty('lateSessionId');
      expect(saleWarnings).toEqual([]);
    } finally {
      await db.remove();
    }
  });

  it('falls back to the current session, with a warning, when the tender pinned none before the session rendered', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession(undefined);
      act(() => view.result.current.startTender('cash'));
      act(() => view.result.current.setTender({ method: 'cash', amountMinor: view.result.current.order.totalMinor }));
      view.rerender({ session: { id: sessionId, sessions } });
      const order = await completed(view);
      expect(order.sessionId).toBe(sessionId);
      expect(saleWarnings).toHaveLength(1);
      expect(saleWarnings[0]).toMatchObject({ level: 'warn', data: { orderId: order.id, sessionId } });
      expect(saleWarnings[0].message).toContain('pass the confirmed session to startTender');
    } finally {
      await db.remove();
    }
  });

  it('an explicit session wins over a stale rendered one', async () => {
    const { db, sessions, sessionId: a } = await withOpenSession();
    try {
      await closeSession(sessions, a, { counted: { cash: 0 } });
      const b = await openSession(sessions, {
        registerId, expectedFloatMinor: 0, countedFloatMinor: 0, openedBy: cashierRef, businessDay: { year: 2026, month: 9, day: 26 },
      });
      const view = renderWithSession({ id: a, sessions });
      act(() => view.result.current.startTender('external', { session: { id: b.id, sessions } }));
      const order = await completed(view);
      expect(order.sessionId).toBe(b.id);
      expect(order).not.toHaveProperty('lateSessionId');
      expect(lateFacts()).toEqual([]);
    } finally {
      await db.remove();
    }
  });

  it('a tender with no session anywhere stays unstamped', async () => {
    const view = renderWithSession(undefined);
    act(() => view.result.current.startTender('external'));
    const order = await completed(view);
    expect(order).not.toHaveProperty('sessionId');
    expect(order).not.toHaveProperty('lateSessionId');
    expect(saleWarnings).toEqual([]);
    expect(facts).toEqual([]);
  });

  // Gap (#170/#172 follow-up): complete() with no startTender falls back to opts.session (use-sale.ts,
  // `?? opts.session`) — the app called setTender straight from the cart. Nothing tested it.
  it('stamps the rendered session when complete() runs without startTender', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    try {
      const view = renderWithSession({ id: sessionId, sessions });
      act(() => view.result.current.setTender({ method: 'cash', amountMinor: view.result.current.order.totalMinor }));
      const order = await completed(view);
      expect(order.sessionId).toBe(sessionId);
      expect(order).not.toHaveProperty('lateSessionId');
      expect(saleWarnings).toEqual([]);
    } finally {
      await db.remove();
    }
  });
});

// complete() is idempotent for one tender (ADR-052, 2026-09-25): once complete() has built the order,
// that order is the sale. A retry reuses it, so a save that failed after storing it never duplicates it.
describe('complete() is idempotent for one tender', () => {
  const facts: LogEntry[] = [];
  registerFactsLogger.addSink({ id: 'idempotent-capture', levels: ['warn'], write: (entry) => facts.push(entry) });
  const lateFacts = () => facts.filter((entry) => (entry.data?.context as { type?: string })?.type === 'register.late-sale');
  beforeEach(() => { facts.length = 0; });

  /**
   * Renders useSale with a real useOrderOutbox on memory `pos_orders`. Its onSaleCompleted throws `before`
   * times before recording, then `after` times after recording (a fake flush failure). The transport
   * answers "retry in a minute" (unless `failures.send` is given), so every stored order stays pending and no
   * retry fires during a test. useSale gets the outbox's `isStored`, through `wrap` if given; `extra` may override it.
   */
  async function renderWithOutbox(failures: { before?: number; after?: number; send?: CommandTransport['send'] },
    extra: Partial<Parameters<typeof useSale>[1]> = {}, wrap?: (real: IsStored) => IsStored) {
    const name = `idem${Math.random().toString(36).slice(2)}`;
    const send = vi.fn<CommandTransport['send']>(failures.send ?? (async () => ({ kind: 'retry', reason: 'offline', retryAfterMs: 60_000 })));
    const left = { before: failures.before ?? 0, after: failures.after ?? 0 };
    const completed = vi.fn<(posOrder: PosOrder) => void>();
    const open = async () => {
      const db = await createRxDatabase({ name, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
      return { orders: await addPosOrderCollection(db), close: () => db.close().then(() => {}) };
    };
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    const view = renderHook(() => {
      const outbox = useOrderOutbox({ storeKey: 'store', deviceId: 'device-1', open, transport: () => ({ send }) });
      const sale = useSale(pricing, saleOpts({ isStored: wrap ? wrap(outbox.isStored) : outbox.isStored, ...extra, onSaleCompleted: async (posOrder) => {
        completed(posOrder);
        if (left.before-- > 0) throw new Error('Storage busy');
        await outbox.record(posOrder);
        if (left.after-- > 0) throw new Error('flush failed');
      } }));
      return { outbox, sale };
    }, { wrapper: Wrapper });
    await waitFor(() => expect(view.result.current.outbox.orders).not.toBeNull());
    const stored = async () => (await view.result.current.outbox.orders!.find().exec()).map((doc) => doc.toJSON());
    return { result: view.result, unmount: view.unmount, completed, stored, send };
  }
  function startCardSale(result: { current: { sale: ReturnType<typeof useSale> } }) {
    act(() => { result.current.sale.add(entries[0], traits); result.current.sale.add(entries[1], traits); });
    act(() => result.current.sale.startTender('external'));
  }

  it('setCustomer puts the customer on the order, and a new sale starts without it', async () => {
    const customer = { id: 'customer-1', name: 'Jane Smith', email: 'jane@test.com' };
    for (const failsAfterSave of [false, true]) {
      const { result, unmount, completed, stored } = await renderWithOutbox({ after: failsAfterSave ? 1 : 0 });
      try {
        act(() => result.current.sale.setCustomer(customer));
        expect(result.current.sale.order.customer).toEqual(customer);
        act(() => result.current.sale.setCustomer(null));
        expect(result.current.sale.order.customer).toBeNull();
        act(() => result.current.sale.setCustomer(customer));
        startCardSale(result);
        await act(async () => { await result.current.sale.complete(); });
        expect(completed.mock.calls[0][0].customer).toEqual(customer);
        expect((await stored())[0].customer).toEqual(customer);
        if (failsAfterSave) {
          await waitFor(() => expect(result.current.sale.canContinue).toBe(true));
          act(() => result.current.sale.continueSale());
        } else {
          expect(result.current.sale.stage.kind).toBe('receipt');
          act(() => result.current.sale.newSale());
        }
        expect(result.current.sale.order.customer).toBeNull();
      } finally {
        unmount();
      }
    }
  });

  it("a throw after the insert, then a retry, ends with exactly one order in the outbox: the first attempt's", async () => {
    const { result, unmount, completed, stored } = await renderWithOutbox({ after: 1 });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale.error).toBe('The sale could not be saved: flush failed');
      expect(result.current.sale.stage).toEqual({ kind: 'tender', method: 'external' });
      expect(result.current.sale.saving).toBe(true);
      const first = completed.mock.calls[0][0];
      expect(await stored()).toEqual([expect.objectContaining({ id: first.id, commandId: first.commandId })]);
      await act(async () => { await result.current.sale.complete(); });
      expect(completed).toHaveBeenCalledTimes(2);
      const orders = await stored();
      expect(orders).toHaveLength(1);
      expect(orders[0]).toMatchObject({ id: first.id, commandId: first.commandId, createdAt: first.createdAt, syncStatus: 'pending' });
      expect(result.current.sale.stage).toEqual({ kind: 'receipt', order: expect.anything(), posOrder: first });
      expect(result.current.sale.error).toBeNull();
      expect(result.current.sale.saving).toBe(false);
    } finally {
      unmount();
    }
  });

  it('a throw before the insert, then retries, store one order; no retry finalizes again (same ids and createdAt)', async () => {
    const { result, unmount, completed, stored } = await renderWithOutbox({ before: 2 });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale.error).toBe('The sale could not be saved: Storage busy');
      expect(await stored()).toEqual([]);
      await act(async () => { await result.current.sale.complete(); });
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale.stage.kind).toBe('receipt');
      const first = completed.mock.calls[0][0];
      expect(completed).toHaveBeenCalledTimes(3);
      expect(completed.mock.calls.every(([posOrder]) => posOrder === first)).toBe(true);
      expect(await stored()).toEqual([expect.objectContaining({ id: first.id, commandId: first.commandId, createdAt: first.createdAt })]);
    } finally {
      unmount();
    }
  });

  it("with a session, the retry doesn't stamp again: a session closed meanwhile doesn't make it late", async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    const { result, unmount, completed, stored } = await renderWithOutbox({ after: 1 }, { session: { id: sessionId, sessions } });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      const first = completed.mock.calls[0][0];
      expect(first.sessionId).toBe(sessionId);
      await closeSession(sessions, sessionId, { counted: { cash: 0 } });
      await act(async () => { await result.current.sale.complete(); });
      expect(completed.mock.calls[1][0]).toBe(first);
      expect(await stored()).toEqual([expect.objectContaining({ id: first.id, sessionId })]);
      expect(lateFacts()).toEqual([]);
    } finally {
      unmount();
      await db.remove();
    }
  });

  it('with a closed session, the retry logs no second late-sale fact', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    await closeSession(sessions, sessionId, { counted: { cash: 0 } });
    const { result, unmount, completed, stored } = await renderWithOutbox({ after: 1 }, { session: { id: sessionId, sessions } });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      expect(lateFacts()).toHaveLength(1);
      await act(async () => { await result.current.sale.complete(); });
      const first = completed.mock.calls[0][0];
      expect(completed.mock.calls[1][0]).toBe(first);
      expect(lateFacts()).toHaveLength(1);
      expect(await stored()).toEqual([expect.objectContaining({ id: first.id, lateSessionId: sessionId })]);
    } finally {
      unmount();
      await db.remove();
    }
  });

  it('while saving, every change to the sale is refused with the saving error, and the retry saves the sale as it was', async () => {
    const { result, unmount, completed } = await renderWithOutbox({ after: 1 }, { capabilities: { orderCreate: 2 } });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      const before = result.current.sale.order;
      const sale = () => result.current.sale;
      const lineId = before.lineItems[0].id;
      let refusal: string | null = null;
      const changes: Array<[string, () => void]> = [
        ['add', () => sale().add(entries[1], traits)],
        ['setTender', () => sale().setTender({ method: 'cash', amountMinor: 99999 })],
        ['cancelTender', () => sale().cancelTender()],
        ['applyDiscount', () => { refusal = sale().applyDiscount(null, { type: 'percentage', value: 10 }); }],
        ['setQuantity', () => sale().setQuantity(lineId, 5)],
        ['remove', () => sale().remove(lineId)],
        ['removeDiscount', () => sale().removeDiscount('any')],
        ['startTender', () => sale().startTender('cash')],
      ];
      for (const [name, change] of changes) {
        act(change);
        expect(result.current.sale.order, name).toEqual(before);
        expect(result.current.sale.stage, name).toEqual({ kind: 'tender', method: 'external' });
        expect(result.current.sale.error, name).toBe(SALE_SAVING);
      }
      expect(refusal).toBe(SALE_SAVING);
      await act(async () => { await result.current.sale.complete(); });
      expect(completed.mock.calls[1][0]).toBe(completed.mock.calls[0][0]);
      expect(result.current.sale.stage.kind).toBe('receipt');
    } finally {
      unmount();
    }
  });

  it('newSale() once the order is confirmed stored abandons the pending completion: the stored order stays pending and unchanged, never handed over again, and the next sale gets new ids', async () => {
    const { result, unmount, completed, stored } = await renderWithOutbox({ after: 1 });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      const [abandoned] = await stored();
      expect(abandoned).toMatchObject({ syncStatus: 'pending' });
      await waitFor(() => expect(result.current.sale.canContinue).toBe(true)); // 5a: newSale() waits for this
      act(() => result.current.sale.newSale());
      expect(result.current.sale.saving).toBe(false);
      expect(result.current.sale.error).toBeNull();
      expect(result.current.sale.stage.kind).toBe('cart');
      // Confirmed stored, so never handed back to onSaleCompleted (the Front desk, 2026-09-27; #147 re-handed it).
      await act(async () => {});
      expect(completed).toHaveBeenCalledTimes(1);
      startCardSale(result);
      expect(result.current.sale.order.lineItems).toHaveLength(2);
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale.stage.kind).toBe('receipt');
      const next = completed.mock.calls[1][0];
      expect(next.id).not.toBe(abandoned.id);
      expect(next.commandId).not.toBe(abandoned.commandId);
      const orders = await stored();
      expect(orders).toHaveLength(2);
      expect(orders.find((order) => order.id === abandoned.id)).toEqual(abandoned);
    } finally {
      unmount();
    }
  });

  it('two complete() calls in the same tick, with a slow stamp, build one order: one stamp, one onSaleCompleted', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    let stamps = 0;
    const read = sessions.storageInstance.findDocumentsById.bind(sessions.storageInstance);
    const slow = { storageInstance: { findDocumentsById: async (...args: Parameters<typeof read>) => { stamps++; await gate; return read(...args); } } };
    const { result, unmount, completed, stored } = await renderWithOutbox({},
      { session: { id: sessionId, sessions: slow as unknown as RegisterSessionCollection } });
    try {
      startCardSale(result);
      let calls!: Promise<void>[];
      act(() => { calls = [result.current.sale.complete(), result.current.sale.complete()]; });
      await act(async () => { release(); await Promise.all(calls); });
      expect(await stored()).toHaveLength(1);
      expect(stamps).toBe(1);
      expect(completed).toHaveBeenCalledTimes(1);
      expect(result.current.sale.stage.kind).toBe('receipt');
      expect(calls[1]).toBe(calls[0]);
    } finally {
      unmount();
      await db.remove();
    }
  });

  it('complete() on the receipt does nothing, even from a handler bound before the receipt showed', async () => {
    const { result, unmount, completed, stored } = await renderWithOutbox({});
    try {
      startCardSale(result);
      const boundOnTender = result.current.sale.complete;
      await act(async () => { await result.current.sale.complete(); });
      const receipt = result.current.sale.stage;
      expect(receipt.kind).toBe('receipt');
      await act(async () => { await result.current.sale.complete(); });
      await act(async () => { await boundOnTender(); });
      expect(completed).toHaveBeenCalledTimes(1);
      expect(await stored()).toHaveLength(1);
      expect(result.current.sale.stage).toBe(receipt);
    } finally {
      unmount();
    }
  });

  it('a first complete() that succeeds behaves as before: one call, one order, the receipt, never left saving', async () => {
    const { result, unmount, completed, stored } = await renderWithOutbox({});
    try {
      startCardSale(result);
      expect(result.current.sale.saving).toBe(false);
      await act(async () => { await result.current.sale.complete(); });
      expect(completed).toHaveBeenCalledTimes(1);
      expect(result.current.sale.stage).toEqual({ kind: 'receipt', order: expect.anything(), posOrder: completed.mock.calls[0][0] });
      expect(result.current.sale.error).toBeNull();
      expect(result.current.sale.saving).toBe(false);
      expect(await stored()).toHaveLength(1);
    } finally {
      unmount();
    }
  });

  // Continue once the order is confirmed stored (the Front desk, 2026-09-27; the medusapos v2 follow-up).
  it('a save that stores, then throws: canContinue turns true, and continueSale() starts a new sale, leaving the order pending with its ids, never handed over again', async () => {
    const { result, unmount, completed, stored } = await renderWithOutbox({ after: 1 });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      const [order] = await stored();
      await waitFor(() => expect(result.current.sale.canContinue).toBe(true));
      act(() => result.current.sale.continueSale());
      expect(result.current.sale.stage.kind).toBe('cart');
      expect(result.current.sale.order.lineItems).toEqual([]);
      expect(result.current.sale).toMatchObject({ canContinue: false, saving: false, error: null });
      for (let i = 0; i < 5; i++) await act(async () => {}); // room for a background hand-over, if one were made
      expect(completed).toHaveBeenCalledTimes(1); // one save attempt; none from continueSale()
      expect(await stored()).toEqual([expect.objectContaining({ id: order.id, commandId: order.commandId, syncStatus: 'pending' })]);
    } finally {
      unmount();
    }
  });

  it('a save that throws before storing: canContinue stays false, and continueSale() and newSale() change nothing', async () => {
    const answers: boolean[] = [];
    const { result, unmount, completed, stored } = await renderWithOutbox({ before: 1 }, {},
      (real) => async (posOrder) => { const answer = await real(posOrder); answers.push(answer); return answer; });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale.canContinue).toBe(false);
      await waitFor(() => expect(answers).toEqual([false]));
      await act(async () => {});
      expect(result.current.sale.canContinue).toBe(false);
      const before = result.current.sale.order;
      act(() => result.current.sale.continueSale());
      act(() => result.current.sale.newSale());
      expect(result.current.sale).toMatchObject({ order: before, stage: { kind: 'tender', method: 'external' }, saving: true, error: SALE_SAVING });
      expect(completed).toHaveBeenCalledTimes(1);
      expect(await stored()).toEqual([]);
    } finally {
      unmount();
    }
  });

  it('Continue never shows before the stored confirmation: false while saving and while a slow isStored runs; newSale() is refused until it answers true', async () => {
    let answer!: () => void;
    const gate = new Promise<void>((resolve) => { answer = resolve; });
    const { result, unmount } = await renderWithOutbox({ after: 1 }, {}, (real) => async (posOrder) => { await gate; return real(posOrder); });
    try {
      startCardSale(result);
      let completion!: Promise<void>;
      act(() => { completion = result.current.sale.complete(); });
      expect(result.current.sale.canContinue).toBe(false);
      await act(async () => { await completion; });
      expect(result.current.sale.error).toBe('The sale could not be saved: flush failed');
      expect(result.current.sale.canContinue).toBe(false);
      const before = result.current.sale.order;
      act(() => result.current.sale.newSale());
      expect(result.current.sale).toMatchObject({ order: before, stage: { kind: 'tender' }, saving: true, error: SALE_SAVING, canContinue: false });
      await act(async () => { answer(); });
      await waitFor(() => expect(result.current.sale.canContinue).toBe(true));
      act(() => result.current.sale.newSale());
      expect(result.current.sale).toMatchObject({ stage: { kind: 'cart' }, saving: false, error: null, canContinue: false });
    } finally {
      unmount();
    }
  });

  it.each([
    ['throws', { wrap: (): IsStored => async () => { throw new Error('storage gone'); } }],
    ['is absent', { extra: { isStored: undefined } }],
  ] as const)('an isStored that %s: canContinue stays false after a save that stored, then threw', async (_kind, setup) => {
    const { result, unmount, stored } = await renderWithOutbox({ after: 1 }, 'extra' in setup ? setup.extra : {},
      'wrap' in setup ? setup.wrap : undefined);
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      expect(await stored()).toHaveLength(1);
      for (let i = 0; i < 5; i++) await act(async () => {});
      expect(result.current.sale.canContinue).toBe(false);
      act(() => result.current.sale.continueSale());
      expect(result.current.sale.stage).toEqual({ kind: 'tender', method: 'external' });
    } finally {
      unmount();
    }
  });

  it('a Retry that succeeds after canContinue was true clears it and shows the receipt', async () => {
    const { result, unmount } = await renderWithOutbox({ after: 1 });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      await waitFor(() => expect(result.current.sale.canContinue).toBe(true));
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale).toMatchObject({ stage: { kind: 'receipt' }, canContinue: false, saving: false, error: null });
    } finally {
      unmount();
    }
  });

  it('requeue, then retry (medusapos #79): the Retry succeeds on the stored order under its new commandId, sent once, logged at warn', async () => {
    const logged: LogEntry[] = [];
    outboxLogger.addSink({ id: 'requeue-retry-capture', levels: ['warn'], write: (entry) => logged.push(entry) });
    let sends = 0;
    const send: CommandTransport<OrderCreateEnvelope>['send'] = async (batch) => ({ kind: 'results', results: batch.map((command) => sends++ === 0
      ? { id: command.id, status: 'rejected', error: { code: 'unknown_variant', message: 'gone' } }
      : { id: command.id, status: 'applied', serverRefs: { orderId: 'server-order', totalMinor: command.payload.totalMinor } }) });
    const { result, unmount, completed, stored, send: transport } = await renderWithOutbox({ after: 1, send });
    try {
      startCardSale(result);
      await act(async () => { await result.current.sale.complete(); });
      const first = completed.mock.calls[0][0];
      await waitFor(async () => expect(await stored()).toEqual([expect.objectContaining({ syncStatus: 'rejected' })]));
      await act(async () => { expect(await result.current.outbox.requeue([first.id])).toBe(1); });
      await waitFor(async () => expect(await stored()).toEqual([expect.objectContaining({ syncStatus: 'applied' })]));
      const [requeued] = await stored();
      expect(requeued.commandId).not.toBe(first.commandId);
      await act(async () => { await result.current.sale.complete(); });
      expect(result.current.sale.stage.kind).toBe('receipt');
      expect(result.current.sale.saving).toBe(false);
      expect(await stored()).toEqual([requeued]);
      const commands = transport.mock.calls.flatMap(([batch]) => batch.map((command) => command.id));
      expect(commands.filter((id) => id === requeued.commandId)).toHaveLength(1);
      expect(logged).toEqual([expect.objectContaining({ level: 'warn',
        data: { orderId: first.id, storedCommandId: requeued.commandId, recordedCommandId: first.commandId } })]);
    } finally {
      outboxLogger.removeSink('requeue-retry-capture');
      unmount();
    }
  });
});

// Follow-ups to complete()'s idempotency (2026-09-27, the #145 review): abandoning a hung save, and
// locking the sale from complete()'s entry rather than only once the order is built and stamped.
describe('abandoning a hung save and locking from entry', () => {
  /** Opens a memory pos_orders collection to check what a completed sale actually stored. */
  async function withPosOrders() {
    const db = await createRxDatabase({ name: `abandon${Math.random().toString(36).slice(2)}`,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false });
    return { db, orders: await addPosOrderCollection(db) };
  }

  // 5a (the Front desk, 2026-09-27) replaces #147's "newSale() during a save that never resolves: the next
  // sale saves its own order with new ids": with the order built, newSale() now waits for the stored
  // confirmation, which a refusal mid-save asks for afresh. These two cover both answers.
  /** A sale whose onSaleCompleted stores the order, then never settles; isStored reads that collection. */
  async function renderHungSave(answer: (stored: boolean) => boolean) {
    const { db, orders } = await withPosOrders();
    const completed = vi.fn(async (posOrder: PosOrder) => {
      await orders.insert(posOrder);
      await new Promise<void>(() => {}); // deliberately never resolves
    });
    const checks: boolean[] = [];
    const isStored = async (posOrder: PosOrder) => {
      const reply = answer(!!(await orders.findOne(posOrder.id).exec()));
      checks.push(reply);
      return reply;
    };
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, isStored }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    const before = result.current.order;
    act(() => { result.current.complete(); });
    await waitFor(async () => expect(await orders.find().exec()).toHaveLength(1));
    act(() => result.current.newSale());
    expect(result.current).toMatchObject({ order: before, stage: { kind: 'tender', method: 'external' },
      saving: true, error: SALE_SAVING, canContinue: false });
    return { db, orders, completed, checks, result };
  }

  it('newSale() during a save that never resolves, with the order built, is refused; an isStored that does not confirm leaves it refused, with no Continue', async () => {
    const { db, completed, checks, result } = await renderHungSave(() => false);
    try {
      await waitFor(() => expect(checks).toEqual([false]));
      await act(async () => {});
      expect(result.current).toMatchObject({ stage: { kind: 'tender' }, saving: true, canContinue: false });
      act(() => result.current.continueSale());
      expect(result.current.stage.kind).toBe('tender');
      expect(completed).toHaveBeenCalledTimes(1);
    } finally {
      await db.remove();
    }
  });

  it('newSale() refused during a save that never resolves asks isStored; once it confirms, Continue starts a new sale with the order stored exactly once', async () => {
    const { db, orders, completed, checks, result } = await renderHungSave((stored) => stored);
    try {
      await waitFor(() => expect(result.current.canContinue).toBe(true));
      expect(checks).toEqual([true]);
      act(() => result.current.continueSale());
      expect(result.current).toMatchObject({ stage: { kind: 'cart' }, saving: false, error: null, canContinue: false });
      expect(result.current.order.lineItems).toEqual([]);
      for (let i = 0; i < 5; i++) await act(async () => {});
      expect(completed).toHaveBeenCalledTimes(1);
      expect(await orders.find().exec()).toHaveLength(1);
    } finally {
      await db.remove();
    }
  });

  // The hung-save poll (the Front desk, 2026-09-28): medusapos's tender has no New sale control while
  // saving, so the refused-newSale() check above never fires for it. useSale re-asks isStored by
  // itself every HUNG_SAVE_CHECK_MS while the order is built and its save is in flight and unconfirmed,
  // with no newSale() call or tap needed. These tests pass the test-only `hungSaveCheckMs` (50 ms) so
  // they run on real timers without waiting out the real 5 s default (the Front desk, 2026-09-28).
  describe('the hung-save poll', () => {
    const checkMs = 50;

    /** As renderHungSave, but never taps newSale(): only the poll's own timer may ask isStored. */
    async function renderHungSaveNoTap(answer: (stored: boolean) => boolean) {
      const { db, orders } = await withPosOrders();
      const completed = vi.fn(async (posOrder: PosOrder) => {
        await orders.insert(posOrder);
        await new Promise<void>(() => {}); // deliberately never resolves
      });
      const checks: boolean[] = [];
      const isStored = async (posOrder: PosOrder) => {
        const reply = answer(!!(await orders.findOne(posOrder.id).exec()));
        checks.push(reply);
        return reply;
      };
      const { result, unmount } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, isStored, hungSaveCheckMs: checkMs }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      act(() => { result.current.complete(); });
      await waitFor(async () => expect(await orders.find().exec()).toHaveLength(1));
      return { db, orders, completed, checks, result, unmount };
    }

    it('defaults to 5000 ms when hungSaveCheckMs is not given', () => {
      expect(HUNG_SAVE_CHECK_MS).toBe(5000);
    });

    it('confirms on its own: with no newSale() or tap, canContinue turns true once the timer\'s isStored confirms; continueSale() then starts a new sale with the order stored exactly once', async () => {
      const { db, orders, completed, checks, result } = await renderHungSaveNoTap(() => true);
      try {
        expect(checks).toEqual([]);
        expect(result.current.canContinue).toBe(false);
        await waitFor(() => expect(result.current.canContinue).toBe(true));
        expect(checks).toEqual([true]);
        expect(result.current).toMatchObject({ stage: { kind: 'tender' }, saving: true, error: null, canContinue: true });
        act(() => result.current.continueSale());
        expect(result.current).toMatchObject({ stage: { kind: 'cart' }, saving: false, error: null, canContinue: false });
        for (let i = 0; i < 5; i++) await act(async () => {});
        expect(completed).toHaveBeenCalledTimes(1);
        expect(await orders.find().exec()).toHaveLength(1);
      } finally {
        await db.remove();
      }
    });

    it('before confirmation, each tick changes nothing; a later tick confirms once isStored turns true', async () => {
      let stored = false;
      const { db, checks, result } = await renderHungSaveNoTap(() => stored);
      try {
        await waitFor(() => expect(checks.length).toBeGreaterThanOrEqual(1));
        expect(checks).toEqual([false]);
        expect(result.current).toMatchObject({ stage: { kind: 'tender' }, saving: true, error: null, canContinue: false });
        stored = true;
        await waitFor(() => expect(result.current.canContinue).toBe(true));
        expect(checks).toEqual([false, true]);
      } finally {
        await db.remove();
      }
    });

    it('cleared on settle: a save that resolves before the first tick asks isStored no further times, even several ticks later', async () => {
      const { db, orders } = await withPosOrders();
      let release!: () => void;
      const gate = new Promise<void>((resolve) => { release = resolve; });
      const completed = vi.fn(async (posOrder: PosOrder) => { await orders.insert(posOrder); await gate; });
      const isStored = vi.fn(async () => true);
      try {
        const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, isStored, hungSaveCheckMs: checkMs }));
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        let completion!: Promise<void>;
        act(() => { completion = result.current.complete(); });
        await new Promise((resolve) => setTimeout(resolve, checkMs / 2));
        release();
        await act(async () => { await completion; });
        expect(result.current.stage.kind).toBe('receipt');
        isStored.mockClear();
        await new Promise((resolve) => setTimeout(resolve, checkMs * 5));
        expect(isStored).not.toHaveBeenCalled();
      } finally {
        await db.remove();
      }
    });

    it('cleared on unmount: unmounting during a hung save stops further isStored calls, with no act warning', async () => {
      const { db, unmount, checks } = await renderHungSaveNoTap(() => false);
      try {
        unmount();
        await new Promise((resolve) => setTimeout(resolve, checkMs * 5));
        expect(checks).toEqual([]);
      } finally {
        await db.remove();
      }
    });

    // #161 review: with isStored slower than the interval, unguarded ticks ran several checks at once,
    // and a hung storage (this poll's whole reason to exist) is exactly when isStored is slow.
    it('overlapping checks: an isStored slower than the interval never has more than one check in flight at once', async () => {
      const { db, orders } = await withPosOrders();
      const completed = vi.fn(async (posOrder: PosOrder) => { await orders.insert(posOrder); await new Promise<void>(() => {}); });
      let active = 0;
      let maxActive = 0;
      const isStored = vi.fn(async () => {
        active++;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, checkMs * 5)); // much slower than the interval
        active--;
        return false;
      });
      try {
        const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, isStored, hungSaveCheckMs: checkMs }));
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        act(() => { result.current.complete(); });
        await waitFor(async () => expect(await orders.find().exec()).toHaveLength(1));
        await new Promise((resolve) => setTimeout(resolve, checkMs * 12)); // several ticks while isStored is slow
        expect(isStored.mock.calls.length).toBeGreaterThanOrEqual(2); // the guard skipped ticks, not every one
        expect(maxActive).toBe(1);
      } finally {
        await db.remove();
      }
    });

    // #161 review: an old, abandoned attempt's own timer handle must never clear a newer sale's timer
    // when its stale save finally settles late.
    it("a stale save from an abandoned sale never kills the next sale's timer: sale 2 still gets Continue", async () => {
      const { db, orders } = await withPosOrders();
      let releaseSale1!: () => void;
      const sale1Gate = new Promise<void>((resolve) => { releaseSale1 = resolve; });
      let sale = 1;
      const completed = vi.fn(async (posOrder: PosOrder) => {
        await orders.insert(posOrder);
        if (sale === 1) { await sale1Gate; throw new Error('sale 1 flush failed, late'); }
        await new Promise<void>(() => {}); // sale 2 hangs too
      });
      const isStored = async (posOrder: PosOrder) => !!(await orders.findOne(posOrder.id).exec());
      const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, isStored, hungSaveCheckMs: checkMs }));
      try {
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        act(() => { result.current.complete(); }); // sale 1, hangs
        await waitFor(() => expect(result.current.canContinue).toBe(true)); // sale 1's own timer confirms it
        act(() => result.current.continueSale()); // abandons sale 1; sale 1's save is still in flight
        expect(result.current.stage.kind).toBe('cart');
        sale = 2;
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        act(() => { result.current.complete(); }); // sale 2, hangs too, with its own timer armed
        await waitFor(async () => expect(await orders.find().exec()).toHaveLength(2));
        releaseSale1(); // sale 1's stale save settles late, well after sale 2's timer took over
        await act(async () => {});
        await waitFor(() => expect(result.current.canContinue).toBe(true)); // sale 2 still gets Continue
        expect(await orders.find().exec()).toHaveLength(2);
      } finally {
        await db.remove();
      }
    });

    // The check guard is per completion, not a bare boolean (medusapos's #85 review): sale 1's isStored
    // never settles (a permanently stuck check), but sale 1 still gets past it through an ordinary Retry
    // that succeeds, and newSale() to sale 2. Sale 2 hangs too; its poll must still confirm and offer
    // Continue, which a shared boolean guard (stuck true forever from sale 1's stuck check) would block.
    it("a completion whose isStored never settles never blocks a later sale's own poll", async () => {
      const { db, orders } = await withPosOrders();
      let sale = 1;
      let insertedSale1 = false;
      const completed = vi.fn(async (posOrder: PosOrder) => {
        if (sale === 1) {
          if (!insertedSale1) { insertedSale1 = true; await orders.insert(posOrder); throw new Error('flush failed'); }
          return; // Retry: already stored, succeeds
        }
        await orders.insert(posOrder);
        await new Promise<void>(() => {}); // sale 2 hangs too
      });
      const isStored = (posOrder: PosOrder) => sale === 1
        ? new Promise<boolean>(() => {}) // sale 1's check never settles
        : orders.findOne(posOrder.id).exec().then((doc) => !!doc);
      const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed, isStored, hungSaveCheckMs: checkMs }));
      try {
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        await act(async () => { await result.current.complete(); }); // attempt 1: throws, fires the stuck check
        expect(result.current.error).toBe('The sale could not be saved: flush failed');
        expect(result.current.canContinue).toBe(false); // never confirms
        await act(async () => { await result.current.complete(); }); // Retry: attempt 2 succeeds
        expect(result.current.stage.kind).toBe('receipt');
        act(() => result.current.newSale()); // allowed: pending is cleared
        expect(result.current.stage.kind).toBe('cart');
        sale = 2;
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        act(() => { result.current.complete(); }); // sale 2, hangs too, with its own timer armed
        await waitFor(() => expect(result.current.canContinue).toBe(true)); // sale 2 still gets Continue
      } finally {
        await db.remove();
      }
    });
  });

  // Removed (the Front desk, 2026-09-27; #149 review): this covered newSale() abandoning a built
  // order mid-stamp, so an old, abandoned attempt and a new one could be in flight in the same hook
  // at once. That's now impossible — newSale() refuses during the stamp instead (see the stamp-window
  // test below) — so there's no old attempt left to resolve late against a new sale's in-flight
  // tracking. Double-tap sharing on one in-flight complete() is still covered above ("two complete()
  // calls in the same tick, with a slow stamp, build one order").

  // 5a (the Front desk, 2026-09-27; #149 review) converts #147's abandon-mid-stamp test: newSale()
  // during the stamp is now refused outright, like every other change, instead of handing the old
  // attempt off in the background — a failure there would otherwise be money taken with only an
  // error log. The cashier waits for the (short) stamp, then gets Retry or Continue as usual.
  it('newSale() while the stamp is slow is refused; the sale is unchanged, and once the stamp resolves and the save succeeds, the receipt shows for that sale', async () => {
    const { db: sessionDb, sessions, sessionId } = await withOpenSession();
    const { db: ordersDb, orders } = await withPosOrders();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = sessions.storageInstance.findDocumentsById.bind(sessions.storageInstance);
    const slow = { storageInstance: { findDocumentsById: async (...args: Parameters<typeof read>) => { await gate; return read(...args); } } };
    const completed = vi.fn(async (posOrder: PosOrder) => { await orders.insert(posOrder); });
    try {
      const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed,
        session: { id: sessionId, sessions: slow as unknown as RegisterSessionCollection } }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      const before = result.current.order;
      let promise!: Promise<void>;
      act(() => { promise = result.current.complete(); }); // stuck in the stamp (gate not released)
      expect(result.current.saving).toBe(true);
      act(() => result.current.newSale()); // refused: nothing is built yet to ask isStored about
      expect(result.current).toMatchObject({ order: before, stage: { kind: 'tender', method: 'external' },
        saving: true, error: SALE_SAVING });
      release(); // let the stamp finish
      await act(async () => { await promise; });
      expect(completed).toHaveBeenCalledTimes(1);
      expect(await orders.find().exec()).toHaveLength(1);
      expect(result.current.error).toBeNull();
      expect(result.current.stage.kind).toBe('receipt');
    } finally {
      await sessionDb.remove();
      await ordersDb.remove();
    }
  });

  // Removed (the Front desk, 2026-09-27; #149 review): this covered handOverAbandoned's error log for
  // an attempt abandoned mid-stamp. That background hand-over no longer exists — newSale() refuses
  // during the stamp instead of abandoning it (see the stamp-window test below), so there's nothing
  // left to throw in the background from this window. The surviving abandon path (a confirmed pending
  // completion, abandoned by Continue, whose still-in-flight save later throws) keeps its own coverage:
  // "Continue during a save still in flight, once isStored confirms: its later throw is logged at
  // error with the order id, never shown on the next sale".

  // The #147 review asked that deliver() abandoned mid-flight never swallow a later throw. Since 5a (the
  // Front desk, 2026-09-27) newSale() can't abandon a built order mid-save until isStored confirms it (no
  // isStored here): it's refused, and the throw lands on the tender as usual. Since the #150 review, that
  // throw is also logged at error, still pending or not: a screen unmounted by the time it lands (medusapos
  // Sign out) must never lose it silently. Covers a session-less sale and one with a session. The confirmed,
  // abandoned case's throw is the next test's.
  it.each(['session-less', 'with a session'] as const)(
    'newSale() (%s) with the insert in flight is refused; the save then throws: the order is stored once and the throw logged, and the tender keeps the error for Retry',
    async (kind) => {
      const logged: LogEntry[] = [];
      saleLogger.addSink({ id: 'abandon-inflight-capture', levels: ['error'], write: (entry) => logged.push(entry) });
      const { db: ordersDb, orders } = await withPosOrders();
      const sessionCtx = kind === 'with a session' ? await withOpenSession() : null;
      let releaseThrow!: () => void;
      const throwGate = new Promise<void>((resolve) => { releaseThrow = resolve; });
      const completed = vi.fn(async (posOrder: PosOrder) => {
        await orders.insert(posOrder);
        await throwGate;
        throw new Error('flush failed');
      });
      try {
        const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed,
          ...(sessionCtx ? { session: { id: sessionCtx.sessionId, sessions: sessionCtx.sessions } } : {}) }));
        addSaleLines(result);
        act(() => result.current.startTender('external'));
        let completion!: Promise<void>;
        act(() => { completion = result.current.complete(); });
        await waitFor(async () => expect(await orders.find().exec()).toHaveLength(1));
        act(() => result.current.newSale()); // refused while onSaleCompleted (the insert) is in flight
        expect(result.current.error).toBe(SALE_SAVING);
        releaseThrow();
        await act(async () => { await completion; });
        expect(await orders.find().exec()).toHaveLength(1);
        expect(logged).toEqual([expect.objectContaining({ level: 'error',
          data: { orderId: completed.mock.calls[0][0].id, error: 'flush failed' } })]);
        expect(result.current.error).toBe('The sale could not be saved: flush failed');
        expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
        expect(result.current.saving).toBe(true);
      } finally {
        saleLogger.removeSink('abandon-inflight-capture');
        await ordersDb.remove();
        if (sessionCtx) await sessionCtx.db.remove();
      }
    },
  );

  it('Continue during a save still in flight, once isStored confirms: its later throw is logged at error with the order id, never shown on the next sale', async () => {
    const logged: LogEntry[] = [];
    saleLogger.addSink({ id: 'continued-inflight-capture', levels: ['error'], write: (entry) => logged.push(entry) });
    const { db, orders } = await withPosOrders();
    let releaseThrow!: () => void;
    const throwGate = new Promise<void>((resolve) => { releaseThrow = resolve; });
    try {
      const { result } = renderSale(pricing, saleOpts({
        onSaleCompleted: async (posOrder) => { await orders.insert(posOrder); await throwGate; throw new Error('flush failed'); },
        isStored: async (posOrder) => !!(await orders.findOne(posOrder.id).exec()) }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      let completion!: Promise<void>;
      act(() => { completion = result.current.complete(); });
      await waitFor(async () => expect(await orders.find().exec()).toHaveLength(1));
      act(() => result.current.newSale()); // refused; asks isStored afresh
      await waitFor(() => expect(result.current.canContinue).toBe(true));
      act(() => result.current.continueSale());
      releaseThrow();
      await act(async () => { await completion; });
      expect(logged).toEqual([expect.objectContaining({ level: 'error',
        data: { orderId: (await orders.find().exec())[0].id, error: 'flush failed' } })]);
      expect(result.current).toMatchObject({ stage: { kind: 'cart' }, saving: false, error: null, canContinue: false });
    } finally {
      saleLogger.removeSink('continued-inflight-capture');
      await db.remove();
    }
  });

  // 5a (the Front desk, 2026-09-27) replaces #147's "newSale() after a failed save re-hands the order in
  // the background": that hand-over could fail again with only a log line, so money taken with no order.
  it("newSale() after a save that failed before storing is refused, and the sale is unchanged; the Retry stores it exactly once", async () => {
    const { db, orders } = await withPosOrders();
    let failFirst = true;
    const completed = vi.fn(async (posOrder: PosOrder) => {
      if (failFirst) { failFirst = false; throw new Error('Storage busy'); }
      await orders.insert(posOrder);
    });
    try {
      const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: completed }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      const before = result.current.order;
      await act(async () => { await result.current.complete(); }); // fails; pending stays set for Retry
      expect(result.current.error).toBe('The sale could not be saved: Storage busy');
      expect(await orders.find().exec()).toHaveLength(0);
      await act(async () => { result.current.newSale(); }); // refused: the order isn't confirmed stored
      expect(result.current).toMatchObject({ order: before, stage: { kind: 'tender', method: 'external' },
        saving: true, error: SALE_SAVING, canContinue: false });
      expect(completed).toHaveBeenCalledTimes(1);
      await act(async () => { await result.current.complete(); });
      expect(await orders.find().exec()).toHaveLength(1);
      expect(completed).toHaveBeenCalledTimes(2);
      expect(result.current.stage.kind).toBe('receipt');
      expect(result.current.error).toBeNull();
    } finally {
      await db.remove();
    }
  });

  it('Back during the stamp: cancelTender() is refused with the saving error; a subsequent save failure leaves the tender and Retry', async () => {
    const { db, sessions, sessionId } = await withOpenSession();
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const read = sessions.storageInstance.findDocumentsById.bind(sessions.storageInstance);
    const slow = { storageInstance: { findDocumentsById: async (...args: Parameters<typeof read>) => { await gate; return read(...args); } } };
    try {
      const { result } = renderSale(pricing, saleOpts({
        onSaleCompleted: async () => { throw new Error('Storage full'); },
        session: { id: sessionId, sessions: slow as unknown as RegisterSessionCollection },
      }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      let completion!: Promise<void>;
      act(() => { completion = result.current.complete(); });
      act(() => result.current.cancelTender());
      expect(result.current.error).toBe(SALE_SAVING);
      expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
      release();
      await act(async () => { await completion; });
      expect(result.current.saving).toBe(true);
      expect(result.current.stage).toEqual({ kind: 'tender', method: 'external' });
      expect(result.current.error).toBe('The sale could not be saved: Storage full');
    } finally {
      await db.remove();
    }
  });

  it('a finalizeOrder refusal leaves the sale unlocked, with the refusal error', async () => {
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted: vi.fn() }));
    addSaleLines(result);
    act(() => result.current.startTender('cash'));
    act(() => result.current.setTender({ method: 'cash', amountMinor: 1000 })); // underpaid: finalize refuses
    await act(async () => { await result.current.complete(); });
    expect(result.current.error).toBe('finalize: underpaid');
    expect(result.current.saving).toBe(false);
    act(() => result.current.cancelTender());
    expect(result.current.stage.kind).toBe('cart');
  });

  // Three mutations the #149 review found no test catches (the Front desk, 2026-09-27).
  it("complete()'s entry clears a canContinue left from an earlier failed attempt, including a Retry after Continue was offered", async () => {
    let attempt = 0;
    const onSaleCompleted = vi.fn(async () => { throw new Error('flush failed'); });
    const isStored = async () => { attempt++; return attempt === 1; }; // only the first attempt is confirmed stored
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted, isStored }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); }); // fails
    await waitFor(() => expect(result.current.canContinue).toBe(true)); // confirmed stored
    act(() => { result.current.complete(); }); // Retry (a new attempt): must clear canContinue at once
    expect(result.current.canContinue).toBe(false);
    await act(async () => {}); // the retry settles; its own check answers false, so no Continue
    expect(result.current.canContinue).toBe(false);
  });

  it("checkStored's pending check: a stale confirmation for a completion that is no longer pending must not set canContinue", async () => {
    let releaseStale!: () => void;
    const staleAnswer = new Promise<boolean>((resolve) => { releaseStale = () => resolve(true); });
    let call = 0;
    const isStored = async () => { call++; return call === 1 ? staleAnswer : true; };
    const onSaleCompleted = vi.fn(() => new Promise<void>(() => {})); // the money is taken; the save just hangs
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted, isStored }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    act(() => { result.current.complete(); }); // builds; hangs in onSaleCompleted with pending and inFlight both set
    act(() => result.current.newSale()); // refused; asks isStored afresh (call 1, held open)
    act(() => result.current.newSale()); // refused again; asks isStored afresh (call 2, answers true at once)
    await waitFor(() => expect(result.current.canContinue).toBe(true));
    act(() => result.current.continueSale()); // clears the pending completion: a fresh, empty cart
    expect(result.current.stage.kind).toBe('cart');
    await act(async () => { releaseStale(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(result.current.canContinue).toBe(false); // that completion isn't pending any more
    expect(result.current.stage.kind).toBe('cart');
  });

  it("checkStored's attempt check: a stale confirmation from an earlier attempt must not set canContinue once a newer attempt has started", async () => {
    let releaseStale!: () => void;
    const staleAnswer = new Promise<boolean>((resolve) => { releaseStale = () => resolve(true); });
    let call = 0;
    const onSaleCompleted = vi.fn(async () => { throw new Error('flush failed'); });
    const isStored = async () => { call++; return call === 1 ? staleAnswer : false; };
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted, isStored }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    await act(async () => { await result.current.complete(); }); // attempt 1 fails; its own check is held open
    expect(result.current.canContinue).toBe(false);
    await act(async () => { await result.current.complete(); }); // Retry = attempt 2; fails again, its own check answers false
    expect(result.current.canContinue).toBe(false);
    await act(async () => { releaseStale(); await new Promise((resolve) => setTimeout(resolve, 0)); });
    expect(result.current.canContinue).toBe(false); // attempt 1's stale answer belongs to a dropped attempt
  });

  // #150 review: Continue is now the only way past a hung save (5a), so an old, hung save and a genuinely
  // new one can still both be in flight in the same hook at once — this exercises that overlap directly,
  // rather than through the abandon-mid-stamp path #149 closed. Three surviving mutants: `.finally`
  // clearing `inFlight` unconditionally would let a duplicate tap on the new sale double-build it;
  // `deliver()` without its `pending.current !== completion` return would let the old save's late,
  // successful resolution stomp the new sale's state; `newSale()` not clearing `inFlight` would make the
  // new sale's own Complete a no-op (caught immediately below, since it would even refuse addSaleLines).
  it('Continue past a hung old save; the new sale completes normally, is untouched when the old save resolves late, and a duplicate tap never double-builds it', async () => {
    const storedIds = new Set<string>();
    let releaseOld!: () => void;
    const oldGate = new Promise<void>((resolve) => { releaseOld = resolve; });
    let releaseNew!: () => void;
    const newGate = new Promise<void>((resolve) => { releaseNew = resolve; });
    let oldId: string | undefined;
    const onSaleCompleted = vi.fn(async (posOrder: PosOrder) => {
      storedIds.add(posOrder.id);
      if (!oldId) { oldId = posOrder.id; await oldGate; return; }
      await newGate;
    });
    const isStored = async (posOrder: PosOrder) => storedIds.has(posOrder.id);
    const { result } = renderSale(pricing, saleOpts({ onSaleCompleted, isStored }));
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    act(() => { result.current.complete(); }); // the old attempt: stores, then hangs on oldGate
    expect(oldId).toBeDefined();
    act(() => result.current.newSale()); // refused; asks isStored afresh
    await waitFor(() => expect(result.current.canContinue).toBe(true));
    act(() => result.current.continueSale()); // past the hung old save
    expect(result.current.stage.kind).toBe('cart');
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    let newPromise!: Promise<void>;
    act(() => { newPromise = result.current.complete(); }); // the new attempt: builds; stores, then hangs on newGate
    expect(onSaleCompleted).toHaveBeenCalledTimes(2); // a genuinely new order was built and handed over
    const newId = onSaleCompleted.mock.calls[1][0].id;
    expect(newId).not.toBe(oldId);
    releaseOld(); // the old save finally resolves, late, while the new one is still hung
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); // flush the old chain fully
    expect(result.current).toMatchObject({ stage: { kind: 'tender', method: 'external' }, saving: true, error: null }); // untouched
    let duplicate!: Promise<void>;
    act(() => { duplicate = result.current.complete(); }); // a duplicate tap must share the new sale's one save
    expect(duplicate).toBe(newPromise);
    expect(onSaleCompleted).toHaveBeenCalledTimes(2); // no third, spurious build
    releaseNew();
    await act(async () => { await Promise.all([newPromise, duplicate]); });
    expect(result.current).toMatchObject({ stage: { kind: 'receipt', posOrder: { id: newId } }, saving: false, error: null });
    expect(storedIds.size).toBe(2);
  });
});

// #150 review: medusapos's Sign out is live while saving, and unmounts the sale screen (closing the
// outbox). A throw from onSaleCompleted on an unmounted screen must still be logged, not silently lost.
describe('unmount logs a save that would otherwise be lost silently', () => {
  it('unmount during an in-flight save that then throws logs the error with the order id', async () => {
    const logged: LogEntry[] = [];
    saleLogger.addSink({ id: 'unmount-inflight-throw', levels: ['error'], write: (entry) => logged.push(entry) });
    let releaseThrow!: () => void;
    const throwGate = new Promise<void>((resolve) => { releaseThrow = resolve; });
    const onSaleCompleted = vi.fn(async (_posOrder: PosOrder) => { await throwGate; throw new Error('flush failed'); });
    try {
      const { result, unmount } = renderSale(pricing, saleOpts({ onSaleCompleted }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      let promise!: Promise<void>;
      act(() => { promise = result.current.complete(); }); // builds; onSaleCompleted is in flight
      const orderId = onSaleCompleted.mock.calls[0][0].id;
      unmount(); // the screen goes away (medusapos Sign out) while the save is still in flight
      releaseThrow();
      await promise;
      expect(logged).toEqual(expect.arrayContaining([expect.objectContaining({
        level: 'error', data: expect.objectContaining({ orderId }) })]));
    } finally {
      saleLogger.removeSink('unmount-inflight-throw');
    }
  });

  it('unmount with a pending, unconfirmed completion logs at error with the order id and stage', async () => {
    const logged: LogEntry[] = [];
    saleLogger.addSink({ id: 'unmount-pending', levels: ['error'], write: (entry) => logged.push(entry) });
    const onSaleCompleted = vi.fn(async (_posOrder: PosOrder) => { throw new Error('flush failed'); });
    try {
      const { result, unmount } = renderSale(pricing, saleOpts({ onSaleCompleted }));
      addSaleLines(result);
      act(() => result.current.startTender('external'));
      await act(async () => { await result.current.complete(); }); // fails; pending stays set for Retry
      const orderId = onSaleCompleted.mock.calls[0][0].id;
      logged.length = 0; // drop the throw's own log (deliver()'s); this test is about the unmount log itself
      unmount();
      expect(logged).toEqual([expect.objectContaining({ level: 'error',
        message: 'useSale unmounted with a save pending or in flight', data: { orderId, stage: 'tender' } })]);
    } finally {
      saleLogger.removeSink('unmount-pending');
    }
  });

  it('unmount with nothing pending logs nothing', () => {
    const logged: LogEntry[] = [];
    saleLogger.addSink({ id: 'unmount-idle', levels: ['error'], write: (entry) => logged.push(entry) });
    try {
      const { unmount } = renderSale(pricing);
      unmount();
      expect(logged).toEqual([]);
    } finally {
      saleLogger.removeSink('unmount-idle');
    }
  });
});

describe('app configuration outside the order.create bounds', () => {
  function renderWithOpts(initialProps: Parameters<typeof useSale>[1]) {
    function Wrapper({ children }: { children: ReactNode }) {
      return <TaxProvider {...taxProviderProps(pricing)}>{children}</TaxProvider>;
    }
    return renderHook((opts: Parameters<typeof useSale>[1]) => useSale(pricing, opts), { wrapper: Wrapper, initialProps });
  }

  it('a 300-character cashierRef shows the error before any sale, complete() refuses, and fixing it clears the error', async () => {
    const onSaleCompleted = vi.fn();
    const { result, rerender } = renderWithOpts(saleOpts({ cashierRef: 'c'.repeat(300), onSaleCompleted }));
    expect(result.current.error).toBe('cashierRef is too long (max 255 characters)');
    addSaleLines(result);
    act(() => result.current.startTender('external'));
    expect(result.current.error).toBe('cashierRef is too long (max 255 characters)');
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).not.toHaveBeenCalled();
    expect(result.current).toMatchObject({ stage: { kind: 'tender' }, saving: false, error: 'cashierRef is too long (max 255 characters)' });
    rerender(saleOpts({ onSaleCompleted }));
    expect(result.current.error).toBeNull();
    await act(async () => { await result.current.complete(); });
    expect(onSaleCompleted).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ cashierRef }));
    expect(result.current.stage.kind).toBe('receipt');
  });

  it('a registerId with a NUL is refused the same way', () => {
    const { result, rerender } = renderWithOpts(saleOpts({ registerId: 'register\u00001' }));
    expect(result.current.error).toBe('registerId contains a NUL character');
    rerender(saleOpts());
    expect(result.current.error).toBeNull();
  });
});
