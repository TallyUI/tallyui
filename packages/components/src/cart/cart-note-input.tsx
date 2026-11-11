import { useState } from 'react';
import { Pressable, Text, TextInput, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface CartNoteInputProps extends Omit<ViewProps, 'children'> {
  value: string;
  onChangeText: (text: string) => void;
  /**
   * The note's name, shown by the collapsed link, the input's placeholder and
   * its accessibility label. WooCommerce sends the note as `customer_note`, so
   * the customer sees it.
   */
  label?: string;
  placeholder?: string;
  className?: string;
}

export function CartNoteInput({
  value,
  onChangeText,
  label = 'Customer note',
  placeholder = label,
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
        <Text className="text-xs text-primary">{`Add ${label.toLowerCase()}`}</Text>
      </Pressable>
    );
  }

  return (
    <View className={cn('px-3 py-2', className)} {...viewProps}>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        accessibilityLabel={label}
        placeholderTextColorClassName="accent-muted-foreground"
        multiline
        className="min-h-[3rem] rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground"
      />
    </View>
  );
}
