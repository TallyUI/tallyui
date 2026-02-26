import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface SettingsGroupProps extends Omit<ViewProps, 'children'> {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function SettingsGroup({ title, description, children, className, ...viewProps }: SettingsGroupProps) {
  return (
    <View className={cn('gap-1', className)} {...viewProps}>
      <View className="px-4 py-2">
        <Text className="text-sm font-semibold text-foreground">{title}</Text>
        {description && <Text className="text-xs text-muted">{description}</Text>}
      </View>
      <View className="rounded-lg border border-border bg-surface">{children}</View>
    </View>
  );
}
