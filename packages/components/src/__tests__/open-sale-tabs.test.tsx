import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
