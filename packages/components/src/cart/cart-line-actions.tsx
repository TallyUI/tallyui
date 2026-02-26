import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CartAction {
  id: string;
  label: string;
  onPress: () => void;
  color?: string;
  iconSlot?: ReactNode;
}

export interface CartLineActionsProps extends Omit<ViewProps, 'children'> {
  children: ReactNode;
  actions: CartAction[];
  className?: string;
}

export function CartLineActions({ children, actions, className, ...viewProps }: CartLineActionsProps) {
  return (
    <View className={cn('flex-row items-center', className)} {...viewProps}>
      <View className="flex-1">{children}</View>
      <View className="flex-row gap-1 px-2">
        {actions.map((action) => (
          <Pressable
            key={action.id}
            onPress={action.onPress}
            className="rounded-md px-2 py-1.5"
          >
            {action.iconSlot}
            <Text className={cn('text-xs font-medium', action.color ?? 'text-danger')}>
              {action.label}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}
