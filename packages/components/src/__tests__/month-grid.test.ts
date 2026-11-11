import { describe, expect, it } from 'vitest';
import { addMonths, monthGrid, pressRangeDay } from '../ui/calendar/month-grid';

const inMonth = (month: string, start: 0 | 1) => monthGrid(month, start).flat().filter((cell) => cell.inMonth);

describe('monthGrid', () => {
  it('lays November 2026 out from Monday over six weeks, with the neighbouring months around it', () => {
    const grid = monthGrid('2026-11', 1);
    expect(grid).toHaveLength(6);
    expect(grid.every((week) => week.length === 7)).toBe(true);
    expect(grid[0][0]).toEqual({ day: '2026-10-26', inMonth: false });
    expect(grid[5][6]).toEqual({ day: '2026-12-06', inMonth: false });
    expect(inMonth('2026-11', 1)).toHaveLength(30);
  });

  it('starts November 2026 on its first day from Sunday, over five weeks', () => {
    const grid = monthGrid('2026-11', 0);
    expect(grid[0][0]).toEqual({ day: '2026-11-01', inMonth: true });
    expect(grid).toHaveLength(5);
  });

  it('fits February 2027 in four Monday weeks of exactly its 28 days', () => {
    const grid = monthGrid('2027-02', 1);
    expect(grid).toHaveLength(4);
    expect(grid.flat().every((cell) => cell.inMonth)).toBe(true);
    expect(grid[0][0].day).toBe('2027-02-01');
    expect(grid[3][6].day).toBe('2027-02-28');
  });

  it('gives February 2028 its leap day', () => {
    expect(inMonth('2028-02', 1)).toHaveLength(29);
    expect(inMonth('2028-02', 1).at(-1)?.day).toBe('2028-02-29');
  });
});

describe('addMonths', () => {
  it('crosses year boundaries both ways and by more than a year', () => {
    expect(addMonths('2026-12', 1)).toBe('2027-01');
    expect(addMonths('2027-01', -1)).toBe('2026-12');
    expect(addMonths('2026-11', 14)).toBe('2028-01');
    expect(addMonths('2026-11', -23)).toBe('2024-12');
  });
});

describe('pressRangeDay', () => {
  it('starts a one-day range on the first tap', () => {
    expect(pressRangeDay(null, '2026-11-05')).toEqual({ range: { from: '2026-11-05', to: '2026-11-05' }, anchor: '2026-11-05' });
  });

  it('ends the range on a later second tap', () => {
    expect(pressRangeDay('2026-11-05', '2026-11-09')).toEqual({ range: { from: '2026-11-05', to: '2026-11-09' }, anchor: null });
  });

  it('swaps an earlier second tap into the start', () => {
    expect(pressRangeDay('2026-11-05', '2026-10-28')).toEqual({ range: { from: '2026-10-28', to: '2026-11-05' }, anchor: null });
  });

  it('makes a one-day range of the same day twice', () => {
    expect(pressRangeDay('2026-11-05', '2026-11-05')).toEqual({ range: { from: '2026-11-05', to: '2026-11-05' }, anchor: null });
  });
});
