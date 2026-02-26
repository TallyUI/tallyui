import type { ReactNode } from 'react';
import { Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface SettingsRowProps extends Omit<ViewProps, 'children'> {
  label: string;
  description?: string;
  action?: ReactNode;
  className?: string;
}

export function SettingsRow({ label, description, action, className, ...viewProps }: SettingsRowProps) {
  return (
    <View className={cn('flex-row items-center gap-3 px-4 py-3', className)} {...viewProps}>
      <View className="flex-1 gap-0.5">
        <Text className="text-sm font-medium text-foreground">{label}</Text>
        {description && <Text className="text-xs text-muted">{description}</Text>}
      </View>
      {action && <View>{action}</View>}
    </View>
  );
}
