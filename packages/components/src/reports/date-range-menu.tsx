/**
 * The Reports period menu: the date presets beside a range calendar, for a custom range. Port of
 * WCPOS v2 `screens/main/reports/date-button.tsx` without its Pro licence locks; copy is v2's
 * English (`core.json`). Presets are worked out in store time by pos `presetRange`.
 */
import { useState, type JSX } from 'react';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { DATE_PRESETS, presetRange, type DatePreset, type DayRange, type StoreDay } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Calendar } from '../ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';

export interface DateRangeMenuProps {
  value: { preset: DatePreset | 'custom'; range: DayRange };
  /** Called on a preset row (immediately) and on Done (the custom range). */
  onChange: (next: { preset: DatePreset | 'custom'; range: DayRange }) => void;
  /** IANA zone of the store, or 'device'. */
  timezone: string;
  /** The clock presets and today are worked out from; defaults to the time of the press. */
  now?: () => Date;
  /** The earliest store day the data covers; the calendar's min. Omitted: no min. */
  earliestDay?: StoreDay;
  testID?: string;
}

export const PRESET_LABELS: Record<DatePreset, string> = {
  today: 'Today', yesterday: 'Yesterday', thisWeek: 'This Week',
  lastWeek: 'Last Week', thisMonth: 'This Month', lastMonth: 'Last Month',
};
// v2's phone boundary (app-shell.tsx); below it the presets stack above the calendar.
const WIDE_MIN_WIDTH = 768;

const format = (day: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('en-GB', { ...options, timeZone: 'UTC' }).format(new Date(`${day}T00:00:00Z`));
/** `10 Nov` for a store day. */
export const dayLabel = (day: string): string => format(day, { day: 'numeric', month: 'short' });
/** `10 Nov`, `3–10 Nov` or `28 Oct – 3 Nov`, as v2's `periodLabel`. */
export function rangeLabel({ from, to }: DayRange): string {
  if (from === to) return dayLabel(from);
  if (from.slice(0, 7) === to.slice(0, 7)) return `${format(from, { day: 'numeric' })}–${dayLabel(to)}`;
  return `${dayLabel(from)} – ${dayLabel(to)}`;
}

export function DateRangeMenu({
  value, onChange, timezone, now, earliestDay, testID = 'reports-period',
}: DateRangeMenuProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange>(value.range);
  const { width } = useWindowDimensions();
  const wide = width >= WIDE_MIN_WIDTH;
  const clock = () => (now ?? (() => new Date()))();
  const today = presetRange('today', clock(), timezone).from;
  const openChange = (next: boolean) => {
    if (next) setDraft(value.range);
    setOpen(next);
  };
  const choose = (preset: DatePreset) => {
    setOpen(false);
    onChange({ preset, range: presetRange(preset, clock(), timezone) });
  };
  const done = () => {
    const at = clock();
    const preset = DATE_PRESETS.find((key) => {
      const range = presetRange(key, at, timezone);
      return range.from === draft.from && range.to === draft.to;
    });
    setOpen(false);
    onChange({ preset: preset ?? 'custom', range: draft });
  };
  const label = value.preset === 'custom' ? 'Custom range' : PRESET_LABELS[value.preset];

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger testID={testID} accessibilityRole="button"
        className="rounded-md border border-border bg-card px-3 py-2">
        <Text className="text-sm text-foreground">{`${label} · ${rangeLabel(value.range)}`}</Text>
      </PopoverTrigger>
      <PopoverContent testID={`${testID}-menu`} align="start" className="p-0"
        style={{ width: wide ? Math.min(556, width) : Math.min(360, width) }}>
        <View className={cn(wide && 'flex-row')}>
          <View className={cn('gap-0.5 p-2', wide && 'w-48 shrink-0')}>
            <Text className="px-2 py-1 text-xs font-medium text-muted-foreground">Date Range</Text>
            {DATE_PRESETS.map((preset) => {
              const selected = value.preset === preset;
              return (
                <Pressable key={preset} testID={`${testID}-${preset}`} accessibilityRole="button"
                  accessibilityState={{ selected }} aria-selected={selected} onPress={() => choose(preset)}
                  className={cn('rounded-md px-2 py-2 active:bg-accent', selected && 'bg-muted')}>
                  <Text className={cn('text-sm text-foreground', selected && 'font-medium')}>{PRESET_LABELS[preset]}</Text>
                </Pressable>
              );
            })}
          </View>
          <View className="flex-1 p-2">
            <Calendar testID={`${testID}-calendar`} mode="range" value={draft} onChange={setDraft}
              today={today} max={today} min={earliestDay} />
          </View>
        </View>
        <View className="flex-row items-center gap-2 border-t border-border p-2">
          <Text className="flex-1 text-sm text-muted-foreground">Tap a day, or two days for a range.</Text>
          <Pressable testID={`${testID}-apply`} accessibilityRole="button" onPress={done}
            className="h-10 justify-center rounded-md bg-primary px-4 active:opacity-90">
            <Text className="text-sm font-medium text-primary-foreground">Done</Text>
          </Pressable>
        </View>
      </PopoverContent>
    </Popover>
  );
}
