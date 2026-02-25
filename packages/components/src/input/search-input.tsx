import { TextInput, View, Text, type TextInputProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface SearchInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  className?: string;
}

export function SearchInput({ value, onChangeText, className, placeholder = 'Search...', ...props }: SearchInputProps) {
  return (
    <View className={cn('flex-row items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2', className)}>
      <Text className="text-muted">{'\u2315'}</Text>
      <TextInput
        role="searchbox"
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        className="flex-1 text-sm text-foreground"
        {...props}
      />
    </View>
  );
}
