/**
 * The tender pane, laid out as WCPOS v2's (monorepo main, packages/core/src/screens/main/pos/checkout/tender/):
 * BalanceHeadline from ledger-pane.tsx, LedgerLegs (now tender-ledger.tsx's TenderLedger), then the method tiles, entry, quick-cash chips,
 * keypad and commit from tender-pane.tsx's TenderKeypad. Copy is read with useT, under v2's catalogue keys. Every figure
 * comes from pos (useSale's captured-only totals, tenderRounding, quickTenderedAmounts, planLegs).
 * The caption row and the hero figure follow tender-pane.tsx's caption row and AmountFigure (v2 :390-459).
 */
import { useEffect, useState, type ComponentProps, type JSX } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFormatMoney, minorUnitDigits, wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import {
  activePlan, CASH_PICK_ENTRIES_MAX, changeMinor, countsTowardPaid, evenSplitShareMinor, inMotionMinor, isInMotion, legStatus, lockedRefundDueMinor, nearestPayableCash, planLegs, quickTenderedAmounts, remainderEntriesMinor, roundedPickTarget, tenderRounding, tillLegsTheStoreRefuses, writeOffLeg,
  type TenderAction, type TenderKey, type TenderPlan, type TenderState, type useSale,
} from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { QUICK_CASH_STEPS } from '../checkout/cash-tendered';
import { useT } from '../i18n';
import { saleErrorText } from './sale-error-text';
import { DIGIT_ROWS, Keypad } from '../input/keypad';
import { offeredMethods, tenderOf } from './offered-methods';
import { heldTillLeg } from './held-leg';
import { CancelPaymentView, cancelLegs, legDescriptor, voidableLeg } from './cancel-payment-view';
import { cancelLine, TenderLedger } from './tender-ledger';
import { pickFigure } from './use-tender';
import { BanknoteIcon } from '../ui/icon/banknote-icon';
import { CreditCardIcon } from '../ui/icon/credit-card-icon';

type Sale = ReturnType<typeof useSale>;
type Leg = Sale['order']['payments'][number];

export interface TenderPaneProps {
  sale: Sale;
  /** The tender reducer's state (`tenderReducer` in @tallyui/pos); the host owns the reducer. */
  state: TenderState;
  dispatch: (action: TenderAction) => void;
  /** Defaults to `defaultPaymentMethods()`. Each manual-capture method is offered, recorded as its wire method (`wireMethodOf`) plus its own id. */
  methods?: PaymentMethodDescriptor[];
  /** Draws the payments ledger in the pane. Pass `false` when the host shows it in the cart column, as v2 does (Cart's `tenderLedger`). Default `true`. */
  ledger?: boolean;
  /** Draws the Back button: `sale.cancelTender`, or the cancel-payment view first when money was taken here. Pass `false` when the host leaves the tender stage itself, as v2's phone checkout does. Default `true`. */ back?: boolean;
  /** Passed to the ledger: v2's "Cancel this payment?" before a leg is voided. Default `false`: Cancel payment voids at once. */
  confirmVoid?: boolean;
  /** Passed to the ledger: runs before Cancel payment voids a leg; the void waits for it, and `false` or a throw keeps the leg. */
  beforeVoid?: ComponentProps<typeof TenderLedger>['beforeVoid'];
  /** Passed to the ledger: runs after a void `beforeVoid` approved, with whether the leg was voided; `false` means the host reverses its journal entry. */
  afterVoid?: ComponentProps<typeof TenderLedger>['afterVoid'];
}

/** order.create's bound on `payments[].reference`, in UTF-16 units. */
const REFERENCE_MAX = 255;
/** v2 tender-pane.tsx: five method tiles a row on a wide pane (TileGrid columns). */
const TILE_COLUMNS = 5;
/** v2 tender-pane.tsx keypadRows: 123 / 456 / 789, then C, 0, backspace. No decimal key: digits shift in from the right. */
const keypadRows = (t: ReturnType<typeof useT>) => [...DIGIT_ROWS,
  [{ name: 'clear', label: t('pos_checkout.clear_amount'), text: 'C' }, { name: '0', label: '0' }, { name: 'backspace', label: t('common.backspace'), text: '⌫' }]];
const button = 'min-h-11 justify-center rounded-md border border-border bg-card px-4 py-2';
/** v2 tender-pane.tsx "Split the rest" strip: 2 to 6 equal ways. */
const SPLIT_WAYS = [2, 3, 4, 5, 6];

