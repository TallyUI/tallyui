import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View, type ViewProps } from 'react-native';

import { formatMoney, minorUnitDigits, moneyFromDecimalString, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface CashTenderedProps extends Omit<ViewProps, 'children'> {
  total: Money;
  defaultAmount?: Money;
  amount?: Money;
  onChangeAmount?: (amount: Money) => void;
  quickAmounts?: Money[];
  locale?: string;
  className?: string;
}

function defaultQuickAmounts(total: Money): Money[] {
  const unit = 10 ** minorUnitDigits(total.currency);
  const amounts = [
    total.amount,
    Math.ceil(total.amount / (5 * unit)) * 5 * unit,
    Math.ceil(total.amount / (10 * unit)) * 10 * unit,
    Math.ceil(total.amount / (20 * unit)) * 20 * unit,
  ];
  return [...new Set(amounts)].sort((a, b) => a - b).map((amount) => ({ amount, currency: total.currency }));
}

export function CashTendered({
  total,
  defaultAmount,
  amount: controlledAmount,
  onChangeAmount,
  quickAmounts,
  locale,
  className,
  ...viewProps
}: CashTenderedProps) {
  const [internalAmount, setInternalAmount] = useState(defaultAmount ?? total);
  const amount = controlledAmount ?? internalAmount;
  const buttons = quickAmounts ?? defaultQuickAmounts(total);
  const digits = minorUnitDigits(amount.currency);
  const amountText = String(Math.abs(amount.amount)).padStart(digits + 1, '0');
  const decimal = (amount.amount < 0 ? '-' : '') + (digits
    ? `${amountText.slice(0, -digits)}.${amountText.slice(-digits)}` : amountText);
  const [text, setText] = useState(decimal);
  const lastTextAmount = useRef(amount);

  useEffect(() => {
    if (amount.amount !== lastTextAmount.current.amount || amount.currency !== lastTextAmount.current.currency) {
      setText(decimal);
      lastTextAmount.current = amount;
    }
  }, [amount, decimal]);

  const handleChange = (value: Money) => {
    if (controlledAmount === undefined) setInternalAmount(value);
    onChangeAmount?.(value);
  };

  return (
    <View className={cn('gap-3', className)} {...viewProps}>
      <Text className="text-sm font-semibold text-foreground">Cash Tendered</Text>
      <View className="flex-row flex-wrap gap-2">
        {buttons.map((val) => (
          <Pressable
            key={`${val.currency}:${val.amount}`}
            onPress={() => handleChange(val)}
            className={cn(
              'rounded-lg border px-4 py-2',
              amount.amount === val.amount && amount.currency === val.currency ? 'border-primary bg-primary' : 'border-input bg-card',
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold',
                amount.amount === val.amount && amount.currency === val.currency ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {formatMoney(val, locale) ?? '—'}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={text}
        onChangeText={(text) => {
          const parsed = moneyFromDecimalString(text, total.currency);
          if (parsed) {
            setText(text);
            lastTextAmount.current = parsed;
            handleChange(parsed);
          } else if (text === '' || /^\d+\.$/.test(text)) {
            setText(text);
          }
        }}
        keyboardType="decimal-pad"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground"
      />
    </View>
  );
}
