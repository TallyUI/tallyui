/**
 * The payments ledger, as WCPOS v2's LedgerLegs (monorepo main, packages/core/src/screens/main/pos/checkout/tender/ledger-pane.tsx):
 * each leg with its status, Next and Cancel payment. `closing` is v2's checkout cart (cart/stilled-cart.tsx): a Payments
 * heading, the legs, then Total, Paid and a Remaining (or Paid in full) lead row. Internal: TenderPane and Cart render it.
 */
import type { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFormatMoney, wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { canVoidLeg, countsTowardPaid, legStatus, type PaymentLegStatus, type useSale } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { useT } from '../i18n';
import { offeredMethods } from './offered-methods';

/** v2 labels.ts statusLabel, as catalogue keys. */
const STATUS_LABEL: Record<PaymentLegStatus, string> = {
  pending: 'pos_checkout.status_pending', authorized: 'pos_checkout.status_authorized', captured: 'pos_checkout.status_captured',
  failed: 'pos_checkout.status_failed', voided: 'pos_checkout.status_voided',
};
/** v2 labels.ts statusVariant: coloured by what the cashier has to do about the leg. */
const STATUS_TONE: Record<PaymentLegStatus, string> = {
  pending: 'text-muted-foreground', authorized: 'text-success', captured: 'text-success', failed: 'text-destructive', voided: 'text-muted-foreground',
};

export function TenderLedger({ sale, methods, closing = false }: { sale: ReturnType<typeof useSale>; methods?: PaymentMethodDescriptor[]; closing?: boolean }): JSX.Element | null {
  const formatMoney = useFormatMoney();
  const t = useT();
  const { order, stage } = sale;
  if (stage.kind !== 'tender') return null;

  const offered = offeredMethods(methods);
  /** The leg's offered descriptor: its own id and its wire method both match, so a card-kind `cash` id never reads as Cash. */
  const descriptorOf = (leg: { method: string; methodId?: string }) => offered.find((method) => method.id === (leg.methodId ?? leg.method) && wireMethodOf(method) === leg.method);
  const money = (minor: number) => formatMoney({ amount: minor, currency: order.currency }) ?? '';
  const balance = order.balanceDueMinor;
  const settled = order.payments.some(countsTowardPaid);
  const firstPending = order.payments.find((leg) => legStatus(leg) === 'pending');

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
        {leg === firstPending ? <Text className="text-sm text-muted-foreground">{t('pos_checkout.next_leg')}</Text> : null}
        {descriptor && canVoidLeg(leg, descriptor) ? <Pressable testID={`tender-leg-${leg.id}-void`} accessibilityRole="button" accessibilityLabel={t('pos_checkout.cancel_payment')}
          onPress={() => sale.voidTender(leg.id)} className="self-start min-h-11 justify-center px-2">
          <Text className="text-destructive">{t('pos_checkout.cancel_payment')}</Text>
        </Pressable> : null}
      </View>;
    })}
    {!closing && balance === 0 && settled ? <Text className="text-sm text-success">{t('pos_checkout.paid_in_full')}</Text> : null}
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
        {balance === 0 && settled ? <Text className="font-semibold text-success">{t('pos_checkout.paid_in_full')}</Text> : <>
          <Text className="font-semibold text-foreground">{t('pos_checkout.remaining')}</Text>
          <Text testID="tender-ledger-remaining" className="font-semibold text-foreground">{money(order.balanceDueMinor)}</Text>
        </>}
      </View>
    </View>
  </View>;
}
