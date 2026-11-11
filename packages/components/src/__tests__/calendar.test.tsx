import { useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DayRange } from '@tallyui/pos';
import { Calendar, type CalendarProps } from '../ui/calendar';

afterEach(cleanup);

const day = (d: string) => screen.getByTestId(`calendar-day-${d}`);
const selected = (d: string) => day(d).getAttribute('aria-selected');
const disabled = (testID: string) => screen.getByTestId(testID).getAttribute('aria-disabled');

function RangeHarness({ onChange, ...props }: Partial<CalendarProps> & { onChange: (range: DayRange) => void }) {
  const [value, setValue] = useState<DayRange | null>(null);
  return <Calendar today="2026-11-11" {...props} mode="range" value={value}
    onChange={(range) => { setValue(range); onChange(range); }} />;
}

describe('Calendar', () => {
  it('reports the pressed day in single mode and marks the chosen day selected', () => {
    const onChange = vi.fn();
    const { rerender } = render(<Calendar mode="single" today="2026-11-11" value={null} onChange={onChange} />);
    fireEvent.click(day('2026-11-04'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-11-04');
    rerender(<Calendar mode="single" today="2026-11-11" value="2026-11-04" onChange={onChange} />);
    expect(selected('2026-11-04')).toBe('true');
    expect(selected('2026-11-05')).toBe('false');
    expect(day('2026-11-04').getAttribute('aria-label')).toMatch(/^Wednesday,? 4 November 2026$/);
  });

  it('reports a one-day range on the first tap and the ordered range on the second, inside days selected', () => {
    const onChange = vi.fn();
    render(<RangeHarness onChange={onChange} />);
    fireEvent.click(day('2026-11-09'));
    fireEvent.click(day('2026-11-03'));
    expect(onChange.mock.calls).toEqual([[{ from: '2026-11-09', to: '2026-11-09' }], [{ from: '2026-11-03', to: '2026-11-09' }]]);
    expect(['2026-11-02', '2026-11-03', '2026-11-06', '2026-11-09', '2026-11-10'].map(selected))
      .toEqual(['false', 'true', 'true', 'true', 'false']);
  });

  it('disables days after max and before min, which a press does not report; max and min themselves stay open', () => {
    const onChange = vi.fn();
    render(<Calendar mode="single" today="2026-11-11" value={null} onChange={onChange} min="2026-11-03" max="2026-11-11" />);
    expect(disabled('calendar-day-2026-11-12')).toBe('true');
    expect(disabled('calendar-day-2026-11-02')).toBe('true');
    expect(disabled('calendar-day-2026-11-11')).toBeNull();
    expect(disabled('calendar-day-2026-11-03')).toBeNull();
    fireEvent.click(day('2026-11-12'));
    fireEvent.click(day('2026-11-02'));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(day('2026-11-11'));
    expect(onChange).toHaveBeenCalledExactlyOnceWith('2026-11-11');
  });

  it('disables the next arrow when the next month starts after max, and pages back with prev', () => {
    render(<Calendar mode="single" today="2026-11-11" value={null} onChange={vi.fn()} max="2026-11-11" />);
    expect(screen.getByTestId('calendar-title').textContent).toBe('November 2026');
    expect(disabled('calendar-next')).toBe('true');
    fireEvent.click(screen.getByTestId('calendar-next'));
    expect(screen.getByTestId('calendar-title').textContent).toBe('November 2026');
    fireEvent.click(screen.getByTestId('calendar-prev'));
    expect(screen.getByTestId('calendar-title').textContent).toBe('October 2026');
    expect(disabled('calendar-next')).toBeNull();
    fireEvent.click(screen.getByTestId('calendar-next'));
    expect(screen.getByTestId('calendar-title').textContent).toBe('November 2026');
  });

  it('enables prev while min lies in the previous month, and disables it once min is in the shown month', () => {
    render(<Calendar mode="single" today="2026-11-11" value={null} onChange={vi.fn()} min="2026-10-15" />);
    expect(disabled('calendar-prev')).toBeNull();
    fireEvent.click(screen.getByTestId('calendar-prev'));
    expect(screen.getByTestId('calendar-title').textContent).toBe('October 2026');
    expect(disabled('calendar-prev')).toBe('true');
  });

  it('drops a half-picked range when the parent sets another value, so the next tap starts afresh', () => {
    const onChange = vi.fn();
    const props = { mode: 'range', today: '2026-11-11', onChange } as const;
    const { rerender } = render(<Calendar {...props} value={null} />);
    fireEvent.click(day('2026-11-05'));
    rerender(<Calendar {...props} value={{ from: '2026-11-10', to: '2026-11-12' }} />);
    fireEvent.click(day('2026-11-20'));
    expect(onChange).toHaveBeenLastCalledWith({ from: '2026-11-20', to: '2026-11-20' });
  });

  it('starts the weekday header on Monday by default and on Sunday from weekStartsOn 0', () => {
    render(<Calendar mode="single" today="2026-11-11" value={null} onChange={vi.fn()} />);
    expect(screen.getByTestId('calendar-weekdays').firstChild?.textContent).toBe('Mon');
    expect(screen.getByTestId('calendar-day-2026-10-26')).toBeTruthy();
    cleanup();
    render(<Calendar mode="single" today="2026-11-11" value={null} onChange={vi.fn()} weekStartsOn={0} />);
    expect(screen.getByTestId('calendar-weekdays').firstChild?.textContent).toBe('Sun');
    expect(screen.queryByTestId('calendar-day-2026-10-26')).toBeNull();
  });
});
