/**
 * The tender pane, laid out as WCPOS v2's (monorepo main, packages/core/src/screens/main/pos/checkout/tender/):
 * BalanceHeadline and LedgerLegs from ledger-pane.tsx, then the method tiles, entry, quick-cash chips,
 * keypad and commit from tender-pane.tsx's TenderKeypad. Copy is v2's English catalogue. Every figure
 * comes from pos (useSale's captured-only totals, tenderRounding, quickTenderedAmounts, planLegs).
 */
import { useEffect, useState, type JSX } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { defaultPaymentMethods, formatMoney, minorUnitDigits, type PaymentMethodDescriptor } from '@tallyui/core';
import {
  activePlan, canVoidLeg, changeMinor, countsTowardPaid, isInMotion, legStatus, planLegs, quickTenderedAmounts, tenderRounding,
  type PaymentLegStatus, type TenderAction, type TenderKey, type TenderState, type useSale,
} from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { QUICK_CASH_STEPS } from '../checkout/cash-tendered';
import { DIGIT_ROWS, Keypad } from '../input/keypad';

type Sale = ReturnType<typeof useSale>;
type Leg = Sale['order']['payments'][number];

export interface TenderPaneProps {
  sale: Sale;
  /** The tender reducer's state (`tenderReducer` in @tallyui/pos); the host owns the reducer. */
  state: TenderState;
  dispatch: (action: TenderAction) => void;
  /** Defaults to `defaultPaymentMethods()`; only `cash` and `external`, the order.create methods, are offered. */
  methods?: PaymentMethodDescriptor[];
}

/** order.create's bound on `payments[].reference`, in UTF-16 units. */
const REFERENCE_MAX = 255;
/** v2 labels.ts statusLabel. */
const STATUS_LABEL: Record<PaymentLegStatus, string> = {
  pending: 'Pending', authorized: 'Authorized', captured: 'Captured', failed: 'Failed', voided: 'Voided',
};
/** v2 labels.ts statusVariant: coloured by what the cashier has to do about the leg. */
const STATUS_TONE: Record<PaymentLegStatus, string> = {
  pending: 'text-muted-foreground', authorized: 'text-success', captured: 'text-success', failed: 'text-destructive', voided: 'text-muted-foreground',
};
/** v2 tender-pane.tsx keypadRows: 123 / 456 / 789, then C, 0, backspace. No decimal key: digits shift in from the right. */
const KEYPAD_ROWS = [...DIGIT_ROWS,
  [{ name: 'clear', label: 'Clear', text: 'C' }, { name: '0', label: '0' }, { name: 'backspace', label: 'Delete last digit', text: '⌫' }]];
const button = 'min-h-11 justify-center rounded-md border border-border bg-card px-4 py-2';

/** The captured legs since the plan began, as the reducer's `tender-recorded` and `planLegs` read them. */
const rowsSince = (payments: readonly Leg[], from: number) =>
  payments.filter(countsTowardPaid).slice(from).map((leg) => ({ title: leg.method, amountMinor: leg.amountMinor }));

