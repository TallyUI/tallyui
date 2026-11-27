import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { RxCollection } from 'rxdb';
import type { CustomerAddress, CustomerTaxId, PaymentRounding, ProductTraits, ServerCapabilities, StoreSettings, woocommerceTax } from '@tallyui/core';
import { ORDER_META_KEY_MAX, ORDER_META_MAX, paymentMethodOf } from '@tallyui/core';
import { canVoidLeg, capturedMinor, countsTowardPaid, inMotionMinor, isInMotion, legStatus, takenLeg } from '../tender/payment-legs';
import { heldUnitsByLine, unpaidUnitsByLine } from '../tender/split-units';
import { createOrderBuilder, writeOrderDraft, restoreOrderDraft, type ChargeInput, type ChargeLine, type LineItem, type OrderBuilder, type CustomerSummary, type Discount, type Order, type SentOrder } from '../order';
import { STORE_ORDER_REBUILD_REFUSALS } from '../order/from-store-order';
import { isLiveLeg } from '../order/order-builder';
import { sessionTakenLegs } from '../order/order-drafts';
import type { CashRounding, Payment } from '../order/types';
import { cleanTaxIds, TAX_IDS_INVALID } from '../order/tax-ids';
import { patchSale } from '../order/tax-exempt';
import { finalizeOrder, uuidv7, type PosOrder } from '../pos-order';
import { AFTER_CLOSE_PAYMENTS_CHANGED, afterCloseChanged, MESSAGE_NAME_MAX, referenceError, referenceReason, withSentForm } from '../pos-order/finalize';
import { CUSTOMER_REFUSALS, customerRefusal, cutText, PAYLOAD_STRING_MAX } from '../pos-order/command';
import { cashVoidRefusal, nearestPayableCash, remainderEntriesMinor, roundedPickTarget, roundedRemainder, settlesAtRoundedDue, writeOffLeg } from '../tender/cash-rounding';
import { useTax, type SaleTaxContext, type SaleTaxLocation, type TaxContext } from '../tax';
import { recordRegisterFact, stampSession, type RegisterSessionCollection } from '../register';
import { isRegisterClosing } from '../register/closing';
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
/** `complete`, `park` and `resume` refuse with this while a close for the sale's register is in flight (#1275). */
export const REGISTER_CLOSING = 'The register is closing. Wait for the close to finish, then try again.';
export const PAYMENT_IN_MOTION = 'Finish or void the payment in progress before completing the sale';
/**
 * `switchSale()` and `closeSale()` refuse a sale whose legs took money (u19). v2 keeps a partly paid order's legs on
 * switching, but a TallyUI draft keeps no tender stage; `startTender` keeps taken legs and legs in motion (ADR-072 d3,
 * amended 2026-11-22 and 2026-11-23), and `resume` keeps a paid draft's parked coupons (ADR-077 d3, amended 2026-11-19): so the
 * sale stays on the till until it is paid or its paid legs are voided.
 */
export const SALE_PARTLY_PAID = 'This sale is partly paid. Take the rest of the payment or void the paid legs first.';
/** newSale refuses with this while an unlocked payment leg is pending or authorized. */
export const SALE_CARD_IN_PROGRESS = 'A card payment is still in progress. Finish or cancel it before starting a new sale.';
export const SALE_IN_TENDER = 'Finish or cancel the payment before switching sales';
/**
 * Line and total changes refuse with this while a till leg is live, as v2's resolveStage stills the cart (tally-woo 11c).
 * "Cancel the payment" names the leg's button, `pos_checkout.cancel_payment` ("Cancel payment") in packages/components.
 */
export const SALE_HAS_PAYMENT = 'A payment was taken on this sale. Cancel the payment before changing the sale.';
/** removeTender refuses a taken leg with this: it is voided, never removed (ADR-072 d3, amended 2026-11-22). */
export const PAYMENT_TAKEN = 'This payment was taken. Void it instead of removing it.';
/** A cash addTender refuses with this when the balance less the legs in motion leaves nothing due (row 500). */
export const NOTHING_DUE = 'Nothing is left to pay: the payments on this sale already cover the total.';
/** ADR-094: a cash due that rounds to nothing is entered against the last leg counting toward paid; with none, there is nothing to round against. */
export const NOTHING_TO_ROUND_AGAINST = 'This sale rounds to nothing in cash: take it by another method.';
export const CASH_NOT_PAYABLE = 'Cash cannot pay that amount: take a whole number of the smallest cash step.';
export const CASH_WAITS_FOR_PAYMENT = 'Cash cannot pay that amount while another payment is in progress: finish that payment first.';
// order-payload-shape.ts accepts at most 16 cashRoundings entries; one stays free for the leg that settles the sale.
export const CASH_PICK_ENTRIES_MAX = 15;
export const CASH_PICK_LIMIT = 'Too many rounded cash payments on this sale: take the rest as one payment.';
// order-payload-shape.ts accepts at most 16 entries, so a non-pick cash leg may not add a 17th.
export const CASH_SETTLE_LIMIT = 'Too many rounded cash payments on this sale: take the rest by another method.';
/** voidTender's refusal for cashVoidRefusal's 'later_cash_rounding' (ADR-094 item 6); the components translate it as pos_checkout.void_later_cash_first. */
export const VOID_LATER_CASH_FIRST = 'Void the later cash payment first.';
/** On the receipt the finished sale refuses edits and re-tender with this; `add` starts the next sale instead (v2 #2861). */
export const SALE_FINISHED = 'This sale is finished. Start a new sale to change it.';
/** startTender and complete() refuse with this while the order's store-priced coupons are stale or being priced again (TallyUI#710). */
export const COUPONS_REPRICING = 'Coupon prices are being checked; try again in a moment';
/** Coupon changes refuse with this while a store-priced coupon is carried. */
export const COUPON_CARRIED = "The store refused this sale's coupon, so it is carried at the amount charged. Coupons can't be added or removed on this sale.";
/** Tender and completion refuse with this after a carried coupon's pricing basis changes. */
export const COUPON_CARRY_STALE = 'The sale changed after the store refused its coupon, so the amount carried for it no longer applies. Reopen the sale without the coupon to take payment.';
/** startTender refuses with this when the app's tenderGate rejects instead of answering. */
export const TENDER_GATE_FAILED = 'The checkout check failed, so the tender did not start';
/** 5.2 backlog F5: startTender shows this when a re-tax swapped the sale while the tender gate ran; the tender does not start. */
export const TENDER_SALE_CHANGED = 'The sale changed while the checkout check ran; start the payment again.';
/** #722: setCustomer's refusal of a customer whose address moves the sale's rates once they can no longer change (tender, receipt, money live); interim until #759 re-taxes like v2. */
export const CUSTOMER_RETAX_REFUSED = 'This customer would change the tax on this sale. To use them, cancel the payment and change the customer in the cart, or start a new order.';
/** Desk Q7.4 (19 Nov): setAddresses' refusal once the sale left the cart or money is live; the address changes only in the cart. */
export const ADDRESS_CHANGE_REFUSED = 'The address can only change in the cart. Cancel the payment to change it, or start a new order.';
/** ADR-092 6a: setTaxIds' refusal once the sale left the cart or money is live; the tax ids change only in the cart. */
export const TAX_IDS_CHANGE_REFUSED = 'Tax ids can only change in the cart. Cancel the payment to change them, or start a new order.';
export { TAX_IDS_INVALID } from '../order/tax-ids';
export const TAX_EXEMPT_UNAVAILABLE = 'This store does not accept tax exempt sales.';
export const TAX_EXEMPT_PAYMENT_TAKEN = 'Tax exemption can only be turned on before a payment is taken.';
export const TAX_EXEMPT_LOCKED = 'Tax exemption cannot change on this sale.';
export const TAX_EXEMPT_REMOVED = 'This sale was tax exempt, but this store no longer accepts tax exempt sales, so tax is charged again.';
/** ADR-092 6d: setMeta's refusal once the sale left the cart or money is live; custom fields change only in the cart. */
export const META_CHANGE_REFUSED = 'Custom fields can only change in the cart. Cancel the payment to change them, or start a new order.';
/** ADR-092 6d: setMeta's refusal of an empty, too long or `_` key, or of a new key past ORDER_META_MAX. */
export const META_INVALID = 'A custom field needs a name of at most 255 characters that does not start with "_", and a sale takes at most 50.';
/** ADR-092 6b: updateLine's refusal once the sale left the cart; a line's name, SKU and regular price change only in the cart. */
export const LINE_EDIT_REFUSED = 'A line can only be edited in the cart. Cancel the payment to edit it, or start a new order.';
/** #1095: restore()'s refusal of a removal whose sale moved on (reset, parked, resumed, finished), whose customer changed or whose sale was re-taxed since, or that is already back. */
export const RESTORE_STALE = 'This item can no longer be put back. Add it again.';
/** Taken by `removal()` before a remove; pass it to `restore()`. Hosts never build one. */
export type SaleRemoval = { readonly kind: 'line' | 'fee' | 'shipping'; readonly id: string; readonly item: LineItem | ChargeLine;
  readonly index: number; readonly orderId: string; readonly taxContext: TaxContext; readonly epoch: number };
