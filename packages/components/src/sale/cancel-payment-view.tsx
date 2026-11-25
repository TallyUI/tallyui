/**
 * WCPOS v2's cancel-payment view (use-tender-flow.ts): before anything is voided, each payment taken here is listed as cash to
 * return, a void on its method, or a refund from the order. ADR-072 d3 (amended 2026-11-22): it ends on the cart, not in
 * checkout as v2 does, because park() runs only from the cart and a refund-only leg's sale must still be able to park.
 */
import { useState, type ComponentProps, type JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFormatMoney, wireMethodOf, type PaymentMethodDescriptor } from '@tallyui/core';
import { canVoidLeg, cashVoidRefusal, countsTowardPaid, lockedRefundDueMinor, type Order, type useSale } from '@tallyui/pos';
import { useT } from '../i18n';
import { heldTillLeg } from './held-leg';
import { offeredMethods } from './offered-methods';
import { cancelLine, type TenderLedger } from './tender-ledger';
import { claimVoid, releaseVoid } from './void-in-flight';

type Leg = Order['payments'][number];
/** tender-pane.tsx's button. */
const button = 'min-h-11 justify-center rounded-md border border-border bg-card px-4 py-2';

/** The leg's offered descriptor, as TenderLedger's: its own id and its wire method both match. */
export function legDescriptor(offered: PaymentMethodDescriptor[], leg: Leg): PaymentMethodDescriptor | undefined {
  return offered.find((method) => method.id === (leg.methodId ?? leg.method) && wireMethodOf(method) === leg.method);
}

/** TenderLedger's Cancel payment rule: the offered method can void the leg, and the leg is not held. Any other leg is refund-only. */
export function voidableLeg(order: Order, offered: PaymentMethodDescriptor[], leg: Leg): boolean {
  const descriptor = legDescriptor(offered, leg);
  return !!descriptor && canVoidLeg(leg, descriptor) && !heldTillLeg(order, leg);
}

/** The legs the view lists: taken here, still counting, and not held. */
export function cancelLegs(order: Order): Leg[] {
  return order.payments.filter((leg) => countsTowardPaid(leg) && leg.takenAt !== undefined && !heldTillLeg(order, leg));
}

/** ADR-094 item 6: the first of `voidable` the core would refuse once every other voidable leg is voided, or undefined. Checked before any beforeVoid, so a refused void is never journalled. */
export function cancelRefusedLeg(order: Order, voidable: Leg[]): Leg | undefined {
  const ids = new Set(voidable.map((leg) => leg.id));
  const after = { ...order, payments: order.payments.map((leg) => (ids.has(leg.id) ? { ...leg, status: 'voided' as const } : leg)) };
  return voidable.find((leg) => cashVoidRefusal(after, leg.id));
}

// Row 501: a net leg (with `tenderedMinor`) returns its `amountMinor`; a leg without `tenderedMinor` is netted as finalize nets it.
// Known limitation (ADR-072 d3, amended 2026-11-22): a pre-#1214 draft's gross leg, voided later, loses its change record.
export function cashToReturnMinor(order: Pick<Order, 'payments' | 'changeDueMinor' | 'totalMinor'>, leg: Leg): number {
  if (leg.tenderedMinor !== undefined) return leg.amountMinor;
  let change = order.changeDueMinor - Math.min(order.changeDueMinor, lockedRefundDueMinor(order));
  for (const gross of order.payments.filter(countsTowardPaid).reverse()) {
    if (gross.method !== 'cash' || gross.tenderedMinor !== undefined) continue;
    const share = Math.min(change, gross.amountMinor);
    if (gross.id === leg.id) return leg.amountMinor - share;
    change -= share;
  }
  return leg.amountMinor;
}

export function CancelPaymentView({ sale, methods, onClose, beforeVoid, afterVoid }: { sale: ReturnType<typeof useSale>; methods?: PaymentMethodDescriptor[]; onClose: () => void;
  /** Runs before each leg this view voids, as in TenderLedger. */
  beforeVoid?: ComponentProps<typeof TenderLedger>['beforeVoid'];
  /** Runs after each leg this view voids, as in TenderLedger. */
  afterVoid?: ComponentProps<typeof TenderLedger>['afterVoid'] }): JSX.Element {
  const formatMoney = useFormatMoney();
  const t = useT();
  const [voiding, setVoiding] = useState(false);
  const { order } = sale;
  const money = (minor: number) => formatMoney({ amount: minor, currency: order.currency }) ?? '';
  const offered = offeredMethods(methods);
  const legs = cancelLegs(order);
  const voidable = legs.filter((leg) => voidableLeg(order, offered, leg));
  const latestFirst = [...voidable].reverse();
  // Void latest first (ADR-094 item 6: a later cash rounding is voided before the one it was computed against). A leg the core would refuse closes the view before any beforeVoid, and the pane shows the sale's error.
  const confirm = async () => {
    if (voiding) return;
    const refused = cancelRefusedLeg(order, voidable); if (refused) { sale.voidTender(refused.id); return onClose(); }
    if (!beforeVoid) { for (const leg of latestFirst) if (!sale.voidTender(leg.id)) return onClose(); sale.cancelTender(); return; }
    setVoiding(true);
    try {
      for (const leg of latestFirst) {
        if (!claimVoid(order.id, leg.id)) return onClose(); // #1271: a ledger is journalling this leg; the view closes and leaves the leg to it
        let go = false;
        try { go = (await beforeVoid(leg)) !== false; } catch { /* the leg stays; the host reports its own error */ } finally { releaseVoid(order.id, leg.id); }
        if (!go) return onClose();
        const voided = sale.voidTender(leg.id);
        try { afterVoid?.(leg, voided); } catch { /* the host reports its own error */ }
        if (!voided) return onClose();
      }
      sale.cancelTender();
    } finally { setVoiding(false); }
  };
  return <View testID="tender-cancel-view" className="gap-3">
    <Text className="text-lg font-semibold text-foreground">{t('pos_checkout.cancel_payment')}</Text>
    {legs.map((leg) => <Text key={leg.id} testID={`tender-cancel-leg-${leg.id}`} className="text-foreground">{cancelLine(t, money, leg, legDescriptor(offered, leg), voidable.includes(leg), cashToReturnMinor(order, leg))}</Text>)}
    <Pressable testID="tender-cancel-keep" accessibilityRole="button" onPress={onClose} disabled={voiding} className={`rounded-md bg-primary px-4 py-3${voiding ? ' opacity-50' : ''}`}>
      <Text className="text-center font-semibold text-primary-foreground">{t('pos_checkout.keep_taking_payment')}</Text>
    </Pressable>
    {voidable.length > 0 ? <Pressable testID="tender-cancel-confirm" accessibilityRole="button" onPress={confirm} disabled={voiding} className={`${button}${voiding ? ' opacity-50' : ''}`}>
      <Text className="text-center text-destructive">{t('pos_checkout.cancel_and_void')}</Text>
    </Pressable> : <Pressable testID="tender-cancel-back" accessibilityRole="button" onPress={sale.cancelTender} className={button}>
      <Text className="text-center text-foreground">{t('common.back')}</Text>
    </Pressable>}
  </View>;
}
