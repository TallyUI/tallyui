/**
 * The tender pane, laid out as WCPOS v2's (monorepo main, packages/core/src/screens/main/pos/checkout/tender/):
 * BalanceHeadline from ledger-pane.tsx, LedgerLegs (now tender-ledger.tsx's TenderLedger), then the method tiles, entry, quick-cash chips,
 * keypad and commit from tender-pane.tsx's TenderKeypad. Copy is read with useT, under v2's catalogue keys. Every figure
 * comes from pos (useSale's captured-only totals, tenderRounding, quickTenderedAmounts, planLegs).
 * The caption row and the hero figure follow tender-pane.tsx's caption row and AmountFigure (v2 :390-459).
 */
import { useEffect, useState, type JSX } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useFormatMoney, minorUnitDigits, wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import {
  activePlan, changeMinor, countsTowardPaid, evenSplitShareMinor, isInMotion, legStatus, lockedRefundDueMinor, planLegs, quickTenderedAmounts, tenderRounding, tillLegsTheStoreRefuses,
  type TenderAction, type TenderKey, type TenderState, type useSale,
} from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { QUICK_CASH_STEPS } from '../checkout/cash-tendered';
import { useT } from '../i18n';
import { DIGIT_ROWS, Keypad } from '../input/keypad';
import { offeredMethods, tenderOf } from './offered-methods';
import { TenderLedger } from './tender-ledger';
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
  /** Draws the Back button (`sale.cancelTender`). Pass `false` when the host leaves the tender stage itself, as v2's phone checkout does. Default `true`. */ back?: boolean;
  /** Passed to the ledger: v2's "Cancel this payment?" before a leg is voided. Default `false`: Cancel payment voids at once. */
  confirmVoid?: boolean;
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

/** The captured legs since the plan began, as the reducer's `tender-recorded` and `planLegs` read them. */
const rowsSince = (payments: readonly Leg[], from: number) =>
  payments.filter(countsTowardPaid).slice(from).map((leg) => ({ title: leg.method, amountMinor: leg.amountMinor }));

