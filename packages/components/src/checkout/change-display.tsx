import { Text, View, type ViewProps } from 'react-native';

import { formatMoney, type Money } from '@tallyui/core';
import { cn } from '@tallyui/theme';

export interface ChangeDisplayProps extends Omit<ViewProps, 'children'> {
  change: Money;
  locale?: string;
  className?: string;
}

export function ChangeDisplay({ change, locale, className, ...viewProps }: ChangeDisplayProps) {
  return (
    <View className={cn('items-center gap-1 rounded-xl bg-muted p-4', className)} {...viewProps}>
      <Text className="text-sm text-muted-foreground">Change Due</Text>
      <Text className="text-3xl font-bold text-success">{formatMoney(change, locale) ?? '—'}</Text>
    </View>
  );
}
