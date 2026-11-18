import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { CashierSheet, type CashierSheetDrawer, type CashierSheetProps } from '../register/cashier-sheet';

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

  describe('drawer door', () => {
    type OpenDrawer = Extract<CashierSheetDrawer, { state: 'open' | 'counting' }>;
    const openDrawer = (over: Partial<OpenDrawer> = {}): CashierSheetDrawer => ({
      state: 'open',
      figure: { kind: 'cash', amountMinor: 12345, currency: 'USD' },
      openedAt: '09:05',
      opener: { name: 'Ada' },
      onOpen: vi.fn(),
      ...over,
    });
    const text = (testID: string) => screen.getByTestId(testID).textContent;

    it('T1: is not drawn without drawer', () => {
      show();
      expect(screen.queryByTestId('cashier-sheet-drawer')).toBeNull();
    });

    it('T2: open with cash shows the label, the formatted figure, the opener line and the verbs', () => {
      show({ drawer: openDrawer() });
      expect(text('cashier-sheet-drawer')).toContain('In the drawer');
      expect(text('cashier-sheet-drawer-figure')).toBe(formatMoney({ amount: 12345, currency: 'USD' }));
      expect(text('cashier-sheet-drawer-opener')).toBe('opened 09:05 by');
      expect(text('cashier-sheet-drawer-verbs')).toBe('Pay in · Pay out · Close register');
    });

    it('T3: registerName leads the opener line', () => {
      show({ drawer: openDrawer({ registerName: 'Front' }) });
      expect(text('cashier-sheet-drawer-opener')).toBe('Front · opened 09:05 by');
    });

    it('T4: a blind figure counts sales, singular and plural', () => {
      show({ drawer: openDrawer({ figure: { kind: 'blind', salesCount: 1 } }) });
      expect(text('cashier-sheet-drawer-figure')).toBe('1 sale');
      cleanup();
      show({ drawer: openDrawer({ figure: { kind: 'blind', salesCount: 3 } }) });
      expect(text('cashier-sheet-drawer-figure')).toBe('3 sales');
    });

    it('T5: pending figures show a dash and the after-sync line', () => {
      show({ drawer: openDrawer({ figure: { kind: 'pending' } }) });
      expect(text('cashier-sheet-drawer-figure')).toBe('—');
      expect(text('cashier-sheet-drawer-opener')).toBe('Figures arrive with the next sync.');
    });

    it('T6: counting shows the way back to the count', () => {
      show({ drawer: openDrawer({ state: 'counting', countingSince: '10:30' }) });
      expect(text('cashier-sheet-drawer-verbs')).toBe('Counting since 10:30 · back to the count');
    });

    it('T7: closed shows the last closure, the closed verbs and no opener line', () => {
      show({ drawer: { state: 'closed', lastClosure: 42, onOpen: vi.fn() } });
      expect(text('cashier-sheet-drawer-figure')).toBe('Register closed · last closure 42');
      expect(text('cashier-sheet-drawer-verbs')).toBe('Last closure · Open register');
      expect(screen.queryByTestId('cashier-sheet-drawer-opener')).toBeNull();
      cleanup();
      show({ drawer: { state: 'closed', onOpen: vi.fn() } });
      expect(text('cashier-sheet-drawer-figure')).toBe('Register closed · last closure —');
    });

    it('T8: pressing calls onOpen once and not onOpenChange; disabled calls nothing', () => {
      const onOpen = vi.fn();
      const { onOpenChange } = show({ drawer: openDrawer({ onOpen }) });
      fireEvent.click(screen.getByTestId('cashier-sheet-drawer'));
      expect(onOpen).toHaveBeenCalledTimes(1);
      expect(onOpenChange).not.toHaveBeenCalled();
      cleanup();
      const blocked = vi.fn();
      show({ drawer: openDrawer({ onOpen: blocked, disabled: true }) });
      fireEvent.click(screen.getByTestId('cashier-sheet-drawer'));
      expect(blocked).not.toHaveBeenCalled();
    });
  });
});
