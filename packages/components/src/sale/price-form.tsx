import { useState, type JSX } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { formatMoney, minorUnitDigits, moneyFromDecimalString } from '@tallyui/core';

/** The cashier's entry as integer minor units of `currency` (0 allowed), or the inline error to show. */
export function parsePrice(text: string, currency: string): number | string {
  const raw = text.trim();
  const trimmed = raw.split(',').length === 2 ? raw.replace(',', '.') : raw;
  if (!trimmed) return 'Enter a price.';
  if (!/^-?\d+(\.\d+)?$/.test(trimmed)) return 'Enter a number.';
  if (Number(trimmed) < 0) return 'Enter a price of 0 or more.';
  const digits = Math.min(2, minorUnitDigits(currency));
  if ((trimmed.split('.')[1]?.length ?? 0) > digits) return digits ? `Use at most ${digits} decimal places.` : 'Use a whole amount.';
  return moneyFromDecimalString(trimmed, currency)?.amount ?? 'Enter a number.';
}

const button = 'rounded-md border border-border px-3 py-2 min-h-11 items-center justify-center';

/** `onApply` returns a refusal to show inline, or null once applied. */
export function PriceForm({ lineName, currency, currentMinor, onApply, onClose }: {
  lineName: string; currency: string; currentMinor: number;
  onApply: (amountMinor: number, reason?: string) => string | null; onClose: () => void;
}): JSX.Element {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const title = `Price for ${lineName}`;
  function apply() {
    const parsed = parsePrice(text, currency);
    const refused = typeof parsed === 'string' ? parsed : onApply(parsed, reason.trim() || undefined);
    setError(refused);
    if (refused === null) onClose();
  }
  return <View testID="price-form" role="group" accessibilityLabel={title} className="gap-2 px-3 py-2">
    <Text className="font-semibold text-foreground">{title}</Text>
    <Text className="text-muted-foreground">{formatMoney({ amount: currentMinor, currency })}</Text>
    <TextInput testID="price-input" accessibilityLabel="Price value" value={text} onChangeText={setText}
      onSubmitEditing={apply} inputMode="decimal" placeholder={currency}
      className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-foreground" />
    <TextInput testID="price-reason" accessibilityLabel="Reason (optional)" placeholder="Reason (optional)"
      value={reason} onChangeText={setReason}
      className="min-w-0 rounded-md border border-border bg-background px-3 py-2 text-foreground" />
    {error ? <Text testID="price-error" accessibilityRole="alert" className="text-destructive">{error}</Text> : null}
    <View className="flex-row gap-2">
      <Pressable testID="price-apply" accessibilityRole="button" onPress={apply} className={`${button} bg-primary`}>
        <Text className="font-semibold text-primary-foreground">Apply</Text></Pressable>
      <Pressable testID="price-cancel" accessibilityRole="button" onPress={onClose} className={`${button} bg-card`}>
        <Text className="text-foreground">Cancel</Text></Pressable>
    </View>
  </View>;
}
