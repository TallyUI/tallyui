import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { CashierSheet, type CashierSheetProps } from '../register/cashier-sheet';

afterEach(cleanup);

const show = (props: Partial<CashierSheetProps> = {}) => {
  const handlers = { onSignOut: vi.fn(), onOpenChange: vi.fn() };
  // Dialog renders through a Portal, which needs a host in the tree.
  render(<><CashierSheet cashier={{ name: 'Sam Lee' }} {...handlers} {...props} /><PortalHost /></>);
  return handlers;
};

describe('CashierSheet', () => {
  it("shows the cashier's name and the header line", () => {
    show({ description: 'Main Street · Till 2 · since 09:05' });
    expect(screen.getByTestId('cashier-sheet')).toBeTruthy();
    expect(screen.getByText('Sam Lee')).toBeTruthy();
    expect(screen.getByTestId('cashier-sheet-description').textContent).toBe('Main Street · Till 2 · since 09:05');
  });

  it('shows "Your sales today" with the amount formatted in the given currency', () => {
    show({ salesToday: { amountMinor: 123450, currency: 'EUR' } });
    const row = screen.getByTestId('cashier-sheet-sales-today');
    expect(row.textContent).toContain('Your sales today');
    expect(row.textContent).toContain(formatMoney({ amount: 123450, currency: 'EUR' }));
  });

  it('hides the sales row when salesToday is not passed', () => {
    show();
    expect(screen.queryByTestId('cashier-sheet-sales-today')).toBeNull();
    expect(screen.queryByText('Your sales today')).toBeNull();
  });

  it('hides the header line when description is not passed', () => {
    show();
    expect(screen.getByText('Sam Lee')).toBeTruthy();
    expect(screen.queryByTestId('cashier-sheet-description')).toBeNull();
  });

  it('Sign out calls onSignOut once and does not close the sheet by itself', () => {
    const { onSignOut, onOpenChange } = show();
    const button = screen.getByTestId('cashier-sheet-sign-out');
    expect(button.textContent).toBe('Sign out');
    fireEvent.click(button);
    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it('Sign out is disabled while signOutDisabled, and pressing it calls nothing', () => {
    const { onSignOut, onOpenChange } = show({ signOutDisabled: true });
    const button = screen.getByTestId('cashier-sheet-sign-out');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(button);
    expect(onSignOut).not.toHaveBeenCalled();
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
