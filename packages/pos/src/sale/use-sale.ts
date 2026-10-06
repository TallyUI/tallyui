import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RxCollection } from 'rxdb';
import type { ProductTraits, ServerCapabilities, StoreSettings } from '@tallyui/core';
import { createOrderBuilder, writeOrderDraft, restoreOrderDraft, type ChargeInput, type OrderBuilder, type CustomerSummary, type Discount, type Order, type SentOrder } from '../order';
import { finalizeOrder, uuidv7, type PosOrder } from '../pos-order';
import { MESSAGE_NAME_MAX, referenceError, referenceReason, withSentForm } from '../pos-order/finalize';
import { CUSTOMER_REFUSALS, customerRefusal, cutText, PAYLOAD_STRING_MAX } from '../pos-order/command';
import { useTax } from '../tax';
import { recordRegisterFact, stampSession, type RegisterSessionCollection } from '../register';
import { createLogger } from '../logging';
import type { CatalogueEntry } from './catalogue';
import { addEntryToCart, CartError } from './cart';

/** Logs a throw from onSaleCompleted for a confirmed pending completion newSale() has abandoned (Continue): nothing else would ever surface it. */
export const saleLogger = createLogger('sale');

export type SaleStage = { kind: 'cart' } | { kind: 'tender'; method: 'cash' | 'external' }
  | { kind: 'receipt'; order: SentOrder; posOrder: PosOrder };
/** TallyUI finalizeOrder's refusal below order.create v2 (c19a203), shown when the discount is applied; finalize stays the backstop. */
export const DISCOUNTS_UNSUPPORTED = 'finalize: discounts are not supported by the server yet (order.create v2)';
/** Every sale change refuses with this while a completion is pending (see `complete()`). */
export const SALE_SAVING = 'This sale is being saved. Retry to finish it.';
/**
 * How often a hung save re-asks `isStored`, while the order is built and its save is still in flight
 * and unconfirmed: an app whose tender has no New sale control while saving (the Front desk,
 * 2026-09-28) never re-asks otherwise, so the cashier could only wait for a hung post-insert step.
 * `useSale`'s `hungSaveCheckMs` overrides this; that option is tests only.
 */
export const HUNG_SAVE_CHECK_MS = 5000;

