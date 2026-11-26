import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useFormatMoney, knownWarnings, type SettleOutcome } from '@tallyui/core';
import { canCancelOnStore, canPayRestOnStore, canReverseOnStore, extrasNotSent, isRequeueableOrder, needsAdminReasonOf, needsAttention, noteDelivery, refundDueOf, REOPENABLE_CODES, settledOnStore, storeOrderLeft, TILL_SESSION_CLOSED, tillPayments, unrecordedLegs, UPDATE_UNSENDABLE, UPDATE_UNSENDABLE_MESSAGE, type OutboxState, type PosOrder } from '@tallyui/pos';
import { META_NOT_SENT, NOTE_NOT_SENT, orderReference, TAX_IDS_NOT_SENT } from './order-reference';
import { sinceText } from './since-text';
import { ConfirmDialog } from '../ui/confirm-dialog';

/** One order from the store's own history (ADR-052 amendment 1), mapped by the app from its platform. */
export type OrderHistoryRow = {
  id: string; clientOrderId?: string; reference: string; placedAt: string;
  totalMinor: number; currency: string; itemCount: number; stateLabel: string;
};

const STATUS_LABEL = { pending: 'Waiting to sync', applied: 'Synced', rejected: 'Not accepted' };
/** `figures_mismatch`'s labels; a field a newer store sends that isn't here is shown by its raw name. */
const FIGURE_LABELS = new Map([['subtotalMinor', 'Subtotal'], ['taxMinor', 'Tax'], ['discountMinor', 'Discount']]);
/** A rejected sale's line in the cashier's words, by the store's error code (#269). The store's own message goes to the
 * sync log (the outbox logs it), never here. */
const REFUSAL_SENTENCES = new Map([
  ['invalid_payload', "The online store refused this sale: this till sent it in a form the store can't read. Ask the store owner to look at the till's sync log."],
  ['unsupported_version', "The online store refused this sale: the store's software is older than this till's. Ask the store owner to update the POS plugin."],
  ['idempotency_mismatch', "The online store has a different sale under this sale's number. Don't send it again; ask the store owner to compare the two."],
  ['store_configuration', 'The online store refused this sale: a setting on the store needs changing. Once the store owner fixes it, press Retry.'],
  ['platform_error', "The online store refused this sale. Ask the store owner to look at the till's sync log."],
  ['internal_error', "The online store hit a fault in its POS plugin and refused this sale. Ask the store owner to look at the till's sync log."],
  ['insufficient_stock', "The online store refused this sale: it doesn't have enough stock of one of the items."],
  ['unsupported_tax_mode', "The online store refused this sale: its tax settings can't take a sale like this one. Ask the store owner to check them."],
  ['unknown_variant', 'The online store refused this sale: that product variation no longer exists.'],
  ['invalid_quantity', "The online store refused this sale: a quantity or a discount on it isn't allowed."],
  ['underpaid', 'The online store refused this sale: the payments add up to less than the total.'],
  ['unsupported_currency', "The online store refused this sale: the store doesn't take this currency."],
  ['coupon_invalid', "The online store refused this sale: a coupon on it isn't valid now. Reopen it to sell it again."],
  ['total_mismatch', "The online store refused this sale: its total didn't match the store's. Reopen it to sell it again."],
]);
// Any other code, or none: platform_error's sentence, as the generic fallback (approved by the Front desk, 2026-09-30).
const refusalSentence = (code: string | undefined) => REFUSAL_SENTENCES.get(code ?? '') ?? REFUSAL_SENTENCES.get('platform_error')!;
/** Pay the rest on store's dialog (#1101 slice 3): the front desk's wording until slice 4 handles money given back. */
const GIVE_BACK = "If the money was given back, do not record it; a manager must check the order in the store's admin.";
const GIVE_BACK_INSTEAD = 'If the money was given back, use Give back and cancel instead.';
const GIVE = 'Give back any of this you have not already given back.';
const CLOSED_SESSION_NOTICE = "Taken in a session that has closed: a manager must settle this sale in the store's admin.";
const legLabel = (method: string) => (method === 'cash' ? 'Cash' : 'Card');
const legWording = (method: string, amount: string | undefined) => `${legLabel(method)} ${amount}: ${method === 'cash' ? 'hand it back from the drawer' : 'give it back on the card terminal'}`;
const methodLabel = (method: string) => (method === 'cash' ? 'Cash' : 'Card terminal');
const REOPEN_AGAIN_SENTENCE = "This order was changed in the online store after it was reopened here, so your change wasn't sent. Reopen the order and make the change again.";

/** Keeps an unparseable value as is, like medusapos's date util, since `Intl` throws on an invalid date. */
function defaultFormatDate(iso: string) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export type OrderSyncNoticesProps = {
  order: PosOrder;
  /** The outbox's `state.stuck`, as OrdersList takes it. */
  stuck?: OutboxState['stuck'];
  /** Rendered between the notes (note not sent) and the store's warnings: OrdersList's Retry goes here. */
  children?: ReactNode;
};

