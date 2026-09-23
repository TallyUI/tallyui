import { useId } from 'react';
import { TextInput, View, type TextInputProps } from 'react-native';
import { Label } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';
import { SearchIcon, HStack } from '../ui';

export interface SearchInputProps extends Omit<TextInputProps, 'value' | 'onChangeText'> {
  value: string;
  onChangeText: (text: string) => void;
  className?: string;
}

export function SearchInput({ value, onChangeText, className, placeholder = 'Search...', ...props }: SearchInputProps) {
  const labelId = useId();

  return (
    <HStack space="sm" className={cn('rounded-lg border border-border bg-card px-3 py-2', className)}>
      <Label.Root nativeID={labelId} asChild>
        <View className="text-muted-foreground">
          <SearchIcon size={16} />
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
        {...props}
      />
    </HStack>
  );
}
