/**
 * The filter pills OrderFilterBar and ProductFilterBar share. Ported from WCPOS v2's `filter-bar/*-pill.tsx`
 * (MIT, WCPOS).
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { cn } from '@tallyui/theme';
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList, ComboboxTrigger } from '../ui/combobox';
import { XIcon } from '../ui/icon/x-icon';

export interface FilterOption { value: string; label: string }

// The chip look is ProductFilterBar's; the trigger inside it drops the form-field look of SelectTrigger/ComboboxTrigger.
export const chipClass = (on: boolean) => cn('min-h-11 flex-row items-center gap-1.5 rounded-full border px-3',
  on ? 'border-primary/30 bg-primary/10' : 'border-border bg-card');
export const TRIGGER_RESET = 'h-auto min-h-11 w-auto justify-start rounded-none border-0 bg-transparent px-0 py-0';
export const labelOf = (options: FilterOption[] | undefined, value: string) => options?.find((o) => o.value === value)?.label ?? value;

export function Chip({ id, on, label, onClear, trigger }: {
  id: string; on: boolean; label: string; onClear: () => void; trigger: (children: ReactNode) => ReactNode;
}) {
  return (
    <View className={chipClass(on)}>
      {trigger(<Text className={cn('text-sm', on ? 'text-primary' : 'text-foreground')}>{label}</Text>)}
      {on ? (
        <Pressable testID={`${id}-remove`} role="button" accessibilityLabel="Remove" onPress={onClear}
          hitSlop={8} className="min-h-11 min-w-8 items-center justify-center text-primary">
          <XIcon size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

export function ComboboxPill({ id, offLabel, placeholder, value, options, onSearch, onPick, onClear }: {
  id: string; offLabel: string; placeholder: string; value?: string; options: FilterOption[];
  onSearch?: (text: string) => void; onPick: (value: string) => void; onClear: () => void;
}) {
  const [search, setSearch] = useState('');
  const selected = value === undefined ? undefined : { value, label: labelOf(options, value) };
  const needle = search.trim().toLowerCase();
  const shown = onSearch || !needle ? options : options.filter((o) => o.label.toLowerCase().includes(needle));
  return (
    <Combobox value={selected} onValueChange={(next) => { if (next) onPick(next.value); }} searchValue={search}
      onSearchValueChange={(text) => { setSearch(text); onSearch?.(text); }}>
      <Chip id={id} on={!!selected} label={selected?.label ?? offLabel} onClear={onClear}
        trigger={(label) => <ComboboxTrigger testID={id} className={TRIGGER_RESET}>{label}</ComboboxTrigger>} />
      <ComboboxContent testID={`${id}-menu`}>
        <View className="border-b border-border px-2 py-1.5">
          <ComboboxInput testID={`${id}-search`} placeholder={placeholder} />
        </View>
        <ComboboxList>
          {shown.map((option) => (
            <ComboboxItem key={option.value} testID={`${id}-${option.value}`} value={option.value} label={option.label}>
              <Text className="text-sm text-popover-foreground">{option.label}</Text>
            </ComboboxItem>
          ))}
          {shown.length === 0 ? <ComboboxEmpty /> : null}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
