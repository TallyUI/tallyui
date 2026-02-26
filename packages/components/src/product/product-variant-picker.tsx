import { Pressable, Text, View, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface VariantOption {
  name: string;
  values: string[];
}

export interface ProductVariantPickerProps extends Omit<ViewProps, 'children'> {
  options: VariantOption[];
  selected?: Record<string, string>;
  onSelect?: (selection: Record<string, string>) => void;
  className?: string;
}

export function ProductVariantPicker({
  options,
  selected = {},
  onSelect,
  className,
  ...viewProps
}: ProductVariantPickerProps) {
  const handleSelect = (optionName: string, value: string) => {
    onSelect?.({ ...selected, [optionName]: value });
  };

  return (
    <View className={cn('gap-3', className)} {...viewProps}>
      {options.map((option) => (
        <View key={option.name} className="gap-1.5">
          <Text className="text-xs font-semibold text-muted">{option.name}</Text>
          <View className="flex-row flex-wrap gap-2">
            {option.values.map((value) => {
              const active = selected[option.name] === value;
              return (
                <Pressable
                  key={value}
                  onPress={() => handleSelect(option.name, value)}
                  className={cn(
                    'rounded-lg border px-3 py-1.5',
                    active ? 'border-primary bg-primary/10' : 'border-border bg-surface',
                  )}
                >
                  <Text
                    className={cn(
                      'text-sm font-medium',
                      active ? 'text-primary' : 'text-foreground',
                    )}
                  >
                    {value}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ))}
    </View>
  );
}
