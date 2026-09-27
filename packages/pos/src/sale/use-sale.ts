import { useEffect, useRef, useState } from 'react';
import type { ProductTraits, ServerCapabilities, StoreSettings } from '@tallyui/core';
import { createOrderBuilder, type Discount, type Order } from '../order';
import { finalizeOrder, type PosOrder } from '../pos-order';
import { useTax } from '../tax';
import { recordRegisterFact, stampSession, type RegisterSessionCollection } from '../register';
import type { CatalogueEntry } from './catalogue';
import { addEntryToCart, CartError } from './cart';

export type SaleStage = { kind: 'cart' } | { kind: 'tender'; method: 'cash' | 'external' }
  | { kind: 'receipt'; order: Order; posOrder: PosOrder };
/** TallyUI finalizeOrder's refusal below order.create v2 (c19a203), shown when the discount is applied; finalize stays the backstop. */
export const DISCOUNTS_UNSUPPORTED = 'finalize: discounts are not supported by the server yet (order.create v2)';
/** Every sale change refuses with this while a completion is pending (see `complete()`). */
export const SALE_SAVING = 'This sale is being saved. Retry to finish it.';

/** Call under a `TaxProvider`: its tax context and the settings' currency price every sale. */
export function useSale(settings: Pick<StoreSettings, 'currency'>, opts: {
  registerId: string; cashierRef: string; capabilities?: ServerCapabilities;
  /**
   * When set, `complete()` stamps the finalized order with this session before `onSaleCompleted`.
   * `complete()` runs after the money is taken, so a refused stamp (the session closed or went
   * missing) never stops the sale: it goes on to `onSaleCompleted` and the receipt with
   * `lateSessionId` instead of `sessionId`, and a `late-sale` register fact is recorded (ADR-032).
   */
  session?: { id: string; sessions: RegisterSessionCollection };
  onSaleCompleted?: (posOrder: PosOrder) => Promise<void> | void;
}) {
  const taxContext = useTax();
  const madeWith = useRef({ taxContext, currency: settings.currency });
  const [builder, setBuilder] = useState(() => createOrderBuilder({ currency: settings.currency, taxContext }));
  const [order, setOrder] = useState(() => builder.getSnapshot());
  const [stage, setStage] = useState<SaleStage>({ kind: 'cart' });
  const [error, setError] = useState<string | null>(null);
  // The pending completion: the order complete() built for this tender attempt. The ref is read
  // synchronously by complete() and the lock; `saving` mirrors it for rendering.
  const pending = useRef<{ order: Order; posOrder: PosOrder } | null>(null);
  const [saving, setSaving] = useState(false);
  // The complete() call in flight, and the stage as of the last render or receipt, both read synchronously.
  const inFlight = useRef<Promise<void> | null>(null);
  const stageNow = useRef(stage);
  stageNow.current = stage;
  /** True, with SALE_SAVING shown, while a completion is pending: the sale can't change. */
  function locked() {
    if (pending.current) setError(SALE_SAVING);
    return !!pending.current;
  }
  useEffect(() => {
    const subscription = builder.order$.subscribe(setOrder);
    return () => subscription.unsubscribe();
  }, [builder]);
  // New tax settings or currency wait until the sale is idle (an empty cart), then start a new sale on them:
  // a sale in progress (lines, tender or receipt) finishes on the settings it started with (a money rule).
  const idle = stage.kind === 'cart' && !order.lineItems.length;
  useEffect(() => {
    if (idle && (madeWith.current.taxContext !== taxContext || madeWith.current.currency !== settings.currency)) result.newSale();
  });

  function setTender(tender: { method: 'cash' | 'external'; amountMinor: number; reference?: string } | null) {
    if (locked()) return;
    const previous = builder.getSnapshot().payments[0];
    if (previous) builder.removePayment(previous.id);
    if (tender) builder.addPayment(tender);
    setError(null);
  }

  /** Hands a pending completion to `onSaleCompleted`; the outcome applies only if it wasn't abandoned meanwhile. */
  async function deliver(completion: { order: Order; posOrder: PosOrder }) {
    try {
      await opts.onSaleCompleted?.(completion.posOrder);
    } catch (error) {
      if (pending.current === completion) setError(`The sale could not be saved: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    if (pending.current !== completion) return;
    pending.current = null;
    setSaving(false);
    setError(null);
    stageNow.current = { kind: 'receipt', order: completion.order, posOrder: completion.posOrder };
    setStage(stageNow.current);
  }

  /**
   * Runs one complete() attempt, unless one is in flight or the receipt shows. The in-flight promise is
   * set before the attempt's first await, so a second call (a double tap) shares it and never builds a
   * second order.
   */
  function once(attempt: () => Promise<void>): Promise<void> {
    if (!inFlight.current && stageNow.current.kind !== 'receipt') {
      inFlight.current = attempt().finally(() => { inFlight.current = null; });
    }
    return inFlight.current ?? Promise.resolve();
  }

  const result = {
    order, stage, error, idle,
    /** A completion is pending (see `complete()`): the sale is locked, and the UI offers Retry. */
    saving,
    add(entry: CatalogueEntry<any>, traits: ProductTraits<any>) {
      if (locked()) return;
      try {
        addEntryToCart(builder, entry, traits, madeWith.current.currency);
        setError(null);
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        setError(error.message);
      }
    },
    setQuantity(lineId: string, quantity: number) { if (!locked()) builder.updateQuantity(lineId, quantity); },
    remove(lineId: string) { if (!locked()) builder.removeItem(lineId); },
    /** A line's discount, or the order's without a line; returns the refusal to show, or null once applied. */
    applyDiscount(lineId: string | null, discount: Discount): string | null {
      if (locked()) return SALE_SAVING;
      if ((opts.capabilities?.orderCreate ?? 1) < 2) return DISCOUNTS_UNSUPPORTED;
      const applied = (snapshot: Order) => lineId === null ? snapshot.discounts
        : snapshot.lineItems.find((line) => line.id === lineId)?.discounts ?? [];
      const before = new Set(applied(builder.getSnapshot()).map((entry) => entry.id));
      if (lineId === null) builder.applyOrderDiscount(discount);
      else builder.applyLineDiscount(lineId, discount);
      // TallyUI caps a fixed amount at what is left; refuse it instead of showing more off than comes off.
      const added = applied(builder.getSnapshot()).find((entry) => !before.has(entry.id));
      if (added?.type === 'fixed' && added.amountMinor < added.value) {
        builder.removeDiscount(added.id);
        return `The discount is more than the ${lineId === null ? 'order' : 'line'}`;
      }
      return null;
    },
    removeDiscount(id: string) { if (!locked()) builder.removeDiscount(id); },
    startTender(method: 'cash' | 'external') {
      if (locked()) return;
      const current = builder.getSnapshot();
      if (!current.lineItems.length) return;
      setTender(method === 'external' ? { method, amountMinor: current.totalMinor } : null);
      setStage({ kind: 'tender', method });
    },
    setTender,
    cancelTender() {
      if (locked()) return;
      setTender(null);
      setStage({ kind: 'cart' });
    },
    /**
     * Finalizes the tender, stamps the session (see `session`), hands the order to `onSaleCompleted`,
     * then shows the receipt. Idempotent for one tender attempt (DECISIONS, ADR-052): once the order
     * is built, that order is the sale. It is kept as the pending completion, `saving` turns true and
     * the sale is locked (every change sets SALE_SAVING), because `onSaleCompleted` may already have
     * stored it before failing. If `onSaleCompleted` throws, the error is set and the tender stays;
     * calling `complete()` again reuses the pending completion exactly (the same `id`, `commandId`
     * and `createdAt`, no new stamp and no second late-sale fact) and hands it to `onSaleCompleted`
     * again, so that must accept an order it already stored (as `useOrderOutbox.record` does). The
     * pending completion is cleared once `onSaleCompleted` resolves, or by `newSale()`. A call while
     * another is in flight returns that call's promise, and a call on the receipt does nothing.
     */
    complete: () => once(async () => {
      if (pending.current) return deliver(pending.current);
      const current = builder.getSnapshot();
      let posOrder: PosOrder;
      try {
        posOrder = finalizeOrder(current, { registerId: opts.registerId, cashierRef: opts.cashierRef, capabilities: opts.capabilities });
      } catch (error) {
        setError((error as Error).message);
        return;
      }
      if (opts.session) {
        try {
          posOrder = await stampSession(posOrder, opts.session.id, opts.session.sessions);
        } catch {
          // The money is taken: keep the sale, outside every closure (ADR-032, late sale).
          const { sessionId: _unstamped, ...unstamped } = posOrder;
          posOrder = { ...unstamped, lateSessionId: opts.session.id };
          try {
            // useSale knows the cashier only by ref, so the actor carries no display name.
            recordRegisterFact({ kind: 'late-sale', orderId: posOrder.id, sessionId: opts.session.id, registerId: opts.registerId,
              actor: { id: opts.cashierRef, name: '' } });
          } catch {
            // The logger calls the app's sinks unguarded; a failing sink must never lose the sale.
          }
        }
      }
      pending.current = { order: current, posOrder };
      setSaving(true);
      return deliver(pending.current);
    }),
    /**
     * Starts a new, empty sale. It also abandons a pending completion, which unlocks the till. Abandoning
     * clears the screen, never the record (the Front desk, 2026-09-25): an order a failed save had already
     * stored stays in the outbox, because the money was taken. `newSale()` never deletes, updates or
     * requeues anything in `pos_orders`.
     */
    newSale() {
      pending.current = null;
      setSaving(false);
      madeWith.current = { taxContext, currency: settings.currency };
      const next = createOrderBuilder({ currency: settings.currency, taxContext });
      setBuilder(next);
      setOrder(next.getSnapshot());
      setStage({ kind: 'cart' });
      setError(null);
    },
  };
  return result;
}
