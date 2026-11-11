/**
 * The calendar's date math, on store days (`yyyy-MM-dd`) and months (`yyyy-MM`). Everything is UTC
 * day arithmetic, as pos `presetRange` does, so no `Date` is ever read in the device zone.
 */
import type { DayRange, StoreDay } from '@tallyui/pos';

export type Month = string;
/** 0 = Sunday, as `Date.getUTCDay`. */
export type WeekDay = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export interface GridDay { day: StoreDay; inMonth: boolean }

const DAY_MS = 86_400_000;
const iso = (at: number): StoreDay => new Date(at).toISOString().slice(0, 10);

export const monthOf = (day: StoreDay): Month => day.slice(0, 7);

export function addMonths(month: Month, n: number): Month {
  const [year, m] = month.split('-').map(Number);
  return iso(Date.UTC(year, m - 1 + n, 1)).slice(0, 7);
}

export const compareDays = (a: StoreDay, b: StoreDay): number => (a < b ? -1 : a > b ? 1 : 0);

/** The weeks of `month`, each 7 days from `weekStartsOn`; leading and trailing days belong to the neighbouring months. */
export function monthGrid(month: Month, weekStartsOn: WeekDay): GridDay[][] {
  const [year, m] = month.split('-').map(Number);
  const first = Date.UTC(year, m - 1, 1);
  const lead = (new Date(first).getUTCDay() - weekStartsOn + 7) % 7;
  const length = new Date(Date.UTC(year, m, 0)).getUTCDate();
  return Array.from({ length: Math.ceil((lead + length) / 7) }, (_, row) => Array.from({ length: 7 }, (_, col) => {
    const day = iso(first + (row * 7 + col - lead) * DAY_MS);
    return { day, inMonth: monthOf(day) === month };
  }));
}

/** v2's two-tap rule. `anchor` is the first tap of a range still being picked, or null. */
export function pressRangeDay(anchor: StoreDay | null, day: StoreDay): { range: DayRange; anchor: StoreDay | null } {
  if (anchor === null) return { range: { from: day, to: day }, anchor: day };
  return { range: compareDays(day, anchor) < 0 ? { from: day, to: anchor } : { from: anchor, to: day }, anchor: null };
}
