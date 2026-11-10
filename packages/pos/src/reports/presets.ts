import { businessDayOf } from '../register/session-store';
import type { DayRange, StoreDay } from './types';

export type DatePreset = 'today' | 'yesterday' | 'thisWeek' | 'lastWeek' | 'thisMonth' | 'lastMonth';
export const DATE_PRESETS: readonly DatePreset[] = ['today', 'yesterday', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth'];

const DAY_MS = 86_400_000;
const iso = (at: number): StoreDay => new Date(at).toISOString().slice(0, 10);

/**
 * The preset's store days at `now` in `timezone` (IANA or 'device'). Weeks start Monday;
 * this week and this month end today, as WCPOS v2's date button clamps a preset to today.
 */
export function presetRange(preset: DatePreset, now: Date, timezone: string): DayRange {
  const today = businessDayOf(now.toISOString(), timezone);
  const [year, month, day] = today.split('-').map(Number);
  const at = Date.UTC(year, month - 1, day);
  const monday = at - ((new Date(at).getUTCDay() + 6) % 7) * DAY_MS;
  switch (preset) {
    case 'today': return { from: today, to: today };
    case 'yesterday': return { from: iso(at - DAY_MS), to: iso(at - DAY_MS) };
    case 'thisWeek': return { from: iso(monday), to: today };
    case 'lastWeek': return { from: iso(monday - 7 * DAY_MS), to: iso(monday - DAY_MS) };
    case 'thisMonth': return { from: iso(Date.UTC(year, month - 1, 1)), to: today };
    case 'lastMonth': return { from: iso(Date.UTC(year, month - 2, 1)), to: iso(Date.UTC(year, month - 1, 0)) };
  }
}
