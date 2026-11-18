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
        {description && <Text className="text-xs text-muted-foreground">{description}</Text>}
      </View>
      {/* A group with nothing in it, such as Printers while loading, shows its header and no empty card, as v2's section does. */}
      {children != null && children !== false && <View className="rounded-lg border border-border bg-card">{children}</View>}
    </View>
  );
}
