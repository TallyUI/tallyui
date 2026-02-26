import type { ReactNode } from 'react';
import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface RegisterOpenCloseProps extends Omit<ViewProps, 'children'> {
  isOpen: boolean;
  onOpen?: () => void;
  onClose?: () => void;
  expectedBalance?: number;
  cashCountSlot?: ReactNode;
  notesSlot?: ReactNode;
  className?: string;
}

export function RegisterOpenClose({
  isOpen,
  onOpen,
  onClose,
  expectedBalance,
  cashCountSlot,
  notesSlot,
  className,
  ...viewProps
}: RegisterOpenCloseProps) {
  return (
    <View className={cn('gap-4 p-4', className)} {...viewProps}>
      <Text className="text-lg font-bold text-foreground">
        {isOpen ? 'Close Register' : 'Open Register'}
      </Text>

      {isOpen && expectedBalance != null && (
        <View className="flex-row justify-between rounded-lg bg-surface-alt px-3 py-2">
          <Text className="text-sm text-muted">Expected Balance</Text>
          <Text className="text-sm font-semibold text-foreground">{expectedBalance.toFixed(2)}</Text>
        </View>
      )}

      {cashCountSlot && <View>{cashCountSlot}</View>}
      {notesSlot && <View>{notesSlot}</View>}

      <Pressable
        onPress={isOpen ? onClose : onOpen}
        className="items-center rounded-lg bg-primary px-4 py-3"
      >
        <Text className="text-sm font-semibold text-primary-foreground">
          {isOpen ? 'Close Register' : 'Open Register'}
        </Text>
      </Pressable>
    </View>
  );
}
