import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { salesFigures, type ReportOrder, type SalesFigures } from '@tallyui/pos';
import { SalesRoom, type SalesFilters, type SalesRoomProps } from '../reports';

const day = { from: '2026-11-11', to: '2026-11-11' };
const yesterday = { from: '2026-11-10', to: '2026-11-10' };
const order = (id: string, at: string, totalMinor: number, overrides: Partial<ReportOrder> = {}): ReportOrder => ({
  id, at, totalMinor, taxMinor: 0, discountMinor: 0, payments: [], taxes: [], refunds: [],
  lines: [{ key: `p-${id}`, name: 'Coffee', quantity: 1, netMinor: totalMinor, taxMinor: 0 }], ...overrides,
});
const orders = [
  order('a', '2026-11-11T09:00:00Z', 1500, { payments: [{ method: 'cash', amountMinor: 1500 }] }),
  order('b', '2026-11-11T10:00:00Z', 1000),
  order('c', '2026-11-10T09:00:00Z', 2000),
];
const filters: SalesFilters = { preset: 'today', range: day, compare: 'previous', status: 'done', cashierId: null, registerId: null };
const text = (testID: string) => screen.getByTestId(testID).textContent;
const money = (minor: number) => formatMoney({ amount: minor, currency: 'EUR' });

function setup(figures: SalesFigures, props: Partial<SalesRoomProps> = {}) {
  const onFiltersChange = vi.fn();
  const onOpenCard = vi.fn();
  render(
    <SalesRoom figures={figures} filters={filters} onFiltersChange={onFiltersChange} onOpenCard={onOpenCard}
      currency="EUR" timezone="Pacific/Auckland" now={() => new Date('2026-11-10T20:00:00Z')}
      statusOptions={[{ value: 'done', label: 'Completed & processing' }, { value: 'all', label: 'Every status' }]}
      cashierOptions={[{ value: 'u1', label: 'Ana' }]} registerOptions={[{ value: 'r1', label: 'Front' }]} {...props} />,
  );
  return { onFiltersChange, onOpenCard };
}

afterEach(cleanup);

describe('SalesRoom hero', () => {
  it('shows the gross with its change against the comparison and the companions\' differences', () => {
    setup(salesFigures({ orders, range: day, compare: yesterday, timezone: 'UTC' }));
    expect(text('hero-total')).toBe(money(2500));
    expect(text('hero-delta')).toBe('+25.0% vs yesterday');
    expect(text('hero-orders-delta')).toBe('+1');
    expect(text('hero-average-delta')).toBe(`−${money(750)}`);
    expect(screen.getByTestId('hero-bar-compare-0')).toBeTruthy();
  });

  it('shows a dash, not 0%, when the comparison has no orders', () => {
    setup(salesFigures({ orders, range: day, compare: { from: '2026-11-01', to: '2026-11-01' }, timezone: 'UTC' }));
    expect(text('hero-delta')).toBe('—');
    expect(screen.getByTestId('hero-delta').getAttribute('aria-label')).toBe('No comparison');
    expect(text('hero-orders-delta')).toBe('—');
  });
});

describe('SalesRoom cards', () => {
  it('says so when a card has no data, and shows margin as unknown without cost', () => {
    setup(salesFigures({ orders: [], range: day, timezone: 'UTC' }));
    expect(text('card-orders-empty')).toBe('No orders in this period');
    expect(text('card-payments-empty')).toBe('No payments in this period');
    expect(text('card-products-empty')).toBe('No sales in this period');
    cleanup();
    setup(salesFigures({ orders, range: day, timezone: 'UTC' }));
    expect(text('card-orders-margin')).toBe('—');
    expect(text('card-orders-cost-missing')).toBe('Cost missing on 2 of 2 items');
  });

  it('opens a card\'s panel from its head', () => {
    const { onOpenCard } = setup(salesFigures({ orders, range: day, timezone: 'UTC' }));
    fireEvent.click(screen.getByTestId('card-payments-open'));
    expect(onOpenCard).toHaveBeenCalledWith('payments');
  });
});

describe('SalesRoom filters', () => {
  const figures = salesFigures({ orders, range: day, timezone: 'UTC' });
  const choose = (select: string, value: string) => {
    fireEvent.click(screen.getByTestId(select));
    fireEvent.click(screen.getByTestId(`${select}-option-${value}`));
  };

  it('calls back with a preset\'s range in store time', () => {
    const { onFiltersChange } = setup(figures);
    choose('sales-filter-period', 'thisWeek');
    expect(onFiltersChange).toHaveBeenCalledWith({ ...filters, preset: 'thisWeek', range: { from: '2026-11-09', to: '2026-11-11' } });
  });

  it('calls back with the status, cashier and register chosen, and null for everyone', () => {
    const { onFiltersChange } = setup(figures, { filters: { ...filters, cashierId: 'u1', registerId: 'r1' } });
    choose('sales-filter-status', 'all');
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'all' }));
    choose('sales-filter-cashier', 'all');
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ cashierId: null, registerId: 'r1' }));
    choose('sales-filter-register', 'all');
    expect(onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ registerId: null, cashierId: 'u1' }));
    cleanup();
    const second = setup(figures);
    choose('sales-filter-cashier', 'u1');
    expect(second.onFiltersChange).toHaveBeenLastCalledWith(expect.objectContaining({ cashierId: 'u1' }));
    expect(screen.getByTestId('sales-filter-cashier').textContent).toBe('Everyone');
  });
});
