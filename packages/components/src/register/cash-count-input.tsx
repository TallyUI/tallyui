import { useState } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

import { QuantityStepper } from '../input/quantity-stepper';

export interface Denomination {
  label: string;
  value: number;
}

const DEFAULT_DENOMINATIONS: Denomination[] = [
  { label: '$100', value: 100 },
  { label: '$50', value: 50 },
  { label: '$20', value: 20 },
  { label: '$10', value: 10 },
  { label: '$5', value: 5 },
  { label: '$1', value: 1 },
  { label: '25\u00a2', value: 0.25 },
  { label: '10\u00a2', value: 0.10 },
  { label: '5\u00a2', value: 0.05 },
  { label: '1\u00a2', value: 0.01 },
];

export interface CashCountInputProps extends Omit<ViewProps, 'children'> {
  denominations?: Denomination[];
  defaultCounts?: Record<number, number>;
  counts?: Record<number, number>;
  onChangeCounts?: (counts: Record<number, number>) => void;
  onChangeTotal?: (total: number) => void;
  className?: string;
}

export function CashCountInput({
  denominations = DEFAULT_DENOMINATIONS,
  defaultCounts,
  counts: controlledCounts,
  onChangeCounts,
  onChangeTotal,
  className,
  ...viewProps
}: CashCountInputProps) {
  const [internalCounts, setInternalCounts] = useState<Record<number, number>>(defaultCounts ?? {});
  const counts = controlledCounts ?? internalCounts;

  const total = denominations.reduce(
    (sum, d) => sum + d.value * (counts[d.value] ?? 0),
    0,
  );

  const handleCountChange = (denomination: number, quantity: number) => {
    const next = { ...counts, [denomination]: quantity };
    if (controlledCounts === undefined) setInternalCounts(next);
    onChangeCounts?.(next);
    const newTotal = denominations.reduce(
      (sum, d) => sum + d.value * (next[d.value] ?? 0),
      0,
    );
    onChangeTotal?.(newTotal);
  };

  return (
    <View className={cn('gap-2', className)} {...viewProps}>
      {denominations.map((d) => (
        <View key={d.value} className="flex-row items-center justify-between px-3 py-1">
          <Text className="w-16 text-sm font-medium text-foreground">{d.label}</Text>
          <QuantityStepper
            quantity={counts[d.value] ?? 0}
            min={0}
            onChangeQuantity={(qty) => handleCountChange(d.value, qty)}
          />
          <Text className="w-20 text-right text-sm text-muted">
            {(d.value * (counts[d.value] ?? 0)).toFixed(2)}
          </Text>
        </View>
      ))}
      <View className="border-t border-border px-3 pt-2">
        <Text className="text-right text-base font-bold text-foreground">
          Total: {total.toFixed(2)}
        </Text>
      </View>
    </View>
  );
}