export function TenderPane({ sale, state, dispatch, methods }: TenderPaneProps): JSX.Element | null {
  const { order, stage } = sale;
  const [reference, setReference] = useState('');
  const [refusal, setRefusal] = useState<string | null>(null);
  const balance = order.balanceDueMinor;
  // The ledger changed (a leg taken or voided) and the entry is untouched: pre-type the next leg or plan share.
  useEffect(() => {
    if (!state.entryDirty) dispatch({ type: 'tender-recorded', rowsSinceFrom: rowsSince(order.payments, state.plan?.from ?? 0), balanceMinor: balance });
  }, [order.payments, balance, state.entryDirty, state.plan, dispatch]);
  if (stage.kind !== 'tender') return null;

  const offered = (methods ?? defaultPaymentMethods()).filter(({ id }) => id === 'cash' || id === 'external');
  const descriptorOf = (id: string) => offered.find((method) => method.id === id);
  const money = (minor: number) => formatMoney({ amount: minor, currency: order.currency }) ?? '';
  const method = state.methodId ? descriptorOf(state.methodId) ?? null : null;
  const givesChange = method?.capabilities.change === true;
  const figures = tenderRounding(state, balance, method);
  const entryChange = changeMinor(figures.entryMinor, figures.appliedMinor, givesChange);
  const left = balance + figures.roundingMinor - figures.appliedMinor;
  const noChange = method !== null && !givesChange && figures.entryMinor > balance;
  const rows = rowsSince(order.payments, state.plan?.from ?? 0).map(({ title, amountMinor }) => ({ title, minor: amountMinor }));
  const plan = activePlan(state.plan, rows.length, balance);
  const planned = plan ? planLegs(plan, rows, balance) : null;
  const dueMinor = planned && planned.thisPaymentMinor < balance ? planned.thisPaymentMinor : figures.roundedDueMinor;
  const chips = givesChange ? quickTenderedAmounts(dueMinor, QUICK_CASH_STEPS.map((step) => step * 10 ** minorUnitDigits(order.currency))) : [];
  const settled = order.payments.some(countsTowardPaid);
  const firstPending = order.payments.find((leg) => legStatus(leg) === 'pending');
  const [onlyLeg] = order.payments;
  // startTender('external') records the card leg for the total: its reference is edited in place, as before.
  const cardReference = order.payments.length === 1 && onlyLeg.method === 'external' && legStatus(onlyLeg) === 'captured' && balance === 0;
  const hint = noChange ? `Only ${money(balance)} is due — ${method?.title} can't give change`
    : entryChange > 0 ? `Change ${money(entryChange)}`
      : figures.appliedMinor < balance && figures.entryMinor > 0 ? `Part payment · ${money(left)} left after this` : '';
  const canComplete = balance === 0 && !order.payments.some(isInMotion);
  const cannotTake = figures.appliedMinor <= 0 || noChange;

  function take() {
    if (!method) return;
    const id = method.id === 'cash'
      ? sale.addTender({ method: 'cash', amountMinor: figures.entryMinor })
      : sale.addTender({ method: 'external', amountMinor: figures.appliedMinor, ...(reference ? { reference } : {}) });
    if (id === null) { setRefusal("That payment wasn't taken: nothing is due, or the amount isn't valid."); return; }
    setRefusal(null);
    setReference('');
    dispatch({ type: 'tender-started' });
  }

  return <View dataSet={{ print: 'hide' }} testID="tender-pane" className="gap-4 p-4">
    <View testID="tender-headline" className="gap-1">
      <Text className="text-sm text-muted-foreground">{order.paidMinor > 0 ? 'Remaining' : 'Total'}</Text>
      <Text testID="tender-balance" className="text-4xl font-bold text-foreground">{money(balance)}</Text>
      {order.paidMinor > 0 ? <Text testID="tender-paid" className="text-sm text-muted-foreground">{`${money(order.paidMinor)} of ${money(order.totalMinor)} paid`}</Text> : null}
      {order.changeDueMinor > 0 ? <Text testID="tender-change" className="text-lg font-semibold text-success">{`Change ${money(order.changeDueMinor)}`}</Text> : null}
    </View>

    <View testID="tender-ledger" className="gap-1">
      {order.payments.length === 0 ? <Text className="text-muted-foreground">No payments yet</Text> : order.payments.map((leg) => {
        const status = legStatus(leg);
        const voided = status === 'voided';
        const descriptor = descriptorOf(leg.method);
        return <View key={leg.id} testID={`tender-leg-${leg.id}`} className="gap-1 border-b border-border py-2">
          <View className="flex-row items-center gap-2">
            <Text className={cn('flex-1 font-semibold text-foreground', voided && 'line-through')}>{descriptor?.title ?? leg.method}</Text>
            <Text className={cn('text-foreground', voided && 'line-through')}>{money(leg.amountMinor)}</Text>
            <Text testID={`tender-leg-${leg.id}-status`} className={cn('text-sm font-semibold', STATUS_TONE[status])}>{voided ? 'Cancelled' : STATUS_LABEL[status]}</Text>
          </View>
          {leg.reference ? <Text className="text-sm text-muted-foreground">{leg.reference}</Text> : null}
          {leg === firstPending ? <Text className="text-sm text-muted-foreground">Next</Text> : null}
          {descriptor && canVoidLeg(leg, descriptor) ? <Pressable testID={`tender-leg-${leg.id}-void`} accessibilityRole="button" accessibilityLabel="Cancel payment"
            onPress={() => sale.voidTender(leg.id)} className="self-start min-h-11 justify-center px-2">
            <Text className="text-destructive">Cancel payment</Text>
          </Pressable> : null}
        </View>;
      })}
      {balance === 0 && settled ? <Text className="text-sm text-success">Paid in full</Text> : null}
    </View>

    {cardReference ? <TextInput accessibilityLabel="Terminal reference" placeholder="Terminal reference" maxLength={REFERENCE_MAX}
      value={onlyLeg.reference ?? ''} onChangeText={(text) => sale.setTender({ method: 'external', amountMinor: onlyLeg.amountMinor, reference: text })}
      className="rounded-md border border-border px-3 py-2 text-foreground" /> : null}

    {balance > 0 ? <View testID="tender-entry" className="gap-3">
      <View className="flex-row flex-wrap gap-2">
        {offered.map((tile) => <Pressable key={tile.id} testID={`tender-method-${tile.id}`} accessibilityRole="button" accessibilityState={{ selected: tile.id === state.methodId }}
          onPress={() => dispatch({ type: 'pick-method', methodId: tile.id, prefillMinor: balance, readerId: null })}
          className={cn(button, tile.id === state.methodId && 'border-primary bg-primary')}>
          <Text className={cn('text-center font-semibold', tile.id === state.methodId ? 'text-primary-foreground' : 'text-foreground')}>{tile.title}</Text>
        </Pressable>)}
      </View>
      {planned ? <Text testID="tender-plan" className="text-sm text-muted-foreground">{`${planned.label.n} of ${planned.label.ways}`}</Text> : null}
      <Text testID="tender-entry-amount" className={cn('text-3xl font-bold text-foreground', !state.entryDirty && 'opacity-70')}>{money(figures.entryMinor)}</Text>
      {figures.roundingMinor !== 0 ? <Text className="text-sm text-muted-foreground">{`Rounded from ${money(balance)}`}</Text> : null}
      <Text testID="tender-entry-hint" className={cn('min-h-6 text-sm', noChange ? 'text-warning' : entryChange > 0 ? 'text-success' : 'text-muted-foreground')}>{hint}</Text>
      {method?.id === 'external' ? <TextInput accessibilityLabel="Terminal reference" placeholder="Terminal reference" maxLength={REFERENCE_MAX}
        value={reference} onChangeText={setReference} className="rounded-md border border-border px-3 py-2 text-foreground" /> : null}
      {chips.length ? <View testID="tender-quick" className="flex-row flex-wrap gap-2">
        {chips.map((minor, index) => <Pressable key={minor} testID={index === 0 ? 'tender-quick-exact' : `tender-quick-${minor}`} accessibilityRole="button"
          onPress={() => dispatch({ type: 'set-entry', minor })} className={cn(button, state.entryDirty && figures.entryMinor === minor && 'border-primary')}>
          <Text className="font-semibold text-foreground">{index === 0 ? `Exact ${money(minor)}` : money(minor)}</Text>
        </Pressable>)}
      </View> : null}
      <Keypad testID="tender-keypad" rows={KEYPAD_ROWS} onPress={(name) => dispatch({ type: 'key', key: name as TenderKey })} />
      {refusal ? <Text accessibilityRole="alert" className="text-destructive">{refusal}</Text> : null}
      {method ? <Pressable testID="tender-take" accessibilityRole="button" disabled={cannotTake}
        onPress={take} className={cn('rounded-md bg-primary px-4 py-3', cannotTake && 'opacity-50')}>
        <Text className="text-center font-semibold text-primary-foreground">{`Take ${money(figures.appliedMinor)} in ${method.title}`}</Text>
      </Pressable> : null}
    </View> : null}

    <Pressable testID="tender-complete" accessibilityRole="button" disabled={!canComplete} onPress={sale.complete}
      className={cn('rounded-md bg-primary px-4 py-3', !canComplete && 'opacity-50')}>
      <Text className="text-center font-semibold text-primary-foreground">Complete sale</Text>
    </Pressable>
    {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{sale.error}</Text> : null}
    {sale.canContinue ? <>
      <Text className="text-foreground">This sale is stored and will be sent. Continue to the next sale.</Text>
      <Pressable accessibilityRole="button" onPress={() => sale.continueSale()} className="rounded-md bg-primary px-4 py-3">
        <Text className="text-center font-semibold text-primary-foreground">Continue</Text>
      </Pressable>
    </> : null}
    <Pressable accessibilityRole="button" onPress={sale.cancelTender} className={button}><Text className="text-center text-foreground">Back</Text></Pressable>
  </View>;
}
