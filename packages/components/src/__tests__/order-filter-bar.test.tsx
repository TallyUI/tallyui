import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderFilterField } from '@tallyui/core';
import type { OrderFilterValue } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { OrderFilterBar, type OrderFilterBarProps } from '../order/order-filter-bar';
import { rangeLabel } from '../reports/date-range-menu';

afterEach(cleanup);

const ALL: OrderFilterField[] = ['status', 'customerId', 'cashierId', 'registerId', 'paymentMethod', 'storeId', 'createdVia', 'dateRange'];
const OPTIONS: NonNullable<OrderFilterBarProps['options']> = {
  status: [{ value: 'completed', label: 'Completed' }, { value: 'refunded', label: 'Refunded' }],
  paymentMethod: [
    { value: 'stripe', label: 'Stripe', kind: 'card' },
    { value: 'pos_cash', label: 'Cash', kind: 'cash' },
    { value: 'cheque', label: 'Cheque' },
    { value: 'square', label: 'Square', kind: 'card' },
  ],
  customer: [{ value: '0', label: 'Guest' }, { value: '12', label: 'Jane Smith' }, { value: '13', label: 'Bob Jones' }],
  cashier: [{ value: '1', label: 'Ada' }],
  register: [{ value: 'reg-1', label: 'Front till' }],
  store: [{ value: '2', label: 'Downtown' }],
  createdVia: [{ value: 'woocommerce-pos', label: 'POS' }, { value: 'checkout', label: 'Online Store' }],
};
// 12:00 on Wednesday 11 November in Sydney.
const now = () => new Date('2026-11-11T01:00:00Z');
const press = (testID: string) => fireEvent.click(screen.getByTestId(testID));
const chipIds = () => screen.getAllByTestId(/^order-filter-(?!bar$)[a-z-]+$/).map((chip) => chip.getAttribute('data-testid'));

function setup(props: Partial<OrderFilterBarProps> = {}) {
  const onChange = vi.fn();
  render(<><OrderFilterBar value={{}} onChange={onChange} fields={ALL} options={OPTIONS} timezone="Australia/Sydney"
    now={now} {...props} /><PortalHost /></>);
  return onChange;
}

