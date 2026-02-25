import { useMemo } from 'react';
import { Pressable, ScrollView, Text, type ViewProps } from 'react-native';
import { ToggleGroup } from '@tallyui/primitives';
import { cn } from '@tallyui/theme';

export interface FilterChipProps {
  label: string;
  active: boolean;
  onPress: () => void;
  className?: string;
}

/**
 * A single toggle chip. When used standalone, renders as a simple
 * ToggleGroup with one item.
 */
export function FilterChip({ label, active, onPress, className }: FilterChipProps) {
  const value = useMemo(() => (active ? [label] : []), [active, label]);

  return (
    <ToggleGroup.Root
      type="multiple"
      value={value}
      onValueChange={() => onPress()}
    >
      <ToggleGroup.Item value={label} asChild>
        <Pressable
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
      </ToggleGroup.Item>
    </ToggleGroup.Root>
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

/**
 * A horizontal scrollable row of toggleable filter chips.
 *
 * Built on top of the ToggleGroup primitive for proper `aria-pressed`
 * semantics and accessible toggle group behavior.
 */
export function FilterChipGroup({ chips, onChipPress, className, ...viewProps }: FilterChipGroupProps) {
  // Derive the controlled value from which chips are active
  const activeValues = useMemo(
    () => chips.filter((c) => c.active).map((c) => c.label),
    [chips],
  );

  // Build a label-to-index lookup so we can translate back to onChipPress(index)
  const labelToIndex = useMemo(() => {
    const map = new Map<string, number>();
    chips.forEach((chip, i) => map.set(chip.label, i));
    return map;
  }, [chips]);

  function handleValueChange(newValues: string[]) {
    // Find which chip was toggled by diffing against current active set
    const added = newValues.find((v) => !activeValues.includes(v));
    const removed = activeValues.find((v) => !newValues.includes(v));
    const toggledLabel = added ?? removed;
    if (toggledLabel !== undefined) {
      const index = labelToIndex.get(toggledLabel);
      if (index !== undefined) onChipPress(index);
    }
  }

  return (
    <ToggleGroup.Root
      type="multiple"
      value={activeValues}
      onValueChange={handleValueChange}
      asChild
    >
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerClassName={cn('flex-row gap-2', className)}
        {...viewProps}
      >
        {chips.map((chip) => (
          <ToggleGroup.Item key={chip.label} value={chip.label} asChild>
            <Pressable
              className={cn(
                'rounded-full px-3 py-1.5',
                chip.active ? 'bg-primary' : 'bg-surface-alt',
              )}
            >
              <Text className={cn('text-xs font-semibold', chip.active ? 'text-primary-foreground' : 'text-muted')}>
                {chip.label}
              </Text>
            </Pressable>
          </ToggleGroup.Item>
        ))}
      </ScrollView>
    </ToggleGroup.Root>
  );
}
