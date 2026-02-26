import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface ChangeDisplayProps extends Omit<ViewProps, 'children'> {
  tendered: number;
  total: number;
  className?: string;
}

export function ChangeDisplay({ tendered, total, className, ...viewProps }: ChangeDisplayProps) {
  const change = Math.max(0, tendered - total);

  return (
    <View className={cn('items-center gap-1 rounded-xl bg-surface-alt p-4', className)} {...viewProps}>
      <Text className="text-sm text-muted">Change Due</Text>
      <Text className="text-3xl font-bold text-success">{change.toFixed(2)}</Text>
    </View>
  );
}
