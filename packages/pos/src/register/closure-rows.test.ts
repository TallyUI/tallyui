// TallyUI-only: WCPOS covers `clampClosureScope` and `selectClosureRows` only through the
// `useClosureRows` hook's server-merge tests (job c), which are not ported. These exercise the
// two pure selectors directly.
import { expect, it } from 'vitest';
import { clampClosureScope, selectClosureRows, type ClosureScope } from './closure-rows';
import type { Closure } from './schemas';

const row = (overrides: Partial<Closure>): Closure =>
  ({
    id: 'c',
    session_id: 's',
    register_id: 'r1',
    store_key: null,
    closed_by: null,
    business_day: '2026-09-17',
    opened_at: '2026-09-17T08:00:00Z',
    closed_at: '2026-09-17T17:00:00Z',
    number: 1,
    till_expected: {},
    expected: {},
    counted: {},
    variance: {},
    period_sales_total_minor: 0,
    period_refunds_total_minor: 0,
    perpetual_sales_total_minor: 0,
    perpetual_refunds_total_minor: 0,
    unsynced_count: 0,
    unsynced_total_minor: 0,
    software_version: '1.0.0',
    breakdowns: {},
    order_ids: [],
    movement_ids: [],
    print_count: 0,
    ...overrides,
  }) as Closure;

it('clamps a scope at the history floor and at today (TallyUI-only)', () => {
  expect(clampClosureScope({ from: '2026-01-01', to: '2026-09-30', registerId: 'r1' }, '2026-09-25', 92)).toEqual({
    from: '2026-06-25',
    to: '2026-09-25',
    registerId: 'r1',
  });
});

it('defaults the history window to WCPOS\'s 92 days (TallyUI-only)', () => {
  expect(clampClosureScope({ from: '2020-01-01', to: '2020-01-01', registerId: 'r1' }, '2026-09-25').from).toBe(
    '2026-06-25',
  );
});

it('filters by business day, register, store key and cashier (TallyUI-only)', () => {
  const rows = [
    row({ id: 'in-range', store_key: 'store-1', closed_by: 'cashier-1' }),
    row({ id: 'wrong-day', business_day: '2026-09-01', store_key: 'store-1', closed_by: 'cashier-1' }),
    row({ id: 'wrong-register', register_id: 'r2', store_key: 'store-1', closed_by: 'cashier-1' }),
    row({ id: 'wrong-store', store_key: 'store-2', closed_by: 'cashier-1' }),
    row({ id: 'wrong-cashier', store_key: 'store-1', closed_by: 'cashier-2' }),
  ];
  const scope: ClosureScope = {
    from: '2026-09-17',
    to: '2026-09-17',
    registerId: 'r1',
    storeKey: 'store-1',
    cashier: 'cashier-1',
  };
  expect(selectClosureRows(rows, scope, 'UTC').map((r) => r.id)).toEqual(['in-range']);
});

it('sorts newest first by business day, then by closed_at (TallyUI-only)', () => {
  const rows = [
    row({ id: 'earlier-day', business_day: '2026-09-16', closed_at: '2026-09-16T17:00:00Z' }),
    row({ id: 'later-close', business_day: '2026-09-17', closed_at: '2026-09-17T18:00:00Z' }),
    row({ id: 'earlier-close', business_day: '2026-09-17', closed_at: '2026-09-17T09:00:00Z' }),
  ];
  const scope: ClosureScope = { from: '2026-09-01', to: '2026-09-30', registerId: '' };
  expect(selectClosureRows(rows, scope, 'UTC').map((r) => r.id)).toEqual([
    'later-close',
    'earlier-close',
    'earlier-day',
  ]);
});

it('derives a missing business_day from opened_at in a zone east of UTC, rolling into the next day (TallyUI-only)', () => {
  const rows = [
    row({
      id: 'rolled',
      business_day: undefined,
      opened_at: '2026-09-17T22:00:00Z',
      closed_at: '2026-09-18T02:00:00Z',
    }),
  ];
  const scope: ClosureScope = { from: '2026-09-18', to: '2026-09-18', registerId: 'r1' };
  expect(selectClosureRows(rows, scope, 'Pacific/Auckland').map((r) => r.id)).toEqual(['rolled']);
});
