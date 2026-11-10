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
  const digits = minorUnitDigits(currency);
  if ((trimmed.split('.')[1]?.length ?? 0) > digits) return digits ? `Use at most ${digits} decimal places.` : 'Use a whole amount.';
  return moneyFromDecimalString(trimmed, currency)?.amount ?? 'Enter a number.';
}

const button = 'rounded-md border border-border px-3 py-2 min-h-11 items-center justify-center';
/** v2's price keypad draws three quick keys (`QUICK_KEYS`, WCPOS `components/src/price-keypad/index.tsx`). */
const QUICK_KEYS = 3;

/** `currentMinor` less `percent` (to two places), half up at the minor unit, as v2's `draftPrice` rounds. */
const lessPercent = (currentMinor: number, percent: number) =>
  Math.round(currentMinor * (10000 - Math.round(percent * 100)) / 10000);

/** `onApply` returns a refusal to show inline, or null once applied. */
export function PriceForm({ lineName, currency, currentMinor, onApply, onClose, quickDiscounts = [] }: {
  lineName: string; currency: string; currentMinor: number;
  onApply: (amountMinor: number, reason?: string) => string | null; onClose: () => void;
  /** Percentages off the current price, as v2's price-keypad keys; the first three valid ones (0 < n ≤ 100) are drawn. */
  quickDiscounts?: readonly number[];
}): JSX.Element {
  const [text, setText] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  // The lit key (v2's reducer): pressing it again puts the current price back; typing starts over.
  const [percent, setPercent] = useState<number | undefined>();
  const keys = quickDiscounts.filter((n) => Number.isFinite(n) && n > 0 && n <= 100).slice(0, QUICK_KEYS);
  const title = `Price for ${lineName}`;
  const current = formatMoney({ amount: currentMinor, currency });
  const draft = percent === undefined ? undefined : lessPercent(currentMinor, percent);
  function apply() {
    const parsed = draft ?? parsePrice(text, currency);
    const refused = typeof parsed === 'string' ? parsed : onApply(parsed, reason.trim() || undefined);
    setError(refused);
    if (refused === null) onClose();
  }
  return <View testID="price-form" role="group" accessibilityLabel={title} className="gap-2 px-3 py-2">
    <Text className="font-semibold text-foreground">{title}</Text>
    {draft === undefined ? <Text className="text-muted-foreground">{current}</Text>
      : <Text testID="price-quick-draft" className="text-muted-foreground">
        {`${current} −${percent}% → ${formatMoney({ amount: draft, currency })}`}</Text>}
    {keys.length ? <View testID="price-quick-discounts" className="flex-row gap-2">
      {keys.map((key) => <Pressable key={key} testID={`price-discount-${key}`} accessibilityRole="button"
        accessibilityLabel={`Discount (${key}%)`} accessibilityState={{ selected: key === percent }}
        aria-selected={key === percent} onPress={() => { setPercent(key === percent ? undefined : key); setText(''); setError(null); }}
        className={`${button} flex-1 ${key === percent ? 'bg-primary' : 'bg-card'}`}>
        <Text className={key === percent ? 'text-primary-foreground' : 'text-foreground'}>{`−${key}%`}</Text>
      </Pressable>)}
    </View> : null}
    <TextInput testID="price-input" accessibilityLabel="Price value" value={text}
      onChangeText={(next) => { setText(next); setPercent(undefined); }}
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
