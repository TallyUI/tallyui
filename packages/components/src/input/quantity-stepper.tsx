import { useState } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface QuantityStepperProps extends Omit<ViewProps, 'children'> {
  defaultQuantity?: number;
  quantity?: number;
  onChangeQuantity?: (quantity: number) => void;
  min?: number;
  max?: number;
  className?: string;
}

export function QuantityStepper({
  defaultQuantity = 1,
  quantity: controlledQuantity,
  onChangeQuantity,
  min = 1,
  max = 999,
  className,
  ...viewProps
}: QuantityStepperProps) {
  const [internalQuantity, setInternalQuantity] = useState(defaultQuantity);
  const quantity = controlledQuantity ?? internalQuantity;

  const handleChange = (next: number) => {
    if (next < min || next > max) return;
    if (controlledQuantity === undefined) setInternalQuantity(next);
    onChangeQuantity?.(next);
  };

  return (
    <View className={cn('flex-row items-center gap-2', className)} {...viewProps}>
      <Pressable
        onPress={() => handleChange(quantity - 1)}
        disabled={quantity <= min}
        className={cn(
          'h-8 w-8 items-center justify-center rounded-lg',
          quantity <= min ? 'bg-surface-alt/50' : 'bg-surface-alt',
        )}
      >
        <Text className={cn('text-base font-semibold', quantity <= min ? 'text-muted' : 'text-foreground')}>
          {'\u2212'}
        </Text>
      </Pressable>
      <Text className="min-w-[2rem] text-center text-base font-semibold text-foreground">
        {quantity}
      </Text>
      <Pressable
        onPress={() => handleChange(quantity + 1)}
        disabled={quantity >= max}
        className={cn(
          'h-8 w-8 items-center justify-center rounded-lg',
          quantity >= max ? 'bg-surface-alt/50' : 'bg-surface-alt',
        )}
      >
        <Text className={cn('text-base font-semibold', quantity >= max ? 'text-muted' : 'text-foreground')}>
          +
        </Text>
      </Pressable>
    </View>
  );
}
