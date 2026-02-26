import { Pressable, View, type PressableProps } from 'react-native';
import type { ReactNode } from 'react';

import { cn } from '@tallyui/theme';
import { Text, HStack } from '../ui';

export interface PaymentMethodCardProps extends Omit<PressableProps, 'children'> {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  className?: string;
}

export function PaymentMethodCard({ label, selected, onPress, icon, className, ...props }: PaymentMethodCardProps) {
  return (
    <Pressable onPress={onPress} {...props}>
      <HStack
        className={cn(
          'rounded-lg border px-4 py-3',
          selected ? 'border-primary bg-primary/5' : 'border-border bg-card',
          className,
        )}
      >
        {icon && <View>{icon}</View>}
        <Text className={cn('flex-1 text-sm font-medium', selected ? 'text-primary' : '')}>
          {label}
        </Text>
        {selected && (
          <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Text className="text-xs text-primary-foreground">{'\u2713'}</Text>
          </View>
        )}
      </HStack>
    </Pressable>
  );
}
