import type { ReactNode } from 'react';
import { Image, ScrollView, Text, View } from 'react-native';
import { formatMoney } from '@tallyui/core';
import type { DisplayPayment, DisplayState, ReceiptData } from '@tallyui/pos';

// English copy from WCPOS v2's display (Pro packages/display/src/sample-snapshot.json); config.i18n overrides it.
const COPY = {
  welcome: 'Welcome', your_items: 'Your items', items_appear_here: 'Your items will appear here', subtotal: 'Subtotal',
  discount: 'Discount', total_tax: 'Tax', included_tax: 'Tax included', total: 'Total', paid_so_far: 'Paid so far',
  present_card: 'Please present your card', approved: 'Approved', declined: 'Declined',
  try_another_card: 'Please try another card or ask staff', paid_in_full: 'Paid in full', change: 'Change',
  thank_you: 'Thank you',
};

const CARD = { started: 'bg-primary', approved: 'bg-success', complete: 'bg-success', declined: 'bg-destructive' };
const CARD_TEXT = { started: 'text-primary-foreground', approved: 'text-success-foreground',
  complete: 'text-success-foreground', declined: 'text-destructive-foreground' };

/**
 * What the customer sees on the second screen, laid out as WCPOS v2's default "Ledger" display
 * (Pro templates/display.html): idle shows the store; cart and payment show the items on the left and a panel on the
 * right with the totals, or the payment card.
 */
export function CustomerDisplayScreen({ state }: { state: DisplayState }) {
  const { config, view } = state;
  const t = (key: keyof typeof COPY) => config?.i18n[key] ?? COPY[key];
  if (view.screen === 'idle') {
    const logo = config?.store.logo;
    return <View testID="customer-display-idle" className="flex-1 items-center justify-center gap-6 bg-primary p-8">
      {logo ? <Image source={{ uri: logo }} accessibilityLabel={config.store.name} resizeMode="contain" style={{ width: 320, height: 180 }} />
        : <Text className="text-5xl font-bold text-primary-foreground">{config?.store.name ?? ''}</Text>}
      <Text className="text-2xl text-primary-foreground">{t('welcome')}</Text>
    </View>;
  }
  const { receipt } = view.cart;
  const money = (amount: number) => formatMoney({ amount, currency: receipt.currency }, config?.store.locale) ?? '';
  const row = (label: string, amount: string, key?: string) => <View key={key} className="flex-row justify-between gap-4 py-1">
    <Text className="text-lg text-muted-foreground">{label}</Text><Text className="text-lg text-muted-foreground">{amount}</Text>
  </View>;
  const total = <View className="mt-3 flex-row items-baseline justify-between gap-4 border-t-2 border-foreground pt-4">
    <Text className="text-base font-semibold uppercase text-foreground">{t('total')}</Text>
    <Text className="text-4xl font-bold text-foreground">{money(receipt.totals.totalMinor)}</Text>
  </View>;
  return <View testID={`customer-display-${view.screen}`} className="flex-1 flex-col bg-card sm:flex-row">
    <ScrollView className="flex-1" contentContainerClassName="p-8 sm:p-12">
      <Text className="mb-5 text-sm font-semibold uppercase text-muted-foreground">{t('your_items')}</Text>
      {receipt.lineItems.length === 0 ? <Text className="py-8 text-center text-xl text-muted-foreground">{t('items_appear_here')}</Text> : null}
      {receipt.lineItems.map((line, index) => <View key={index} className="flex-row items-baseline gap-4 border-b border-border py-4">
        <Text className="w-14 text-xl text-muted-foreground">{`${line.quantity} ×`}</Text>
        <View className="flex-1">
          <Text className="text-xl font-semibold text-foreground">{line.name}</Text>
          {Object.entries(line.attributes ?? {}).map(([name, value]) => <Text key={name} className="text-base text-muted-foreground">{`${name}: ${value}`}</Text>)}
        </View>
        <Text className="text-xl font-semibold text-foreground">{money(line.displayAmountMinor)}</Text>
      </View>)}
    </ScrollView>
    <View className="justify-end border-t border-border p-8 sm:w-96 sm:border-l sm:border-t-0">
      <Text className="mb-auto text-lg font-bold text-foreground">{config?.store.name ?? receipt.header.storeName}</Text>
      {view.screen === 'cart' ? <View>
        {row(t('subtotal'), money(receipt.totals.subtotalMinor))}
        {receipt.fees.map((charge, index) => row(charge.name, money(charge.amountMinor), `fee-${index}`))}
        {receipt.shipping.map((charge, index) => row(charge.name, money(charge.amountMinor), `shipping-${index}`))}
        {receipt.totals.discountMinor > 0 ? row(t('discount'), `-${money(receipt.totals.discountMinor)}`) : null}
        {receipt.totals.taxMinor > 0 ? row(t(receipt.totals.taxInclusive ? 'included_tax' : 'total_tax'), money(receipt.totals.taxMinor)) : null}
        {total}
      </View> : <PaymentCard receipt={receipt} payment={view.payment} money={money} t={t}>{total}</PaymentCard>}
    </View>
  </View>;
}

function PaymentCard({ receipt, payment, money, t, children }: {
  receipt: ReceiptData; payment: DisplayPayment; money: (amount: number) => string; t: (key: keyof typeof COPY) => string;
  children: ReactNode;
}) {
  const paid = receipt.payments.reduce((sum, { amountMinor }) => sum + amountMinor, 0);
  const due = Math.max(0, receipt.totals.totalMinor - paid);
  const complete = payment.state === 'complete';
  const title = { started: t('present_card'), approved: t('approved'), declined: t('declined'), complete: t('paid_in_full') }[payment.state];
  const message = complete ? t('thank_you') : payment.message ?? (payment.state === 'declined' ? t('try_another_card') : undefined);
  const text = CARD_TEXT[payment.state];
  return <View className="gap-4">
    {complete ? null : <View>{children}{paid > 0 ? <View className="flex-row justify-between py-1">
      <Text className="text-lg text-success">{t('paid_so_far')}</Text><Text className="text-lg text-success">{money(paid)}</Text>
    </View> : null}</View>}
    <View className={`gap-2 rounded-xl p-6 ${CARD[payment.state]}`}>
      <Text className={`text-sm font-semibold uppercase ${text}`}>{title}</Text>
      <Text className={`text-4xl font-bold ${text}`}>{money(complete ? receipt.totals.totalMinor : payment.leg?.amountMinor ?? due)}</Text>
      {complete && receipt.changeDueMinor > 0 ? <Text className={`text-lg ${text}`}>{`${t('change')} ${money(receipt.changeDueMinor)}`}</Text> : null}
      {message ? <Text className={`text-lg ${text}`}>{message}</Text> : null}
    </View>
  </View>;
}
