/**
 * The payments ledger, as WCPOS v2's LedgerLegs (monorepo main, packages/core/src/screens/main/pos/checkout/tender/ledger-pane.tsx):
 * each leg with its status, Next and Cancel payment. `closing` is v2's checkout cart (cart/stilled-cart.tsx): a Payments
 * heading, the legs, then Total, Paid and a Remaining (or Paid in full) lead row. Internal: TenderPane and Cart render it.
 */
import { useState, type JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFormatMoney, wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { canVoidLeg, countsTowardPaid, legStatus, type PaymentLegStatus, type useSale } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { ConfirmDialog } from '../ui/confirm-dialog';
import { heldTillLeg } from './held-leg';
import { offeredMethods } from './offered-methods';
import { shortTime } from './since-text';

/** v2 labels.ts statusLabel, as catalogue keys. */
const STATUS_LABEL: Record<PaymentLegStatus, string> = {
  pending: 'pos_checkout.status_pending', authorized: 'pos_checkout.status_authorized', captured: 'pos_checkout.status_captured',
  failed: 'pos_checkout.status_failed', voided: 'pos_checkout.status_voided',
};
/** v2 labels.ts statusVariant: coloured by what the cashier has to do about the leg. */
const STATUS_TONE: Record<PaymentLegStatus, string> = {
  pending: 'text-muted-foreground', authorized: 'text-success', captured: 'text-success', failed: 'text-destructive', voided: 'text-muted-foreground',
};

// One leg's line in v2's cancel-payment view (use-tender-flow.ts cancelOne): voidable cash not captured by the server goes back as
// `cashMinor` cash, any other voidable leg is voided on its method, and a leg the till cannot void is refunded from the order.
export function cancelLine(t: ReturnType<typeof useT>, money: (minor: number) => string, leg: ReturnType<typeof useSale>['order']['payments'][number],
  descriptor: PaymentMethodDescriptor | undefined, voidable: boolean, cashMinor: number): string {
  if (!voidable) return t('pos_checkout.refund_on_method', { amount: money(leg.amountMinor), title: descriptor?.title ?? leg.methodId ?? leg.method });
  return descriptor?.kind === 'cash' && descriptor.capture.mode !== 'server'
    ? t('pos_checkout.return_cash', { amount: money(cashMinor) })
    : t('pos_checkout.void_on_method', { amount: money(leg.amountMinor), title: descriptor?.title ?? leg.methodId ?? leg.method });
}

export function TenderLedger({ sale, methods, closing = false, confirmVoid = false }: { sale: ReturnType<typeof useSale>; methods?: PaymentMethodDescriptor[]; closing?: boolean;
  /** v2's "Cancel this payment?" before a leg is voided (use-tender-flow.ts cancelOne). Default false: Cancel payment voids at once. */
  confirmVoid?: boolean }): JSX.Element | null {
  const formatMoney = useFormatMoney();
  const t = useT();
  /** The id of the leg the one question is about (confirmVoid). */
  const [asking, setAsking] = useState<string | null>(null);
  const { order, stage } = sale;
  if (stage.kind !== 'tender') return null;

  const offered = offeredMethods(methods);
  /** The leg's offered descriptor: its own id and its wire method both match, so a card-kind `cash` id never reads as Cash. */
  const descriptorOf = (leg: { method: string; methodId?: string }) => offered.find((method) => method.id === (leg.methodId ?? leg.method) && wireMethodOf(method) === leg.method);
  const money = (minor: number) => formatMoney({ amount: minor, currency: order.currency }) ?? '';
  const balance = order.balanceDueMinor;
  const settled = order.payments.some(countsTowardPaid);
  /** v2's paid_in_full_at: the time of the last settled leg (settled.at(-1)); plain Paid in full when it has none. */
  const paidAt = order.payments.filter(countsTowardPaid).at(-1)?.takenAt;
  const paidInFull = paidAt ? t('pos_checkout.paid_in_full_at', { time: shortTime(paidAt) }) : t('pos_checkout.paid_in_full');
  const firstPending = order.payments.find((leg) => legStatus(leg) === 'pending');
  const askedLeg = order.payments.find((leg) => leg.id === asking);
  const asked = askedLeg && descriptorOf(askedLeg);
  const question = askedLeg && asked ? cancelLine(t, money, askedLeg, asked, true, askedLeg.amountMinor) : undefined;

  const legs = <View testID="tender-ledger" className="gap-1">
    {order.payments.length === 0 ? <Text className="text-muted-foreground">{t('pos_checkout.no_payments_yet')}</Text> : order.payments.map((leg) => {
      const status = legStatus(leg);
      const voided = status === 'voided';
      const descriptor = descriptorOf(leg);
      return <View key={leg.id} testID={`tender-leg-${leg.id}`} className="gap-1 border-b border-border py-2">
        <View className="flex-row items-center gap-2">
          <Text className={cn('flex-1 font-semibold text-foreground', voided && 'line-through')}>{descriptor?.title ?? leg.methodId ?? leg.method}</Text>
          <Text className={cn('text-foreground', voided && 'line-through')}>{money(leg.amountMinor)}</Text>
          <Text testID={`tender-leg-${leg.id}-status`} className={cn('text-sm font-semibold', STATUS_TONE[status])}>{voided ? t('pos_checkout.cancelled') : t(STATUS_LABEL[status])}</Text>
        </View>
        {leg.reference ? <Text className="text-sm text-muted-foreground">{leg.reference}</Text> : null}
        {leg.takenAt ? <Text testID={`tender-leg-${leg.id}-time`} className="text-sm text-muted-foreground">{shortTime(leg.takenAt)}</Text> : null}
        {leg === firstPending ? <Text className="text-sm text-muted-foreground">{t('pos_checkout.next_leg')}</Text> : null}
        {descriptor && canVoidLeg(leg, descriptor) && !heldTillLeg(order, leg) ? <Pressable testID={`tender-leg-${leg.id}-void`} accessibilityRole="button" accessibilityLabel={t('pos_checkout.cancel_payment')}
          onPress={() => (confirmVoid ? setAsking(leg.id) : sale.voidTender(leg.id))} className="self-start min-h-11 justify-center px-2">
          <Text className="text-destructive">{t('pos_checkout.cancel_payment')}</Text>
        </Pressable> : null}
      </View>;
    })}
    {/* ADR-094: each live cash rounding, signed, under the legs. */}
    {order.cashRoundings?.map((entry) => <View key={`rounding-${entry.paymentId}`} testID={`tender-rounding-${entry.paymentId}`} className="flex-row items-center gap-2 border-b border-border py-2">
      <Text className="flex-1 text-muted-foreground">{t('pos_checkout.rounding')}</Text>
      <Text className="text-foreground">{money(entry.minor)}</Text>
    </View>)}
    {!closing && balance === 0 && settled ? <Text className="text-sm text-success">{paidInFull}</Text> : null}
    {confirmVoid ? <ConfirmDialog testID="tender-leg-void-dialog" tone="destructive" title={t('pos_checkout.cancel_payment_question')} description={question}
      confirmLabel={t('pos_checkout.cancel_payment')} open={asking !== null} onOpenChange={(open) => { if (!open) setAsking(null); }}
      onConfirm={() => { if (asking) sale.voidTender(asking); }} /> : null}
  </View>;
  if (!closing) return legs;

  const row = (label: string, minor: number) => <View className="flex-row justify-between">
    <Text className="text-sm text-muted-foreground">{label}</Text><Text className="text-sm text-foreground">{money(minor)}</Text>
  </View>;
  return <View testID="cart-payments" className="gap-2 border-t border-border p-2">
    <Text className="font-semibold text-foreground">{t('pos_checkout.payments_tab')}</Text>
    {legs}
    <View testID="tender-ledger-totals" className="gap-1.5">
      {row(t('common.total'), order.totalMinor)}
      {row(t('pos_checkout.paid'), order.paidMinor)}
      <View testID="tender-ledger-lead" className="mt-1.5 flex-row justify-between border-t border-border pt-2">
        {balance === 0 && settled ? <Text className="font-semibold text-success">{paidInFull}</Text> : <>
          <Text className="font-semibold text-foreground">{t('pos_checkout.remaining')}</Text>
          <Text testID="tender-ledger-remaining" className="font-semibold text-foreground">{money(order.balanceDueMinor)}</Text>
        </>}
      </View>
    </View>
  </View>;
}
