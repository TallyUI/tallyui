import { useState } from 'react';
import { Pressable, Text, TextInput, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CartNoteInputProps extends Omit<ViewProps, 'children'> {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  className?: string;
}

export function CartNoteInput({
  value,
  onChangeText,
  placeholder = 'Order note...',
  className,
  ...viewProps
}: CartNoteInputProps) {
  const [expanded, setExpanded] = useState(value.length > 0);

  if (!expanded) {
    return (
      <Pressable
        onPress={() => setExpanded(true)}
        className={cn('flex-row items-center gap-1.5 px-3 py-2', className)}
        {...viewProps}
      >
        <Text className="text-xs text-primary">Add note</Text>
      </Pressable>
    );
  }

  return (
    <View className={cn('px-3 py-2', className)} {...viewProps}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        multiline
        className="min-h-[3rem] rounded-lg border border-border bg-surface px-3 py-2 text-sm text-foreground"
      />
    </View>
  );
}
