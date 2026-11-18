import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { CashierSheet, type CashierSheetDrawer, type CashierSheetHandTo, type CashierSheetProps } from '../register/cashier-sheet';

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

  describe('hand the till to and hold notices', () => {
    const handTo = (over: Partial<CashierSheetHandTo> = {}): CashierSheetHandTo => ({
      cashiers: [
        { id: 'ben', name: 'Ben', openCarts: 2 },
        { id: 'cy', name: 'Cy', openCarts: 1 },
        { id: 'di', name: 'Di' },
      ],
      onHandTo: vi.fn(),
      ...over,
    });

    it('T1: nothing is drawn without handTo, paying or awaitingStore, and awaitingStore 0 draws no notice', () => {
      show();
      expect(screen.queryByTestId('cashier-sheet-hand-to')).toBeNull();
      expect(screen.queryByTestId('cashier-sheet-hold')).toBeNull();
      expect(screen.queryByTestId('cashier-sheet-awaiting-store')).toBeNull();
      cleanup();
      show({ awaitingStore: 0 });
      expect(screen.queryByTestId('cashier-sheet-awaiting-store')).toBeNull();
    });

    it('T2: the awaiting-store notice counts sales, singular and plural', () => {
      show({ awaitingStore: 1 });
      expect(screen.getByText('Awaiting store · 1 sale')).toBeTruthy();
      expect(screen.getByTestId('cashier-sheet-awaiting-store').textContent).toContain('Sent when you are signed in online.');
      cleanup();
      show({ awaitingStore: 3 });
      expect(screen.getByText('Awaiting store · 3 sales')).toBeTruthy();
      expect(screen.getByTestId('cashier-sheet-awaiting-store').textContent).toContain('Sent when you are signed in online.');
    });

    it('T3: paying draws the payment hold', () => {
      show({ paying: true });
      expect(screen.getByTestId('cashier-sheet-hold').textContent).toBe('Finish the payment first');
    });

    it('T4: one row per cashier with its name and open carts, singular and plural', () => {
      show({ handTo: handTo() });
      expect(screen.getByTestId('cashier-sheet-hand-to').textContent).toContain('Hand the till to');
      expect(screen.getByTestId('cashier-sheet-hand-to-ben').textContent).toContain('Ben');
      expect(screen.getByTestId('cashier-sheet-hand-to-cy').textContent).toContain('Cy');
      expect(screen.getByTestId('cashier-sheet-hand-to-di').textContent).toContain('Di');
      expect(screen.getByTestId('cashier-sheet-open-carts-ben').textContent).toBe('2 open carts');
      expect(screen.getByTestId('cashier-sheet-open-carts-cy').textContent).toBe('1 open cart');
      expect(screen.queryByTestId('cashier-sheet-open-carts-di')).toBeNull();
    });

    it("T5: pressing Ben's row calls onHandTo('ben') once and neither onOpenChange nor onSignOut", () => {
      const onHandTo = vi.fn();
      const { onOpenChange, onSignOut } = show({ handTo: handTo({ onHandTo }) });
      fireEvent.click(screen.getByTestId('cashier-sheet-hand-to-ben'));
      expect(onHandTo).toHaveBeenCalledTimes(1);
      expect(onHandTo).toHaveBeenCalledWith('ben');
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(onSignOut).not.toHaveBeenCalled();
    });

    it('T6: disabled, paying and counting each block the rows', () => {
      const cases: Partial<CashierSheetProps>[] = [
        { handTo: handTo({ disabled: true }) },
        { handTo: handTo(), paying: true },
        { handTo: handTo({ counting: true }) },
      ];
      for (const props of cases) {
        show(props);
        fireEvent.click(screen.getByTestId('cashier-sheet-hand-to-ben'));
        expect(props.handTo!.onHandTo).not.toHaveBeenCalled();
        cleanup();
      }
    });

    it('T7: counting shows the count hold, unless paying, which shows the payment hold instead', () => {
      show({ handTo: handTo({ counting: true }) });
      expect(screen.getByTestId('cashier-sheet-count-hold').textContent).toBe('Finish or abandon the count first');
      cleanup();
      show({ handTo: handTo({ counting: true }), paying: true });
      expect(screen.queryByText('Finish or abandon the count first')).toBeNull();
      expect(screen.getByText('Finish the payment first')).toBeTruthy();
    });

    it('T8: an empty cashier list draws no section', () => {
      show({ handTo: handTo({ cashiers: [] }) });
      expect(screen.queryByTestId('cashier-sheet-hand-to')).toBeNull();
    });
  });
});
