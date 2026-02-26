import { Pressable, Text, View, type ViewProps } from 'react-native';
import type { ReactNode } from 'react';

import { cn } from '@tallyui/theme';

export interface PaymentMethodCardProps extends Omit<ViewProps, 'children'> {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  className?: string;
}

export function PaymentMethodCard({ label, selected, onPress, icon, className, ...viewProps }: PaymentMethodCardProps) {
  return (
    <Pressable onPress={onPress} {...viewProps}>
      <View
        className={cn(
          'flex-row items-center gap-3 rounded-lg border px-4 py-3',
          selected ? 'border-primary bg-primary/5' : 'border-border bg-card',
          className,
        )}
      >
        {icon && <View>{icon}</View>}
        <Text className={cn('flex-1 text-sm font-medium', selected ? 'text-primary' : 'text-foreground')}>
          {label}
        </Text>
        {selected && (
          <View className="h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Text className="text-xs text-primary-foreground">{'\u2713'}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
