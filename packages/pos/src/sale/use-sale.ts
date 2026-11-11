import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RxCollection } from 'rxdb';
import type { ProductTraits, ServerCapabilities, StoreSettings } from '@tallyui/core';
import { paymentMethodOf } from '@tallyui/core';
import { canVoidLeg, capturedMinor, countsTowardPaid, inMotionMinor, isInMotion } from '../tender/payment-legs';
import { createOrderBuilder, writeOrderDraft, restoreOrderDraft, type ChargeInput, type OrderBuilder, type CustomerSummary, type Discount, type Order, type SentOrder } from '../order';
import { finalizeOrder, uuidv7, type PosOrder } from '../pos-order';
import { MESSAGE_NAME_MAX, referenceError, referenceReason, withSentForm } from '../pos-order/finalize';
import { CUSTOMER_REFUSALS, customerRefusal, cutText, PAYLOAD_STRING_MAX } from '../pos-order/command';
import { useTax, type SaleTaxContext, type SaleTaxLocation, type TaxContext } from '../tax';
import { recordRegisterFact, stampSession, type RegisterSessionCollection } from '../register';
import { createLogger } from '../logging';
import type { CatalogueEntry } from './catalogue';
import { addEntryToCart, CartError } from './cart';
import { productCategories } from '../product/categories';
import { COUPONS_UNSUPPORTED, type SaleDiscountCodes, type SaleDiscountState } from './discount-codes';

/** Logs a throw from onSaleCompleted for a confirmed pending completion newSale() has abandoned (Continue): nothing else would ever surface it. */
export const saleLogger = createLogger('sale');

export type SaleStage = { kind: 'cart' } | { kind: 'tender'; method: 'cash' | 'external' }
  | { kind: 'receipt'; order: SentOrder; posOrder: PosOrder };
/** TallyUI finalizeOrder's refusal below order.create v2 (c19a203), shown when the discount is applied; finalize stays the backstop. */
export const DISCOUNTS_UNSUPPORTED = 'finalize: discounts are not supported by the server yet (order.create v2)';
/** Every sale change refuses with this while a completion is pending (see `complete()`). */
export const SALE_SAVING = 'This sale is being saved. Retry to finish it.';
export const PAYMENT_IN_MOTION = 'Finish or void the payment in progress before completing the sale';
/**
 * `switchSale()` and `closeSale()` refuse a sale whose legs took money (u19). v2 keeps a partly paid order's legs on
 * switching, but a TallyUI draft keeps no tender stage, the next `startTender` replaces every leg, and `resume`
 * re-checks coupons: so the sale stays on the till until it is paid or its paid legs are voided.
 */
export const SALE_PARTLY_PAID = 'This sale is partly paid. Take the rest of the payment or void the paid legs first.';
export const SALE_IN_TENDER = 'Finish or cancel the payment before switching sales';
/** startTender and complete() refuse with this while the order's store-priced coupons are stale or being priced again (TallyUI#710). */
export const COUPONS_REPRICING = 'Coupon prices are being checked; try again in a moment';
// The start of the message addOne sets when a terminal reference is dropped; a later tender change keeps it.
const REFERENCE_DROPPED = "The terminal's payment reference couldn't be kept";
/**
 * How often a hung save re-asks `isStored`, while the order is built and its save is still in flight
 * and unconfirmed: an app whose tender has no New sale control while saving (the Front desk,
 * 2026-09-28) never re-asks otherwise, so the cashier could only wait for a hung post-insert step.
 * `useSale`'s `hungSaveCheckMs` overrides this; that option is tests only.
 */
export const HUNG_SAVE_CHECK_MS = 5000;