/** The captured legs in ledger order excluding `plan.before`, or sliced from `plan.from` when `before` is absent. */
const rowsSince = (payments: readonly Leg[], plan: TenderPlan | null) => {
  const captured = payments.filter(countsTowardPaid);
  const before = plan?.before;
  return (before ? captured.filter((leg) => !before.includes(leg.id)) : captured.slice(plan?.from ?? 0))
    .map((leg) => ({ title: leg.method, amountMinor: leg.amountMinor }));
};

export function TenderPane({ sale, state, dispatch, methods, ledger = true, back = true, confirmVoid, beforeVoid, afterVoid }: TenderPaneProps): JSX.Element | null {
  const formatMoney = useFormatMoney();
  const { order, stage } = sale;
  const t = useT();
  const [reference, setReference] = useState('');
  const [refusal, setRefusal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const balance = order.balanceDueMinor;
  // Leaving the tender stage ends the cancel-payment view (state adjusted while rendering, so it never outlives the stage).
  if (stage.kind !== 'tender' && cancelling) setCancelling(false);
  // The ledger changed (a leg taken or voided) and the entry is untouched: pre-type the next leg or plan share.
  useEffect(() => {
    if (!state.entryDirty) dispatch({ type: 'tender-recorded', rowsSinceFrom: rowsSince(order.payments, state.plan), balanceMinor: balance });
  }, [order.payments, balance, state.entryDirty, state.plan, dispatch]);
  const legsKey = order.payments.map((leg) => `${leg.id}:${legStatus(leg)}`).join(',');
  useEffect(() => setRefusal(false), [legsKey]);
  if (stage.kind !== 'tender') return null;

  const offered = offeredMethods(methods);
  const descriptorOf = (id: string) => offered.find((method) => method.id === id);
  const money = (minor: number) => formatMoney({ amount: minor, currency: order.currency }) ?? '';
  const method = state.methodId ? descriptorOf(state.methodId) ?? null : null;
  // ADR-072: change comes only from cash, so a non-cash method's `change: true` gives none (take() records no change for it).
  const givesChange = method !== null && wireMethodOf(method) === 'cash' && method.capabilities.change === true;
  const pick = state.plan || Object.keys(state.pickedUnits).length === 0 ? null : pickFigure(order, state.pickedUnits);
  const target = pick ? Math.min(pick.minor, balance - inMotionMinor(order.payments)) : balance;
  const partPick = pick !== null && target < balance;
  // ADR-094: the pane rounds exactly when addTender does: only on a store whose connector declares cashRounding, and only while no leg is in motion.
  const rounds = sale.capabilities?.cashRounding === true && inMotionMinor(order.payments) === 0;
  // ADR-094 item 7 (carry): a cash part pick rounds its target less the live entries; addTender rounds the leg, the pane shows the same figure.
  const pickRounding = rounds && method !== null && wireMethodOf(method) === 'cash' && method.capture.mode === 'manual' && method.defaults.rounding ? method.defaults.rounding : null;
  const entries = remainderEntriesMinor(order);
  const pickTarget = partPick ? roundedPickTarget(target, pickRounding, entries) : target;
  const entry = state.entryDirty ? state.entryMinor : pickTarget;
  const figures = partPick ? tenderRounding({ entryMinor: entry, entryDirty: state.entryDirty }, pickTarget, null) : tenderRounding(state, balance, rounds ? method : null, entries);
  // Promotion: a carried pick at the whole-settle due is taken as that settle (addTender), so it meets the settle's 16-entry cap.
  const promoted = partPick && pickRounding !== null && pickTarget === tenderRounding(state, balance, method, entries).roundedDueMinor;
  // "Rounded from": a pick's own goods when its amount differs from them; a settle's balance.
  const roundedFrom = promoted ? (pickTarget !== balance ? balance : null) : partPick ? (pickTarget !== target ? target : null) : figures.roundingMinor !== 0 ? balance : null;
  const cashNotPayable = rounds && pick === null && method !== null && wireMethodOf(method) === 'cash' && method.capture.mode === 'manual' && method.defaults.rounding
    && figures.roundingMinor === 0 && figures.appliedMinor < figures.roundedDueMinor
    ? nearestPayableCash(figures.entryMinor, method.defaults.rounding.incrementMinor) : null;
  const cashWaits = sale.capabilities?.cashRounding === true && inMotionMinor(order.payments) > 0 && method !== null
    && wireMethodOf(method) === 'cash' && method.capture.mode === 'manual' && method.defaults.rounding && (partPick
      ? nearestPayableCash(target, method.defaults.rounding.incrementMinor) !== null
      : figures.entryMinor > 0 && nearestPayableCash(Math.min(figures.entryMinor, balance - inMotionMinor(order.payments)), method.defaults.rounding.incrementMinor) !== null);
  // order-payload-shape.ts's 16-entry cap: a pick that would add an entry is refused once the sale has CASH_PICK_ENTRIES_MAX.
  const pickLimit = partPick && !promoted && pickTarget !== target && (order.cashRoundings ?? []).length >= CASH_PICK_ENTRIES_MAX;
  const pickRefused = (partPick && entry > 0 && (givesChange ? entry < pickTarget : entry !== pickTarget))
    || (pick !== null && !partPick && figures.appliedMinor > 0 && figures.appliedMinor < figures.roundedDueMinor);
  // Row 500: judged against the due less the legs in motion, as addTender records the leg's change.
  // ADR-094: a cash due rounded to nothing still settles the sale (v2 tender-pane.tsx:1062), where the store's connector declares cashRounding.
  const zeroDue = sale.capabilities?.cashRounding === true && !partPick && figures.roundedDueMinor === 0 && figures.roundingMinor !== 0
    && inMotionMinor(order.payments) === 0;
  // The 16-entry cap as addTender applies it: a settle that adds an entry is refused at 16; a write-off onto a leg with one is not.
  const lastCounted = writeOffLeg(order);
  const settleLimit = ((!partPick && sale.capabilities?.cashRounding === true && figures.roundingMinor !== 0) || (promoted && pickTarget !== balance))
    && (order.cashRoundings ?? []).length > CASH_PICK_ENTRIES_MAX
    && !(zeroDue && lastCounted !== undefined && (order.cashRoundings ?? []).some((e) => e.paymentId === lastCounted.id));
  // With no other method, a cash-only store frees an entry by voiding its latest rounded cash leg, which no later cash leg's entry blocks; offered methods are all manual capture.
  const otherWay = offered.some((m) => !(wireMethodOf(m) === 'cash' && m.defaults.rounding));
  const lastRounded = order.payments.filter(countsTowardPaid).filter((leg) => leg.method === 'cash' && (order.cashRoundings ?? []).some((e) => e.paymentId === leg.id)).at(-1);
  const entryChange = zeroDue ? 0 : partPick ? changeMinor(figures.entryMinor, figures.appliedMinor, givesChange)
    : changeMinor(figures.entryMinor, Math.min(figures.appliedMinor, Math.max(0, balance - inMotionMinor(order.payments)) + figures.roundingMinor), givesChange);
  // What Take can still pay: pos caps a leg at the balance less the legs in motion (use-sale.ts addTender).
  const dueNow = Math.max(0, balance - inMotionMinor(order.payments));
  const left = dueNow + figures.roundingMinor - figures.appliedMinor;
  const noChange = !partPick && method !== null && !givesChange && figures.entryMinor > balance;
  // Take records only dueNow here (pos caps the leg), so the hint names it without blocking.
  const capped = !partPick && method !== null && !givesChange && dueNow > 0 && figures.entryMinor > dueNow;
  const cannotTake = (figures.appliedMinor <= 0 && !zeroDue) || (partPick && pickTarget === 0) || noChange || pickRefused || cashNotPayable !== null || cashWaits || pickLimit || settleLimit || (!partPick && balance - inMotionMinor(order.payments) <= 0);
  const changeLeads = !cannotTake && entryChange > 0;
  // v2 tender-pane.tsx:405-410: the caption names the balance only when it differs from the figure shown.
  const balanceInCaption = balance === 0 || figures.entryMinor !== balance;
  const rows = rowsSince(order.payments, state.plan).map(({ title, amountMinor }) => ({ title, minor: amountMinor }));
  const plan = activePlan(state.plan, rows.length, balance);
  const planned = plan ? planLegs(plan, rows, balance) : null;
  const counted = order.payments.filter(countsTowardPaid).length;
  const splitOn = state.splitView || plan !== null;
  // v2 tender-figures.ts: a typed part payment comes first, and the ways divide what is left after it.
  const typed = state.entryDirty && figures.appliedMinor > 0 && figures.appliedMinor < balance;
  const restMinor = balance - (typed ? (partPick ? target : figures.appliedMinor) : 0);
  const thisPaymentMinor = planned ? planned.thisPaymentMinor : balance;
  const dueMinor = partPick ? pickTarget : planned && planned.thisPaymentMinor < balance ? planned.thisPaymentMinor : figures.roundedDueMinor;
  const chips = givesChange ? quickTenderedAmounts(dueMinor, QUICK_CASH_STEPS.map((step) => step * 10 ** minorUnitDigits(order.currency))) : [];
  // v2 tender-pane.tsx:942-954: a method that gives no change gets one chip setting the entry to the due figure; hidden in percent entry, as v2 does.
  const balanceChip = method !== null && !givesChange && state.entryMode !== 'percent' ? dueMinor : null;
  const unstamped = order.payments.filter((leg) => leg.takenAt === undefined && !sale.tenderHeld(leg.id));
  const [prefill] = unstamped;
  // startTender('external')'s one unstamped card leg for the rest, beside any kept taken or voided legs: its reference is edited in place.
  const cardReference = unstamped.length === 1 && prefill.method === 'external' && legStatus(prefill) === 'captured' && balance === 0;
  const hint = cashNotPayable ? (cashNotPayable.belowMinor === 0 ? t('pos_checkout.cash_not_payable_above', { above: money(cashNotPayable.aboveMinor) })
    : t('pos_checkout.cash_not_payable', { below: money(cashNotPayable.belowMinor), above: money(cashNotPayable.aboveMinor) }))
    : cashWaits ? t('pos_checkout.cash_waits_for_payment')
    : pickLimit ? t('pos_checkout.cash_pick_limit')
    : settleLimit ? (otherWay ? t('pos_checkout.cash_settle_limit')
      : lastRounded && voidableLeg(order, offered, lastRounded) ? t('pos_checkout.cash_settle_limit_void', { amount: money(lastRounded.amountMinor) })
        : t('pos_checkout.cash_settle_limit_park', { amount: lastRounded ? money(lastRounded.amountMinor) : '' }))
    : partPick ? (pickTarget === 0 ? t('pos_checkout.pick_rounds_to_nothing')
    : pickRefused || entry === pickTarget ? t('pos_checkout.pick_amount_due', { amount: money(pickTarget) })
    : givesChange && entry > pickTarget ? (cannotTake ? '' : t('pos_checkout.change_due', { amount: money(entry - pickTarget) })) : '')
    : pickRefused ? t('pos_checkout.pick_amount_due', { amount: money(figures.roundedDueMinor) })
    : capped || (noChange && dueNow === balance) ? t('pos_checkout.no_change_for_method', { amount: money(dueNow), method: method?.title })
    : zeroDue ? ''
    : entryChange > 0 ? (cannotTake ? '' : t('pos_checkout.change_due', { amount: money(entryChange) }))
      : !cannotTake && figures.appliedMinor < dueNow && figures.entryMinor > 0 ? t('pos_checkout.part_payment_left', { left: money(left) }) : '';
  // ADR-090 gate 36c: once the store's legs cover the total, finalize refuses every till leg; name them and offer their void.
  const refused = tillLegsTheStoreRefuses(order);
  const refusedLegs = order.payments.filter((leg) => refused.includes(leg.id));
  const refusedMinor = refusedLegs.reduce((total, leg) => total + leg.amountMinor, 0);
  // A refused leg the till cannot void (held, or refund-only) leaves the sale only able to park (ADR-072 d3, amended 2026-11-22).
  const kept = refusedLegs.filter((leg) => !voidableLeg(order, offered, leg));
  const canComplete = balance === 0 && !order.payments.some(isInMotion) && refused.length === 0;
  // ADR-090 gate 36 (desk Q4): changeDueMinor counts locked legs; what they hold beyond the total is the store's refund due, never till change.
  const refundDue = Math.min(order.changeDueMinor, lockedRefundDueMinor(order));
  const tillChange = order.changeDueMinor - refundDue + order.payments.reduce((sum, leg) => sum + (!leg.locked && countsTowardPaid(leg) ? leg.changeMinor ?? 0 : 0), 0);

  function take() {
    if (!method || pickRefused) return;
    const tender = tenderOf(method);
    // No pick stands (a plan is set, or nothing is picked): the leg carries no units. Otherwise it carries the picks that stand (pickFigure), never the raw ones.
    const units = pick === null ? {} : { units: pick.picks };
    const id = tender.method === 'cash'
      ? sale.addTender({ ...tender, ...units, amountMinor: partPick ? target : figures.entryMinor, ...(partPick ? { tenderedMinor: entry, ...(method.capture.mode === 'manual' && method.defaults.rounding ? { rounding: method.defaults.rounding } : {}) } : {}),
        ...(!partPick && method.capture.mode === 'manual' && method.defaults.rounding ? { rounding: method.defaults.rounding } : {}) })
      : sale.addTender({ ...tender, ...units, amountMinor: partPick ? target : figures.appliedMinor, ...(reference ? { reference } : {}) });
    if (id === null) { setRefusal(true); return; }
    setRefusal(false);
    setReference('');
    // A zero-due settle returns the leg its entry went on, which already holds its own units.
    dispatch({ type: 'tender-started', paymentId: id, units: pick === null || zeroDue ? {} : pick.picks });
  }

  if (cancelling) return <View dataSet={{ print: 'hide' }} testID="tender-pane" className="gap-4 p-4">
    <CancelPaymentView sale={sale} methods={methods} beforeVoid={beforeVoid} afterVoid={afterVoid} onClose={() => setCancelling(false)} />
  </View>;

  return <View dataSet={{ print: 'hide' }} testID="tender-pane" className="gap-4 p-4">
    <View testID="tender-headline" className="items-center gap-1">
      <View className="flex-row flex-wrap items-center justify-center gap-2">
        <Text testID="tender-caption" className="text-xs uppercase tracking-wide text-muted-foreground">
          {order.paidMinor > 0 ? t('pos_checkout.remaining') : t('pos_checkout.to_pay')}
          {balanceInCaption ? <>{' '}<Text testID="tender-balance">{money(balance)}</Text></> : null}
        </Text>
        {balance > 0 ? <Pressable testID="tender-split-chip" accessibilityRole="button" aria-pressed={splitOn} className={cn(button, splitOn && 'border-primary bg-muted')}
          onPress={() => {
            if (splitOn) {
              dispatch({ type: 'clear-plan', balanceMinor: balance });
              for (const lineId of Object.keys(state.pickedUnits)) dispatch({ type: 'set-split-units', lineId, units: 0, unpaidUnits: 0 });
            } else dispatch({ type: 'open-split' });
          }}>
          <Text className="font-semibold text-foreground">{t('pos_checkout.split')}</Text>
        </Pressable> : null}
      </View>
      {order.paidMinor > 0 ? <Text testID="tender-paid" className="text-sm text-muted-foreground">{t('pos_checkout.paid_of_total', { paid: money(order.paidMinor), total: money(order.totalMinor) })}</Text> : null}
      {tillChange > 0 ? <Text testID="tender-change" className="text-lg font-semibold text-success">{t('pos_checkout.change_due', { amount: money(tillChange) })}</Text> : null}
      {refundDue > 0 ? <Text testID="tender-refund-due" className="text-lg font-semibold text-foreground">{t('pos_checkout.refund_due', { amount: money(refundDue) })}</Text> : null}
    </View>

    {balance > 0 ? <View testID="tender-figure" className="items-center gap-1">
      {changeLeads ? <>
        <Text testID="tender-entry-hint" className="text-4xl font-bold text-success">{hint}</Text>
        <Text testID="tender-tendered-line" className="min-h-6 text-sm text-muted-foreground">{t('pos_checkout.tendered')} <Text testID="tender-entry-amount" className="font-semibold text-foreground">{money(figures.entryMinor)}</Text>{order.totalMinor !== balance ? ` · ${t('common.total')} ${money(order.totalMinor)}` : ''}</Text>
        {roundedFrom !== null ? <Text className="text-sm text-muted-foreground">{t('pos_checkout.rounded_from', { amount: money(roundedFrom) })}</Text> : null}
      </> : <>
        <Text testID="tender-entry-amount" className={cn('text-4xl font-bold text-foreground', !state.entryDirty && 'opacity-70')}>{money(figures.entryMinor)}</Text>
        {roundedFrom !== null ? <Text className="text-sm text-muted-foreground">{t('pos_checkout.rounded_from', { amount: money(roundedFrom) })}</Text> : null}
        <Text testID="tender-entry-hint" className={cn('min-h-6 text-center text-sm', noChange || capped || pickRefused || cashWaits || pickLimit || settleLimit ? 'text-warning-text' : 'text-muted-foreground')}>{hint}</Text>
      </>}
    </View> : null}

    {ledger ? <TenderLedger sale={sale} methods={methods} confirmVoid={confirmVoid} beforeVoid={beforeVoid} afterVoid={afterVoid} /> : null}

    {/* cardReference holds only for an external leg; the edit keeps that leg's method and its own methodId. */}
    {cardReference ? <TextInput accessibilityLabel={t('tender.terminal_reference')} placeholder={t('tender.terminal_reference')} maxLength={REFERENCE_MAX}
      value={prefill.reference ?? ''} onChangeText={(text) => sale.setTender({ method: 'external', ...(prefill.methodId !== undefined ? { methodId: prefill.methodId } : {}), amountMinor: prefill.amountMinor, reference: text })}
      className="rounded-md border border-border px-3 py-2 text-foreground" /> : null}

    {balance > 0 ? <View testID="tender-entry" className="gap-3">
      <View testID="tender-methods" className="w-full gap-2">
        {Array.from({ length: Math.ceil(offered.length / TILE_COLUMNS) }, (_, row) => (
          <View key={row} className="flex-row gap-2">
            {Array.from({ length: TILE_COLUMNS }, (_, column) => {
              const tile = offered[row * TILE_COLUMNS + column];
              if (!tile) return <View key={column} className="min-w-0 flex-1" />;
              const selected = tile.id === state.methodId;
              const Icon = tile.kind === 'cash' ? BanknoteIcon : CreditCardIcon;
              return <View key={tile.id} className="min-w-0 flex-1">
                <Pressable key={tile.id} testID={`tender-method-${tile.id}`} accessibilityRole="button" accessibilityState={{ selected: tile.id === state.methodId }}
                  // react-native-web does not render accessibilityState.selected.
                  aria-selected={tile.id === state.methodId}
                  onPress={() => dispatch({ type: 'pick-method', methodId: tile.id, prefillMinor: state.view === 'amount' ? state.entryMinor : thisPaymentMinor, readerId: null })}
                  className={cn('min-h-16 items-center justify-center gap-1 rounded-md border bg-card px-2 py-2', selected ? 'border-primary bg-muted' : 'border-border')}>
                  <Icon size={20} testID={`tender-method-${tile.id}-icon`} />
                  <Text numberOfLines={2} className="text-center font-semibold text-foreground">{tile.title}</Text>
                </Pressable>
              </View>;
            })}
          </View>
        ))}
      </View>
      {planned ? <Text testID="tender-plan" className="text-sm text-muted-foreground">{t('pos_checkout.n_of_ways', { n: planned.label.n, ways: planned.label.ways })}</Text> : null}
      {method && wireMethodOf(method) === 'external' ? <TextInput accessibilityLabel={t('tender.terminal_reference')} placeholder={t('tender.terminal_reference')} maxLength={REFERENCE_MAX}
        value={reference} onChangeText={setReference} className="rounded-md border border-border px-3 py-2 text-foreground" /> : null}
      {state.splitView && !plan ? <>
        <Text testID="tender-split-heading" className="text-center text-sm text-muted-foreground">
          {typed ? t('pos_checkout.after_this_payment', { amount: money(restMinor) }) : t('pos_checkout.split_the_rest')}
        </Text>
        <ScrollView horizontal testID="tender-split-ways" showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="grow gap-2">
          {SPLIT_WAYS.map((count) => <View key={count} className="min-w-28 flex-1">
            <Pressable testID={`tender-split-even-${count}`} accessibilityRole="button"
              onPress={() => dispatch({ type: 'set-plan', balanceMinor: balance, plan: typed
                ? { kind: 'fixed', firstMinor: figures.appliedMinor, title: null, thenWays: count, from: counted, before: order.payments.map((leg) => leg.id) }
                : { kind: 'even', ways: count, from: counted, before: order.payments.map((leg) => leg.id) } })}
              className="min-h-16 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-2">
              <Text className="font-semibold text-foreground">{t('pos_checkout.n_ways', { ways: count })}</Text>
              <Text className="text-sm text-muted-foreground">{t('pos_checkout.amount_each', { amount: money(evenSplitShareMinor(restMinor, count)) })}</Text>
            </Pressable>
          </View>)}
        </ScrollView>
      </> : null}
      {chips.length || balanceChip !== null || cashNotPayable ? <View testID="tender-quick" className="flex-row flex-wrap justify-center gap-2">
        {cashNotPayable ? [cashNotPayable.belowMinor, cashNotPayable.aboveMinor].filter((minor) => minor !== 0).map((minor) => <Pressable key={minor}
          testID={minor === cashNotPayable.belowMinor ? 'tender-payable-below' : 'tender-payable-above'} accessibilityRole="button" onPress={() => dispatch({ type: 'set-entry', minor })} className={button}>
          <Text className="font-semibold text-foreground">{money(minor)}</Text>
        </Pressable>) : null}
        {chips.map((minor, index) => <Pressable key={minor} testID={index === 0 ? 'tender-quick-exact' : `tender-quick-${minor}`} accessibilityRole="button"
          onPress={() => dispatch({ type: 'set-entry', minor })} className={cn(button, state.entryDirty && figures.entryMinor === minor && 'border-primary')}>
          <Text className="font-semibold text-foreground">{index === 0 ? t('pos_checkout.exact_amount', { amount: money(minor) }) : money(minor)}</Text>
        </Pressable>)}
        {balanceChip !== null ? <Pressable testID="tender-quick-balance" accessibilityRole="button"
          onPress={() => dispatch({ type: 'set-entry', minor: balanceChip })} className={cn(button, state.entryDirty && figures.entryMinor === balanceChip && 'border-primary')}>
          <Text className="font-semibold text-foreground">{plan ? t('pos_checkout.exact_amount', { amount: money(balanceChip) })
            : figures.entryMinor === balanceChip ? t('pos_checkout.full_balance_label') : t('pos_checkout.full_balance', { amount: money(balanceChip) })}</Text>
        </Pressable> : null}
      </View> : null}
      <Keypad testID="tender-keypad" rows={keypadRows(t)} onPress={(name) => dispatch({ type: 'key', key: name as TenderKey })} />
      {refusal ? <Text accessibilityRole="alert" className="text-destructive">{t('tender.not_taken')}</Text> : null}
      {method ? <Pressable testID="tender-take" accessibilityRole="button" disabled={cannotTake}
        onPress={take} className={cn('rounded-md bg-primary px-4 py-3', cannotTake && 'opacity-50')}>
        <Text className="text-center font-semibold text-primary-foreground">{t('pos_checkout.take_amount_in', { amount: money(figures.appliedMinor), method: method.title })}</Text>
      </Pressable> : null}
    </View> : null}

    {refused.length > 0 ? <>
      <Text testID="tender-store-holds" className="text-foreground">{kept.length ? t('pos_checkout.store_holds_park', { amount: money(kept.reduce((total, leg) => total + leg.amountMinor, 0)) })
        : t('pos_checkout.store_holds_payment', { amount: money(refusedMinor) })}</Text>
      {refusedLegs.filter((leg) => !heldTillLeg(order, leg)).map((leg) => voidableLeg(order, offered, leg)
        ? <Pressable key={leg.id} testID={`tender-leg-${leg.id}-refused-void`} accessibilityRole="button" onPress={() => sale.voidTender(leg.id)} className={button}>
          <Text className="text-center text-foreground">{t('pos_checkout.cancel_payment')}</Text>
        </Pressable>
        : <Text key={leg.id} testID={`tender-leg-${leg.id}-refused-refund`} className="text-foreground">{cancelLine(t, money, leg, legDescriptor(offered, leg), false, leg.amountMinor)}</Text>)}
    </> : null}
    <Pressable testID="tender-complete" accessibilityRole="button" disabled={!canComplete} onPress={sale.complete}
      className={cn('rounded-md bg-primary px-4 py-3', !canComplete && 'opacity-50')}>
      <Text className="text-center font-semibold text-primary-foreground">{t('tender.complete_sale')}</Text>
    </Pressable>
    {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{saleErrorText(t, sale.error)}</Text> : null}
    {sale.canContinue ? <>
      <Text className="text-foreground">{t('tender.stored_will_send')}</Text>
      <Pressable accessibilityRole="button" onPress={() => sale.continueSale()} className="rounded-md bg-primary px-4 py-3">
        <Text className="text-center font-semibold text-primary-foreground">{t('tender.continue')}</Text>
      </Pressable>
    </> : null}
    {back ? <Pressable accessibilityRole="button" onPress={() => (cancelLegs(order).length ? setCancelling(true) : sale.cancelTender())} className={button}><Text className="text-center text-foreground">{t('common.back')}</Text></Pressable> : null}
  </View>;
}
