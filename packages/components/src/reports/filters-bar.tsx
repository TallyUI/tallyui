/**
 * The Sales room's filters: the period presets (worked out in store time by pos `presetRange`),
 * status, cashier and register. Port of WCPOS v2 `screens/main/reports/date-button.tsx` and the
 * filter choices in its `LEDGER.md`; copy is v2's English (`core.json`).
 */
import { useState, type JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DatePreset, DayRange, StoreDay } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { DateRangeMenu } from './date-range-menu';

export { dayLabel } from './date-range-menu';

export interface SalesOption { value: string; label: string }
export interface SalesFilters {
  preset: DatePreset | 'custom';
  range: DayRange;
  /** A single day's comparison: the day before or the same weekday last week. */
  compare: 'previous' | 'week';
  status: string;
  cashierId: string | null;
  registerId: string | null;
}
export interface SalesFiltersBarProps {
  filters: SalesFilters;
  onFiltersChange: (next: SalesFilters) => void;
  /** IANA zone of the store, or 'device'. */
  timezone: string;
  /** The clock presets are worked out from; defaults to the time of the press. */
  now?: () => Date;
  /** The earliest store day the data covers; the calendar's min. */
  earliestDay?: StoreDay;
  statusOptions: SalesOption[];
  cashierOptions: SalesOption[];
  registerOptions: SalesOption[];
}

const ALL = 'all';

function ChoiceSelect({ id, value, options, onChange }: {
  id: string; value: string; options: SalesOption[]; onChange: (value: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const chosen = options.find((option) => option.value === value);
  return (
    <View className="gap-1">
      <Pressable testID={id} accessibilityRole="button" onPress={() => setOpen(!open)}
        className="rounded-md border border-border bg-card px-3 py-2">
        <Text className="text-sm text-foreground">{chosen?.label ?? value}</Text>
      </Pressable>
      {open && (
        <View className="rounded-md border border-border bg-card py-1">
          {options.map((option) => (
            <Pressable key={option.value} testID={`${id}-option-${option.value}`} accessibilityRole="radio"
              accessibilityState={{ checked: option.value === value }}
              onPress={() => { setOpen(false); onChange(option.value); }}
              className={cn('px-3 py-2', option.value === value && 'bg-muted')}>
              <Text className="text-sm text-foreground">{option.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

export function SalesFiltersBar({
  filters, onFiltersChange, timezone, now, earliestDay, statusOptions, cashierOptions, registerOptions,
}: SalesFiltersBarProps): JSX.Element {
  return (
    <View testID="sales-filters" className="flex-row flex-wrap items-start gap-2">
      <DateRangeMenu testID="sales-filter-period" value={{ preset: filters.preset, range: filters.range }}
        timezone={timezone} now={now} earliestDay={earliestDay}
        onChange={({ preset, range }) => onFiltersChange({ ...filters, preset, range })} />
      <ChoiceSelect id="sales-filter-status" value={filters.status} options={statusOptions}
        onChange={(status) => onFiltersChange({ ...filters, status })} />
      <ChoiceSelect id="sales-filter-cashier" value={filters.cashierId ?? ALL}
        options={[{ value: ALL, label: 'Everyone' }, ...cashierOptions]}
        onChange={(value) => onFiltersChange({ ...filters, cashierId: value === ALL ? null : value })} />
      <ChoiceSelect id="sales-filter-register" value={filters.registerId ?? ALL}
        options={[{ value: ALL, label: 'All registers' }, ...registerOptions]}
        onChange={(value) => onFiltersChange({ ...filters, registerId: value === ALL ? null : value })} />
    </View>
  );
}