/** Call under a `TaxProvider`: its tax context and the settings' currency price every sale. */
export function useSale(settings: Pick<StoreSettings, 'currency' | 'calcDiscountsSequentially'>, opts: {
  registerId: string; cashierRef: string; capabilities?: ServerCapabilities;
  /** The platform's discount codes (ADR-077 amendment 3), e.g. woocommerceDiscountCodes.createDiscountCodes(source); without them, applyCoupon refuses with COUPONS_UNSUPPORTED. */
  discountCodes?: SaleDiscountCodes<any>;
  /**
   * Put on every new sale, as v2's store setting `default_customer` (or the cashier, `default_customer_is_cashier`)
   * is on every new cart: the first sale and each one after complete, discard, park, newSale or a switch to New,
   * never a resumed one. The app resolves which customer. A cashier's change, Guest included, stays on that sale.
   * A change applies at once to an idle cart, else to the next new sale. One `setCustomer` would refuse is skipped
   * (the sale starts on guest, with no error).
   */
  defaultCustomer?: CustomerSummary | null;
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
  /**
   * #722: the tax context for a customer's address (`saleTaxContexts(settings)`, memoized). Each new sale is taxed for its
   * customer, and `setCustomer` re-taxes a cart whose new customer moves the matched rates; tender and receipt keep theirs.
   * Without it, every sale is taxed by `useTax()`.
   */
  taxContextFor?: (customer: CustomerSummary | null) => SaleTaxContext;
}) {
  const taxContext = useTax();
  // The store's context and the settings the sale started with, for the idle reset; the sale's own context is `taxNow`.
  const madeWith = useRef({ taxContext, currency: settings.currency, taxContextFor: opts.taxContextFor });
  function contextFor(customer: CustomerSummary | null): TaxContext {
    return opts.taxContextFor ? opts.taxContextFor(customer).taxContext : taxContext;
  }
  // The live builder's tax context: the store's, or its customer's (#722).
  const taxNow = useRef<TaxContext>(taxContext);
  // The default customer for a new sale, unless the server would refuse it: then the sale starts on guest.
  function defaulted(): CustomerSummary | null {
    const customer = opts.defaultCustomer ?? null;
    return customer && !customerRefusal(customer) ? customer : null;
  }
  const defaultKey = opts.defaultCustomer ? JSON.stringify([opts.defaultCustomer.id, opts.defaultCustomer.name, opts.defaultCustomer.email]) : '';
  const defaultSeen = useRef(defaultKey);
  const [rendered, setBuilder] = useState(() => {
    const customer = defaulted();
    taxNow.current = contextFor(customer);
    const first = createOrderBuilder({ currency: settings.currency, taxContext: taxNow.current });
    if (customer) first.setCustomer(customer);
    return first;
  });
  // The live builder, which every mutator reads (#301): newSale() sets it before setBuilder(next) renders, so a
  // call from an older render never reaches a discarded builder. The state only moves the `order` subscription.
  const builderNow = useRef(rendered);
  const applied = useRef(new Map<string, unknown>());
  const appliedWith = useRef<SaleDiscountCodes<any> | null>(null);
  const categories = useRef(new Map<number, { id: number }[]>());
  function discountState(order: Order, accepted: ReadonlyMap<string, unknown>): SaleDiscountState<unknown> {
    return { order, accepted: new Map(accepted), categories: categories.current, settings: { calcDiscountsSequentially: settings.calcDiscountsSequentially } };
  }
  function codesFor(): SaleDiscountCodes<any> | null {
    return opts.capabilities?.coupons === true && (opts.capabilities?.orderCreate ?? 1) >= 6 && opts.discountCodes
      && opts.discountCodes.supports({ capabilities: opts.capabilities, rounding: taxContext.rounding }) ? opts.discountCodes : null;
  }
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
    const active = busy();
    if (active) setError(SALE_SAVING);
    return active;
  }
  /** locked() without its error. */
  function busy() { return !!(inFlight.current || pending.current); }
  // TallyUI#710: the coupon re-price in flight (at most one), the count of coupon changes that discards its result,
  // and the order snapshot a transient refusal or a throw stopped it on, with that reason.
  const repricing = useRef<Promise<string | null> | null>(null);
  const [couponsRepricing, setCouponsRepricing] = useState(false);
  const generation = useRef(0);
  const stopped = useRef<{ order: Order; reason: string } | null>(null);
  /** Prices the accepted codes again, as resume() checks them, on the live builder; resolves to the error it set, or null. */
  function reprice(): Promise<string | null> {
    if (repricing.current) return repricing.current;
    const b = builderNow.current, codes = appliedWith.current!, at = generation.current;
    let asked = b.getSnapshot();
    // A transient refusal or a throw stops the re-price, changing nothing; the effect skips the snapshot it stopped on.
    const stop = (reason: string) => {
      stopped.current = { order: asked, reason };
      if (builderNow.current === b && generation.current === at) setError(reason);
      return reason;
    };
    const run = (async () => {
      try {
        const kept = new Map<string, unknown>(), messages: string[] = [];
        for (const code of [...applied.current.keys()]) {
          asked = b.getSnapshot();
          const result = await codes.find(code, discountState(asked, kept));
          if ('refusal' in result && result.transient) return stop(result.refusal);
          const reason = 'refusal' in result ? result.refusal : codes.check(code, result.found, discountState(b.getSnapshot(), kept));
          if (reason === null) kept.set(code, (result as { found: unknown }).found);
          else messages.push(`Coupon ${code} was removed: ${reason}.`);
        }
        if (builderNow.current !== b || generation.current !== at) return null;
        asked = b.getSnapshot();
        codes.apply(b, discountState(asked, kept));
        applied.current = kept;
        if (!kept.size) appliedWith.current = null;
        const message = messages.length ? messages.join(' ') : null;
        // A refusal only a re-price could have set goes once the codes are priced.
        setError((current) => message ?? (current === COUPONS_REPRICING || current === stopped.current?.reason ? null : current));
        return message;
      } catch (error) { return stop(error instanceof Error ? error.message : String(error)); }
    })().finally(() => { repricing.current = null; setCouponsRepricing(false); });
    repricing.current = run;
    setCouponsRepricing(true);
    return run;
  }
  /** startTender's and complete()'s check: the live order's coupon prices are stale or being priced again. */
  function couponsUnpriced() { return !!(builderNow.current.getSnapshot().couponPricesStale || repricing.current); }
  // newSale()'s body (see its doc comment for the guards): `newSale()` is `resetSale()`, on the default customer.
  function resetSale(customer: CustomerSummary | null = defaulted(), restored?: OrderBuilder, restoredTax?: TaxContext) {
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
    madeWith.current = { taxContext, currency: settings.currency, taxContextFor: opts.taxContextFor };
    const tax = restoredTax ?? contextFor(customer);
    const next = restored ?? createOrderBuilder({ currency: settings.currency, taxContext: tax });
    if (customer !== null) next.setCustomer(customer);
    builderNow.current = next;
    taxNow.current = tax;
    applied.current.clear();
    appliedWith.current = null;
    generation.current++;
    setBuilder(next);
    setOrder(next.getSnapshot());
    // Live at once, so a resume() in the same tick (switchSale) sees the cart before the next render.
    stageNow.current = { kind: 'cart' };
    setStage(stageNow.current);
    setError(null);
  }
  useEffect(() => {
    const subscription = rendered.order$.subscribe(setOrder);
    return () => subscription.unsubscribe();
  }, [rendered]);
  // TallyUI#710: a rendered order whose store-priced coupons went stale prices them again, one re-price at a time. Checked
  // on every render, so it runs again when one ends (the sale may have changed meanwhile), never on a snapshot one stopped on.
  useEffect(() => {
    if (order.couponPricesStale && appliedWith.current && applied.current.size > 0 && !repricing.current
      && stageNow.current.kind !== 'receipt' && !busy() && stopped.current?.order !== order) void reprice();
  });
  // New tax settings or currency wait until the sale is idle (an empty cart), then start a new sale keeping its customer:
  // a sale in progress (lines, tender or receipt) finishes on the settings it started with (a money rule).
  const idle = stage.kind === 'cart' && !order.lineItems.length && !order.fees?.length && !order.shipping?.length;
  // A layout effect, on live idleness (#301): it runs inside the settings' commit, before any tap can be handled, and
  // the rendered `idle` would miss a line added since this render (it would then be dropped with the old builder).
  // A new default customer starts a new sale on it at once when idle, as v2 seeds its new cart again; never held pending.
  useLayoutEffect(() => {
    const live = builderNow.current.getSnapshot();
    const liveIdle = stageNow.current.kind === 'cart' && !live.lineItems.length && !live.fees?.length && !live.shipping?.length && !inFlight.current && !pending.current;
    const newDefault = defaultSeen.current !== defaultKey;
    defaultSeen.current = defaultKey;
    if (liveIdle && (newDefault || madeWith.current.taxContext !== taxContext || madeWith.current.currency !== settings.currency
      || madeWith.current.taxContextFor !== opts.taxContextFor)) resetSale(newDefault ? undefined : live.customer ?? null);
  });
  /**
   * #722: the cart rebuilt on `next`, its customer's context, as resume() restores a draft: the order id, lines, discounts,
   * fees, shipping and note are kept, line taxes re-derived from the new rates, and the applied codes put back (store-priced
   * ones go stale and price again, as the basis has the customer). `applied`, the error and the stage are kept.
   */
  function retax(customer: CustomerSummary | null, next: TaxContext) {
    const snapshot = { ...builderNow.current.getSnapshot(), customer };
    const rebuilt = restoreOrderDraft(snapshot, { currency: snapshot.currency, taxContext: next });
    if (appliedWith.current && applied.current.size) appliedWith.current.apply(rebuilt, discountState(rebuilt.getSnapshot(), applied.current));
    builderNow.current = rebuilt;
    taxNow.current = next;
    setBuilder(rebuilt);
    setOrder(rebuilt.getSnapshot());
  }
  /**
   * #722, v2's rule: a cart is re-taxed for `customer` when that customer moves its rates and no money is live (tender,
   * receipt, a paid or moving leg finish on their rates). setCustomer's and cancelTender's check; true when it re-taxed.
   */
  function retaxFor(customer: CustomerSummary | null): boolean {
    const next = opts.taxContextFor?.(customer).taxContext;
    const { payments } = builderNow.current.getSnapshot();
    if (!next || next === taxNow.current || stageNow.current.kind !== 'cart' || busy()
      || capturedMinor(payments) !== 0 || payments.some(isInMotion)) return false;
    retax(customer, next);
    return true;
  }
  const liveCustomer = order.customer, taxContextFor = opts.taxContextFor;
  const taxLocation = useMemo<SaleTaxLocation | undefined>(() => taxContextFor
    ? { ...taxContextFor(liveCustomer).location, hasCustomer: liveCustomer !== null } : undefined, [liveCustomer, taxContextFor]);
  // A screen that unmounts (medusapos: Sign out) mid-save must still leave a trace of the loss.
  useEffect(() => () => {
    clearHungSaveTimer();
    if (pending.current || inFlight.current) {
      saleLogger.error('useSale unmounted with a save pending or in flight',
        { orderId: pending.current?.posOrder.id, stage: stageNow.current.kind });
    }
  }, []);

  function addOne(tender: { method: 'cash' | 'external'; amountMinor: number; reference?: string; status?: 'pending' | 'authorized' | 'captured' }): string {
    // A terminal reference finalize would refuse is dropped as it's entered, never the payment (the money is
    // taken): the tender applies without it, with a message that doesn't block complete() and a
    // localWarnings entry on the stored order naming the payment whose reference was dropped.
    const reason = referenceReason(tender.reference);
    const dropped = reason && (reason === 'nul' ? 'it contains a NUL character' : `it is over ${PAYLOAD_STRING_MAX} characters`);
    const kept = dropped ? { method: tender.method, amountMinor: tender.amountMinor, ...(tender.status !== undefined ? { status: tender.status } : {}) } : tender;
    const builder = builderNow.current;
    const paymentId = builder.addPayment(kept);
    if (dropped) {
      droppedReferences.current.add(paymentId);
      setError(`${REFERENCE_DROPPED} (${dropped}); the payment is recorded without it.`);
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

  /** addTender, voidTender and removeTender changed the tenders: a stale error goes, a dropped-reference message stays. */
  function clearStaleError() {
    setError((current) => current?.startsWith(REFERENCE_DROPPED) ? current : null);
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
    /** #722: the address the sale's customer is taxed by (WooCommerce's `tax_based_on`), for a "Tax based on" panel; undefined without `taxContextFor`. */
    taxLocation,
    /** The store's capabilities as passed in: a component offers fees, shipping and custom lines
     * only when `orderCreate >= 5`, and their tax status and class only as `lineTax` allows. */
    capabilities: opts.capabilities,
    /** A completion is pending (see `complete()`): the sale is locked, and the UI offers Retry. */
    saving,
    /** The failed save's order is confirmed stored (see `isStored`): the UI also offers Continue (`continueSale()`). */
    canContinue,
    /** Adds the entry, as a new line or one more on its line; returns that line's id, or the refusal `error` now shows. */
    add(entry: CatalogueEntry<any>, traits: ProductTraits<any>): { lineId: string } | string {
      if (locked()) return SALE_SAVING;
      const builder = builderNow.current;
      try {
        const known = new Set(builder.getSnapshot().lineItems.map((line) => line.id));
        const productId = Number(traits.getId(entry.product));
        if (Number.isSafeInteger(productId) && productId >= 0) {
          const ids = productCategories(entry.product, traits).map(({ id }) => ({ id: Number(id) })).filter(({ id }) => Number.isSafeInteger(id));
          if (ids.length) categories.current.set(productId, ids);
        }
        const lineId = addEntryToCart(builder, entry, traits, madeWith.current.currency);
        // A new line whose id or v3 tax code finalize would refuse is taken off at once, in finalize's
        // message shape; finalize stays the backstop.
        const line = builder.getSnapshot().lineItems.find((item) => item.id === lineId && !known.has(item.id));
        const name = line && `"${cutText(line.name, MESSAGE_NAME_MAX)}"`;
        const taxLines = line && (opts.capabilities?.orderCreate ?? 1) >= 3 ? line.taxLines : [];
        const refused = line && [line.variantId !== undefined ? referenceError(`${name}: the variant id`, line.variantId)
          : referenceError(`${name}: the product id`, line.productId),
        ...taxLines.map((tax) => referenceError(`${name}: the tax code`, tax.code))].find((message) => message !== null);
        if (refused) { builder.removeItem(lineId); setError(refused); return refused; }
        setError(null);
        return { lineId };
      } catch (error) {
        if (!(error instanceof CartError)) throw error;
        setError(error.message);
        return error.message;
      }
    },
    setQuantity(lineId: string, quantity: number) { if (!locked()) builderNow.current.updateQuantity(lineId, quantity); },
    /** v2's cart Split: a line of quantity N becomes N lines of 1. Returns the refusal to show (SPLIT_FIXED_DISCOUNT), or null. */
    splitLine(lineId: string): string | null {
      if (locked()) return SALE_SAVING;
      try { builderNow.current.splitLine(lineId); return null; }
      catch (error) { if (error instanceof RangeError) return error.message; throw error; }
    },
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
    /** ADR-077: looks up, checks and applies a discount code through the platform's discount codes; resolves to the refusal to show, or null once applied. */
    async applyCoupon(code: string): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      const codes = codesFor();
      if (!codes) return COUPONS_UNSUPPORTED;
      const builder = builderNow.current, normalized = code.trim().toLowerCase();
      if (!normalized) return 'Enter a coupon code';
      const result = await codes.find(normalized, discountState(builder.getSnapshot(), applied.current));
      if ('refusal' in result) return result.refusal;
      if (locked()) return SALE_SAVING;
      if (builderNow.current !== builder || stageNow.current.kind === 'receipt') return 'The sale changed while the coupon was being checked; apply it again';
      const refusal = codes.check(normalized, result.found, discountState(builder.getSnapshot(), applied.current));
      if (refusal !== null) return refusal;
      const next = new Map([...applied.current, [normalized, result.found]]);
      try { codes.apply(builder, discountState(builder.getSnapshot(), next)); }
      catch (error) { if (error instanceof Error) return error.message; throw error; }
      applied.current.set(normalized, result.found);
      appliedWith.current = codes;
      generation.current++;
      setError(null);
      return null;
    },
    /** Removes an applied coupon; returns the refusal to show, or null once removed. */
    removeCoupon(code: string): string | null {
      if (locked()) return SALE_SAVING;
      const normalized = code.trim().toLowerCase();
      if (!applied.current.has(normalized)) return null;
      const remaining = new Map(applied.current); remaining.delete(normalized);
      appliedWith.current!.apply(builderNow.current, discountState(builderNow.current.getSnapshot(), remaining));
      applied.current.delete(normalized);
      generation.current++;
      return null;
    },
    /** TallyUI#710: true while the sale prices its store-priced coupons again; tender is refused with COUPONS_REPRICING meanwhile. */
    couponsRepricing,
    /** Prices the sale's coupons again now, as Retry after a transient refusal; resolves to the refusal or error it set, or null. */
    async repriceCoupons(): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (!appliedWith.current || !applied.current.size || stageNow.current.kind === 'receipt') return null;
      return reprice();
    },
    /** The sale's note, kept on the open sale (parked and resumed with it, cleared by newSale) and sent as order.create v7's note (ADR-083). */
    setNote(note: string) { if (!locked()) builderNow.current.setNote(note); },
    /** the picked customer reaches the server as order.create v3's customer.customerId */
    setCustomer(customer: CustomerSummary | null) {
      if (locked()) return;
      // A searched customer's email or id the server would refuse never reaches the sale; the customer stays as it was.
      const refused = customer && customerRefusal(customer);
      if (refused) return setError(refused);
      if (!retaxFor(customer)) builderNow.current.setCustomer(customer);
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
      if (couponsUnpriced()) return setError(COUPONS_REPRICING);
      tenderSession.current ??= { session: options?.session ?? opts.session }; // a repeat call mid-tender keeps the pin
      setTender(method === 'external' ? { method, amountMinor: current.totalMinor } : null);
      setStage({ kind: 'tender', method });
    },
    setTender,
    /** ADR-072: external is capped at the balance due; change comes only from cash. A leg is captured unless a status says otherwise; a leg in motion is held against the external cap. */
    addTender(tender: { method: 'cash' | 'external'; amountMinor: number; reference?: string; status?: 'pending' | 'authorized' | 'captured' }): string | null {
      if (locked() || !Number.isInteger(tender.amountMinor) || tender.amountMinor <= 0) return null;
      if (tender.method === 'cash' && tender.status !== undefined && tender.status !== 'captured') return null;
      if (tender.method === 'external') {
        const snapshot = builderNow.current.getSnapshot();
        const due = snapshot.balanceDueMinor - inMotionMinor(snapshot.payments);
        if (due <= 0) return null;
        clearStaleError(); // before addOne, which sets its own message for a dropped reference
        return addOne({ ...tender, amountMinor: Math.min(tender.amountMinor, due) });
      }
      clearStaleError();
      return addOne(tender);
    },
    setTenderStatus(paymentId: string, status: 'authorized' | 'captured' | 'failed'): boolean {
      if (locked()) return false;
      return builderNow.current.setPaymentStatus(paymentId, status);
    },
    /** The leg stays in order.payments as voided and counts nothing; removeTender still removes a leg outright. */
    voidTender(paymentId: string): boolean {
      if (locked()) return false;
      const payment = builderNow.current.getSnapshot().payments.find((p) => p.id === paymentId);
      if (!payment || (payment.method !== 'cash' && payment.method !== 'external') || !canVoidLeg(payment, paymentMethodOf(payment.method))) return false;
      builderNow.current.setPaymentStatus(paymentId, 'voided');
      droppedReferences.current.delete(paymentId);
      clearStaleError();
      return true;
    },
    /** ADR-072: remove one tender and its dropped-reference warning. An id not among the payments changes nothing. */
    removeTender(paymentId: string): void {
      if (locked()) return;
      if (!builderNow.current.getSnapshot().payments.some((payment) => payment.id === paymentId)) return;
      builderNow.current.removePayment(paymentId);
      droppedReferences.current.delete(paymentId);
      clearStaleError();
    },
    cancelTender() {
      if (locked()) return;
      setTender(null);
      tenderSession.current = null;
      stageNow.current = { kind: 'cart' };
      setStage(stageNow.current);
      // #722: a customer set during tender is taxed for once the cart is back, unless money was taken.
      retaxFor(builderNow.current.getSnapshot().customer ?? null);
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
      const snapshot = builderNow.current.getSnapshot();
      if (snapshot.payments.some(isInMotion)) { setSaving(false); setError(PAYMENT_IN_MOTION); return; }
      if (couponsUnpriced()) { setSaving(false); setError(COUPONS_REPRICING); return; }
      // Failed and voided legs stay on the screen's ledger but are never sent: only captured money is the sale's.
      const current = { ...snapshot, payments: snapshot.payments.filter(countsTowardPaid) };
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
    newSale() { resetSale(); },
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
      resetSale();
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
      // Taxed for the customer the draft restores (a refused one isn't).
      const restoredTax = contextFor(saved.customer && !customerRefusal(saved.customer) ? saved.customer : null);
      const builder = restoreOrderDraft(saved, { currency: settings.currency, taxContext: restoredTax });
      let n = 0;
      // A draft whose legs took money keeps the prices it was paid against (u19).
      if (opts.currentPrice && !options?.keepParkedPrices && capturedMinor(saved.payments ?? []) === 0) {
        for (const line of builder.getSnapshot().lineItems) {
          if (!line.variantId) continue;
          const price = opts.currentPrice(line.variantId);
          if (price !== undefined && Number.isInteger(price) && price >= 0 && price !== line.unitPriceMinor) {
            builder.setUnitPrice(line.id, price);
            n++;
          }
        }
      }
      const kept = new Map<string, unknown>(), messages: string[] = [];
      const codes = saved.coupons?.length ? codesFor() : null;
      if (n > 0) messages.push(`Prices changed since this sale was parked: ${n} ${n === 1 ? 'line' : 'lines'} updated to today's price.`);
      if (saved.coupons?.length) {
        const supported = codes !== null;
        if (supported) await codes.beforeResume?.(discountState(builder.getSnapshot(), new Map()));
        for (const { code } of saved.coupons) {
          let reason: string | null = supported ? null : COUPONS_UNSUPPORTED;
          if (supported) {
            const result = await codes.find(code, discountState(builder.getSnapshot(), kept));
            if ('refusal' in result) reason = result.refusal;
            else {
              reason = codes.check(code, result.found, discountState(builder.getSnapshot(), kept));
              if (reason === null) try { codes.apply(builder, discountState(builder.getSnapshot(), new Map([...kept, [code, result.found]]))); kept.set(code, result.found); }
              catch (error) { if (error instanceof Error) reason = error.message; else throw error; }
            }
          }
          if (reason !== null) messages.push(`Coupon ${code} was removed: ${reason}.`);
        }
      }
      await doc.remove();
      if (builderNow.current !== live || live.getSnapshot() !== liveSnapshot) {
        await writeOrderDraft(opts.drafts, saved);
        return 'The sale changed while it was being resumed; resume it again';
      }
      resetSale(null, builder, restoredTax);
      if (builderNow.current === builder) {
        applied.current = kept;
        appliedWith.current = kept.size ? codes : null;
        generation.current++;
      }
      if (messages.length) setError(messages.join(' '));
      return null;
    },
    /**
     * Opens the parked draft `draftId`, or an empty sale for null (New), as a tab switch (u19, v2 cart/tabs.tsx):
     * parks the current sale first when it has lines, fees or shipping (a receipt is done and is not parked).
     * Refused, changing nothing, while saving, for a partly paid sale (SALE_PARTLY_PAID), a payment in motion or
     * the tender stage. Resolves to a refusal (park's, or `resume`'s for the chosen draft), or null.
     */
    async switchSale(draftId: string | null): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (!opts.drafts) throw new Error('useSale: switchSale() needs the drafts option');
      const builder = builderNow.current;
      const snapshot = builder.getSnapshot();
      if (draftId === snapshot.id) return null;
      if (capturedMinor(snapshot.payments) > 0 && snapshot.balanceDueMinor > 0) return SALE_PARTLY_PAID;
      if (snapshot.payments.some(isInMotion)) return PAYMENT_IN_MOTION;
      if (stageNow.current.kind === 'tender') return SALE_IN_TENDER;
      if (stageNow.current.kind !== 'receipt' && (snapshot.lineItems.length || snapshot.fees?.length || snapshot.shipping?.length)) {
        await writeOrderDraft(opts.drafts, snapshot);
        if (builderNow.current !== builder || builder.getSnapshot() !== snapshot) return 'The sale changed while it was being parked; park it again';
      }
      resetSale();
      return draftId === null ? null : result.resume(draftId);
    },
    /** Discards the current sale (nothing is parked) and starts an empty one; refused while saving, once a leg of an unfinished sale took or holds money, or in the tender stage. */
    closeSale(): string | null {
      if (locked()) return SALE_SAVING;
      const { payments } = builderNow.current.getSnapshot();
      if (stageNow.current.kind !== 'receipt' && (capturedMinor(payments) > 0 || payments.some(isInMotion))) return SALE_PARTLY_PAID;
      if (stageNow.current.kind === 'tender') return SALE_IN_TENDER;
      resetSale();
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
