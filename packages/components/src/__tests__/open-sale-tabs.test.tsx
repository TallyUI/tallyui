import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import type { OpenSale } from '@tallyui/pos';
import { OpenSaleTabs } from '../sale/open-sale-tabs';

const sale = (id: string, extra: Partial<OpenSale> = {}): OpenSale => ({
  id, itemCount: 1, totalMinor: 2250, paidMinor: 0, balanceDueMinor: 2250, current: false, ...extra,
});
const eur = (amount: number) => formatMoney({ amount, currency: 'EUR' });

function renderTabs(sales: OpenSale[]) {
  const onSelect = vi.fn();
  const onNew = vi.fn();
  render(<OpenSaleTabs sales={sales} currency="EUR" onSelect={onSelect} onNew={onNew} />);
  return { onSelect, onNew };
}

afterEach(cleanup);

describe('OpenSaleTabs', () => {
  it("labels each tab by its customer or contents, with the sale's total", () => {
    renderTabs([
      sale('a', { customerName: 'Alice', itemCount: 2, firstItem: 'Shirt' }),
      sale('b', { firstItem: 'Shirt', totalMinor: 1250, current: true }),
      sale('c', { itemCount: 2, firstItem: 'Shirt', totalMinor: 1000 }),
    ]);
    expect(screen.getByTestId('open-sale-tab-a-who').textContent).toBe('Alice');
    expect(screen.getByTestId('open-sale-tab-b-who').textContent).toBe('Guest · Shirt');
    expect(screen.getByTestId('open-sale-tab-c-who').textContent).toBe('Guest · 2 items');
    expect(screen.getByTestId('open-sale-tab-a-amount').textContent).toBe(eur(2250));
    expect(screen.getByTestId('open-sale-tab-b-amount').textContent).toBe(eur(1250));
    expect(screen.getByTestId('open-sale-tab-c-amount').textContent).toBe(eur(1000));
    expect(screen.getByTestId('open-sale-tab-b').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('open-sale-tab-a').getAttribute('aria-selected')).toBe('false');
    expect(screen.queryByTestId('new-sale-tab-label')).toBeNull();
  });

  it('shows the Partly paid chip on an inactive partly paid tab and only the words on the open one', () => {
    renderTabs([
      sale('a', { paidMinor: 1000, balanceDueMinor: 1250 }),
      sale('b', { paidMinor: 500, balanceDueMinor: 750, current: true }),
      sale('c', { paidMinor: 2250, balanceDueMinor: 0 }),
    ]);
    expect(screen.getByTestId('open-sale-chip-a').textContent).toBe(`Partly paid · ${eur(1250)} due`);
    expect(screen.queryByTestId('open-sale-tab-a-amount')).toBeNull();
    expect(screen.queryByTestId('open-sale-chip-b')).toBeNull();
    expect(screen.getByTestId('open-sale-status-b').textContent).toBe(`Partly paid · ${eur(750)} due`);
    expect(screen.queryByTestId('open-sale-chip-c')).toBeNull();
    expect(screen.getByTestId('open-sale-tab-c-amount').textContent).toBe(eur(2250));
  });

  it('selects the pressed tab, and + starts a new sale unless the cart is already blank', () => {
    const live = renderTabs([sale('a'), sale('b', { current: true })]);
    fireEvent.click(screen.getByTestId('open-sale-tab-a'));
    expect(live.onSelect).toHaveBeenCalledWith('a');
    fireEvent.click(screen.getByTestId('new-sale-tab'));
    expect(live.onNew).toHaveBeenCalledTimes(1);
    cleanup();
    const blank = renderTabs([sale('a')]);
    expect(screen.getByTestId('new-sale-tab-label').textContent).toBe('New');
    expect(screen.getByTestId('new-sale-tab').getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByTestId('new-sale-tab'));
    expect(blank.onNew).not.toHaveBeenCalled();
  });
});