describe('OrderFilterBar', () => {
  it("renders the seven chips in v2's order with v2's labels", () => {
    setup();
    expect(chipIds()).toEqual(['order-filter-status', 'order-filter-payment-method', 'order-filter-customer',
      'order-filter-cashier', 'order-filter-store', 'order-filter-register', 'order-filter-date']);
    expect(chipIds().map((id) => screen.getByTestId(id!).textContent)).toEqual(['Status', 'Payment Method',
      'Select Customer', 'Select Cashier', 'Created via', 'Select register', 'Date range']);
  });

  it('hides a pill whose field the connector does not support, and shows only the store groups it supports', () => {
    setup({ fields: ['status', 'createdVia', 'dateRange'] });
    expect(chipIds()).toEqual(['order-filter-status', 'order-filter-store', 'order-filter-date']);
    press('order-filter-store');
    expect(screen.getByTestId('order-filter-store-created-via')).toBeTruthy();
    expect(screen.queryByTestId('order-filter-store-stores')).toBeNull();
    expect(screen.queryByTestId('order-filter-store-2')).toBeNull();
    cleanup();
    setup({ options: { ...OPTIONS, status: [], register: undefined } });
    expect(chipIds()).not.toContain('order-filter-status');
    expect(chipIds()).not.toContain('order-filter-register');
  });

  it('sets the chosen status and keeps the other fields', () => {
    const onChange = setup({ value: { cashierId: '1', createdVia: 'woocommerce-pos' } });
    press('order-filter-status');
    press('order-filter-status-refunded');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ cashierId: '1', createdVia: 'woocommerce-pos', status: 'refunded' });
  });

  it("shows an on chip's option label, and its Remove clears only that field", () => {
    const value: OrderFilterValue = { status: 'completed', customerId: '12', registerId: 'reg-1' };
    const onChange = setup({ value });
    expect(screen.getByTestId('order-filter-status').textContent).toBe('Completed');
    expect(screen.getByTestId('order-filter-customer').textContent).toBe('Jane Smith');
    expect(screen.getByTestId('order-filter-register').textContent).toBe('Front till');
    expect(screen.queryByTestId('order-filter-cashier-remove')).toBeNull();
    press('order-filter-customer-remove');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ status: 'completed', customerId: undefined, registerId: 'reg-1' });
  });

  it("clears both store fields with the store pill's Remove", () => {
    const onChange = setup({ value: { createdVia: 'checkout', storeId: '2', status: 'completed' } });
    expect(screen.getByTestId('order-filter-store').textContent).toBe('Downtown');
    press('order-filter-store-remove');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ status: 'completed', storeId: undefined, createdVia: undefined });
  });

  it('clears the store when a Created via item is chosen, and Created via when a store is chosen', () => {
    const onChange = setup({ value: { storeId: '2' } });
    press('order-filter-store');
    press('order-filter-store-checkout');
    expect(onChange).toHaveBeenLastCalledWith({ storeId: undefined, createdVia: 'checkout' });
    cleanup();
    const onStore = setup({ value: { createdVia: 'checkout' } });
    expect(screen.getByTestId('order-filter-store').textContent).toBe('Online Store');
    press('order-filter-store');
    press('order-filter-store-2');
    expect(onStore).toHaveBeenLastCalledWith({ storeId: '2', createdVia: undefined });
  });

  it('groups payment methods by kind with separators, and says when there are none', () => {
    const onChange = setup();
    press('order-filter-payment-method');
    const menu = screen.getByTestId('order-filter-payment-method-menu');
    const ids = Array.from(menu.querySelectorAll('[data-testid]'), (node) => node.getAttribute('data-testid'));
    expect(ids).toEqual(['order-filter-payment-method-pos_cash', 'order-filter-payment-method-separator',
      'order-filter-payment-method-stripe', 'order-filter-payment-method-square', 'order-filter-payment-method-separator',
      'order-filter-payment-method-cheque']);
    press('order-filter-payment-method-square');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ paymentMethod: 'square' });
    cleanup();
    setup({ options: { ...OPTIONS, paymentMethod: [] } });
    press('order-filter-payment-method');
    expect(screen.getByText('No payment methods found')).toBeTruthy();
  });

  it('hands customer search text to onCustomerSearch when given, keeping the list as passed', () => {
    const onCustomerSearch = vi.fn();
    setup({ onCustomerSearch });
    press('order-filter-customer');
    fireEvent.change(screen.getByTestId('order-filter-customer-search'), { target: { value: 'jan' } });
    expect(onCustomerSearch).toHaveBeenCalledWith('jan');
    expect(screen.getByTestId('order-filter-customer-13')).toBeTruthy();
  });

  it('narrows the customer list locally without onCustomerSearch, and picks a customer', () => {
    const onChange = setup();
    press('order-filter-customer');
    fireEvent.change(screen.getByTestId('order-filter-customer-search'), { target: { value: 'JAN' } });
    expect(screen.getByTestId('order-filter-customer-12')).toBeTruthy();
    expect(screen.queryByTestId('order-filter-customer-13')).toBeNull();
    expect(screen.queryByTestId('order-filter-customer-0')).toBeNull();
    press('order-filter-customer-12');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ customerId: '12' });
  });

  it("gives the cashier search v2's placeholder", () => {
    setup();
    press('order-filter-cashier');
    expect(screen.getByTestId('order-filter-cashier-search').getAttribute('placeholder')).toBe('Search Cashiers');
  });

  it('reports a picked date range only on Done', () => {
    const onChange = setup({ value: { status: 'completed' } });
    press('order-filter-date');
    expect(screen.getByTestId('order-filter-date-popover')).toBeTruthy();
    press('order-filter-date-calendar-day-2026-11-06');
    press('order-filter-date-calendar-day-2026-11-03');
    expect(onChange).not.toHaveBeenCalled();
    press('order-filter-date-done');
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ status: 'completed', dateRange: { from: '2026-11-03', to: '2026-11-06' } });
    expect(screen.queryByTestId('order-filter-date-popover')).toBeNull();
  });

  it('drops a draft closed without Done, and reopens on the value', () => {
    const onChange = setup({ value: { dateRange: { from: '2026-11-09', to: '2026-11-09' } } });
    press('order-filter-date');
    press('order-filter-date-calendar-day-2026-11-03');
    press('order-filter-date');
    expect(screen.queryByTestId('order-filter-date-popover')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    press('order-filter-date');
    expect(screen.getByTestId('order-filter-date-calendar-day-2026-11-09').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('order-filter-date-calendar-day-2026-11-03').getAttribute('aria-selected')).toBe('false');
  });

  it('labels the date chip Today, Yesterday or the range, in store time', () => {
    const label = (dateRange: OrderFilterValue['dateRange']) => {
      cleanup();
      setup({ value: { dateRange } });
      return screen.getByTestId('order-filter-date').textContent;
    };
    expect(label({ from: '2026-11-11', to: '2026-11-11' })).toBe('Today');
    expect(label({ from: '2026-11-10', to: '2026-11-10' })).toBe('Yesterday');
    expect(label({ from: '2026-11-09', to: '2026-11-09' })).toBe(rangeLabel({ from: '2026-11-09', to: '2026-11-09' }));
    expect(label({ from: '2026-10-28', to: '2026-11-03' })).toBe('28 Oct – 3 Nov');
  });

  it('shows Clear all from two changed pills, and resets to initial', () => {
    const initial: OrderFilterValue = { cashierId: '1', createdVia: 'woocommerce-pos' };
    setup({ initial, value: { ...initial, status: 'completed' } });
    expect(screen.queryByTestId('orders-filter-clear-all')).toBeNull();
    cleanup();
    const onChange = setup({ initial, value: { ...initial, status: 'completed', registerId: 'reg-1' } });
    press('orders-filter-clear-all');
    expect(onChange).toHaveBeenCalledExactlyOnceWith(initial);
  });
});
