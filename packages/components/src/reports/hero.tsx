/**
 * The Sales room's hero: the period's gross, its change against the comparison period and a
 * daily chart of both. Port of WCPOS v2 `screens/main/reports/hero/index.tsx` (`Difference`, the
 * companions Orders · Average order · Items) and the comparison labels of its `LEDGER.md`.
 * The bars are Views with theme token classes, so the chart takes its colours from the theme.
 */
import type { JSX } from 'react';
import { Pressable, Text, View } from 'react-native';
import { formatMoney } from '@tallyui/core';
import { daysOf, type SalesFigures } from '@tallyui/pos';
import { cn } from '@tallyui/theme';
import { Card } from '../ui/card';
import { dayLabel, type SalesFilters } from './filters-bar';

export interface SalesHeroProps {
  figures: SalesFigures;
  filters: SalesFilters;
  onFiltersChange: (next: SalesFilters) => void;
  currency: string;
}

const NO_COMPARISON = '—';
const signed = (diff: number, format: (n: number) => string) =>
  diff === 0 ? '±0' : `${diff > 0 ? '+' : '−'}${format(Math.abs(diff))}`;

/** A change against the comparison, or `—` when there is nothing to compare with. */
function Difference({ testID, text, diff, suffix }: { testID: string; text?: string; diff: number; suffix?: string }): JSX.Element {
  const tone = text === undefined || diff === 0 ? 'text-muted-foreground' : diff > 0 ? 'text-success' : 'text-destructive';
  return (
    <Text testID={testID} className={cn('text-sm', tone)} accessibilityLabel={text === undefined ? 'No comparison' : undefined}>
      {text === undefined ? NO_COMPARISON : suffix ? `${text} ${suffix}` : text}
    </Text>
  );
}

/** A custom range compares as pos `comparisonRange` does by day count: a day, a week (up to 7) or a month. */
const customDays = (filters: SalesFilters) => (filters.preset === 'custom' ? daysOf(filters.range).length : 0);

function compareLabel(filters: SalesFilters): string {
  const days = customDays(filters);
  if (filters.preset === 'thisWeek' || filters.preset === 'lastWeek' || (days > 1 && days <= 7)) return 'vs the week before';
  if (filters.preset === 'thisMonth' || filters.preset === 'lastMonth' || days > 7) return 'vs the month before';
  if (filters.compare === 'previous') return 'vs yesterday';
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${filters.range.from}T00:00:00Z`));
  return `vs last ${weekday}`;
}

export function SalesHero({ figures, filters, onFiltersChange, currency }: SalesHeroProps): JSX.Element {
  const money = (minor: number) => formatMoney({ amount: minor, currency }) ?? '';
  const { totals, series } = figures;
  const before = figures.comparison && figures.comparison.totals.orderCount > 0 ? figures.comparison.totals : undefined;
  const label = compareLabel(filters);
  const grossDiff = before ? totals.grossMinor - before.grossMinor : 0;
  const pct = before && before.grossMinor !== 0 ? Math.round((grossDiff / before.grossMinor) * 1000) / 10 : undefined;
  const companions = [
    { id: 'orders', name: 'Orders', value: totals.orderCount, prev: before?.orderCount, format: String },
    { id: 'average', name: 'Average order', value: totals.averageMinor, prev: before?.averageMinor, format: money },
    { id: 'items', name: 'Items', value: totals.items, prev: before?.items, format: String },
  ];
  const compareSeries = figures.comparison?.series ?? [];
  const max = Math.max(0, ...series.map((point) => point.grossMinor), ...compareSeries.map((point) => point.grossMinor));
  const height = (gross: number) => `${max > 0 ? (Math.max(0, gross) / max) * 100 : 0}%` as const;
  const oneDay = filters.preset === 'today' || filters.preset === 'yesterday' || customDays(filters) === 1;

  return (
    <Card testID="sales-hero" className="gap-4 p-4">
      <View className="flex-row flex-wrap items-end gap-3">
        <Text testID="hero-total" className="text-4xl font-bold text-foreground">{money(totals.grossMinor)}</Text>
        <Difference testID="hero-delta" diff={pct ?? 0} suffix={label}
          text={pct === undefined ? undefined : pct === 0 ? '±0%' : signed(pct, (n) => `${n.toFixed(1)}%`)} />
      </View>
      {oneDay ? (
        <View className="flex-row gap-2">
          {(['previous', 'week'] as const).map((compare) => (
            <Pressable key={compare} testID={`hero-compare-${compare}`} accessibilityRole="radio"
              accessibilityState={{ checked: filters.compare === compare }}
              onPress={() => onFiltersChange({ ...filters, compare })}
              className={cn('rounded-md border border-border px-3 py-1', filters.compare === compare && 'bg-muted')}>
              <Text className="text-sm text-foreground">{compareLabel({ ...filters, compare })}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text testID="hero-compare" className="text-sm text-muted-foreground">{label}</Text>
      )}
      <View className="flex-row flex-wrap gap-6">
        {companions.map(({ id, name, value, prev, format }) => (
          <View key={id} className="gap-0.5">
            <Text className="text-xs text-muted-foreground">{name}</Text>
            <Text testID={`hero-${id}`} className="text-lg font-semibold text-foreground">{format(value)}</Text>
            <Difference testID={`hero-${id}-delta`} diff={prev === undefined ? 0 : value - prev}
              text={prev === undefined ? undefined : signed(value - prev, format)} />
          </View>
        ))}
      </View>
      <View testID="hero-chart" className="h-40 flex-row items-end gap-1">
        {series.map((point, i) => (
          <View key={point.day} className="h-full flex-1 flex-row items-end gap-0.5">
            {compareSeries[i] && (
              <View testID={`hero-bar-compare-${i}`} className="flex-1 rounded-sm bg-muted-foreground opacity-30"
                style={{ height: height(compareSeries[i].grossMinor) }} />
            )}
            <View testID={`hero-bar-${i}`} className="flex-1 rounded-sm bg-primary" style={{ height: height(point.grossMinor) }} />
          </View>
        ))}
      </View>
      {series.length > 0 && (
        <View className="flex-row justify-between">
          <Text className="text-xs text-muted-foreground">{dayLabel(series[0].day)}</Text>
          {series.length > 1 && <Text className="text-xs text-muted-foreground">{dayLabel(series[series.length - 1].day)}</Text>}
        </View>
      )}
    </Card>
  );
}
