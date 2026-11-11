import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PortalHost } from '@tallyui/primitives';
import { DateRangeMenu, type DateRangeMenuProps } from '../reports/date-range-menu';

afterEach(cleanup);

// 09:00 on Wednesday 11 November in Auckland, still the 10th in UTC.
const now = () => new Date('2026-11-10T20:00:00Z');
const today = { preset: 'today' as const, range: { from: '2026-11-11', to: '2026-11-11' } };
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));

function open(value: DateRangeMenuProps['value'] = today) {
  const onChange = vi.fn();
  render(<><DateRangeMenu value={value} onChange={onChange} timezone="Pacific/Auckland" now={now} /><PortalHost /></>);
  press('reports-period');
  return onChange;
}

describe('DateRangeMenu', () => {
  it('reports a preset row at once with its range in store time, and closes', () => {
    const onChange = open();
    expect(screen.getByTestId('reports-period-today').getAttribute('aria-selected')).toBe('true');
    press('reports-period-thisWeek');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ preset: 'thisWeek', range: { from: '2026-11-09', to: '2026-11-11' } });
    expect(screen.queryByTestId('reports-period-menu')).toBeNull();
  });

  it('reports two day taps as a custom range only on Done', () => {
    const onChange = open();
    press('reports-period-calendar-day-2026-11-06');
    press('reports-period-calendar-day-2026-11-03');
    expect(onChange).not.toHaveBeenCalled();
    press('reports-period-apply');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ preset: 'custom', range: { from: '2026-11-03', to: '2026-11-06' } });
    expect(screen.queryByTestId('reports-period-menu')).toBeNull();
  });

  it('reports the preset a picked range equals on Done', () => {
    const onChange = open();
    press('reports-period-calendar-day-2026-11-10');
    press('reports-period-apply');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ preset: 'yesterday', range: { from: '2026-11-10', to: '2026-11-10' } });
  });

  it('drops an abandoned draft: closing without Done and reopening shows the value again', () => {
    const onChange = open();
    press('reports-period-calendar-day-2026-11-03');
    press('reports-period');
    expect(screen.queryByTestId('reports-period-menu')).toBeNull();
    press('reports-period');
    expect(screen.getByTestId('reports-period-calendar-day-2026-11-11').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('reports-period-calendar-day-2026-11-03').getAttribute('aria-selected')).toBe('false');
    press('reports-period-apply');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(today);
  });

  it('labels the trigger with the preset or Custom range and its dates', () => {
    render(<DateRangeMenu value={{ preset: 'custom', range: { from: '2026-10-28', to: '2026-11-03' } }} onChange={vi.fn()}
      timezone="Pacific/Auckland" now={now} />);
    expect(screen.getByTestId('reports-period').textContent).toBe('Custom range · 28 Oct – 3 Nov');
    cleanup();
    render(<DateRangeMenu value={{ preset: 'thisWeek', range: { from: '2026-11-09', to: '2026-11-11' } }} onChange={vi.fn()}
      timezone="Pacific/Auckland" now={now} />);
    expect(screen.getByTestId('reports-period').textContent).toBe('This Week · 9–11 Nov');
  });
});