// #1280: only session_closed guarantees the store holds no order.
const NEEDS_ADMIN_SESSION_CLOSED = 'Not in the online store yet. A manager must finish this sale in the store admin.';
const NEEDS_ADMIN_SALE = 'Not finished in the online store. A manager must check this sale in the store admin.';

/** The per-sale sync notices OrdersList shows under each order, for an app's own order screen. */
export function OrderSyncNotices({ order, stuck, children }: OrderSyncNoticesProps) {
  const formatMoney = useFormatMoney();
  // The order's own stuck entry: its clock and latest reason, not the earliest across all stuck orders.
  const stuckEntry = order.syncStatus === 'pending' ? stuck?.orders.find((entry) => entry.commandId === order.commandId) : undefined;
  const needsAdminReason = stuckEntry ? needsAdminReasonOf(stuckEntry.reason) : undefined;
  const left = storeOrderLeft(order);
  // #1101: the store created this order, so invalid_payload's "a form the store can't read" would be wrong.
  const sentence = order.syncStatus === 'rejected'
    ? order.storeOrderId !== undefined && ['reopen_required', 'revision_conflict'].includes(order.error?.code ?? '')
      ? REOPEN_AGAIN_SENTENCE : refusalSentence(left && order.error?.code === 'invalid_payload' ? 'platform_error' : order.error?.code)
    : order.syncStatus === 'pending' && order.error?.code === UPDATE_UNSENDABLE ? UPDATE_UNSENDABLE_MESSAGE : undefined;
  const extras = extrasNotSent(order);
  // #1101: where the till's cancel, or pay of the rest, of the order the refused sale left on the store stands. Done, gone
  // and changed say it in place of the "left" line; refused and sending add to it. The store's code and message never show (#269).
  const kind = order.storeSettlement?.kind;
  const settlement = order.syncStatus === 'rejected' && (kind === 'cancel' || kind === 'pay' || (kind === 'reverse' && order.storeSettlement?.legs?.length)) ? order.storeSettlement : undefined;
  const reference = left?.reference ?? orderReference(order);
  const money = (amount: number) => formatMoney({ amount, currency: order.currency });
  const sum = (legs: { amountMinor: number }[]) => legs.reduce((total, leg) => total + leg.amountMinor, 0);
  const paidThere = settlement?.capturedMinor ? `: ${money(settlement.capturedMinor)} is paid there` : '';
  // A pay's R: what the store had recorded at the refusal, plus each leg this till has recorded since.
  const recorded = money((left?.recordedMinor ?? 0) + sum(settlement?.payments?.filter((payment) => payment.done) ?? []));
  // What this till has recorded on the stored pay, on this press or an earlier one: true in every state.
  const doneMinor = sum(settlement?.payments?.filter((payment) => payment.done) ?? []);
  const nothing = doneMinor > 0 ? `${money(doneMinor)} was recorded from this till.` : 'Nothing was recorded from this till.';
  let settledText = settlement?.kind === 'pay'
    ? settlement.state === 'done' ? `Order #${reference} is paid on the store.`
      : settlement.state === 'gone' ? `Order #${reference} is not on the store any more; ${recorded} was recorded on it.`
        : settlement.state !== 'changed' ? undefined
          : settlement.storeStatus === 'completed' ? `Order #${reference} is already paid on the store. ${nothing}`
            : `Order #${reference} changed on the store${paidThere}. ${nothing} Check it in the store's admin.`
    : settlement?.state === 'done' ? `Order #${reference} was cancelled on the store.${order.payments.length || kind === 'reverse'
      ? ` The till took: ${order.payments.map((leg) => legWording(leg.method, money(leg.amountMinor))).join('; ')}. ${GIVE}` : ''}`
      : settlement?.state === 'gone' ? `Order #${reference} was removed on the store.`
        : settlement?.state === 'changed' ? `Order #${reference} changed on the store${paidThere}. Nothing was cancelled from this till. Check it in the store's admin.`
          : undefined;
  const pay = settlement?.kind === 'pay';
  let addedText = settlement?.state === 'refused' ? pay
    ? `The store did not record the rest of order #${reference}: ${recorded} of ${money(order.totalMinor)} is recorded there. Check it in the store's admin.`
    : `The store did not cancel order #${reference}. Check it in the store's admin.`
    : settlement?.state === 'sending' ? pay ? `Recording the rest of order #${reference} on the store is not finished.`
      : `Cancelling order #${reference} on the store is not finished.` : undefined;
  if (settlement?.kind === 'reverse' && settlement.state !== 'done' && settlement.legs) {
    const legs = settlement.legs.flatMap((leg) => {
      const payment = order.payments.find(({ id }) => id === leg.paymentId);
      return payment ? [{ ...payment, done: leg.done }] : [];
    });
    const taken = legs.filter((leg) => leg.done).map((leg) => legWording(leg.method, money(leg.amountMinor))).join('; ');
    const still = legs.filter((leg) => !leg.done).map((leg) => `${legLabel(leg.method)} ${money(leg.amountMinor)}`).join('; ');
    const hasDone = settlement.legs.some((leg) => leg.done);
    const subject = `Order #${reference}`;
    settledText = undefined;
    addedText = undefined;
    if (settlement.state === 'gone') settledText = `${subject} is not on the store any more.${taken ? ` The store had taken off: ${taken}. ${GIVE}` : ''} Check it in the store's admin.`;
    else if (settlement.state === 'sending') addedText = `Cancelling order #${reference} on the store is not finished.${taken ? ` The store has taken off: ${taken}. ${GIVE}` : ''}${still ? ` Not confirmed taken off yet: ${still}. Keep that until this till shows the order cancelled.` : ''}`;
    else if (hasDone) addedText = `${subject} was not cancelled on the store.${taken ? ` The store has taken off: ${taken}. ${GIVE}` : ''}${still ? ` Still paid there: ${still}. Keep that; a manager must check it in the store's admin.` : ''}`;
    else if (settlement.state === 'refused') addedText = `The store did not cancel order #${reference}. Check it in the store's admin.`;
    else settledText = `${subject} changed on the store${paidThere}. Nothing was taken off it or cancelled from this till. Check it in the store's admin.`;
  }
  if ((kind === 'cancel' || kind === 'reverse') && order.storeSettlement?.code === TILL_SESSION_CLOSED) { settledText = undefined; addedText = CLOSED_SESSION_NOTICE; }
  // A pay gone with money recorded on the store is not settled (`settledOnStore`): it stays a destructive line.
  const settled = !!settlement && settledOnStore(order);
  return <>
    {stuckEntry ? <Text className="text-destructive">
      {/* A parked sale needs a manager; other retries keep the hour as the status line has it (numeric, #245), with no reason code. */}
      {needsAdminReason !== undefined
        ? needsAdminReason === 'session_closed' ? NEEDS_ADMIN_SESSION_CLOSED : NEEDS_ADMIN_SALE
        : `Hasn't reached the online store since ${sinceText(stuckEntry)}.`}
    </Text> : null}
    {/* The code's sentence alone: the cashier sees no error code and never the store's message. */}
    {sentence && !settled ? <Text className="text-destructive">{sentence}</Text> : null}
    {settledText ? <Text testID={`order-settlement-${order.id}`} className={settled ? 'text-foreground' : 'text-destructive'}>{settledText}</Text> : null}
    {/* What the store had recorded at the refusal, not the order's state now. */}
    {left && !settledText ? <Text testID={`order-left-on-store-${order.id}`} className="text-destructive">
      {left.recordedMinor === 0
        ? `Order #${left.reference} was left pending on the online store. Nothing was paid there.`
        : `Order #${left.reference} was left part paid on the online store: ${formatMoney({ amount: left.recordedMinor, currency: order.currency })} of ${formatMoney({ amount: order.totalMinor, currency: order.currency })}.`}
    </Text> : null}
    {addedText ? <Text testID={`order-settlement-${order.id}`} className="text-destructive">{addedText}</Text> : null}
    {/* A late sale (ADR-032) needs no Retry of its own; a rejected one still gets its Retry below. */}
    {order.lateSessionId !== undefined ? <Text className="text-foreground">Taken after the register closed. It is not in that register's closure.</Text> : null}
    {order.countedInClosureOf !== undefined ? <Text className="text-foreground">Recorded after the register closed. Its payment is in that register's closure.</Text> : null}
    {order.localWarnings?.map((warning, index) => <Text key={index} className="text-foreground">
      {warning.code === 'customer_omitted'
        ? `The customer's ${warning.field} couldn't be sent to the store, so the order isn't linked to them.`
        : "The terminal's payment reference couldn't be kept; the payment is recorded without it."}
    </Text>)}
    {noteDelivery(order) === 'not_sent' ? <Text testID={`order-note-not-sent-${order.id}`} className="text-foreground">{NOTE_NOT_SENT}</Text> : null}
    {extras.taxIds ? <Text testID={`order-tax-ids-not-sent-${order.id}`} className="text-foreground">{TAX_IDS_NOT_SENT}</Text> : null}
    {extras.meta ? <Text testID={`order-meta-not-sent-${order.id}`} className="text-foreground">{META_NOT_SENT}</Text> : null}
    {extras.skuLineIds.length ? <Text testID={`order-sku-not-sent-${order.id}`} className="text-foreground">
      {((ids) => `The edited ${ids.length === 1 ? 'SKU' : 'SKUs'} of ${order.lines.filter((line) => ids.includes(line.id)).map((line) => line.name).join(', ')} couldn't be sent to the store.`)(extras.skuLineIds)}
    </Text> : null}
    {children}
    {knownWarnings(order.warnings).filter((warning) => warning.code !== 'register_session_unknown').map((warning, index) => <View key={index} className="border-l-4 border-warning pl-2"><Text className="text-foreground">
      {warning.code === 'insufficient_stock'
        ? `${warning.quantity} sold without stock: ${order.lines.find((line) => line.variantId === warning.variantId)?.name}`
        : warning.code === 'tax_rate_mismatch'
        ? `Tax at ${(warning.ratePpm / 10000).toLocaleString(undefined, { maximumFractionDigits: 4 })}%: store ${formatMoney({ amount: warning.serverMinor, currency: order.currency })} vs POS ${formatMoney({ amount: warning.expectedMinor, currency: order.currency })}`
        : warning.code === 'customer_ignored'
        ? `The online store didn't recognise the customer on this sale, so it was saved as a guest sale. Customer id: ${warning.customerId}.`
        : warning.code === 'figures_mismatch'
        ? `The online store worked out different figures for this sale. ${warning.fields.map(({ field, tillMinor, serverMinor }) => `${FIGURE_LABELS.get(field) ?? field}: till ${formatMoney({ amount: tillMinor, currency: order.currency })}, store ${formatMoney({ amount: serverMinor, currency: order.currency })}.`).join(' ')}`
        : warning.code === 'line_figures_mismatch'
        ? ((n) => `The online store worked out different figures for ${n === 1 ? 'one line' : `${n} lines`} of this sale.`)(new Set(warning.lines.map((line) => line.lineId)).size)
        : warning.bridgeMinor !== undefined
        ? `Store calculated ${formatMoney({ amount: warning.serverMinor, currency: order.currency })}; a rounding line of ${warning.bridgeMinor > 0 ? '+' : ''}${formatMoney({ amount: warning.bridgeMinor, currency: order.currency })} brought it to ${formatMoney({ amount: warning.expectedMinor, currency: order.currency })}`
        : `Store total ${formatMoney({ amount: warning.serverMinor, currency: order.currency })} vs POS ${formatMoney({ amount: warning.expectedMinor, currency: order.currency })}`}
    </Text></View>)}
  </>;
}

/** The "Needs attention" (when not empty) and "Recent" orders, lifted from medusapos/app's orders screen (ADR-052).
 * `onRetry` is the outbox's `requeue`; `formatDate` replaces the app's date util; `footer` is the app's own content
 * (medusapos: the feedback link). The router and session redirect stay in the app. `stuck` is the outbox's
 * `state.stuck` (`useOrderOutbox`): those pending orders need attention too, each with its own entry's reason and since.
 * `onOpen` adds an Open button to each row that passes its order to the app.
 * `history` adds read-only store order rows to Recent (ADR-052 amendment 1).
 * `onReopen` adds Reopen to a Needs attention row the store refused with a reopenable code (`REOPENABLE_CODES`), not yet
 * reopened and with no store order: the app wires `reopenRefusedOrder`. When it refuses `coupon_carry_inexact` with a
 * `toCollectMinor`, the row offers "Reopen without the coupon", which calls it again with `{ withoutCoupons: true }`.
 * `onResume` adds Resume to a reopened row; the app resumes the parked sale, whose draft id is the order's id.
 * `openSessionId` must match the session of every till payment to offer or finish either store cancellation action.
 * `onCancelOnStore` adds "Cancel order on store" to a Needs attention row whose refused sale left an unpaid order on the
 * store (`canCancelOnStore`, #1101), asked in a confirm dialog first: the app wires `useOrderOutbox`'s `cancelOnStore`.
 * A cancel still `sending` is finished with no dialog. With it, such a row offers no Retry, except an `insufficient_stock`
 * refusal's, which reads "Try the payment again".
 * `onPayRestOnStore` adds "Pay the rest on store" to a Needs attention row whose refused sale left a part-paid order on
 * the store (`canPayRestOnStore`, #1101 slice 3), asked in a confirm dialog naming each leg to record (no money is taken):
 * the app wires `useOrderOutbox`'s `payRestOnStore`. A pay still `sending` is finished with no dialog. With it, a row
 * with money recorded on the store offers no Retry. */
export function OrdersList({ orders, onRetry, formatDate = defaultFormatDate, footer, stuck, history, onOpen, onReopen, onResume, onCancelOnStore, onPayRestOnStore, onReverseOnStore, openSessionId }: {
  orders: PosOrder[]; onRetry(orderIds: string[]): Promise<number>; formatDate?: (iso: string) => string; footer?: ReactNode;
  stuck?: OutboxState['stuck'];
  history?: OrderHistoryRow[];
  onOpen?: (row: PosOrder | OrderHistoryRow) => void;
  onReopen?: (order: PosOrder, options?: { withoutCoupons: true }) => Promise<void>;
  onResume?: (order: PosOrder) => void;
  openSessionId?: string;
  onCancelOnStore?: (order: PosOrder) => Promise<SettleOutcome | { kind: 'not_offered' }>;
  onPayRestOnStore?: (order: PosOrder) => Promise<SettleOutcome | { kind: 'not_offered' }>;
  onReverseOnStore?: (order: PosOrder) => Promise<SettleOutcome | { kind: 'not_offered' }>;
}) {
  const formatMoney = useFormatMoney();
  const hintId = useId();
  const retrying = useRef(new Set<string>());
  const [retryingIds, setRetryingIds] = useState(new Set<string>());
  /** Each row's Reopen: in flight, the inexact refusal's amount to collect, or the reason it was refused (null: none given). */
  const reopening = useRef(new Set<string>());
  const [reopens, setReopens] = useState(new Map<string, { busy?: true; toCollectMinor?: number; failed?: string | null }>());
  const setReopen = (id: string, state?: { busy?: true; toCollectMinor?: number; failed?: string | null }) => setReopens((current) => {
    const next = new Map(current);
    if (state) next.set(id, state); else next.delete(id);
    return next;
  });
  async function reopen(order: PosOrder, options?: { withoutCoupons: true }) {
    if (!onReopen || reopening.current.has(order.id)) return;
    reopening.current.add(order.id);
    setReopen(order.id, { ...reopens.get(order.id), busy: true });
    try {
      await onReopen(order, options);
      setReopen(order.id);
    } catch (error) {
      const reason = (error as { reason?: unknown } | undefined)?.reason;
      const toCollectMinor = (error as { toCollectMinor?: unknown } | undefined)?.toCollectMinor;
      setReopen(order.id, reason === 'coupon_carry_inexact' && typeof toCollectMinor === 'number' ? { toCollectMinor }
        : { failed: typeof reason === 'string' ? reason : null });
    } finally {
      reopening.current.delete(order.id);
    }
  }
  /** Each row's Cancel order on store (#1101): in flight, or the last press got no answer from the store. */
  const cancelling = useRef(new Set<string>());
  const [cancels, setCancels] = useState(new Map<string, 'busy' | 'failed'>());
  const [askingCancel, setAskingCancel] = useState<PosOrder | null>(null);
  const setCancel = (id: string, state?: 'busy' | 'failed') => setCancels((current) => {
    const next = new Map(current);
    if (state) next.set(id, state); else next.delete(id);
    return next;
  });
  async function cancelOnStore(order: PosOrder) {
    if (!onCancelOnStore || cancelling.current.has(order.id)) return;
    cancelling.current.add(order.id);
    setCancel(order.id, 'busy');
    try {
      const outcome = await onCancelOnStore(order);
      setCancel(order.id, outcome.kind === 'retry' ? 'failed' : undefined);
    } catch {
      setCancel(order.id, 'failed');
    } finally {
      cancelling.current.delete(order.id);
    }
  }
  /** Each row's Pay the rest on store (#1101 slice 3): in flight, the last press got no answer from the store, or the store
   * answered that the order is not completed there yet (`not_completed`). */
  const paying = useRef(new Set<string>());
  const [pays, setPays] = useState(new Map<string, 'busy' | 'failed' | 'unfinished'>());
  const [askingPay, setAskingPay] = useState<PosOrder | null>(null);
  const setPay = (id: string, state?: 'busy' | 'failed' | 'unfinished') => setPays((current) => {
    const next = new Map(current);
    if (state) next.set(id, state); else next.delete(id);
    return next;
  });
  async function payRestOnStore(order: PosOrder) {
    if (!onPayRestOnStore || paying.current.has(order.id)) return;
    paying.current.add(order.id);
    setPay(order.id, 'busy');
    try {
      const outcome = await onPayRestOnStore(order);
      setPay(order.id, outcome.kind !== 'retry' ? undefined : outcome.reason === 'not_completed' ? 'unfinished' : 'failed');
    } catch {
      setPay(order.id, 'failed');
    } finally {
      paying.current.delete(order.id);
    }
  }
  const reversing = useRef(new Set<string>());
  const [reverses, setReverses] = useState(new Map<string, 'busy' | 'failed'>());
  const [askingReverse, setAskingReverse] = useState<PosOrder | null>(null);
  async function reverseOnStore(order: PosOrder) {
    if (!onReverseOnStore || reversing.current.has(order.id)) return;
    reversing.current.add(order.id);
    setReverses((current) => new Map(current).set(order.id, 'busy'));
    let failed = false;
    try {
      failed = (await onReverseOnStore(order)).kind === 'retry';
    } catch { failed = true; } finally {
      reversing.current.delete(order.id);
      setReverses((current) => {
        const next = new Map(current);
        if (failed) next.set(order.id, 'failed'); else next.delete(order.id);
        return next;
      });
    }
  }
  const inOpenSession = (order: PosOrder) => openSessionId !== undefined && tillPayments(order.payments).every((payment) => (payment.sessionId ?? order.sessionId) === openSessionId);
  const [expanded, setExpanded] = useState(new Set<string>());
  useEffect(() => {
    for (const id of retrying.current) {
      if (!orders.some((order) => order.id === id && order.syncStatus === 'rejected')) retrying.current.delete(id);
    }
    setRetryingIds(new Set(retrying.current));
  }, [orders]);
  const shown = (history ?? []).filter((row) => row.clientOrderId === undefined || !orders.some((order) => order.id === row.clientOrderId));
  const recent = shown.length === 0 ? orders : [...orders, ...shown].sort((a, b) => {
    const aTime = Date.parse('placedAt' in a ? a.placedAt : a.createdAt);
    const bTime = Date.parse('placedAt' in b ? b.placedAt : b.createdAt);
    if (Number.isNaN(aTime)) return Number.isNaN(bTime) ? 0 : 1;
    if (Number.isNaN(bTime)) return -1;
    return bTime - aTime;
  });
  return <ScrollView className="flex-1 bg-background p-4">
    {[{ title: 'Needs attention', orders: needsAttention(orders, { stuckCommandIds: stuck?.commandIds }) }, { title: 'Recent', orders: recent }].filter((section) => section.title === 'Recent' || section.orders.length > 0).map((section, sectionIndex) => (
      <View key={section.title} className="mb-6 gap-3">
        <Text accessibilityRole="header" className="text-xl font-semibold text-foreground">{section.title}</Text>
        {section.title === 'Recent' && orders.length === 0 && shown.length === 0 ? <Text testID="orders-empty" className="text-muted-foreground">No sales yet. Completed sales appear here.</Text> : null}
        {section.orders.map((order) => {
          if ('placedAt' in order) {
            const row = order;
            return <View key={`history:${row.id}`} testID={`history-row-${row.id}`} className="gap-1 rounded-md border border-border bg-card p-3">
              <Text className="text-foreground">{`Order ${row.reference} · ${row.itemCount} ${row.itemCount === 1 ? 'item' : 'items'}`}</Text>
              <Text className="text-muted-foreground">{formatDate(row.placedAt)} · {formatMoney({ amount: row.totalMinor, currency: row.currency })} · {row.stateLabel}</Text>
              {onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Open order ${row.reference}`}
                testID={`history-open-${row.id}`} onPress={() => onOpen(row)}
                className="rounded-md border border-border px-4 py-2">
                <Text className="text-center font-semibold text-foreground">Open</Text>
              </Pressable> : null}
            </View>;
          }
          const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
          const refundDueMinor = refundDueOf(order);
          const key = `${section.title}:${order.id}`;
          const isExpanded = expanded.has(key);
          const attention = section.title === 'Needs attention';
          const reopenable = attention && !!onReopen && order.syncStatus === 'rejected' && REOPENABLE_CODES.includes(order.error?.code ?? '')
            && order.storeOrderId === undefined && order.reopenedAt === undefined;
          const reopenState = reopens.get(order.id);
          const cancelOffered = attention && !!onCancelOnStore && canCancelOnStore(order);
          const cancelState = cancels.get(order.id);
          const finishing = order.storeSettlement?.kind === 'cancel' && order.storeSettlement.state === 'sending';
          // #1101: with the cancel wired, an unpaid order left on the store is cancelled rather than resent, except a stock refusal.
          const left = storeOrderLeft(order);
          const payable = attention && !!onPayRestOnStore && canPayRestOnStore(order);
          const payState = pays.get(order.id);
          const finishingPay = order.storeSettlement?.kind === 'pay' && order.storeSettlement.state === 'sending';
          // #1101 slice 3: with the pay wired, a part-paid order left on the store has its rest recorded, never resent.
          const reverseOffered = attention && !!onReverseOnStore && canReverseOnStore(order);
          const closedSession = (cancelOffered || reverseOffered) && !inOpenSession(order);
          const cancellable = cancelOffered && !closedSession, reversible = reverseOffered && !closedSession;
          const reverseState = reverses.get(order.id), finishingReverse = order.storeSettlement?.kind === 'reverse' && order.storeSettlement.state === 'sending';
          const retryLabel = (onPayRestOnStore || onReverseOnStore) && left && left.recordedMinor > 0 ? undefined : onCancelOnStore && left?.recordedMinor === 0
            ? order.error?.code === 'insufficient_stock' ? 'Try the payment again' : undefined : 'Retry';
          return (
          <View key={order.id} className="gap-1 rounded-md border border-border bg-card p-3">
            {/* RN-web drops accessibilityHint; aria-describedby carries it on web. */}
            <Text id={`${hintId}-${sectionIndex}-${order.id}`} className="hidden">Shows the items and payments of this sale</Text>
            <Pressable accessibilityRole="button" aria-expanded={isExpanded} aria-describedby={`${hintId}-${sectionIndex}-${order.id}`}
              accessibilityHint="Shows the items and payments of this sale" testID={`order-row-${order.id}`} className="gap-1"
              onPress={() => setExpanded((current) => {
                const next = new Set(current);
                if (next.has(key)) next.delete(key); else next.add(key);
                return next;
              })}>
              <Text className="text-foreground">{`Order ${orderReference(order)} · ${count} ${count === 1 ? 'item' : 'items'}`}</Text>
              <Text className="text-muted-foreground">{formatDate(order.createdAt)} · {formatMoney({ amount: order.totalMinor, currency: order.currency })} · {STATUS_LABEL[order.syncStatus]}</Text>
            </Pressable>
            {onOpen ? <Pressable accessibilityRole="button" accessibilityLabel={`Open order ${orderReference(order)}`}
              testID={`order-open-${order.id}`} onPress={() => onOpen(order)}
              className="rounded-md border border-border px-4 py-2">
              <Text className="text-center font-semibold text-foreground">Open</Text>
            </Pressable> : null}
            {isExpanded ? <View testID={`order-detail-${order.id}`} className="mt-1 gap-1 border-t border-border pt-2">
              {order.lines.map((line) => <Text key={line.id} className="text-foreground">{`${line.quantity} × ${line.name}`}</Text>)}
              {order.payments.map((payment) => <Text key={payment.id} className="text-muted-foreground">
                {`${methodLabel(payment.method)} ${formatMoney({ amount: payment.amountMinor, currency: order.currency })}${payment.reference ? ` · ${payment.reference}` : ''}`}
              </Text>)}
              {refundDueMinor > 0 ? <Text testID={`order-refund-due-${order.id}`} className="text-foreground">
                {`Refund due ${formatMoney({ amount: refundDueMinor, currency: order.currency })}`}</Text> : null}
              {order.note ? <Text testID={`order-note-${order.id}`} className="text-foreground">{`Customer note: ${order.note}`}</Text> : null}
            </View> : null}
            <OrderSyncNotices order={order} stuck={stuck}>
            {/* Retry is offered only for an order the outbox resends (isRequeueableOrder). */}
            {section.title === 'Needs attention' && isRequeueableOrder(order) && retryLabel
              ? <Pressable accessibilityRole="button" disabled={retryingIds.has(order.id)} onPress={async () => {
                if (retrying.current.has(order.id)) return;
                retrying.current.add(order.id);
                setRetryingIds(new Set(retrying.current));
                if (await onRetry([order.id]) === 0) {
                  retrying.current.delete(order.id);
                  setRetryingIds(new Set(retrying.current));
                }
              }} className="rounded-md bg-primary px-4 py-2">
                <Text className="text-center font-semibold text-primary-foreground">{retryLabel}</Text>
              </Pressable> : null}
            {closedSession ? <Text className="text-muted-foreground">{CLOSED_SESSION_NOTICE}</Text> : null}
            {cancellable ? <Pressable accessibilityRole="button" testID={`order-${order.id}-cancel-on-store`} disabled={cancelState === 'busy'}
              onPress={() => {
                if (cancelling.current.has(order.id)) return;
                if (finishing) void cancelOnStore(order); else setAskingCancel(order);
              }} className="rounded-md border border-border px-4 py-2">
              <Text className="text-center font-semibold text-foreground">
                {cancelState === 'busy' ? 'Cancelling on store…' : finishing ? 'Finish cancelling on store' : 'Cancel order on store'}
              </Text>
            </Pressable> : null}
            {cancellable && cancelState === 'failed' ? <Text testID={`order-${order.id}-cancel-on-store-error`} className="text-muted-foreground">
              Could not reach the store. Try again.</Text> : null}
            {payable ? <Pressable accessibilityRole="button" testID={`order-${order.id}-pay-rest-on-store`} disabled={payState === 'busy'}
              onPress={() => {
                if (paying.current.has(order.id)) return;
                if (finishingPay) void payRestOnStore(order); else setAskingPay(order);
              }} className="rounded-md bg-primary px-4 py-2">
              <Text className="text-center font-semibold text-primary-foreground">
                {payState === 'busy' ? 'Recording on store…' : finishingPay ? 'Finish recording on store' : 'Pay the rest on store'}
              </Text>
            </Pressable> : null}
            {payable && (payState === 'failed' || payState === 'unfinished') ? <Text testID={`order-${order.id}-pay-rest-on-store-error`} className="text-muted-foreground">
              {payState === 'unfinished' ? "The store has not finished this order yet. Try again, or check it in the store's admin." : 'Could not reach the store. Try again.'}</Text> : null}
            {reversible ? <Pressable accessibilityRole="button" testID={`order-${order.id}-reverse-on-store`} disabled={reverseState === 'busy'}
              onPress={() => { if (finishingReverse) void reverseOnStore(order); else setAskingReverse(order); }} className="rounded-md border border-border px-4 py-2">
              <Text className="text-center font-semibold text-foreground">{reverseState === 'busy' ? 'Cancelling on store…' : finishingReverse ? 'Finish cancelling on store' : 'Give back and cancel'}</Text>
            </Pressable> : null}
            {reversible && reverseState === 'failed' ? <Text testID={`order-${order.id}-reverse-on-store-error`} className="text-muted-foreground">Could not reach the store. Try again.</Text> : null}
            {/* Reopen needs a reopenable code, which Retry never resends (NOT_REQUEUEABLE), so the two never show together. */}
            {attention && order.reopenedAt !== undefined ? <>
              <Text testID={`order-${order.id}-reopened`} className="text-muted-foreground">Reopened as a parked sale.</Text>
              {onResume ? <Pressable accessibilityRole="button" accessibilityLabel={`Resume order ${orderReference(order)}`}
                testID={`order-${order.id}-resume`} onPress={() => onResume(order)} className="rounded-md bg-primary px-4 py-2">
                <Text className="text-center font-semibold text-primary-foreground">Resume</Text>
              </Pressable> : null}
            </> : null}
            {reopenable && reopenState?.failed !== undefined ? <Text testID={`order-${order.id}-reopen-error`} className="text-muted-foreground">
              {reopenState.failed ? `This sale can't be reopened here (${reopenState.failed}).` : "This sale can't be reopened here."}
            </Text> : reopenable ? <>
              <Pressable accessibilityRole="button" accessibilityLabel={`Reopen order ${orderReference(order)}`} testID={`order-${order.id}-reopen`}
                disabled={reopenState?.busy} onPress={() => reopen(order)} className="rounded-md bg-primary px-4 py-2">
                <Text className="text-center font-semibold text-primary-foreground">Reopen</Text>
              </Pressable>
              {/* The inexact carry's choice is offered, never taken (desk 2026-11-21): its amount is the refusal's toCollectMinor. */}
              {reopenState?.toCollectMinor !== undefined ? <Pressable accessibilityRole="button" testID={`order-${order.id}-reopen-without-coupon`}
                disabled={reopenState.busy} onPress={() => reopen(order, { withoutCoupons: true })} className="rounded-md border border-border px-4 py-2">
                <Text className="text-center font-semibold text-foreground">
                  {`Reopen without the coupon: ${formatMoney({ amount: reopenState.toCollectMinor, currency: order.currency })} to collect`}
                </Text>
              </Pressable> : null}
            </> : null}
            </OrderSyncNotices>
          </View>
          );
        })}
      </View>
    ))}
    {askingCancel && inOpenSession(askingCancel) ? ((reference) => <ConfirmDialog testID={`order-${askingCancel.id}-cancel-on-store-dialog`} tone="destructive" open
      onOpenChange={(open) => { if (!open) setAskingCancel(null); }} title={`Cancel order #${reference} on the store?`}
      description={`Order #${reference} is waiting on the online store with nothing paid. This cancels it there. The payments taken on this till stay as they are.`}
      cancelLabel="Keep order" confirmLabel="Cancel order on store"
      onConfirm={() => { setAskingCancel(null); void cancelOnStore(askingCancel); }} />)(storeOrderLeft(askingCancel)?.reference ?? orderReference(askingCancel)) : null}
    {askingPay ? ((reference, legs, stored) => <ConfirmDialog testID={`order-${askingPay.id}-pay-rest-on-store-dialog`} tone="default" open
      onOpenChange={(open) => { if (!open) setAskingPay(null); }} title={`Record the rest of order #${reference} on the store?`}
      description={[...legs.filter((_leg, index) => !(stored?.kind === 'pay' && stored.payments?.length === legs.length && stored.payments[index].done))
        .map((leg) => `${methodLabel(leg.method)} ${formatMoney({ amount: leg.amountMinor, currency: askingPay.currency })}, already taken on this till.`),
        'No money is taken now.', onReverseOnStore && canReverseOnStore(askingPay) && inOpenSession(askingPay) ? GIVE_BACK_INSTEAD : GIVE_BACK].join('\n')}
      cancelLabel="Keep as is" confirmLabel="Record on store"
      onConfirm={() => { setAskingPay(null); void payRestOnStore(askingPay); }} />)(storeOrderLeft(askingPay)?.reference ?? orderReference(askingPay),
      // Only the legs still to record: the stored pay is index-aligned with them when the lengths match, as the outbox reuses it.
      unrecordedLegs(askingPay), askingPay.storeSettlement) : null}
    {askingReverse && inOpenSession(askingReverse) ? <ConfirmDialog testID={`order-${askingReverse.id}-reverse-on-store-dialog`} tone="destructive" open
      onOpenChange={(open) => { if (!open) setAskingReverse(null); }} title={`Give the money back and cancel order #${storeOrderLeft(askingReverse)?.reference ?? orderReference(askingReverse)}?`}
      description={[...askingReverse.payments.map((leg) => `${legWording(leg.method, formatMoney({ amount: leg.amountMinor, currency: askingReverse.currency }))}.`),
        'The store stops counting the payments it recorded and cancels the order.', 'Hand the money back once this till shows the order cancelled. If you already gave it back, go ahead.'].join('\n')}
      cancelLabel="Keep order" confirmLabel="Give back and cancel" onConfirm={() => { setAskingReverse(null); void reverseOnStore(askingReverse); }} /> : null}
    {footer}
  </ScrollView>;
}
