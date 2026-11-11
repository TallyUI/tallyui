import type { ListOrdersQuery, OrderFilterField } from '@tallyui/core';
import type { DayRange, StoreDay } from '../reports/types';

/** What the orders filter bar holds (#721): store ids as strings, and the date range as store days. */
export interface OrderFilterValue {
  status?: string;
  customerId?: string;
  cashierId?: string;
  registerId?: string;
  paymentMethod?: string;
  storeId?: string;
  createdVia?: string;
  /** Store days, inclusive. */
  dateRange?: DayRange;
}

const COPIED = ['status', 'customerId', 'cashierId', 'registerId', 'paymentMethod', 'storeId', 'createdVia'] as const;
const DAY_MS = 86_400_000;

/** How far `timezone`'s wall clock is ahead of UTC at instant `at`, in ms. `Intl`, so no date library. */
function offsetMs(at: number, timezone: string): number {
  const format = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', minute: 'numeric', second: 'numeric',
  });
  const part = Object.fromEntries(format.formatToParts(new Date(at)).map(({ type, value }) => [type, Number(value)]));
  const wall = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
  return wall - Math.floor(at / 1000) * 1000;
}

/** The instant store day `day` starts in `timezone` (IANA or 'device'), as an ISO string ending in Z. */
function dayStart(day: StoreDay, timezone: string): string {
  const [year, month, date] = day.split('-').map(Number);
  if (timezone === 'device') return new Date(year, month - 1, date).toISOString();
  const wall = Date.UTC(year, month - 1, date);
  // Two passes: the offset at the first guess can differ from the offset at the day's start across a DST change.
  const guess = wall - offsetMs(wall, timezone);
  return new Date(wall - offsetMs(guess, timezone)).toISOString();
}

const nextDay = (day: StoreDay): StoreDay => {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date) + DAY_MS).toISOString().slice(0, 10);
};

/**
 * The bar's value as ListOrdersQuery filter fields. Set fields are copied; `dateRange` becomes UTC instants: `after`
 * the start of `from` in `timezone`, `before` the start of the day after `to` (exclusive), as `presetRange` reads days.
 */
export function orderFiltersQuery(value: OrderFilterValue, timezone: string): Pick<ListOrdersQuery, OrderFilterField> {
  const query: Pick<ListOrdersQuery, OrderFilterField> = {};
  for (const field of COPIED) {
    if (value[field] !== undefined) query[field] = value[field];
  }
  if (value.dateRange) {
    query.dateRange = { after: dayStart(value.dateRange.from, timezone), before: dayStart(nextDay(value.dateRange.to), timezone) };
  }
  return query;
}
