import { useId, useState } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Label } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { HStack } from '../ui';

export interface SearchInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  className?: string;
}

export function SearchInput({ value, onChangeText, className, placeholder = 'Search...', style, onFocus, onBlur, ...props }: SearchInputProps) {
  const labelId = useId();
  const [focused, setFocused] = useState(false);

  return (
    <HStack space="sm" className={cn(
      'rounded-lg border bg-card px-3 py-2.5',
      focused ? 'border-ring' : 'border-border',
      className,
    )}>
      <Label.Root nativeID={labelId} asChild>
        <View aria-hidden className="relative h-4 w-4">
          <View className="absolute left-0 top-0 h-2.5 w-2.5 rounded-full border-2 border-muted-foreground" />
          <View className="absolute bottom-0 right-0 h-1.5 w-0.5 rotate-45 bg-muted-foreground" />
        </View>
      </Label.Root>
      <TextInput
        role="searchbox"
        aria-labelledby={labelId}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        className="flex-1 text-sm text-foreground"
        style={[{ outlineStyle: 'none' } as any, style]}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        {...props}
      />
    </HStack>
  );
}
