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
    const previous = builder.getSnapshot().payments[0];
    if (previous) builder.removePayment(previous.id);
    if (tender) builder.addPayment(tender);
    setError(null);
  }

  const result = {
    order, stage, error, idle,
    add(entry: CatalogueEntry<any>, traits: ProductTraits<any>) {
      try {
        addEntryToCart(builder, entry, traits, madeWith.current.currency);
        setError(null);
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        setError(error.message);
      }
    },
    setQuantity(lineId: string, quantity: number) { builder.updateQuantity(lineId, quantity); },
    remove(lineId: string) { builder.removeItem(lineId); },
    /** A line's discount, or the order's without a line; returns the refusal to show, or null once applied. */
    applyDiscount(lineId: string | null, discount: Discount): string | null {
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
    removeDiscount(id: string) { builder.removeDiscount(id); },
    startTender(method: 'cash' | 'external') {
      const current = builder.getSnapshot();
      if (!current.lineItems.length) return;
      setTender(method === 'external' ? { method, amountMinor: current.totalMinor } : null);
      setStage({ kind: 'tender', method });
    },
    setTender,
    cancelTender() { setTender(null); setStage({ kind: 'cart' }); },
    async complete() {
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
            recordRegisterFact({ kind: 'late-sale', orderId: posOrder.id, sessionId: opts.session.id, registerId: opts.registerId });
          } catch {
            // The logger calls the app's sinks unguarded; a failing sink must never lose the sale.
          }
        }
      }
      try {
        await opts.onSaleCompleted?.(posOrder);
      } catch (error) {
        setError(`The sale could not be saved: ${error instanceof Error ? error.message : String(error)}`);
        return;
      }
      setError(null);
      setStage({ kind: 'receipt', order: current, posOrder });
    },
    newSale() {
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
