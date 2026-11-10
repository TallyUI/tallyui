import { expect, it } from 'vitest';
import { DATE_PRESETS, presetRange } from './presets';

// 20:00 UTC on Tuesday 10 Nov is 09:00 on Wednesday 11 Nov in Auckland.
const now = new Date('2026-11-10T20:00:00Z');

it('works every preset out in the store\'s day, not the UTC day', () => {
  expect(Object.fromEntries(DATE_PRESETS.map((preset) => [preset, presetRange(preset, now, 'Pacific/Auckland')]))).toEqual({
    today: { from: '2026-11-11', to: '2026-11-11' },
    yesterday: { from: '2026-11-10', to: '2026-11-10' },
    thisWeek: { from: '2026-11-09', to: '2026-11-11' },
    lastWeek: { from: '2026-11-02', to: '2026-11-08' },
    thisMonth: { from: '2026-11-01', to: '2026-11-11' },
    lastMonth: { from: '2026-10-01', to: '2026-10-31' },
  });
  expect(presetRange('today', now, 'UTC')).toEqual({ from: '2026-11-10', to: '2026-11-10' });
});

it('keeps a Monday as its own week start and takes January back to December', () => {
  expect(presetRange('thisWeek', new Date('2026-11-09T12:00:00Z'), 'UTC')).toEqual({ from: '2026-11-09', to: '2026-11-09' });
  expect(presetRange('lastMonth', new Date('2027-01-15T12:00:00Z'), 'UTC')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
});
