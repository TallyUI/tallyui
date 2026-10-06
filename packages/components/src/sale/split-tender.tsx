import { useState, type JSX } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatMoney, minorUnitDigits } from '@tallyui/core';
import type { useSale } from '@tallyui/pos';
import { tenderLabel } from '../register/register-count';
import { parsePrice } from './price-form';

export function SplitTender({ sale }: { sale: ReturnType<typeof useSale> }): JSX.Element | null {
  const { order, stage } = sale;
  const [method, setMethod] = useState<'cash' | 'external'>('cash');
  const [amount, setAmount] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [error, setError] = useState<string | null>(null);
  if (stage.kind !== 'tender') return null;
  const money = (value: number) => formatMoney({ amount: value, currency: order.currency });
  const digits = minorUnitDigits(order.currency);
  const amountText = amount ?? (order.balanceDueMinor / 10 ** digits).toFixed(digits);
  const incomplete = order.balanceDueMinor > 0 || order.payments.length === 0;
  function add() {
    const parsed = parsePrice(amountText, order.currency);
    if (typeof parsed === 'string') { setError(parsed); return; }
    const id = sale.addTender({ method, amountMinor: parsed,
      ...(method === 'external' && reference ? { reference } : {}) });
    if (id === null) {
      setError("That tender wasn't added: nothing is due, or the amount isn't valid.");
      return;
    }
    setError(null);
    setReference('');
    setAmount(null);
  }
  return <View dataSet={{ print: 'hide' }} className="gap-4 p-4">
    <View testID="split-tender-summary" className="gap-2">
      <Text className="text-foreground">Total: {money(order.totalMinor)}</Text>
      <Text className="text-foreground">Paid: {money(order.paidMinor)}</Text>
      <Text className="text-foreground">Remaining: {money(order.balanceDueMinor)}</Text>
      {order.changeDueMinor > 0 ? <Text className="text-foreground">Change: {money(order.changeDueMinor)}</Text> : null}
    </View>
    <View testID="split-tender-list" className="gap-2">
      {order.payments.map((payment) => <View key={payment.id} testID={`split-tender-row-${payment.id}`} className="gap-2">
        <Text className="text-foreground">{tenderLabel(payment.method)} {money(payment.amountMinor)}</Text>
        {payment.reference ? <Text className="text-foreground">{payment.reference}</Text> : null}
        <Pressable testID={`split-tender-remove-${payment.id}`} accessibilityRole="button" accessibilityLabel="Remove tender"
          onPress={() => sale.removeTender(payment.id)} className="rounded-md border border-border bg-card px-4 py-3">
          <Text className="text-center text-foreground">Remove</Text>
        </Pressable>
      </View>)}
    </View>
    <View testID="split-tender-add" className="gap-2">
      <View className="flex-row gap-2">
        {(['cash', 'external'] as const).map((value) => <Pressable key={value}
          testID={`split-tender-method-${value === 'cash' ? 'cash' : 'card'}`} accessibilityRole="button"
          accessibilityState={{ selected: method === value }} onPress={() => setMethod(value)}
          className={`rounded-md border border-border px-4 py-3 ${method === value ? 'bg-primary' : 'bg-card'}`}>
          <Text className={`text-center ${method === value ? 'text-primary-foreground' : 'text-foreground'}`}>{tenderLabel(value)}</Text>
        </Pressable>)}
      </View>
      <TextInput testID="split-tender-amount" accessibilityLabel="Tender amount" inputMode="decimal"
        value={amountText} onChangeText={setAmount} className="rounded-md border border-border px-3 py-2 text-foreground" />
      {method === 'external' ? <TextInput testID="split-tender-reference" accessibilityLabel="Terminal reference"
        placeholder="Terminal reference" maxLength={255} value={reference} onChangeText={setReference}
        className="rounded-md border border-border px-3 py-2 text-foreground" /> : null}
      {error ? <Text testID="split-tender-error" accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
      <Pressable testID="split-tender-add-button" accessibilityRole="button" onPress={add} className="rounded-md bg-primary px-4 py-3">
        <Text className="text-center font-semibold text-primary-foreground">Add</Text>
      </Pressable>
    </View>
    <Pressable testID="split-tender-complete" accessibilityRole="button" disabled={incomplete} onPress={sale.complete}
      className={`rounded-md bg-primary px-4 py-3 ${incomplete ? 'opacity-50' : ''}`}>
      <Text className="text-center font-semibold text-primary-foreground">Complete sale</Text>
    </Pressable>
    {sale.error ? <Text accessibilityRole="alert" className="text-destructive">{sale.error}</Text> : null}
    {sale.canContinue ? <>
      <Text className="text-foreground">This sale is stored and will be sent. Continue to the next sale.</Text>
      <Pressable accessibilityRole="button" onPress={() => sale.continueSale()} className="rounded-md bg-primary px-4 py-3">
        <Text className="text-center font-semibold text-primary-foreground">Continue</Text>
      </Pressable>
    </> : null}
    <Pressable accessibilityRole="button" onPress={sale.cancelTender} className="rounded-md border border-border bg-card px-4 py-3"><Text className="text-center text-foreground">Back</Text></Pressable>
  </View>;
}
