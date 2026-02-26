import { useState } from 'react';
import { Pressable, Text, TextInput, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CashTenderedProps extends Omit<ViewProps, 'children'> {
  total: number;
  defaultAmount?: number;
  amount?: number;
  onChangeAmount?: (amount: number) => void;
  quickAmounts?: number[];
  className?: string;
}

function defaultQuickAmounts(total: number): number[] {
  const amounts = [
    total,
    Math.ceil(total / 5) * 5,
    Math.ceil(total / 10) * 10,
    Math.ceil(total / 20) * 20,
  ];
  return [...new Set(amounts)].sort((a, b) => a - b);
}

export function CashTendered({
  total,
  defaultAmount,
  amount: controlledAmount,
  onChangeAmount,
  quickAmounts,
  className,
  ...viewProps
}: CashTenderedProps) {
  const [internalAmount, setInternalAmount] = useState(defaultAmount ?? total);
  const amount = controlledAmount ?? internalAmount;
  const buttons = quickAmounts ?? defaultQuickAmounts(total);

  const handleChange = (value: number) => {
    if (controlledAmount === undefined) setInternalAmount(value);
    onChangeAmount?.(value);
  };

  return (
    <View className={cn('gap-3', className)} {...viewProps}>
      <Text className="text-sm font-semibold text-foreground">Cash Tendered</Text>
      <View className="flex-row flex-wrap gap-2">
        {buttons.map((val) => (
          <Pressable
            key={val}
            onPress={() => handleChange(val)}
            className={cn(
              'rounded-lg px-4 py-2',
              amount === val ? 'bg-primary' : 'bg-surface-alt',
            )}
          >
            <Text
              className={cn(
                'text-sm font-semibold',
                amount === val ? 'text-primary-foreground' : 'text-foreground',
              )}
            >
              {val.toFixed(2)}
            </Text>
          </Pressable>
        ))}
      </View>
      <TextInput
        value={String(amount.toFixed(2))}
        onChangeText={(text) => {
          const parsed = parseFloat(text);
          if (!isNaN(parsed) && parsed >= 0) handleChange(parsed);
        }}
        keyboardType="decimal-pad"
        className="rounded-lg border border-border bg-surface px-3 py-2 text-base text-foreground"
      />
    </View>
  );
}