/** The sale's tax context and, with `taxContextFor`, the address it matched (#722). */
type SaleTax = { taxContext: TaxContext; location?: woocommerceTax.ResolvedTaxLocation };
// The start of the message addOne sets when a terminal reference is dropped; a later tender change keeps it.
const REFERENCE_DROPPED = "The terminal's payment reference couldn't be kept";
// A paid draft's code in `applied`, kept as parked with no `find` at resume: never passed to codes.apply; a re-price replaces it.
const KEPT = Symbol('kept coupon');
/**
 * How often a hung save re-asks `isStored`, while the order is built and its save is still in flight
 * and unconfirmed: an app whose tender has no New sale control while saving (the Front desk,
 * 2026-09-28) never re-asks otherwise, so the cashier could only wait for a hung post-insert step.
 * `useSale`'s `hungSaveCheckMs` overrides this; that option is tests only.
 */
export const HUNG_SAVE_CHECK_MS = 5000;
/**
 * An `onSaleCompleted` call unsettled after this long is treated as failed, so the sale offers Retry;
 * the register can be closed once the retry succeeds (Front desk, 2026-11-23).
 */
export const SAVE_TIMEOUT_MS = 60_000;

/** Runs a builder call; an `Error` it throws becomes the refusal message to show, anything else is rethrown. */
function refusalOf<T>(run: () => T): T | string {
  try { return run(); } catch (error) { if (error instanceof Error) return error.message; throw error; }
}