export function TenderPane({ sale, state, dispatch, methods, ledger = true, back = true, confirmVoid }: TenderPaneProps): JSX.Element | null {
  const formatMoney = useFormatMoney();
  const { order, stage } = sale;
  const t = useT();
  const [reference, setReference] = useState('');
  const [refusal, setRefusal] = useState(false);
  const balance = order.balanceDueMinor;
  // The ledger changed (a leg taken or voided) and the entry is untouched: pre-type the next leg or plan share.
  useEffect(() => {
    if (!state.entryDirty) dispatch({ type: 'tender-recorded', rowsSinceFrom: rowsSince(order.payments, state.plan?.from ?? 0), balanceMinor: balance });
  }, [order.payments, balance, state.entryDirty, state.plan, dispatch]);
  if (stage.kind !== 'tender') return null;

  const offered = offeredMethods(methods);
  const descriptorOf = (id: string) => offered.find((method) => method.id === id);
  const money = (minor: number) => formatMoney({ amount: minor, currency: order.currency }) ?? '';
  const method = state.methodId ? descriptorOf(state.methodId) ?? null : null;
  // ADR-072: change comes only from cash, so a non-cash method's `change: true` gives none (take() records no change for it).
  const givesChange = method !== null && wireMethodOf(method) === 'cash' && method.capabilities.change === true;
  const figures = tenderRounding(state, balance, method);
  const entryChange = changeMinor(figures.entryMinor, figures.appliedMinor, givesChange);
  const left = balance + figures.roundingMinor - figures.appliedMinor;
  const noChange = method !== null && !givesChange && figures.entryMinor > balance;
  const changeLeads = !noChange && entryChange > 0;
  // v2 tender-pane.tsx:405-410: the caption names the balance only when it differs from the figure shown.
  const balanceInCaption = balance === 0 || figures.entryMinor !== balance;
  const rows = rowsSince(order.payments, state.plan?.from ?? 0).map(({ title, amountMinor }) => ({ title, minor: amountMinor }));
  const plan = activePlan(state.plan, rows.length, balance);
  const planned = plan ? planLegs(plan, rows, balance) : null;
  const counted = order.payments.filter(countsTowardPaid).length;
  const splitOn = state.splitView || plan !== null;
  // v2 tender-figures.ts: a typed part payment comes first, and the ways divide what is left after it.
  const typed = state.entryDirty && figures.appliedMinor > 0 && figures.appliedMinor < balance;
  const restMinor = balance - (typed ? figures.appliedMinor : 0);
  const thisPaymentMinor = planned ? planned.thisPaymentMinor : balance;
  const dueMinor = planned && planned.thisPaymentMinor < balance ? planned.thisPaymentMinor : figures.roundedDueMinor;
  const chips = givesChange ? quickTenderedAmounts(dueMinor, QUICK_CASH_STEPS.map((step) => step * 10 ** minorUnitDigits(order.currency))) : [];
  // v2 tender-pane.tsx:942-954: a method that gives no change gets one chip setting the entry to the due figure; hidden in percent entry, as v2 does.
  const balanceChip = method !== null && !givesChange && state.entryMode !== 'percent' ? dueMinor : null;
  const [onlyLeg] = order.payments;
  // startTender('external') records the card leg for the total: its reference is edited in place, as before.
  const cardReference = order.payments.length === 1 && onlyLeg.method === 'external' && legStatus(onlyLeg) === 'captured' && balance === 0;
  const hint = noChange ? t('pos_checkout.no_change_for_method', { amount: money(balance), method: method?.title })
    : entryChange > 0 ? t('pos_checkout.change_due', { amount: money(entryChange) })
      : figures.appliedMinor < balance && figures.entryMinor > 0 ? t('pos_checkout.part_payment_left', { left: money(left) }) : '';
  // ADR-090 gate 36c: once the store's legs cover the total, finalize refuses every till leg; name them and offer their removal.
  const refused = tillLegsTheStoreRefuses(order);
  const refusedMinor = order.payments.filter((leg) => refused.includes(leg.id)).reduce((total, leg) => total + leg.amountMinor, 0);
  const canComplete = balance === 0 && !order.payments.some(isInMotion) && refused.length === 0;
  // ADR-090 gate 36 (desk Q4): changeDueMinor counts locked legs; what they hold beyond the total is the store's refund due, never till change.
  const refundDue = Math.min(order.changeDueMinor, lockedRefundDueMinor(order));
  const tillChange = order.changeDueMinor - refundDue;
  const cannotTake = figures.appliedMinor <= 0 || noChange;

  function take() {
    if (!method) return;
    const tender = tenderOf(method);
    const id = tender.method === 'cash'
      ? sale.addTender({ ...tender, amountMinor: figures.entryMinor })
      : sale.addTender({ ...tender, amountMinor: figures.appliedMinor, ...(reference ? { reference } : {}) });
    if (id === null) { setRefusal(true); return; }
    setRefusal(false);
    setReference('');
    dispatch({ type: 'tender-started', paymentId: id });
  }

  return <View dataSet={{ print: 'hide' }} testID="tender-pane" className="gap-4 p-4">
    <View testID="tender-headline" className="items-center gap-1">
      <View className="flex-row flex-wrap items-center justify-center gap-2">
        <Text testID="tender-caption" className="text-xs uppercase tracking-wide text-muted-foreground">
          {order.paidMinor > 0 ? t('pos_checkout.remaining') : t('pos_checkout.to_pay')}
          {balanceInCaption ? <>{' '}<Text testID="tender-balance">{money(balance)}</Text></> : null}
        </Text>
        {balance > 0 ? <Pressable testID="tender-split-chip" accessibilityRole="button" aria-pressed={splitOn} className={cn(button, splitOn && 'border-primary bg-muted')}
          onPress={() => dispatch(splitOn ? { type: 'clear-plan', balanceMinor: balance } : { type: 'open-split' })}>
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
        {figures.roundingMinor !== 0 ? <Text className="text-sm text-muted-foreground">{t('pos_checkout.rounded_from', { amount: money(balance) })}</Text> : null}
      </> : <>
        <Text testID="tender-entry-amount" className={cn('text-4xl font-bold text-foreground', !state.entryDirty && 'opacity-70')}>{money(figures.entryMinor)}</Text>
        {figures.roundingMinor !== 0 ? <Text className="text-sm text-muted-foreground">{t('pos_checkout.rounded_from', { amount: money(balance) })}</Text> : null}
        <Text testID="tender-entry-hint" className={cn('min-h-6 text-center text-sm', noChange ? 'text-warning-text' : entryChange > 0 ? 'text-success' : 'text-muted-foreground')}>{hint}</Text>
      </>}
    </View> : null}

    {ledger ? <TenderLedger sale={sale} methods={methods} confirmVoid={confirmVoid} /> : null}

    {/* cardReference holds only for an external leg; the edit keeps that leg's method and its own methodId. */}
    {cardReference ? <TextInput accessibilityLabel={t('tender.terminal_reference')} placeholder={t('tender.terminal_reference')} maxLength={REFERENCE_MAX}
      value={onlyLeg.reference ?? ''} onChangeText={(text) => sale.setTender({ method: 'external', ...(onlyLeg.methodId !== undefined ? { methodId: onlyLeg.methodId } : {}), amountMinor: onlyLeg.amountMinor, reference: text })}
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
      {method?.id === 'external' ? <TextInput accessibilityLabel={t('tender.terminal_reference')} placeholder={t('tender.terminal_reference')} maxLength={REFERENCE_MAX}
        value={reference} onChangeText={setReference} className="rounded-md border border-border px-3 py-2 text-foreground" /> : null}
      {state.splitView && !plan ? <>
        <Text testID="tender-split-heading" className="text-center text-sm text-muted-foreground">
          {typed ? t('pos_checkout.after_this_payment', { amount: money(restMinor) }) : t('pos_checkout.split_the_rest')}
        </Text>
        <ScrollView horizontal testID="tender-split-ways" showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerClassName="grow gap-2">
          {SPLIT_WAYS.map((count) => <View key={count} className="min-w-28 flex-1">
            <Pressable testID={`tender-split-even-${count}`} accessibilityRole="button"
              onPress={() => dispatch({ type: 'set-plan', balanceMinor: balance, plan: typed
                ? { kind: 'fixed', firstMinor: figures.appliedMinor, title: null, thenWays: count, from: counted }
                : { kind: 'even', ways: count, from: counted } })}
              className="min-h-16 items-center justify-center gap-1 rounded-md border border-border bg-card px-2 py-2">
              <Text className="font-semibold text-foreground">{t('pos_checkout.n_ways', { ways: count })}</Text>
              <Text className="text-sm text-muted-foreground">{t('pos_checkout.amount_each', { amount: money(evenSplitShareMinor(restMinor, count)) })}</Text>
            </Pressable>
          </View>)}
        </ScrollView>
      </> : null}
      {chips.length || balanceChip !== null ? <View testID="tender-quick" className="flex-row flex-wrap justify-center gap-2">
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
      <Text testID="tender-store-holds" className="text-foreground">{t('pos_checkout.store_holds_payment', { amount: money(refusedMinor) })}</Text>
      {refused.map((id) => <Pressable key={id} testID={`tender-leg-${id}-remove`} accessibilityRole="button" onPress={() => sale.removeTender(id)} className={button}>
        <Text className="text-center text-foreground">{t('pos_checkout.remove_payment')}</Text>
      </Pressable>)}
    </> : null}
    <Pressable testID="tender-complete" accessibilityRole="button" disabled={!canComplete} onPress={sale.complete}
      className={cn('rounded-md bg-primary px-4 py-3', !canComplete && 'opacity-50')}>
      <Text className="text-center font-semibold text-primary-foreground">{t('tender.complete_sale')}</Text>
    </Pressable>
    {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{sale.error}</Text> : null}
    {sale.canContinue ? <>
      <Text className="text-foreground">{t('tender.stored_will_send')}</Text>
      <Pressable accessibilityRole="button" onPress={() => sale.continueSale()} className="rounded-md bg-primary px-4 py-3">
        <Text className="text-center font-semibold text-primary-foreground">{t('tender.continue')}</Text>
      </Pressable>
    </> : null}
    {back ? <Pressable accessibilityRole="button" onPress={sale.cancelTender} className={button}><Text className="text-center text-foreground">{t('common.back')}</Text></Pressable> : null}
  </View>;
}