describe('OpenSaleTabs arrow keys (web)', () => {
  const abc = (current?: string) => ['a', 'b', 'c'].map((id) => sale(id, { current: id === current }));
  const key = (testID: string, k: string) => fireEvent.keyDown(screen.getByTestId(testID), { key: k });
  const none = (tabs: { onSelect: ReturnType<typeof vi.fn>; onNew: ReturnType<typeof vi.fn> }) => {
    expect(tabs.onSelect).not.toHaveBeenCalled();
    expect(tabs.onNew).not.toHaveBeenCalled();
  };

  it('→ on a tab selects the next sale', () => {
    const tabs = renderTabs(abc('b'));
    key('open-sale-tab-b', 'ArrowRight');
    expect(tabs.onSelect).toHaveBeenCalledWith('c');
  });

  it('← on a tab selects the previous sale', () => {
    const tabs = renderTabs(abc('b'));
    key('open-sale-tab-b', 'ArrowLeft');
    expect(tabs.onSelect).toHaveBeenCalledWith('a');
    expect(tabs.onSelect).toHaveBeenCalledTimes(1);
  });

  it('→ from the last sale lands on New, and ← from New lands on the last sale', () => {
    const last = renderTabs(abc('c'));
    key('open-sale-tab-c', 'ArrowRight');
    expect(last.onNew).toHaveBeenCalledTimes(1);
    expect(last.onSelect).not.toHaveBeenCalled();
    cleanup();
    const blank = renderTabs(abc());
    key('new-sale-tab', 'ArrowLeft');
    expect(blank.onSelect).toHaveBeenCalledWith('c');
  });

  it('no wrap at the ends', () => {
    const first = renderTabs(abc('a'));
    key('open-sale-tab-a', 'ArrowLeft');
    none(first);
    cleanup();
    const blank = renderTabs(abc());
    key('new-sale-tab', 'ArrowRight');
    none(blank);
  });

  it('other keys and pre-handled events do nothing', () => {
    const tabs = renderTabs(abc('b'));
    key('open-sale-tab-b', 'Enter');
    const tab = screen.getByTestId('open-sale-tab-b');
    // A capture listener on the tab handles the key first, as a nested widget would.
    tab.addEventListener('keydown', (event) => event.preventDefault(), { capture: true });
    fireEvent.keyDown(tab, { key: 'ArrowRight' });
    none(tabs);
  });

  it('focus follows a key step', () => {
    const onSelect = vi.fn();
    const onNew = vi.fn();
    const ui = (current: string) => <OpenSaleTabs sales={abc(current)} currency="EUR" onSelect={onSelect} onNew={onNew} />;
    const { rerender } = render(ui('b'));
    key('open-sale-tab-b', 'ArrowRight');
    rerender(ui('c'));
    expect(document.activeElement).toBe(screen.getByTestId('open-sale-tab-c'));
    fireEvent.click(screen.getByTestId('open-sale-tab-a'));
    expect(onSelect).toHaveBeenLastCalledWith('a');
    rerender(ui('a'));
    expect(document.activeElement).toBe(screen.getByTestId('open-sale-tab-c'));
  });
});

describe('OpenSaleTabs age', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
    vi.setSystemTime(new Date('2026-11-17T12:00:00.000Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('shows the age in hours after the total once a parked sale has waited an hour', () => {
    renderTabs([
      sale('a', { parkedAt: '2026-11-17T07:00:00Z' }),
      sale('b', { parkedAt: '2026-11-17T11:30:00Z' }),
      sale('c', { parkedAt: '2026-11-17T10:59:00Z' }),
      sale('d', { current: true }),
    ]);
    expect(screen.getByTestId('open-sale-tab-a-age').textContent).toBe('5 h');
    expect(screen.getByTestId('open-sale-tab-a-amount').textContent).toBe(`${eur(2250)} · 5 h`);
    expect(screen.getByTestId('open-sale-tab-c-age').textContent).toBe('1 h');
    expect(screen.queryByTestId('open-sale-tab-b-age')).toBeNull();
    expect(screen.queryByTestId('open-sale-tab-d-age')).toBeNull();
  });

  it('rounds to the nearest hour', () => {
    renderTabs([sale('a', { parkedAt: '2026-11-17T09:20:00Z' })]);
    expect(screen.getByTestId('open-sale-tab-a-age').textContent).toBe('3 h');
  });

  it('a partly paid tab shows its chip and no age', () => {
    renderTabs([sale('a', { parkedAt: '2026-11-17T07:00:00Z', paidMinor: 1000, balanceDueMinor: 1250 })]);
    expect(screen.getByTestId('open-sale-chip-a')).not.toBeNull();
    expect(screen.queryByTestId('open-sale-tab-a-age')).toBeNull();
  });

  it('an unparseable parkedAt shows no age', () => {
    renderTabs([sale('a', { parkedAt: 'not a date' })]);
    expect(screen.queryByTestId('open-sale-tab-a-age')).toBeNull();
  });

  it('the age appears when the minute tick crosses the hour', () => {
    renderTabs([sale('a', { parkedAt: '2026-11-17T11:00:30Z' })]);
    expect(screen.queryByTestId('open-sale-tab-a-age')).toBeNull();
    act(() => { vi.advanceTimersByTime(60_000); });
    expect(screen.getByTestId('open-sale-tab-a-age').textContent).toBe('1 h');
  });
});
