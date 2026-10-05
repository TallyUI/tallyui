import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatMoney } from '@tallyui/core';
import { buildReceiptData, type SentOrder } from '@tallyui/pos';
import type { PosOrder } from '@tallyui/pos';
import { injectPrintStyle } from './print-style';
import { discountLabel } from './discount-form';
import { orderReference } from './order-reference';

const defaultFormatDate = (iso: string) => new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso));

/** `store`/`taxLabel`/`topInset`/`formatDate` replace the app's Medusa settings, hard-coded VAT (default matches
 * TV6a's `Cart`), outbox strip and date util, so `Receipt` stays platform-neutral (ADR-052). */
export function Receipt({ order, posOrder, store, cashier, registerId, newSale, taxLabel = (ratePpm: number) => `Tax ${ratePpm / 10000}%`,
  topInset = 0, formatDate = defaultFormatDate }: {
  order: SentOrder; store: { name: string; address?: string }; cashier: string; registerId: string; newSale: () => void;
  /** The finalized order (useSale's receipt stage has it). With it the receipt prints its reference and time, the
   * same as Orders; without it (a preview before finalize) the sale id is marked as a draft. */
  posOrder?: PosOrder;
  taxLabel?: (ratePpm: number) => string; topInset?: number; formatDate?: (iso: string) => string;
}) {
  useEffect(injectPrintStyle, []);
  const receipt = buildReceiptData(order, {
    storeName: store.name, storeAddress: store.address, cashier, register: registerId,
  });
  const money = (amount: number) => formatMoney({ amount, currency: receipt.currency }) ?? '';
  const row = (label: string, amount: string, bold = false, key?: number) => <View key={key} accessibilityLabel={`${label}: ${amount}`} className="flex-row justify-between gap-4">
    <Text className={`text-foreground ${bold ? 'font-semibold' : ''}`}>{label}</Text>
    <Text className={`text-right text-foreground ${bold ? 'font-semibold' : ''}`}>{amount}</Text>
  </View>;
  const { totals } = receipt;
  const lineDiscountMinor = totals.discountMinor - receipt.orderDiscountMinor;
  const taxRows = totals.taxLines.map((line, index) =>
    row(`${totals.taxInclusive ? 'incl. ' : ''}${taxLabel(line.ratePpm)}`, money(line.amountMinor), false, index));
  return <>
    {topInset > 0 ? <View dataSet={{ print: 'hide' }} style={{ height: topInset, flexShrink: 0 }} /> : null}
    <View className="w-full max-w-md self-center gap-3 p-4 bg-card">
    <Text className="text-lg font-semibold text-foreground">{receipt.header.storeName}</Text>
    {receipt.header.storeAddress ? <Text className="text-muted-foreground">{receipt.header.storeAddress}</Text> : null}
    <Text testID="receipt-order" className="text-foreground">{posOrder ? `Order ${orderReference(posOrder)}` : `Order ${receipt.header.orderNumber.slice(-8)} (draft)`}</Text>
    <Text className="text-muted-foreground">{formatDate(posOrder?.createdAt ?? receipt.header.date)}</Text>
    <Text className="text-muted-foreground">Cashier: {receipt.header.cashier}</Text>
    {receipt.header.customer && <Text className="text-muted-foreground">Customer: {receipt.header.customer}</Text>}
    {receipt.lineItems.map((line, index) => <View key={index}>
      <Text className="text-foreground">{line.name}</Text>
      {/* Before any discount, then the line's own discounts as sub-rows (TallyUI ADR-063); they add up to the subtotal. */}
      {row(`${line.quantity} × ${money(line.unitPriceMinor)}`, money(line.displayAmountMinor))}
      {line.displayDiscounts.map((discount, i) => <View key={i} className="pl-4">{row(`${discountLabel(
        order.lineItems[index].discounts[i], receipt.currency)} off`, `−${money(discount.amountMinor)}`)}</View>)}
    </View>)}
    {/* Each discount appears once in the totals: line discounts are itemised under their lines and summed once here;
        the order discount appears once. order.display's figures (ADR-063; medusapos ADR 0008). */}
    {row('Subtotal', money(totals.subtotalMinor))}
    {lineDiscountMinor > 0 ? row('Line discounts', `−${money(lineDiscountMinor)}`) : null}
    {receipt.orderDiscountMinor > 0 ? row('Order discount', `−${money(receipt.orderDiscountMinor)}`) : null}
    {taxRows}
    {row('Total', money(totals.totalMinor), true)}
    {receipt.payments.map((payment, index) => row(payment.method === 'cash' ? 'Cash tendered' : 'Card terminal',
      money(payment.amountMinor) + (payment.reference ? ` · ${payment.reference}` : ''), false, index))}
    {row('Change', money(receipt.changeDueMinor))}
    <View dataSet={{ print: 'hide' }} className="flex-row gap-4">
      <Pressable accessibilityRole="button" onPress={() => { if (typeof window !== 'undefined' && typeof window.print === 'function') window.print(); }} className="rounded-md border border-border bg-card px-4 py-3">
        <Text className="text-center text-foreground">Print receipt</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={newSale} className="rounded-md bg-primary px-4 py-3"><Text className="text-center font-semibold text-primary-foreground">New sale</Text></Pressable>
    </View>
  </View></>;
}