/** Call under a `TaxProvider`: its tax context and the settings' currency price every sale. */
export function useSale(settings: Pick<StoreSettings, 'currency'>, opts: {
  registerId: string; cashierRef: string; capabilities?: ServerCapabilities;
  /** Where `park()` keeps parked carts; create it with `orderDraftSchema` */
  drafts?: RxCollection;
  /**
   * The current unit price (integer minor units) of a variant in the till's catalogue, or undefined when unknown.
   * When set, `resume()` re-prices the restored lines from it unless asked to keep the parked prices.
   */
  currentPrice?: (variantId: string) => number | undefined;
  /**
   * When set, `complete()` stamps the finalized order with this session before `onSaleCompleted`.
   * `complete()` runs after the money is taken, so a refused stamp (the session closed or went
   * missing) never stops the sale: it goes on to `onSaleCompleted` and the receipt with
   * `lateSessionId` instead of `sessionId`, and a `late-sale` register fact is recorded (ADR-032).
   * The session stamped is the one in force when the tender started (`startTender`), pinned for that
   * tender: this option going undefined mid-tender (the session closed) doesn't skip the stamp. A
   * tender that pinned none, with a session here at `complete()`, stamps it and logs a warning.
   */
  session?: { id: string; sessions: RegisterSessionCollection };
  onSaleCompleted?: (posOrder: PosOrder) => Promise<void> | void;
  /**
   * Asked after `onSaleCompleted` throws, or on a `newSale()` refused mid-save: whether that order is confirmed stored
   * (medusapos: `useOrderOutbox`'s `isStored`). Only a true answer sets `canContinue`; without it, a failed save offers Retry only.
   */
  isStored?: (posOrder: PosOrder) => Promise<boolean>;
  /** Tests only: overrides HUNG_SAVE_CHECK_MS, so a test can shrink the hung-save poll's interval. */
  hungSaveCheckMs?: number;
}) {
  const taxContext = useTax();
  const madeWith = useRef({ taxContext, currency: settings.currency });
  const [rendered, setBuilder] = useState(() => createOrderBuilder({ currency: settings.currency, taxContext }));
  // The live builder, which every mutator reads (#301): newSale() sets it before setBuilder(next) renders, so a
  // call from an older render never reaches a discarded builder. The state only moves the `order` subscription.
  const builderNow = useRef(rendered);
  const [order, setOrder] = useState(() => rendered.getSnapshot());
  const [stage, setStage] = useState<SaleStage>({ kind: 'cart' });
  const [saleError, setError] = useState<string | null>(null);
  // App configuration is checked on every render (so on mount and on each change), by finalize's own rule, which
  // stays the backstop: while it's bad, `error` shows it and complete() refuses, before the first sale's money.
  const configError = referenceError('cashierRef', opts.cashierRef) ?? referenceError('registerId', opts.registerId);
  // The pending completion: the order complete() built for this tender attempt. The ref is read
  // synchronously by complete() and the lock; `saving` mirrors it (true from complete()'s entry) for rendering.
  const pending = useRef<{ order: Order; posOrder: PosOrder } | null>(null);
  const [saving, setSaving] = useState(false);
  // While a completion is pending (a failed save), its own error comes first: Retry still delivers it.
  const error = saving && saleError ? saleError : configError ?? saleError;
  // The session pinned by startTender for this tender (`undefined` inside: none); null until a tender starts.
  const tenderSession = useRef<{ session: typeof opts.session } | null>(null);
  // The ids, at the tender, of payments whose terminal references were dropped.
  const droppedReferences = useRef<Set<string>>(new Set());
  // The pending completion isStored confirmed stored after its save failed; `canContinue` mirrors it for
  // rendering. `attempts` counts complete() attempts, so a confirmation that lands after a new one is dropped.
  const confirmed = useRef<{ order: Order; posOrder: PosOrder } | null>(null);
  const [canContinue, setCanContinue] = useState(false);
  const attempts = useRef(0);
  // The hung-save poll (at most one at a time): deliver() arms it while a completion's save is in
  // flight, and it, confirm() and unmount all clear it.
  const hungSaveTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards overlapping isStored checks (#161 review), per completion: a tick skips only while its own
  // completion's check is already in flight, so an isStored slower than the interval never has more
  // than one check running at once for that completion. Scoped to the completion (not a bare boolean)
  // so a completion whose isStored never settles can never block a later sale's own poll (#161 follow-up).
  const checking = useRef<{ order: Order; posOrder: PosOrder } | null>(null);
  function clearHungSaveTimer() {
    if (hungSaveTimer.current !== null) { clearInterval(hungSaveTimer.current); hungSaveTimer.current = null; }
  }
  function confirm(completion: { order: Order; posOrder: PosOrder } | null) {
    confirmed.current = completion;
    setCanContinue(!!completion);
    clearHungSaveTimer();
  }
  // The complete() call in flight, and the stage as of the last render or receipt, both read synchronously.
  const inFlight = useRef<Promise<void> | null>(null);
  const stageNow = useRef(stage);
  stageNow.current = stage;
  /** True, with SALE_SAVING shown, from complete()'s entry (inFlight) through a pending retry: the sale can't change. */
  function locked() {
    const active = !!(inFlight.current || pending.current);
    if (active) setError(SALE_SAVING);
    return active;
  }
  // newSale()'s body (see its doc comment for the guards): `newSale()` is `resetSale(null)`.
  function resetSale(customer: CustomerSummary | null, restored?: OrderBuilder) {
    if (inFlight.current && !pending.current) return setError(SALE_SAVING);
    if (pending.current && confirmed.current !== pending.current) {
      if (inFlight.current) checkStored(pending.current);
      return setError(SALE_SAVING);
    }
    confirm(null); pending.current = null;
    inFlight.current = null;
    tenderSession.current = null;
    droppedReferences.current.clear();
    setSaving(false);
    madeWith.current = { taxContext, currency: settings.currency };
    const next = restored ?? createOrderBuilder({ currency: settings.currency, taxContext });
    if (customer !== null) next.setCustomer(customer);
    builderNow.current = next;
    setBuilder(next);
    setOrder(next.getSnapshot());
    setStage({ kind: 'cart' });
    setError(null);
  }
  useEffect(() => {
    const subscription = rendered.order$.subscribe(setOrder);
    return () => subscription.unsubscribe();
  }, [rendered]);
  // New tax settings or currency wait until the sale is idle (an empty cart), then start a new sale keeping its customer:
  // a sale in progress (lines, tender or receipt) finishes on the settings it started with (a money rule).
  const idle = stage.kind === 'cart' && !order.lineItems.length && !order.fees?.length && !order.shipping?.length;
  // A layout effect, on live idleness (#301): it runs inside the settings' commit, before any tap can be handled, and
  // the rendered `idle` would miss a line added since this render (it would then be dropped with the old builder).
  useLayoutEffect(() => {
    const live = builderNow.current.getSnapshot();
    const liveIdle = stageNow.current.kind === 'cart' && !live.lineItems.length && !live.fees?.length && !live.shipping?.length && !inFlight.current && !pending.current;
    if (liveIdle && (madeWith.current.taxContext !== taxContext || madeWith.current.currency !== settings.currency)) resetSale(live.customer ?? null);
  });
  // A screen that unmounts (medusapos: Sign out) mid-save must still leave a trace of the loss.
  useEffect(() => () => {
    clearHungSaveTimer();
    if (pending.current || inFlight.current) {
      saleLogger.error('useSale unmounted with a save pending or in flight',
        { orderId: pending.current?.posOrder.id, stage: stageNow.current.kind });
    }
  }, []);

  function addOne(tender: { method: 'cash' | 'external'; amountMinor: number; reference?: string }): string {
    // A terminal reference finalize would refuse is dropped as it's entered, never the payment (the money is
    // taken): the tender applies without it, with a message that doesn't block complete() and a
    // localWarnings entry on the stored order naming the payment whose reference was dropped.
    const reason = referenceReason(tender.reference);
    const dropped = reason && (reason === 'nul' ? 'it contains a NUL character' : `it is over ${PAYLOAD_STRING_MAX} characters`);
    const kept = dropped ? { method: tender.method, amountMinor: tender.amountMinor } : tender;
    const builder = builderNow.current;
    const paymentId = builder.addPayment(kept);
    if (dropped) {
      droppedReferences.current.add(paymentId);
      setError(`The terminal's payment reference couldn't be kept (${dropped}); the payment is recorded without it.`);
    }
    try {
      if (dropped) saleLogger.warn("the terminal's payment reference was dropped", { reason: dropped, method: tender.method });
    } catch { /* a failing sink must never lose the tender */ }
    return paymentId;
  }

  function setTender(tender: { method: 'cash' | 'external'; amountMinor: number; reference?: string } | null) {
    if (locked()) return;
    const builder = builderNow.current;
    for (const payment of builder.getSnapshot().payments) builder.removePayment(payment.id);
    droppedReferences.current.clear();
    setError(null);
    if (tender) addOne(tender);
  }

  /** Asks `isStored`; Continue is offered only once it confirms, for this attempt, with the completion still pending. */
  function checkStored(completion: { order: Order; posOrder: PosOrder }) {
    const attempt = attempts.current;
    const isStored = opts.isStored; // a throw, even a synchronous one, counts as not stored
    if (!isStored) return;
    checking.current = completion;
    void Promise.resolve(completion.posOrder).then(isStored).catch(() => false).then((stored) => {
      if (stored === true && attempts.current === attempt && pending.current === completion) confirm(completion);
    }).finally(() => { if (checking.current === completion) checking.current = null; });
  }

  /** Hands a pending completion to `onSaleCompleted`; the outcome applies only if it wasn't abandoned meanwhile. */
  async function deliver(completion: { order: Order; posOrder: PosOrder }) {
    clearHungSaveTimer();
    // Re-asks isStored every HUNG_SAVE_CHECK_MS while this save is in flight and unconfirmed, so a hung
    // post-insert step (no throw, no resolve) still offers Continue with no user action. Its own
    // `timer` handle is cleared below only while it's still the current one, so a late settle from an
    // attempt a newer sale has already superseded can never cut off that newer sale's poll (#161 review).
    const timer = opts.isStored ? setInterval(() => {
      if (checking.current === completion) return;
      if (pending.current === completion && inFlight.current && confirmed.current !== completion) checkStored(completion);
      else if (hungSaveTimer.current === timer) clearHungSaveTimer();
    }, opts.hungSaveCheckMs ?? HUNG_SAVE_CHECK_MS) : null;
    hungSaveTimer.current = timer;
    try {
      await opts.onSaleCompleted?.(completion.posOrder);
    } catch (error) {
      if (hungSaveTimer.current === timer) clearHungSaveTimer();
      const message = error instanceof Error ? error.message : String(error);
      // Logged whatever the mount state and whether or not it's still pending (#150 review): a screen
      // unmounted mid-save (medusapos Sign out) must never lose a throw silently. Skipped only once the
      // order is confirmed stored, since a later throw on a known-safe order needs no fresh alarm.
      if (confirmed.current !== completion) {
        saleLogger.error('onSaleCompleted failed', { orderId: completion.posOrder.id, error: message });
      }
      if (pending.current === completion) {
        setError(`The sale could not be saved: ${message}`);
        checkStored(completion);
      }
      return;
    }
    if (hungSaveTimer.current === timer) clearHungSaveTimer();
    if (pending.current !== completion) return;
    pending.current = null;
    droppedReferences.current.clear();
    confirm(null);
    setSaving(false);
    setError(null);
    stageNow.current = { kind: 'receipt', order: withSentForm(completion.order, completion.posOrder), posOrder: completion.posOrder };
    setStage(stageNow.current);
  }

  /**
   * Runs one complete() attempt, unless one is in flight or the receipt shows. The in-flight promise is
   * set before the attempt's first await, so a second call (a double tap) shares it and never builds a
   * second order. `.finally` clears `inFlight` only if it still holds this attempt's own promise.
   */
  function once(attempt: () => Promise<void>): Promise<void> {
    if (!inFlight.current && stageNow.current.kind !== 'receipt') {
      const mine: Promise<void> = attempt().finally(() => { if (inFlight.current === mine) inFlight.current = null; });
      inFlight.current = mine;
    }
    return inFlight.current ?? Promise.resolve();
  }

  const result = {
    order, stage, error, idle,
    /** A completion is pending (see `complete()`): the sale is locked, and the UI offers Retry. */
    saving,
    /** The failed save's order is confirmed stored (see `isStored`): the UI also offers Continue (`continueSale()`). */
    canContinue,
    add(entry: CatalogueEntry<any>, traits: ProductTraits<any>) {
      if (locked()) return;
      const builder = builderNow.current;
      try {
        const known = new Set(builder.getSnapshot().lineItems.map((line) => line.id));
        const lineId = addEntryToCart(builder, entry, traits, madeWith.current.currency);
        // A new line whose id or v3 tax code finalize would refuse is taken off at once, in finalize's
        // message shape; finalize stays the backstop.
        const line = builder.getSnapshot().lineItems.find((item) => item.id === lineId && !known.has(item.id));
        const name = line && `"${cutText(line.name, MESSAGE_NAME_MAX)}"`;
        const taxLines = line && (opts.capabilities?.orderCreate ?? 1) >= 3 ? line.taxLines : [];
        const refused = line && [line.variantId !== undefined ? referenceError(`${name}: the variant id`, line.variantId)
          : referenceError(`${name}: the product id`, line.productId),
        ...taxLines.map((tax) => referenceError(`${name}: the tax code`, tax.code))].find((message) => message !== null);
        if (refused) { builder.removeItem(lineId); return setError(refused); }
        setError(null);
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        setError(error.message);
      }
    },
    setQuantity(lineId: string, quantity: number) { if (!locked()) builderNow.current.updateQuantity(lineId, quantity); },
    /** ADR-075: adds a fee; returns its id or the builder's refusal. */
    addFee(input: ChargeInput): { id: string } | string {
      if (locked()) return SALE_SAVING;
      try { return { id: builderNow.current.addFee(input) }; }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** ADR-075: updates a fee; returns a refusal or null. */
    updateFee(id: string, patch: Partial<ChargeInput>): string | null {
      if (locked()) return SALE_SAVING;
      try { builderNow.current.updateFee(id, patch); return null; }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** ADR-075: removes a fee; returns a refusal or null. */
    removeFee(id: string): string | null {
      if (locked()) return SALE_SAVING;
      try { builderNow.current.removeFee(id); return null; }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** ADR-075: adds shipping; returns its id or the builder's refusal. */
    addShipping(input: ChargeInput & { methodId?: string }): { id: string } | string {
      if (locked()) return SALE_SAVING;
      try { return { id: builderNow.current.addShipping(input) }; }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** ADR-075: updates shipping; returns a refusal or null. */
    updateShipping(id: string, patch: Partial<ChargeInput & { methodId?: string }>): string | null {
      if (locked()) return SALE_SAVING;
      try { builderNow.current.updateShipping(id, patch); return null; }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** ADR-075: removes shipping; returns a refusal or null. */
    removeShipping(id: string): string | null {
      if (locked()) return SALE_SAVING;
      try { builderNow.current.removeShipping(id); return null; }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** ADR-075: adds a distinct custom product line; returns its id or the builder's refusal. */
    addCustomLine(input: { name: string; priceMinor: number; quantity?: number; taxClass?: string; taxStatus?: 'taxable' | 'none'; sku?: string }): { id: string } | string {
      if (locked()) return SALE_SAVING;
      try {
        return { id: builderNow.current.addLine({ ...input, custom: true, productId: `custom:${uuidv7()}`,
          unitPrice: { amount: input.priceMinor, currency: madeWith.current.currency.toUpperCase() } }) };
      } catch (error) { if (error instanceof Error) return error.message; throw error; }
    },
    /** Sets a line's unit price in minor units of its own tax mode, recomputing discounts and tax; returns a refusal or null. */
    setUnitPrice(lineId: string, amountMinor: number): string | null {
      if (locked()) return SALE_SAVING;
      try {
        builderNow.current.setUnitPrice(lineId, amountMinor);
        return null;
      } catch (error) {
        if (error instanceof RangeError || (error instanceof Error && error.message === `Unknown line ${lineId}`)) return error.message;
        throw error;
      }
    },
    remove(lineId: string) { if (!locked()) builderNow.current.removeItem(lineId); },
    /** A line's discount, or the order's without a line; returns the refusal to show, or null once applied. */
    applyDiscount(lineId: string | null, discount: Discount): string | null {
      if (locked()) return SALE_SAVING;
      if ((opts.capabilities?.orderCreate ?? 1) < 2) return DISCOUNTS_UNSUPPORTED;
      const builder = builderNow.current;
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
    removeDiscount(id: string) { if (!locked()) builderNow.current.removeDiscount(id); },
    /** the picked customer reaches the server as order.create v3's customer.customerId */
    setCustomer(customer: CustomerSummary | null) {
      if (locked()) return;
      // A searched customer's email or id the server would refuse never reaches the sale; the customer stays as it was.
      const refused = customer && customerRefusal(customer);
      if (refused) return setError(refused);
      builderNow.current.setCustomer(customer);
      setError((current) => current !== null && CUSTOMER_REFUSALS.includes(current) ? null : current); // any other error stays
    },
    /**
     * Pins `options.session` for this tender when given, else the rendered `session` option. Pass the
     * session `useRegisterSession`'s `requireSaleSession()` returned: the rendered one can lag a session
     * opened just before (#170 race). A repeat call mid-tender keeps the first pin.
     */
    startTender(method: 'cash' | 'external', options?: { session?: { id: string; sessions: RegisterSessionCollection } }) {
      if (locked()) return;
      const current = builderNow.current.getSnapshot();
      if (!current.lineItems.length) return;
      tenderSession.current ??= { session: options?.session ?? opts.session }; // a repeat call mid-tender keeps the pin
      setTender(method === 'external' ? { method, amountMinor: current.totalMinor } : null);
      setStage({ kind: 'tender', method });
    },
    setTender,
    /** ADR-072: external is capped at the balance due; change comes only from cash. */
    addTender(tender: { method: 'cash' | 'external'; amountMinor: number; reference?: string }): string | null {
      if (locked() || !Number.isInteger(tender.amountMinor) || tender.amountMinor <= 0) return null;
      if (tender.method === 'external') {
        const due = builderNow.current.getSnapshot().balanceDueMinor;
        if (due <= 0) return null;
        return addOne({ ...tender, amountMinor: Math.min(tender.amountMinor, due) });
      }
      return addOne(tender);
    },
    /** ADR-072: remove one tender and its dropped-reference warning. An id not among the payments changes nothing. */
    removeTender(paymentId: string): void {
      if (locked()) return;
      if (!builderNow.current.getSnapshot().payments.some((payment) => payment.id === paymentId)) return;
      builderNow.current.removePayment(paymentId);
      droppedReferences.current.delete(paymentId);
    },
    cancelTender() {
      if (locked()) return;
      setTender(null);
      tenderSession.current = null;
      setStage({ kind: 'cart' });
    },
    /**
     * Finalizes the tender, stamps the session (see `session`), hands the order to `onSaleCompleted`,
     * then shows the receipt. `saving` turns true and the sale locks (every change sets SALE_SAVING)
     * from this call's entry, not only once the order is built; a refused finalize unlocks it again,
     * with the refusal's error. Idempotent for one tender attempt (DECISIONS, ADR-052): once the order
     * is built, that order is the sale, kept as the pending completion, because `onSaleCompleted` may
     * already have stored it before failing. If `onSaleCompleted` throws, the error is set and the tender stays;
     * calling `complete()` again reuses the pending completion exactly (the same `id`, `commandId`
     * and `createdAt`, no new stamp and no second late-sale fact) and hands it to `onSaleCompleted`
     * again, so that must accept an order it already stored (as `useOrderOutbox.record` does). The
     * pending completion is cleared once `onSaleCompleted` resolves, or by `newSale()`. A call while
     * another is in flight returns that call's promise, and a call on the receipt does nothing. While
     * `cashierRef` or `registerId` is out of bounds (shown as `error`), a call does nothing either,
     * unless it's the Retry of a pending completion, which was built with the options as they were.
     */
    complete: () => configError && !pending.current && !inFlight.current ? Promise.resolve() : once(async () => {
      attempts.current++;
      confirm(null);
      if (pending.current) return deliver(pending.current);
      setSaving(true);
      const current = builderNow.current.getSnapshot();
      const localWarnings = current.payments.filter((payment) => droppedReferences.current.has(payment.id))
        .map((payment) => ({ code: 'payment_reference_dropped' as const, paymentId: payment.id }));
      let posOrder: PosOrder;
      try {
        posOrder = finalizeOrder(current, { registerId: opts.registerId, cashierRef: opts.cashierRef, capabilities: opts.capabilities,
          ...(localWarnings.length ? { localWarnings } : {}) });
      } catch (error) {
        setSaving(false);
        setError((error as Error).message);
        return;
      }
      // The tender's pinned session; opts.session only for a complete() with no startTender (setTender from the cart),
      // or when the tender pinned none but a session has rendered since (the backstop, warned: see startTender).
      const session = tenderSession.current?.session ?? opts.session;
      if (tenderSession.current && !tenderSession.current.session && session) {
        try {
          saleLogger.warn('the tender started before its session rendered; pass the confirmed session to startTender',
            { orderId: posOrder.id, sessionId: session.id });
        } catch {
          // A failing sink must never lose the sale.
        }
      }
      if (session) {
        try {
          posOrder = await stampSession(posOrder, session.id, session.sessions);
        } catch {
          // The money is taken: keep the sale, outside every closure (ADR-032, late sale).
          const { sessionId: _unstamped, ...unstamped } = posOrder;
          posOrder = { ...unstamped, lateSessionId: session.id };
          try {
            // useSale knows the cashier only by ref, so the actor carries no display name.
            recordRegisterFact({ kind: 'late-sale', orderId: posOrder.id, sessionId: session.id, registerId: opts.registerId,
              actor: { id: opts.cashierRef, name: '' } });
          } catch {
            // The logger calls the app's sinks unguarded; a failing sink must never lose the sale.
          }
        }
      }
      pending.current = { order: current, posOrder };
      return deliver(pending.current);
    }),
    /**
     * Starts a new, empty sale. Refused with SALE_SAVING, changing nothing, while a save is still
     * building or stamping (nothing yet to ask `isStored` about), and while a pending completion
     * exists and isn't confirmed stored — the ways out are Retry (`complete()`) or Continue, once
     * `canContinue` (the Front desk, 2026-09-27; #149 review). So an app that doesn't pass `isStored`
     * gets Retry only after a failed save. A refusal while a save is still delivering its order asks
     * `isStored` afresh, so a hung save whose order is stored can still offer Continue. Past those, it
     * abandons a confirmed pending completion (never handed to `onSaleCompleted` again: it's stored; a
     * save still in flight carries on in the background, a throw logged at error) and starts the new
     * sale outright — from the receipt, or an idle cart, there's nothing pending to abandon. Abandoning
     * clears the screen, never the record (the Front desk, 2026-09-25). `newSale()` never deletes,
     * updates or requeues `pos_orders` itself.
     */
    newSale() { resetSale(null); },
    /** Parks the cart in `drafts`; resolves to a refusal message, or null once parked. */
    async park(): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (!opts.drafts) throw new Error('useSale: park() needs the drafts option');
      if (stageNow.current.kind !== 'cart') return 'Finish or cancel the payment before parking the sale';
      const builder = builderNow.current;
      const snapshot = builder.getSnapshot();
      if (!snapshot.lineItems.length && !snapshot.fees?.length && !snapshot.shipping?.length) return 'There is nothing to park';
      await writeOrderDraft(opts.drafts, snapshot);
      if (builderNow.current !== builder || builder.getSnapshot() !== snapshot) return 'The sale changed while it was being parked; park it again';
      resetSale(null);
      return null;
    },
    /** Resumes a draft into an empty cart; resolves to a refusal message, or null once resumed. */
    async resume(draftId: string, options?: { keepParkedPrices?: boolean }): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (!opts.drafts) throw new Error('useSale: resume() needs the drafts option');
      const live = builderNow.current;
      const liveSnapshot = live.getSnapshot();
      if (stageNow.current.kind !== 'cart' || liveSnapshot.lineItems.length || liveSnapshot.fees?.length || liveSnapshot.shipping?.length) return 'Park or clear the current sale first';
      const doc = await opts.drafts.findOne(draftId).exec();
      if (!doc) return 'That parked sale is no longer there';
      const saved: Order = JSON.parse(doc.toJSON().data);
      if (saved.currency.toUpperCase() !== settings.currency.toUpperCase()) return 'That parked sale is in another currency';
      const builder = restoreOrderDraft(saved, { currency: settings.currency, taxContext });
      let n = 0;
      if (opts.currentPrice && !options?.keepParkedPrices) {
        for (const line of builder.getSnapshot().lineItems) {
          if (!line.variantId) continue;
          const price = opts.currentPrice(line.variantId);
          if (price !== undefined && Number.isInteger(price) && price >= 0 && price !== line.unitPriceMinor) {
            builder.setUnitPrice(line.id, price);
            n++;
          }
        }
      }
      await doc.remove();
      if (builderNow.current !== live || live.getSnapshot() !== liveSnapshot) {
        await writeOrderDraft(opts.drafts, saved);
        return 'The sale changed while it was being resumed; resume it again';
      }
      resetSale(null, builder);
      if (n > 0) setError(`Prices changed since this sale was parked: ${n} ${n === 1 ? 'line' : 'lines'} updated to today's price.`);
      return null;
    },
    /**
     * Continue after a failed save whose order is confirmed stored (`canContinue`): exactly `newSale()`.
     * The order stays pending in the outbox, which will send it; it isn't handed to `onSaleCompleted` again, and
     * its receipt is not shown. Otherwise does nothing.
     */
    continueSale() {
      if (pending.current && confirmed.current === pending.current) result.newSale();
    },
  };
  return result;
}
