/**
 * A month calendar with single and range selection, `min`/`max` bounds and a week start. WCPOS v2
 * wraps react-native-calendars (`components/src/calendar/calendar-impl.tsx`); this is a plain grid
 * of Pressables with theme token classes instead, so it adds no dependency. Days are store days.
 */
import { useMemo, useState, type JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DayRange, StoreDay } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { addMonths, monthGrid, monthOf, pressRangeDay, type Month, type WeekDay } from './month-grid';

interface CalendarBaseProps {
  min?: StoreDay;
  max?: StoreDay;
  /** Default 1 (Monday), as v2 hard-codes. */
  weekStartsOn?: WeekDay;
  /** The month shown first; defaults to the month of the value's start, else of `today`. */
  initialMonth?: Month;
  /** Today as a store day, for the today mark and the default month; the caller works it out in store time. */
  today: StoreDay;
  /** BCP 47 tag for the month and weekday names via Intl, default 'en-GB'. */
  locale?: string;
  testID?: string;
  className?: string;
}
export type CalendarProps =
  | (CalendarBaseProps & { mode: 'single'; value: StoreDay | null; onChange: (day: StoreDay) => void })
  | (CalendarBaseProps & { mode: 'range'; value: DayRange | null; onChange: (range: DayRange) => void });

const utc = (day: StoreDay) => new Date(`${day}T00:00:00Z`);
// 1 January 2023 was a Sunday, so day `i` of that week is weekday `i`.
const weekdayDate = (weekday: number) => new Date(Date.UTC(2023, 0, 1 + weekday));
const rangeKey = (range: DayRange | null) => (range ? `${range.from}/${range.to}` : '');

export function Calendar(props: CalendarProps): JSX.Element {
  const { min, max, weekStartsOn = 1, today, locale = 'en-GB', testID = 'calendar', className } = props;
  const start = props.mode === 'single' ? props.value : props.value?.from ?? null;
  const [month, setMonth] = useState<Month>(props.initialMonth ?? monthOf(start ?? today));
  // The first tap of a range still being picked, and the one-day range it reported.
  const [pick, setPick] = useState<{ anchor: StoreDay; reported: string } | null>(null);
  const valueKey = props.mode === 'range' ? rangeKey(props.value) : '';
  const [seen, setSeen] = useState(valueKey);
  if (seen !== valueKey) {
    setSeen(valueKey);
    if (pick && pick.reported !== valueKey) setPick(null);
  }
  const format = useMemo(() => ({
    title: new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }),
    full: new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }),
  }), [locale]);

  const outside = (day: StoreDay) => (min !== undefined && day < min) || (max !== undefined && day > max);
  const prevDisabled = min !== undefined && addMonths(month, -1) < monthOf(min);
  const nextDisabled = max !== undefined && addMonths(month, 1) > monthOf(max);
  const press = (day: StoreDay) => {
    if (outside(day)) return;
    if (props.mode === 'single') return props.onChange(day);
    const next = pressRangeDay(pick?.anchor ?? null, day);
    setPick(next.anchor ? { anchor: next.anchor, reported: rangeKey(next.range) } : null);
    props.onChange(next.range);
  };
  const look = (day: StoreDay): 'end' | 'inside' | null => {
    if (props.mode === 'single') return props.value === day ? 'end' : null;
    const range = props.value;
    if (!range) return null;
    if (day === range.from || day === range.to) return 'end';
    return day > range.from && day < range.to ? 'inside' : null;
  };
  const arrow = (id: 'prev' | 'next', disabled: boolean, glyph: string, label: string) => (
    <Pressable testID={`${testID}-${id}`} accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled }} aria-disabled={disabled} disabled={disabled}
      onPress={() => { if (!disabled) setMonth(addMonths(month, id === 'prev' ? -1 : 1)); }}
      className={cn('h-9 w-9 items-center justify-center rounded-md active:bg-accent', disabled && 'opacity-40')}>
      <Text className="text-xl text-primary">{glyph}</Text>
    </Pressable>
  );

  return (
    <View testID={testID} className={cn('gap-1', className)}>
      <View className="flex-row items-center justify-between">
        {arrow('prev', prevDisabled, '‹', 'Previous month')}
        <Text testID={`${testID}-title`} className="text-base font-medium text-foreground">{format.title.format(utc(`${month}-01`))}</Text>
        {arrow('next', nextDisabled, '›', 'Next month')}
      </View>
      <View testID={`${testID}-weekdays`} className="flex-row">
        {Array.from({ length: 7 }, (_, i) => (
          <Text key={i} className="flex-1 text-center text-xs font-medium text-muted-foreground">
            {format.weekday.format(weekdayDate((weekStartsOn + i) % 7))}
          </Text>
        ))}
      </View>
      {monthGrid(month, weekStartsOn).map((week) => (
        <View key={week[0].day} className="flex-row">
          {week.map(({ day, inMonth }) => {
            const disabled = outside(day);
            const state = look(day);
            const selected = state !== null;
            return (
              <Pressable key={day} testID={`${testID}-day-${day}`} accessibilityRole="button"
                accessibilityLabel={format.full.format(utc(day))} accessibilityState={{ selected, disabled }}
                aria-selected={selected} aria-disabled={disabled} disabled={disabled} onPress={() => press(day)}
                className={cn('aspect-square min-h-9 min-w-9 flex-1 items-center justify-center rounded-md',
                  state === 'end' && 'bg-primary', state === 'inside' && 'bg-primary/15')}>
                <Text className={cn('text-sm',
                  state === 'end' ? 'text-primary-foreground'
                    : disabled ? 'text-border'
                      : day === today ? 'font-medium text-primary'
                        : inMonth ? 'text-foreground' : 'text-muted-foreground')}>
                  {Number(day.slice(8))}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}