/** Call under a `TaxProvider`: its tax context and the settings' currency price every sale. */
export function useSale(settings: Pick<StoreSettings, 'currency' | 'calcDiscountsSequentially'>, opts: {
  registerId: string; cashierRef: string; capabilities?: ServerCapabilities;
  /** The platform's discount codes (ADR-077 amendment 3), e.g. woocommerceDiscountCodes.createDiscountCodes(source); without them, applyCoupon refuses with COUPONS_UNSUPPORTED. */
  discountCodes?: SaleDiscountCodes<any>;
  /**
   * Awaited after startTender's own checks, before the tender starts (ADR-089 D11): resolves to a refusal to show,
   * or null to start. Typically `(attempt) => host.dispatch('checkout.tender.start', attempt, sources)` from
   * `@tallyui/extensions`. Without it startTender starts at once, as before; a rejection refuses with TENDER_GATE_FAILED.
   */
  tenderGate?: (attempt: { method: 'cash' | 'external' }) => Promise<string | null>;
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
  /** Tests only: overrides SAVE_TIMEOUT_MS, so a test can shrink the save's time bound. */
  saveTimeoutMs?: number;
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
  function contextFor(customer: CustomerSummary | null): SaleTax {
    return opts.taxContextFor ? opts.taxContextFor(customer) : { taxContext };
  }
  // The live builder's tax context, the store's or its customer's, and the address it matched (#722), from one
  // `taxContextFor` call: a newer function mid-sale never changes the address the sale's lines were taxed on.
  const taxNow = useRef<SaleTax>({ taxContext });
  // The default customer for a new sale, unless the server would refuse it: then the sale starts on guest.
  function defaulted(): CustomerSummary | null {
    const customer = opts.defaultCustomer ?? null;
    return customer && !customerRefusal(customer) ? customer : null;
  }
  const defaultKey = opts.defaultCustomer ? JSON.stringify([opts.defaultCustomer.id, opts.defaultCustomer.name, opts.defaultCustomer.email]) : '';
  const defaultSeen = useRef(defaultKey);
  const resetRefused = useRef(false); // the idle reset was refused for a held taken payment; its error is set once, not on every render (row 516)
  const [rendered, setBuilder] = useState(() => {
    const customer = defaulted();
    taxNow.current = contextFor(customer);
    const first = createOrderBuilder({ currency: settings.currency, taxContext: taxNow.current.taxContext });
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
    return { order: order.exemptedFrom ?? order, accepted: new Map(accepted), categories: categories.current, settings: { calcDiscountsSequentially: settings.calcDiscountsSequentially } };
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
  const tenderGatePending = useRef(false);
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
  // park() and resume() calls in flight, which the register reads as `saving` (#1275).
  const moving = useRef(0);
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
  /** Line and total changes' guard: SALE_SAVING while busy, SALE_FINISHED on the receipt, SALE_HAS_PAYMENT while an unlocked leg is captured or in motion; sets it as the error. */
  function editRefusal(): string | null {
    const refusal = busy() ? SALE_SAVING : stageNow.current.kind === 'receipt' ? SALE_FINISHED : liveLeg() ? SALE_HAS_PAYMENT : null;
    if (refusal) setError(refusal);
    return refusal;
  }
  /** An unlocked leg on the live sale is captured or in motion: its total must not move. */
  function liveLeg() {
    return builderNow.current.getSnapshot().payments.some(isLiveLeg);
  }
  function keptCodes() { return [...applied.current.values()].includes(KEPT); } // apply, remove and re-tax wait for the re-price
  // TallyUI#710: the coupon re-price in flight (at most one), the count of coupon changes that discards its result,
  // and the order snapshot a transient refusal or a throw stopped it on, with that reason.
  const repricing = useRef<Promise<string | null> | null>(null);
  const [couponsRepricing, setCouponsRepricing] = useState(false);
  const generation = useRef(0);
  // #1095: a removal from an older epoch is stale; bumped by every resetSale (new sale, park, resume, switch, receipt exit)
  // and every accepted customer change (setCustomer, setAddresses, setTaxIds).
  const removalEpoch = useRef(0);
  const stopped = useRef<{ order: Order; reason: string } | null>(null);
  const keptCoupons = useRef<Order['coupons']>(undefined); // the draft's coupons while KEPT placeholders hold; park writes them stale
  const keptLegIds = useRef<readonly string[]>([]); // the kept draft's parked live legs, held while KEPT placeholders hold
  const resumedLegIds = useRef<readonly string[]>([]); // a resumed draft's parked live legs, held until the sale resets (ADR-072 d3, amended 2026-11-22; row 328 F3)
  // a resumed draft's captured legs with no takenAt (parked before 4.2): taken, with no stamp invented (row 517)
  const resumedTakenIds = useRef<readonly string[]>([]);
  // An after-close sale's closure counted these legs, and finalize refuses any change to them: they are held like a locked leg.
  function countedLeg(p: { id: string }) { return !!builderNow.current.getSnapshot().afterClose?.payments.some((leg) => leg.id === p.id); }
  // BUG 2: a leg in motion is held too, so Back and a repeat startTender never drop a card the terminal may still capture.
  function heldLeg(p: Order['payments'][number]) { return !!p.locked || !!p.reopened || countedLeg(p) || (keptCodes() && isLiveLeg(p) && keptLegIds.current.includes(p.id))
    || (isLiveLeg(p) && resumedLegIds.current.includes(p.id)) || taken(p) || isInMotion(p); }
  function taken(p: Order['payments'][number]) { return takenLeg(p) || resumedTakenIds.current.includes(p.id); }
  /** The live sale holds a captured taken payment (row 517's `taken`): newSale, openStoreOrder, resume and the empty-sale resets refuse it with SALE_PARTLY_PAID (row 516). */
  function holdsTakenPayment() { return builderNow.current.getSnapshot().payments.some((p) => !p.locked && legStatus(p) === 'captured' && taken(p)); }
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
        keptCoupons.current = undefined; keptLegIds.current = [];
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
  function carriedCoupon() { return builderNow.current.getSnapshot().coupons?.some((coupon) => coupon.carried); }
  // newSale()'s body (see its doc comment for the guards): `newSale()` is `resetSale()` after newSale's guard, on the default customer.
  function resetSale(customer: CustomerSummary | null = defaulted(), restored?: OrderBuilder, restoredTax?: SaleTax) {
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
    const next = restored ?? createOrderBuilder({ currency: settings.currency, taxContext: tax.taxContext });
    if (customer !== null) next.setCustomer(customer);
    builderNow.current = next;
    taxNow.current = tax;
    applied.current.clear();
    keptCoupons.current = undefined; keptLegIds.current = []; resumedLegIds.current = []; resumedTakenIds.current = [];
    appliedWith.current = null;
    generation.current++;
    removalEpoch.current++;
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
  // #1059 review: never while a leg is live, as a re-price moves the total. The coupons then stay stale, so startTender and
  // complete() keep refusing with COUPONS_REPRICING (couponsUnpriced) and finalize's stale check stays the backstop, until
  // the leg is voided, removed or fails; that changes the order, and this effect prices them again.
  useEffect(() => {
    if (order.couponPricesStale && applied.current.size > 0 && !repricing.current
      && stageNow.current.kind !== 'receipt' && !busy() && !liveLeg() && stopped.current?.order !== order) void (appliedWith.current ? reprice() : dropKept());
  });
  function dropKept() { // kept coupons resumed with no discount codes: nothing can price them again
    builderNow.current.setCoupons([], { kind: 'store-priced', priced: new Map(), basis: '' });
    applied.current.clear();
    keptCoupons.current = undefined; keptLegIds.current = [];
    setError(COUPONS_UNSUPPORTED);
  }
  // New tax settings or currency wait until the sale is idle (an empty cart), then start a new sale keeping its customer:
  // a sale in progress (lines, tender or receipt) finishes on the settings it started with (a money rule), and an empty
  // sale holding a taken payment waits too, refused with SALE_PARTLY_PAID (row 516).
  const idle = stage.kind === 'cart' && !order.lineItems.length && !order.fees?.length && !order.shipping?.length;
  // A layout effect, on live idleness (#301): it runs inside the settings' commit, before any tap can be handled, and
  // the rendered `idle` would miss a line added since this render (it would then be dropped with the old builder).
  // A new default customer starts a new sale on it at once when idle, as v2 seeds its new cart again; never held pending.
  function refuseIdleReset() { if (!resetRefused.current) setError(SALE_PARTLY_PAID); resetRefused.current = true; }
  useLayoutEffect(() => {
    const live = builderNow.current.getSnapshot();
    const liveIdle = stageNow.current.kind === 'cart' && !live.lineItems.length && !live.fees?.length && !live.shipping?.length && !inFlight.current && !pending.current;
    const newDefault = defaultSeen.current !== defaultKey;
    defaultSeen.current = defaultKey;
    const due = liveIdle && (newDefault || madeWith.current.taxContext !== taxContext || madeWith.current.currency !== settings.currency
      || madeWith.current.taxContextFor !== opts.taxContextFor);
    if (due && holdsTakenPayment()) refuseIdleReset();
    else { resetRefused.current = false; if (due) resetSale(newDefault ? undefined : live.customer ?? null); }
  });
  /**
   * #722: the cart rebuilt on `next`, its customer's context, as resume() restores a draft: the order id, lines, discounts,
   * fees, shipping and note are kept, line taxes re-derived from the new rates, and the applied codes put back (store-priced
   * ones go stale and price again, as the basis has the customer). `applied`, the error and the stage are kept.
   */
  function retax(customer: CustomerSummary | null, next: SaleTax) {
    const snapshot = patchSale(builderNow.current.getSnapshot(), { customer, ...(carriedCoupon() ? { couponPricesStale: true } : {}) });
    const rebuilt = restoreOrderDraft(snapshot, { currency: snapshot.currency, taxContext: next.taxContext });
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
    const next = opts.taxContextFor?.(customer);
    const { payments } = builderNow.current.getSnapshot();
    if (!next || next.taxContext === taxNow.current.taxContext || stageNow.current.kind !== 'cart' || busy()
      || capturedMinor(payments) !== 0 || payments.some(isInMotion) || keptCodes()) return false;
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

  function addOne(tender: { method: 'cash' | 'external'; methodId?: string; amountMinor: number; tenderedMinor?: number; changeMinor?: number; reference?: string; units?: Readonly<Record<string, number>>; status?: 'pending' | 'authorized' | 'captured' }, stamp: boolean, rounding?: { minor: number }): string {
    // A terminal reference finalize would refuse is dropped as it's entered, never the payment (the money is
    // taken): the tender applies without it, with a message that doesn't block complete() and a
    // localWarnings entry on the stored order naming the payment whose reference was dropped.
    const reason = referenceReason(tender.reference);
    const dropped = reason && (reason === 'nul' ? 'it contains a NUL character' : `it is over ${PAYLOAD_STRING_MAX} characters`);
    // addTender stamps a leg that enters captured; setTender's pre-filled leg waits for complete(), a pending one for capture.
    // Stamped here, never in addPayment, which the restore paths call too.
    // S3: a leg entering captured is also stamped with its tender's session; a pending or authorized one gets its session
    // at capture (setTenderStatus), which may be in a later session. No session, no stamp.
    const captured = stamp && legStatus({ status: tender.status }) === 'captured', sessionId = captured ? legSessionId() : undefined;
    const takenAt = { ...(captured ? { takenAt: new Date().toISOString() } : {}), ...(sessionId !== undefined ? { sessionId } : {}) };
    const kept = dropped ? { method: tender.method, amountMinor: tender.amountMinor, ...takenAt,
      ...(tender.tenderedMinor !== undefined ? { tenderedMinor: tender.tenderedMinor } : {}),
      ...(tender.changeMinor !== undefined ? { changeMinor: tender.changeMinor } : {}),
      ...(tender.units !== undefined ? { units: tender.units } : {}),
      ...(tender.methodId !== undefined ? { methodId: tender.methodId } : {}), ...(tender.status !== undefined ? { status: tender.status } : {}) } : { ...tender, ...takenAt };
    const builder = builderNow.current;
    const { units, ...payment } = kept;
    const paymentId = builder.addPayment({ ...payment, ...(units && Object.keys(units).length ? { units } : {}) }, rounding);
    if (dropped) {
      droppedReferences.current.add(paymentId);
      setError(`${REFERENCE_DROPPED} (${dropped}); the payment is recorded without it.`);
    }
    try {
      if (dropped) saleLogger.warn("the terminal's payment reference was dropped", { reason: dropped, method: tender.method });
    } catch { /* a failing sink must never lose the tender */ }
    return paymentId;
  }

  /** #1064: a customer's tax ids cleanTaxIds would refuse (a defaultCustomer, a restored draft) start no tender. */
  function taxIdsRefusal(): string | null {
    const taxIds = builderNow.current.getSnapshot().customer?.taxIds;
    return taxIds && cleanTaxIds(taxIds) === null ? TAX_IDS_INVALID : null;
  }

  function setTender(tender: { method: 'cash' | 'external'; methodId?: string; amountMinor: number; reference?: string } | null) {
    if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED); // a finished sale's tender stays
    if (locked()) return;
    const taxIdsRefused = tender && taxIdsRefusal();
    if (taxIdsRefused) return setError(taxIdsRefused);
    // An after-close sale's money is what its closure counted, so the sale takes and gives none (ADR-077).
    if (tender && builderNow.current.getSnapshot().afterClose) return setError(AFTER_CLOSE_PAYMENTS_CHANGED);
    const builder = builderNow.current;
    for (const payment of builder.getSnapshot().payments) if (!heldLeg(payment)) { builder.removePayment(payment.id); droppedReferences.current.delete(payment.id); }
    setError(null);
    if (tender) addOne(tender, false);
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
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let timedOut = false;
    try {
      await Promise.race([
        Promise.resolve(opts.onSaleCompleted?.(completion.posOrder)).then(() => {
          if (timedOut && pending.current === completion && inFlight.current === null) finish();
        }, (error) => {
          if (timedOut && confirmed.current !== completion) saleLogger.error('onSaleCompleted failed', { orderId: completion.posOrder.id, error: error instanceof Error ? error.message : String(error) });
          throw error;
        }),
        new Promise<never>((_resolve, reject) => {
          timeout = setTimeout(() => { timedOut = true; reject(new Error('the save took too long')); }, opts.saveTimeoutMs ?? SAVE_TIMEOUT_MS);
        }),
      ]);
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
    } finally { clearTimeout(timeout); }
    finish();
    function finish() {
      if (hungSaveTimer.current === timer) clearHungSaveTimer();
      if (pending.current !== completion) return;
      pending.current = null;
      droppedReferences.current.clear();
      confirm(null);
      setSaving(false);
      setError(null); // every error goes, SALE_HAS_PAYMENT too: it is never shown on the receipt (#1059 review)
      stageNow.current = { kind: 'receipt', order: withSentForm(completion.order, completion.posOrder), posOrder: completion.posOrder };
      setStage(stageNow.current);
    }
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

  /** The session this tender is pinned to, as complete() stamps the order (S3). */
  const legSessionId = () => (tenderSession.current?.session ?? opts.session)?.id;

  function begin(method: 'cash' | 'external', options?: { session?: { id: string; sessions: RegisterSessionCollection } }) {
    if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED); // a tender gate that answers after complete()
    if (locked()) return;
    const current = builderNow.current.getSnapshot();
    if (!current.lineItems.length) return;
    if (couponsUnpriced()) return setError(carriedCoupon() ? COUPON_CARRY_STALE : COUPONS_REPRICING);
    if (afterCloseChanged(current)) return setError(AFTER_CLOSE_PAYMENTS_CHANGED);
    tenderSession.current ??= { session: options?.session ?? opts.session }; // a repeat call mid-tender keeps the pin
    const heldMinor = current.payments.reduce((sum, payment) => sum + (heldLeg(payment) && legStatus(payment) !== 'voided' ? payment.amountMinor : 0), 0);
    if (current.afterClose) setTender(null); // its legs are all counted
    else if (heldMinor === 0) setTender(method === 'external' ? { method, amountMinor: current.totalMinor } : null);
    else setTender(method === 'external' && current.totalMinor - heldMinor > 0 ? { method, amountMinor: current.totalMinor - heldMinor } : null);
    stageNow.current = { kind: 'tender', method }; // 5.2 backlog F4: a same-tick setCustomer/setAddresses sees the tender
    setStage(stageNow.current);
  }

  /** park()'s and switchSale()'s draft write: kept codes with no figures (a stopped re-price) park their coupons stale, so the resume prices them (as main does). */
  async function writeParked(drafts: NonNullable<typeof opts.drafts>, snapshot: Order): Promise<string | null> {
    const stale = keptCodes() && !snapshot.coupons?.length;
    if (stale && liveLeg()) return COUPONS_REPRICING; // a parked live leg would be re-priced on resume (as main refuses)
    return writeOrderDraft(drafts, stale ? patchSale(snapshot, { coupons: keptCoupons.current, couponPricesStale: true }) : snapshot).then(() => null);
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
    /** Adds the entry, as a new line or one more on its line; returns that line's id, or the refusal `error` now shows. On the receipt it starts the next sale first (v2 #2861). */
    add(entry: CatalogueEntry<any>, traits: ProductTraits<any>): { lineId: string } | string {
      if (stageNow.current.kind === 'receipt') {
        resetSale();
        if (stageNow.current.kind === 'receipt') return SALE_SAVING; // resetSale refused, with this as its error
      }
      const held = editRefusal(); if (held) return held;
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
    setQuantity(lineId: string, quantity: number) { if (!editRefusal()) builderNow.current.updateQuantity(lineId, quantity); },
    /** v2's cart Split: a line of quantity N becomes N lines of 1. Returns the refusal to show (SPLIT_FIXED_DISCOUNT), or null. */
    splitLine(lineId: string): string | null {
      const held = editRefusal(); if (held) return held;
      try { builderNow.current.splitLine(lineId); return null; }
      catch (error) { if (error instanceof RangeError) return error.message; throw error; }
    },
    /** ADR-075: adds a fee; returns its id or the builder's refusal. */
    addFee(input: ChargeInput): { id: string } | string {
      const held = editRefusal(); if (held) return held;
      const { storeLineId: _storeLineId, ...charge } = input;
      return refusalOf(() => ({ id: builderNow.current.addFee(charge) }));
    },
    /** ADR-075: updates a fee; returns a refusal or null. */
    updateFee(id: string, patch: Partial<ChargeInput>): string | null {
      const held = editRefusal(); if (held) return held;
      return refusalOf(() => { builderNow.current.updateFee(id, patch); return null; });
    },
    /** ADR-075: removes a fee; returns a refusal or null. */
    removeFee(id: string): string | null {
      const held = editRefusal(); if (held) return held;
      return refusalOf(() => { builderNow.current.removeFee(id); return null; });
    },
    /** ADR-075: adds shipping; returns its id or the builder's refusal. */
    addShipping(input: ChargeInput & { methodId?: string }): { id: string } | string {
      const held = editRefusal(); if (held) return held;
      const { storeLineId: _storeLineId, ...charge } = input;
      return refusalOf(() => ({ id: builderNow.current.addShipping(charge) }));
    },
    /** ADR-075: updates shipping; returns a refusal or null. */
    updateShipping(id: string, patch: Partial<ChargeInput & { methodId?: string }>): string | null {
      const held = editRefusal(); if (held) return held;
      return refusalOf(() => { builderNow.current.updateShipping(id, patch); return null; });
    },
    /** ADR-075: removes shipping; returns a refusal or null. */
    removeShipping(id: string): string | null {
      const held = editRefusal(); if (held) return held;
      return refusalOf(() => { builderNow.current.removeShipping(id); return null; });
    },
    /** ADR-075: adds a distinct custom product line; returns its id or the builder's refusal. */
    addCustomLine(input: { name: string; priceMinor: number; quantity?: number; taxClass?: string; taxStatus?: 'taxable' | 'none'; sku?: string }): { id: string } | string {
      const held = editRefusal(); if (held) return held;
      return refusalOf(() => ({ id: builderNow.current.addLine({ ...input, custom: true, productId: `custom:${uuidv7()}`,
        unitPrice: { amount: input.priceMinor, currency: madeWith.current.currency.toUpperCase() } }) }));
    },
    /** Sets a line's unit price in minor units of its own tax mode, recomputing discounts and tax; returns a refusal or null. */
    setUnitPrice(lineId: string, amountMinor: number): string | null {
      const held = editRefusal(); if (held) return held;
      try {
        builderNow.current.setUnitPrice(lineId, amountMinor);
        return null;
      } catch (error) {
        if (error instanceof RangeError || (error instanceof Error && error.message === `Unknown line ${lineId}`)) return error.message;
        throw error;
      }
    },
    /**
     * ADR-092 6b/6c: edits a cart line's `name`, `sku` or `regularUnitPriceMinor` (`null` removes it); the regular price is
     * the "was" price that receipts print and order.create 6+ sends. Cart only; returns a refusal or null: editRefusal's
     * refusals first (SALE_SAVING, SALE_FINISHED, SALE_HAS_PAYMENT), then LINE_EDIT_REFUSED for any other stage outside the cart.
     */
    updateLine(lineId: string, patch: { name?: string; sku?: string; regularUnitPriceMinor?: number | null }): string | null {
      const held = editRefusal(); if (held) return held;
      if (stageNow.current.kind !== 'cart') return LINE_EDIT_REFUSED;
      try {
        builderNow.current.updateLine(lineId, patch);
        return null;
      } catch (error) {
        if (error instanceof RangeError || (error instanceof Error && error.message === `Unknown line ${lineId}`)) return error.message;
        throw error;
      }
    },
    remove(lineId: string) { if (!editRefusal()) builderNow.current.removeItem(lineId); },
    /** #1095: the line, fee or shipping line `id` as it is now, taken before a remove for `restore()`; null when it is not there. */
    removal(kind: SaleRemoval['kind'], id: string): SaleRemoval | null {
      const order = builderNow.current.getSnapshot();
      const list: readonly (LineItem | ChargeLine)[] = kind === 'line' ? order.lineItems : kind === 'fee' ? order.fees ?? [] : order.shipping ?? [];
      const index = list.findIndex((item) => item.id === id);
      return index < 0 ? null : { kind, id, item: list[index], index, orderId: order.id, taxContext: taxNow.current.taxContext, epoch: removalEpoch.current };
    },
    /** #1095, v2's Undo: puts a removal back at its old index (clamped); returns a refusal or null. Any customer change, a re-tax, a reset (park, resume, new sale) or the receipt voids it (RESTORE_STALE). */
    restore(removal: SaleRemoval): string | null {
      const held = editRefusal(); if (held) return held;
      const order = builderNow.current.getSnapshot();
      if (stageNow.current.kind !== 'cart' || removal.orderId !== order.id || removal.epoch !== removalEpoch.current
        || removal.taxContext !== taxNow.current.taxContext) return RESTORE_STALE;
      const ids = [removal.item, ...(removal.kind === 'line' ? (removal.item as LineItem).discounts : [])].map((entry) => entry.id);
      if ([...order.lineItems.flatMap((li) => [li, ...li.discounts]), ...order.fees ?? [], ...order.shipping ?? [], ...order.discounts, ...order.payments]
        .some((entry) => ids.includes(entry.id))) return RESTORE_STALE; // already back
      builderNow.current.restoreItem(removal.kind, removal.item, removal.index);
      return null;
    },
    /** A line's discount, or the order's without a line; returns the refusal to show, or null once applied. */
    applyDiscount(lineId: string | null, discount: Discount): string | null {
      const held = editRefusal(); if (held) return held;
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
    removeDiscount(id: string) { if (!editRefusal()) builderNow.current.removeDiscount(id); },
    /** ADR-077: looks up, checks and applies a discount code through the platform's discount codes; resolves to the refusal to show, or null once applied. */
    async applyCoupon(code: string): Promise<string | null> {
      const held = editRefusal(); if (held) return held;
      if (carriedCoupon()) return COUPON_CARRIED;
      if (keptCodes()) return COUPONS_REPRICING;
      const codes = codesFor();
      if (!codes) return COUPONS_UNSUPPORTED;
      const builder = builderNow.current, normalized = code.trim().toLowerCase();
      if (!normalized) return 'Enter a coupon code';
      const result = await codes.find(normalized, discountState(builder.getSnapshot(), applied.current));
      if ('refusal' in result) return result.refusal;
      const heldNow = editRefusal(); if (heldNow) return heldNow;
      if (builderNow.current !== builder || stageNow.current.kind === 'receipt') return 'The sale changed while the coupon was being checked; apply it again';
      const refusal = codes.check(normalized, result.found, discountState(builder.getSnapshot(), applied.current));
      if (refusal !== null) return refusal;
      const next = new Map([...applied.current, [normalized, result.found]]);
      const refused = refusalOf(() => { codes.apply(builder, discountState(builder.getSnapshot(), next)); return null; });
      if (refused !== null) return refused;
      applied.current.set(normalized, result.found);
      appliedWith.current = codes;
      generation.current++;
      setError(null);
      return null;
    },
    /** Removes an applied coupon; returns the refusal to show, or null once removed. */
    removeCoupon(code: string): string | null {
      const held = editRefusal(); if (held) return held;
      if (carriedCoupon()) return COUPON_CARRIED;
      if (keptCodes()) return COUPONS_REPRICING;
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
      const held = editRefusal(); if (held) return held; // a re-price moves the total
      if (!appliedWith.current || !applied.current.size) return null;
      return reprice();
    },
    /** The sale's note, kept on the open sale (parked and resumed with it, cleared by newSale) and sent as order.create v7's note (ADR-083). */
    setNote(note: string) {
      if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED);
      if (!locked()) builderNow.current.setNote(note);
    },
    /** the picked customer reaches the server as order.create v3's customer.customerId */
    setCustomer(picked: CustomerSummary | null) {
      if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED);
      if (locked()) return;
      // A searched customer's email or id the server would refuse never reaches the sale; the customer stays as it was.
      const refused = picked && customerRefusal(picked);
      if (refused) return setError(refused);
      // #1064: so do tax ids setTaxIds would refuse; the clean list is the one stored.
      const taxIds = picked?.taxIds?.length ? cleanTaxIds(picked.taxIds) : undefined;
      if (taxIds === null) return setError(TAX_IDS_INVALID);
      const customer = picked && taxIds ? { ...picked, taxIds } : picked;
      // #722: the sale's rates and its customer always agree, so a customer with other rates is refused once they are fixed.
      if (!retaxFor(customer)) {
        const same = opts.taxContextFor?.(customer);
        if (same && same.taxContext !== taxNow.current.taxContext) return setError(CUSTOMER_RETAX_REFUSED);
        // Same rates: the address now matched is this customer's (a guest's is the base), so finalize never names one they lack.
        if (same) taxNow.current = same;
        builderNow.current.setCustomer(customer);
      }
      removalEpoch.current++;
      setError((current) => current !== null && (CUSTOMER_REFUSALS.includes(current) || current === CUSTOMER_RETAX_REFUSED || current === TAX_IDS_INVALID) ? null : current); // any other error stays
    },
    /**
     * Replaces both addresses on the picked customer (`undefined` removes one) and re-taxes like `setCustomer`. Does
     * nothing and returns false for a guest sale (guests come later); refuses once the sale left the cart (desk Q7.4).
     */
    setAddresses(billing: CustomerAddress | undefined, shipping: CustomerAddress | undefined): boolean {
      if (locked()) return false;
      const { customer, payments } = builderNow.current.getSnapshot();
      if (customer === null) return false;
      // Q7.4: refused outside the cart or with money live, even for an address with the same rates.
      if (stageNow.current.kind !== 'cart' || capturedMinor(payments) !== 0 || payments.some(isInMotion)) {
        setError(ADDRESS_CHANGE_REFUSED);
        return false;
      }
      const { billing: _billing, shipping: _shipping, ...rest } = customer;
      const next: CustomerSummary = { ...rest, ...(billing !== undefined ? { billing } : {}), ...(shipping !== undefined ? { shipping } : {}) };
      if (!retaxFor(next)) {
        const same = opts.taxContextFor?.(next);
        if (same && same.taxContext !== taxNow.current.taxContext) { setError(ADDRESS_CHANGE_REFUSED); return false; }
        if (same) taxNow.current = same;
        builderNow.current.setCustomer(next);
      }
      removalEpoch.current++;
      setError((current) => current === ADDRESS_CHANGE_REFUSED ? null : current); // any other error stays
      return true;
    },
    /** Replaces the picked customer's tax ids on this sale (`[]` removes them). Returns false for a guest sale, as `setAddresses`
     *  does; refuses once the sale left the cart, and refuses an invalid list (ADR-092 6a). It does not re-tax, and it does
     *  not save them to the customer (the customer editor does). */
    setTaxIds(taxIds: CustomerTaxId[]): boolean {
      if (locked()) return false;
      const { customer, payments } = builderNow.current.getSnapshot();
      if (customer === null) return false;
      if (stageNow.current.kind !== 'cart' || capturedMinor(payments) !== 0 || payments.some(isInMotion)) { setError(TAX_IDS_CHANGE_REFUSED); return false; }
      const cleaned = cleanTaxIds(taxIds);
      if (!cleaned) { setError(TAX_IDS_INVALID); return false; }
      const { taxIds: _taxIds, ...rest } = customer;
      builderNow.current.setCustomer(cleaned.length ? { ...rest, taxIds: cleaned } : rest);
      removalEpoch.current++;
      setError((current) => current === TAX_IDS_CHANGE_REFUSED || current === TAX_IDS_INVALID ? null : current); // any other error stays
      return true;
    },
    taxExempt: order.taxExempt === true,
    taxExemptAvailable: opts.capabilities?.taxExempt === true && !taxNow.current.taxContext.pricesIncludeTax && !order.storeOrder,
    setTaxExempt(on: boolean): boolean {
      if (locked()) return false;
      if (stageNow.current.kind === 'receipt') { setError(SALE_FINISHED); return false; }
      const snapshot = builderNow.current.getSnapshot();
      if (on === snapshot.taxExempt) return true;
      if (on && (opts.capabilities?.taxExempt !== true || taxNow.current.taxContext.pricesIncludeTax || snapshot.storeOrder)) { setError(TAX_EXEMPT_UNAVAILABLE); return false; }
      if (snapshot.payments.some(isInMotion)) { setError(PAYMENT_IN_MOTION); return false; }
      if (on && capturedMinor(snapshot.payments) > 0) { setError(TAX_EXEMPT_PAYMENT_TAKEN); return false; }
      if (snapshot.afterClose || carriedCoupon()) { setError(TAX_EXEMPT_LOCKED); return false; }
      builderNow.current.setTaxExempt(on);
      removalEpoch.current++;
      setError((current) => current === TAX_EXEMPT_UNAVAILABLE || current === TAX_EXEMPT_PAYMENT_TAKEN || current === TAX_EXEMPT_LOCKED ? null : current);
      return true;
    },
    /**
     * Sets one custom field on this sale (ADR-092 4 and 6d). It replaces the value when the key is there, and removes the
     * field when `value` is null. It refuses once the sale has left the cart, and it refuses an invalid key. The value is
     * cut to its bound when the order is frozen, as the note is.
     */
    setMeta(key: string, value: string | null): boolean {
      if (locked()) return false;
      const { meta = [], payments } = builderNow.current.getSnapshot();
      if (stageNow.current.kind !== 'cart' || capturedMinor(payments) !== 0 || payments.some(isInMotion)) {
        setError(META_CHANGE_REFUSED);
        return false;
      }
      const name = key.trim();
      const known = meta.some((m) => m.key === name);
      if (!name || name.length > ORDER_META_KEY_MAX || name.startsWith('_') || (value !== null && !known && meta.length >= ORDER_META_MAX)) {
        setError(META_INVALID);
        return false;
      }
      const next = value === null ? meta.filter((m) => m.key !== name)
        : known ? meta.map((m) => m.key === name ? { key: name, value } : m) : [...meta, { key: name, value }];
      builderNow.current.setMeta(next);
      setError((current) => current === META_CHANGE_REFUSED || current === META_INVALID ? null : current); // any other error stays
      return true;
    },
    /**
     * Pins `options.session` for this tender when given, else the rendered `session` option. Pass the
     * session `useRegisterSession`'s `requireSaleSession()` returned: the rendered one can lag a session
     * opened just before (#170 race). A repeat call mid-tender keeps the first pin.
     */
    startTender(method: 'cash' | 'external', options?: { session?: { id: string; sessions: RegisterSessionCollection } }) {
      if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED); // never re-tender a finished sale
      const taxIdsRefused = taxIdsRefusal();
      if (taxIdsRefused) return setError(taxIdsRefused);
      if (!opts.tenderGate) return begin(method, options);
      if (locked()) return;
      const current = builderNow.current.getSnapshot();
      if (!current.lineItems.length) return;
      if (couponsUnpriced()) return setError(carriedCoupon() ? COUPON_CARRY_STALE : COUPONS_REPRICING);
      if (tenderGatePending.current) return;
      const b = builderNow.current, at = generation.current;
      tenderGatePending.current = true;
      void Promise.resolve().then(() => opts.tenderGate!({ method })).catch(() => TENDER_GATE_FAILED).then((refusal) => {
        tenderGatePending.current = false;
        if (generation.current !== at) return;
        if (builderNow.current !== b) return setError(TENDER_SALE_CHANGED); // 5.2 backlog F5: a re-tax the gate did not judge
        if (refusal !== null) setError(refusal);
        else begin(method, options);
      });
    },
    setTender,
    /** ADR-072: external is capped at the balance due; change comes only from cash. A cash leg records the amount applied, the amount handed over (`tenderedMinor`) and the change (`changeMinor`). A leg is captured unless a status says otherwise; a leg in motion is held against the external cap. Units are checked against the units legs hold (`heldUnitsByLine`), but a leg's amount is not tied to its units' money here; the pane enforces that (#1133). A cash part pick rounds its target less the live entries on a cashRounding store, and one that reaches the whole-settle due is taken as that settle (ADR-094 item 7). */
    addTender(input: { method: 'cash' | 'external'; methodId?: string; amountMinor: number; tenderedMinor?: number; reference?: string; units?: Readonly<Record<string, number>>; status?: 'pending' | 'authorized' | 'captured'; rounding?: PaymentRounding }): string | null {
      const { rounding, ...tender } = input;
      if (stageNow.current.kind === 'receipt') { setError(SALE_FINISHED); return null; }
      if (rounding && tender.method !== 'cash') return null;
      // ADR-094: a cash leg is rounded only against a store whose connector declares cashRounding; otherwise, BASE's leg.
      // A leg in motion means this cash leg does not settle the sale, so nothing rounds: BASE's row 500 leg, but the leg it records must still be a whole number of cash steps (refused with CASH_WAITS_FOR_PAYMENT otherwise).
      const rule = rounding && tender.tenderedMinor === undefined && opts.capabilities?.cashRounding === true
        && inMotionMinor(builderNow.current.getSnapshot().payments) === 0 ? rounding : null;
      // ADR-094 item 7 (carry): a cash part pick rounds its target less the sale's live entries, and carries amount less target.
      const pickRule = rounding && tender.method === 'cash' && opts.capabilities?.cashRounding === true
        && inMotionMinor(builderNow.current.getSnapshot().payments) === 0 ? rounding : null;
      if (locked() || !Number.isInteger(tender.amountMinor) || tender.amountMinor < 0 || (tender.amountMinor === 0 && !rule)) return null;
      if (builderNow.current.getSnapshot().afterClose) { setError(AFTER_CLOSE_PAYMENTS_CHANGED); return null; }
      const taxIdsRefused = taxIdsRefusal();
      if (taxIdsRefused) { setError(taxIdsRefused); return null; }
      if (tender.method === 'cash' && tender.status !== undefined && tender.status !== 'captured') return null;
      if (tender.units) {
        const { lineItems, payments } = builderNow.current.getSnapshot();
        // unpaidUnitsByLine reads only id and quantity, so totalMinor can be 0.
        const unpaid = unpaidUnitsByLine(lineItems.map(({ id, quantity }) => ({ id, quantity, totalMinor: 0 })), heldUnitsByLine(payments));
        if (Object.entries(tender.units).some(([id, units]) => !id || !Number.isInteger(units) || units <= 0 || !Object.hasOwn(unpaid, id) || units > unpaid[id])) return null;
      }
      const pickMinor = pickRule && tender.tenderedMinor !== undefined ? roundedPickTarget(tender.amountMinor, pickRule, remainderEntriesMinor(builderNow.current.getSnapshot())) : tender.amountMinor;
      if (tender.tenderedMinor !== undefined && pickMinor === 0) return null;
      if (tender.tenderedMinor !== undefined && (tender.method !== 'cash' || !tender.units || !Object.keys(tender.units).length
        || !Number.isInteger(tender.tenderedMinor) || tender.tenderedMinor < pickMinor)) return null;
      if (tender.tenderedMinor !== undefined) {
        const snapshot = builderNow.current.getSnapshot();
        if (tender.amountMinor > snapshot.balanceDueMinor - inMotionMinor(snapshot.payments)) return null;
        // ADR-094 item 7 (promotion): a carried pick that reaches the whole-settle due is that settle, keeping its units; entry due - balance.
        const due = snapshot.balanceDueMinor;
        if (pickRule && pickMinor === roundedRemainder(due, remainderEntriesMinor(snapshot), pickRule)) {
          if ((snapshot.cashRoundings ?? []).length >= CASH_PICK_ENTRIES_MAX + 1 && pickMinor !== due) { setError(CASH_SETTLE_LIMIT); return null; }
          clearStaleError();
          return addOne({ ...tender, amountMinor: pickMinor, changeMinor: tender.tenderedMinor - pickMinor }, true, pickMinor !== due ? { minor: pickMinor - due } : undefined);
        }
        if (pickMinor !== tender.amountMinor && (snapshot.cashRoundings ?? []).length >= CASH_PICK_ENTRIES_MAX) { setError(CASH_PICK_LIMIT); return null; }
        if (rounding && opts.capabilities?.cashRounding === true && tender.method === 'cash' && inMotionMinor(snapshot.payments) > 0
          && nearestPayableCash(tender.amountMinor, rounding.incrementMinor) !== null) { setError(CASH_WAITS_FOR_PAYMENT); return null; }
      }
      if (tender.method === 'external') {
        const snapshot = builderNow.current.getSnapshot();
        const due = snapshot.balanceDueMinor - inMotionMinor(snapshot.payments);
        if (due <= 0) return null;
        clearStaleError(); // before addOne, which sets its own message for a dropped reference
        return addOne({ ...tender, amountMinor: Math.min(tender.amountMinor, due) }, true);
      }
      if (tender.tenderedMinor === undefined) {
        const snapshot = builderNow.current.getSnapshot();
        const due = snapshot.balanceDueMinor - inMotionMinor(snapshot.payments);
        if (due <= 0) { setError(NOTHING_DUE); return null; }
        const entries = remainderEntriesMinor(snapshot);
        const dueMinor = rule ? roundedRemainder(due, entries, rule) : due;
        if (rule && settlesAtRoundedDue({ amountMinor: Math.min(tender.amountMinor, due), tenderedMinor: tender.amountMinor, balanceMinor: due, dueMinor })) {
          const against = writeOffLeg(snapshot);
          const roundings = snapshot.cashRoundings ?? [];
          // The 16-entry cap: a settle that adds an entry (a rounded leg, or a write-off onto a leg with none) is refused at 16.
          if (roundings.length >= CASH_PICK_ENTRIES_MAX + 1 && (dueMinor > 0 ? dueMinor !== due
            : against !== undefined && !roundings.some((entry) => entry.paymentId === against.id))) { setError(CASH_SETTLE_LIMIT); return null; }
          clearStaleError();
          if (dueMinor > 0) {
            return addOne({ ...tender, amountMinor: dueMinor, tenderedMinor: tender.amountMinor, changeMinor: tender.amountMinor - dueMinor }, true, { minor: dueMinor - due });
          }
          // A remainder that rounds to zero closes the sale: no leg, its entry goes on writeOffLeg (ADR-094 item 1, #1365).
          if (!against) { setError(NOTHING_TO_ROUND_AGAINST); return null; }
          builderNow.current.addCashRounding({ paymentId: against.id, minor: -due });
          return against.id;
        }
        if (tender.amountMinor === 0) return null; // only the zero-remainder settle takes nothing
        if (rule && nearestPayableCash(tender.amountMinor, rule.incrementMinor)) { setError(CASH_NOT_PAYABLE); return null; }
        const amountMinor = Math.min(tender.amountMinor, due);
        if (rounding && tender.tenderedMinor === undefined && opts.capabilities?.cashRounding === true
          && inMotionMinor(snapshot.payments) > 0 && nearestPayableCash(amountMinor, rounding.incrementMinor) !== null) {
          setError(CASH_WAITS_FOR_PAYMENT); return null;
        }
        clearStaleError();
        return addOne({ ...tender, amountMinor, tenderedMinor: tender.amountMinor, changeMinor: tender.amountMinor - amountMinor }, true);
      }
      clearStaleError();
      return addOne({ ...tender, amountMinor: pickMinor, changeMinor: tender.tenderedMinor - pickMinor }, true,
        pickMinor !== tender.amountMinor ? { minor: pickMinor - tender.amountMinor } : undefined);
    },
    setTenderStatus(paymentId: string, status: 'authorized' | 'captured' | 'failed'): boolean {
      if (stageNow.current.kind === 'receipt') { setError(SALE_FINISHED); return false; }
      if (locked()) return false;
      const payment = builderNow.current.getSnapshot().payments.find((p) => p.id === paymentId);
      if (payment && countedLeg(payment)) { setError(AFTER_CLOSE_PAYMENTS_CHANGED); return false; }
      // S3: a capture stamps the capturing tender's session on a leg that has none yet.
      const changed = status === 'captured'
        ? builderNow.current.setPaymentStatus(paymentId, status, new Date().toISOString(), legSessionId())
        : builderNow.current.setPaymentStatus(paymentId, status);
      // With no live leg left, the sale can change again: SALE_HAS_PAYMENT goes, any other error stays.
      if (changed && status === 'failed' && !liveLeg()) setError((current) => current === SALE_HAS_PAYMENT ? null : current);
      // A leg moved, so the due changed: a stale NOTHING_DUE goes (row 502).
      if (changed) setError((current) => current === NOTHING_DUE ? null : current);
      return changed;
    },
    /** The leg stays in order.payments as voided and counts nothing; removeTender removes only a leg that took no money. Refused on the receipt. */
    voidTender(paymentId: string): boolean {
      if (stageNow.current.kind === 'receipt') { setError(SALE_FINISHED); return false; } // a finished sale's legs stay
      const payment = builderNow.current.getSnapshot().payments.find((p) => p.id === paymentId);
      if (payment && countedLeg(payment)) { setError(AFTER_CLOSE_PAYMENTS_CHANGED); return false; }
      if (payment?.locked) return false;
      if (locked()) return false;
      if (!payment || (payment.method !== 'cash' && payment.method !== 'external') || !canVoidLeg(payment, paymentMethodOf(payment.method))) return false;
      if (cashVoidRefusal(builderNow.current.getSnapshot(), paymentId)) { setError(VOID_LATER_CASH_FIRST); return false; }
      builderNow.current.setPaymentStatus(paymentId, 'voided');
      droppedReferences.current.delete(paymentId);
      clearStaleError();
      return true;
    },
    /** ADR-072: remove one tender and its dropped-reference warning. An id not among the payments changes nothing. Refused on the receipt. */
    removeTender(paymentId: string): void {
      if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED);
      const payment = builderNow.current.getSnapshot().payments.find((p) => p.id === paymentId);
      if (payment && countedLeg(payment)) return setError(AFTER_CLOSE_PAYMENTS_CHANGED);
      if (payment?.locked) return;
      if (locked()) return;
      if (!payment) return;
      if (taken(payment)) return setError(PAYMENT_TAKEN);
      builderNow.current.removePayment(paymentId);
      droppedReferences.current.delete(paymentId);
      clearStaleError();
    },
    /** True when setTender keeps this payment; false for one it replaces and for an id not among the payments. Changes nothing. */
    tenderHeld(paymentId: string): boolean {
      const payment = builderNow.current.getSnapshot().payments.find((p) => p.id === paymentId);
      return !!payment && heldLeg(payment);
    },
    cancelTender() {
      if (stageNow.current.kind === 'receipt') return setError(SALE_FINISHED);
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
     * Refused with `REGISTER_CLOSING`, changing nothing, while a close for this register is in flight (#1275).
     */
    complete: () => configError && !pending.current && !inFlight.current ? Promise.resolve()
      : isRegisterClosing(opts.registerId) ? (setError(REGISTER_CLOSING), Promise.resolve()) : once(async () => {
      attempts.current++;
      confirm(null);
      if (pending.current) return deliver(pending.current);
      setSaving(true);
      const snapshot = builderNow.current.getSnapshot();
      if (snapshot.payments.some(isInMotion)) { setSaving(false); setError(PAYMENT_IN_MOTION); return; }
      if (couponsUnpriced()) { setSaving(false); setError(carriedCoupon() ? COUPON_CARRY_STALE : COUPONS_REPRICING); return; }
      // Failed and voided legs stay on the screen's ledger but are never sent: only captured money is the sale's.
      // A leg with no takenAt yet (setTender's pre-filled one) was taken now; store, reopened and resumed pre-4.2 legs keep what they have.
      // Only this copy is stamped, never the builder, so a retry (pending.current) keeps this attempt's instant.
      const completedAt = new Date().toISOString(), sessionId = legSessionId();
      const current = { ...snapshot, payments: snapshot.payments.filter(countsTowardPaid)
        .map((payment) => payment.takenAt === undefined && !payment.locked && !payment.reopened && !resumedTakenIds.current.includes(payment.id)
          ? { ...payment, takenAt: completedAt, ...(sessionId !== undefined && payment.sessionId === undefined ? { sessionId } : {}) } : payment) };
      const localWarnings = current.payments.filter((payment) => droppedReferences.current.has(payment.id))
        .map((payment) => ({ code: 'payment_reference_dropped' as const, paymentId: payment.id }));
      let posOrder: PosOrder;
      try {
        posOrder = finalizeOrder(current, { registerId: opts.registerId, cashierRef: opts.cashierRef, capabilities: opts.capabilities,
          ...(localWarnings.length ? { localWarnings } : {}),
          // #722: the address the sale's lines were taxed on, kept with their context (taxNow), never a newer function's.
          ...(taxNow.current.location ? { taxLocation: taxNow.current.location } : {}) });
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
      // An after-close successor's sale is already in a closed session's closure: it joins no session (ADR-077).
      if (session && posOrder.countedInClosureOf === undefined) {
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
     * updates or requeues `pos_orders` itself. An unfinished sale that still holds a taken payment is refused
     * with SALE_PARTLY_PAID, changing nothing, as `closeSale` refuses it; the receipt and a confirmed stored
     * pending completion are unchanged.
     * An unfinished sale with an unlocked leg in motion refuses with SALE_CARD_IN_PROGRESS, changing nothing.
     */
    newSale() {
      if (stageNow.current.kind !== 'receipt' && !inFlight.current && !pending.current && builderNow.current.getSnapshot().payments.some((p) => !p.locked && isInMotion(p))) return setError(SALE_CARD_IN_PROGRESS);
      if (stageNow.current.kind !== 'receipt' && !inFlight.current && !pending.current && holdsTakenPayment()) return setError(SALE_PARTLY_PAID);
      resetSale();
    },
    /**
     * S3: the live sale's legs its session counts now and no stored order counts yet, for `useRegisterSession`'s
     * `liveSale`: captured till legs stamped with a session, not reopened and not counted by an after-close sale's closure
     * (`sessionTakenLegs`, the rule a parked draft's legs follow). `[]` on the receipt, whose stored order counts them.
     * `cashRoundings` are the sale's cash rounding entries on those legs, copied, counted on the Z with them (#1281).
     * `saving` is true while a completion is in flight or pending, including after a failed save, and while a
     * `park()` or `resume()` is in flight.
     */
    registerView(): { takenLegs: Payment[]; saving: boolean; cashRoundings: CashRounding[] } {
      const snapshot = builderNow.current.getSnapshot();
      const takenLegs = stageNow.current.kind === 'receipt' ? [] : sessionTakenLegs(snapshot.payments, countedLeg);
      const taken = new Set(takenLegs.map((leg) => leg.id));
      return {
        takenLegs,
        saving: inFlight.current !== null || pending.current !== null || moving.current > 0,
        cashRoundings: (snapshot.cashRoundings ?? []).filter((entry) => taken.has(entry.paymentId)).map((entry) => ({ ...entry })),
      };
    },
    /**
     * Parks the cart in `drafts`; resolves to a refusal message, or null once parked.
     * Refused with `REGISTER_CLOSING` while a close for this register is in flight (#1275).
     */
    async park(): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (isRegisterClosing(opts.registerId)) return REGISTER_CLOSING;
      moving.current++;
      try {
        if (!opts.drafts) throw new Error('useSale: park() needs the drafts option');
        if (stageNow.current.kind !== 'cart') return 'Finish or cancel the payment before parking the sale';
        const builder = builderNow.current;
        const snapshot = builder.getSnapshot();
        if (!snapshot.lineItems.length && !snapshot.fees?.length && !snapshot.shipping?.length) return 'There is nothing to park';
        const refused = await writeParked(opts.drafts, snapshot); if (refused) return refused;
        if (builderNow.current !== builder || builder.getSnapshot() !== snapshot) return 'The sale changed while it was being parked; park it again';
        resetSale();
        return null;
      } finally { moving.current--; }
    },
    /** Whether the live sale or a parked draft holds this store order; unreadable drafts do not count. */
    async holdsStoreOrder(orderId: string): Promise<boolean> {
      if (builderNow.current.getSnapshot().storeOrder?.id === orderId) return true;
      if (!opts.drafts) return false;
      const drafts = await opts.drafts.find().exec();
      return drafts.some((doc) => {
        try {
          const saved: Order = JSON.parse(doc.toJSON().data);
          return saved.storeOrder?.id === orderId;
        } catch { return false; }
      });
    },
    /** Loads a reopened store order (from reopenStoreOrder) into an empty sale, or returns why not; refused with SALE_PARTLY_PAID while the live sale holds a taken payment. */
    openStoreOrder(order: Order): string | null {
      if (locked()) return SALE_SAVING;
      if (!order.storeOrder) throw new Error('useSale: openStoreOrder() takes a reopened store order');
      const liveSnapshot = builderNow.current.getSnapshot();
      if (stageNow.current.kind !== 'cart' || liveSnapshot.lineItems.length || liveSnapshot.fees?.length || liveSnapshot.shipping?.length) return 'Park or clear the current sale first';
      if (holdsTakenPayment()) return SALE_PARTLY_PAID;
      if (order.currency.toUpperCase() !== settings.currency.toUpperCase()) return 'That order is in another currency';
      const restoredTax = contextFor(order.customer && !customerRefusal(order.customer) ? order.customer : null);
      const builder = restoreOrderDraft(order, { currency: settings.currency, taxContext: restoredTax.taxContext });
      const snapshot = builder.getSnapshot();
      if (snapshot.totalMinor !== order.totalMinor || snapshot.taxMinor !== order.taxMinor) return STORE_ORDER_REBUILD_REFUSALS.totals;
      resetSale(null, builder, restoredTax);
      return null;
    },
    /**
     * Resumes a draft into an empty cart; resolves to a refusal message, or null once resumed; refused with SALE_PARTLY_PAID while the live sale holds a taken payment.
     * Refused with `REGISTER_CLOSING` while a close for this register is in flight (#1275).
     */
    async resume(draftId: string, options?: { keepParkedPrices?: boolean }): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (isRegisterClosing(opts.registerId)) return REGISTER_CLOSING;
      moving.current++;
      try {
        if (!opts.drafts) throw new Error('useSale: resume() needs the drafts option');
        const live = builderNow.current;
        const liveSnapshot = live.getSnapshot();
        if (stageNow.current.kind !== 'cart' || liveSnapshot.lineItems.length || liveSnapshot.fees?.length || liveSnapshot.shipping?.length) return 'Park or clear the current sale first';
        if (holdsTakenPayment()) return SALE_PARTLY_PAID;
        const doc = await opts.drafts.findOne(draftId).exec();
        if (!doc) return 'That parked sale is no longer there';
        const saved: Order = JSON.parse(doc.toJSON().data);
        if (saved.currency.toUpperCase() !== settings.currency.toUpperCase()) return 'That parked sale is in another currency';
        // Taxed for the customer the draft restores (a refused one isn't).
        const restoredTax = contextFor(saved.customer && !customerRefusal(saved.customer) ? saved.customer : null);
        const removed = saved.taxExempt && (opts.capabilities?.taxExempt !== true || restoredTax.taxContext.pricesIncludeTax);
        const source = removed ? saved.exemptedFrom! : saved;
        // A draft whose legs took money keeps the tax rates it was paid against (u19); otherwise class-taxed lines re-derive.
        // ADR-077 d3 amended 2026-11-19: parked coupon amounts, with their prices and rates, given a display row per coupon.
        const carriedDraft = !!source.coupons?.length && source.coupons.every((coupon) => coupon.carried);
        const keep = !carriedDraft && !!source.coupons?.length && source.display.coupons?.length === source.coupons.length && (source.payments ?? []).some(isLiveLeg);
        const builder = restoreOrderDraft(source, { currency: settings.currency, taxContext: restoredTax.taxContext,
          keepTaxRates: keep || capturedMinor(source.payments ?? []) !== 0, keepCoupons: keep });
        let n = 0;
        // A draft whose legs took money keeps the prices it was paid against (u19), as does one kept for its coupons.
        // A reopened store order keeps the store's prices (ADR-090 decision 3, carryover item 22).
        if (opts.currentPrice && !options?.keepParkedPrices && !carriedDraft && !keep && capturedMinor(source.payments ?? []) === 0 && !source.storeOrder) {
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
        if (removed) messages.push(TAX_EXEMPT_REMOVED);
        const codes = !carriedDraft && source.coupons?.length ? codesFor() : null;
        if (n > 0) messages.push(`Prices changed since this sale was parked: ${n} ${n === 1 ? 'line' : 'lines'} updated to today's price.`);
        if (!carriedDraft && source.coupons?.length) {
          const supported = codes !== null;
          if (supported) await codes.beforeResume?.(discountState(builder.getSnapshot(), new Map()));
          if (keep) for (const { code } of source.coupons) kept.set(code, KEPT);
          else for (const { code } of source.coupons) {
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
          await writeOrderDraft(opts.drafts, source);
          return 'The sale changed while it was being resumed; resume it again';
        }
        resetSale(null, builder, restoredTax);
        if (builderNow.current === builder) {
          applied.current = kept;
          resumedLegIds.current = (source.payments ?? []).filter(isLiveLeg).map((p) => p.id);
          // A pre-4.2 leg voided before the park carries no takenAt and holds no money the till still has: it is dropped (desk, 23 Nov).
          resumedTakenIds.current = builder.getSnapshot().payments.filter((p) => !p.locked && legStatus(p) === 'captured' && p.takenAt === undefined).map((p) => p.id);
          if (keep) { keptCoupons.current = (source.exemptedFrom ?? source).coupons; keptLegIds.current = source.payments.filter(isLiveLeg).map((p) => p.id); }
          appliedWith.current = kept.size ? codes : null;
          generation.current++;
        }
        if (messages.length) setError(messages.join(' '));
        return null;
      } finally { moving.current--; }
    },
    /**
     * Opens the parked draft `draftId`, or an empty sale for null (New), as a tab switch (u19, v2 cart/tabs.tsx):
     * parks the current sale first when it has lines, fees or shipping (a receipt is done and is not parked).
     * Refused, changing nothing, while saving, for a partly paid sale or an empty sale holding a taken payment (SALE_PARTLY_PAID), a payment in motion or
     * the tender stage. Resolves to a refusal (park's, or `resume`'s for the chosen draft), or null.
     * Refused with `REGISTER_CLOSING` while a close for this register is in flight (#1275).
     */
    async switchSale(draftId: string | null): Promise<string | null> {
      if (locked()) return SALE_SAVING;
      if (isRegisterClosing(opts.registerId)) return REGISTER_CLOSING;
      moving.current++;
      try {
        if (!opts.drafts) throw new Error('useSale: switchSale() needs the drafts option');
        const builder = builderNow.current;
        const snapshot = builder.getSnapshot();
        if (draftId === snapshot.id) return null;
        if (capturedMinor(snapshot.payments.filter((payment) => !payment.locked)) > 0 && snapshot.balanceDueMinor > 0) return SALE_PARTLY_PAID;
        if (snapshot.payments.some(isInMotion)) return PAYMENT_IN_MOTION;
        if (stageNow.current.kind === 'tender') return SALE_IN_TENDER;
        if (stageNow.current.kind !== 'receipt' && !snapshot.lineItems.length && !snapshot.fees?.length && !snapshot.shipping?.length && holdsTakenPayment()) return SALE_PARTLY_PAID;
        if (stageNow.current.kind !== 'receipt' && (snapshot.lineItems.length || snapshot.fees?.length || snapshot.shipping?.length)) {
          const refused = await writeParked(opts.drafts, snapshot); if (refused) return refused;
          if (builderNow.current !== builder || builder.getSnapshot() !== snapshot) return 'The sale changed while it was being parked; park it again';
        }
        resetSale();
        return draftId === null ? null : await result.resume(draftId);
      } finally { moving.current--; }
    },
    /** Discards the current sale (nothing is parked) and starts an empty one; refused while saving, once a leg of an unfinished sale took or holds money, or in the tender stage.
     * A reopened sale's locked store legs do not stop it closing; the store order stays reopened, as in v2. */
    closeSale(): string | null {
      if (locked()) return SALE_SAVING;
      const { payments } = builderNow.current.getSnapshot();
      if (stageNow.current.kind !== 'receipt' && (capturedMinor(payments.filter((payment) => !payment.locked)) > 0 || payments.some(isInMotion))) return SALE_PARTLY_PAID;
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
