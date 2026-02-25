import { Pressable, ScrollView, Text, type ViewProps } from 'react-native';

import { cn } from '@tallyui/theme';

export interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  className?: string;
}

export function FilterChip({ label, active, onPress, className }: FilterChipProps) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full px-3 py-1.5',
        active ? 'bg-primary' : 'bg-surface-alt',
        className,
      )}
    >
      <Text className={cn('text-xs font-semibold', active ? 'text-primary-foreground' : 'text-muted')}>
        {label}
      </Text>
    </Pressable>
  );
}

export interface ChipItem {
  label: string;
  active: boolean;
}

export interface FilterChipGroupProps extends Omit<ViewProps, 'children'> {
  chips: ChipItem[];
  onChipPress: (index: number) => void;
  className?: string;
}

export function FilterChipGroup({ chips, onChipPress, className, ...viewProps }: FilterChipGroupProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName={cn('flex-row gap-2', className)}
      {...viewProps}
    >
      {chips.map((chip, index) => (
        <FilterChip
          key={chip.label}
          label={chip.label}
          active={chip.active}
          onPress={() => onChipPress(index)}
        />
      ))}
    </ScrollView>
  );
}
