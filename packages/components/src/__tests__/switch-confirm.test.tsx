import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import { PortalHost } from '@tallyui/primitives';
import { switchWarnings, type HandoverSlipData, type SwitchKind } from '@tallyui/pos';
import { HandoverSlip } from '../register/handover-slip';
import { SwitchConfirm, type SwitchConfirmProps } from '../register/switch-confirm';

afterEach(cleanup);

const counts = (pending: number) => ({ pending, rejected: 0, stuck: 0 });
const warn = (kind: SwitchKind, sales = 0, extra: { tillUpdates?: number; parkedSales?: number; paidMinor?: number; open?: boolean } = {}) =>
  switchWarnings({
    kind, outbox: { sales: counts(sales), tillUpdates: counts(extra.tillUpdates ?? 0) },
    parkedSales: extra.parkedSales ?? 0, paidMinor: extra.paidMinor ?? 0, sessionStatus: extra.open ? 'open' : null,
  });
const show = (props: Partial<SwitchConfirmProps> & Pick<SwitchConfirmProps, 'kind' | 'warnings'>) => {
  const handlers = { onConfirm: vi.fn(), onCancel: vi.fn() };
  // Dialog renders through a Portal, which needs a host in the tree (register-harness.tsx).
  render(<><SwitchConfirm targetName="Sam" registerName="Till 1" {...handlers} {...props} /><PortalHost /></>);
  return handlers;
};
const text = (id: string) => screen.getByTestId(id).textContent;

it.each([
  ['cashier', 'Hand the till to Sam?', 'Hand over to Sam', 'Hand over to Sam anyway'],
  ['register', 'Switch to Sam?', 'Switch to Sam', 'Switch to Sam anyway'],
  ['signOut', 'Sign out?', 'Sign out', 'Sign out anyway'],
] as const)('%s: the title, and the confirm wording with and without unsent sales', (kind, title, confirm, withUnsent) => {
  show({ kind, warnings: warn(kind) });
  expect(text('switch-confirm-title')).toBe(title);
  expect(text('switch-confirm-confirm')).toBe(confirm);
  expect(screen.queryByTestId('switch-confirm-warnings')).toBeNull();
  cleanup();
  show({ kind, warnings: warn(kind, 2) });
  expect(text('switch-confirm-confirm')).toBe(withUnsent);
  expect(text('switch-warning-unsentSales')).toBe('2 unsent sales');
});

it('one unsent sale is enough for "anyway", and its line is singular', () => {
  show({ kind: 'cashier', warnings: warn('cashier', 1) });
  expect(text('switch-confirm-confirm')).toBe('Hand over to Sam anyway');
  expect(text('switch-warning-unsentSales')).toBe('1 unsent sale');
});

it('cashier and register descriptions name the drawer left open', () => {
  show({ kind: 'cashier', warnings: warn('cashier') });
  expect(text('switch-confirm-description')).toBe('The drawer stays open on Till 1.');
  cleanup();
  show({ kind: 'register', targetName: 'Till 2', warnings: warn('register', 0, { open: true }) });
  expect(text('switch-confirm-description')).toBe("This device moves to Till 2. Till 1's drawer stays open for whoever is there.");
  cleanup();
  show({ kind: 'register', targetName: 'Till 2', warnings: warn('register') });
  expect(text('switch-confirm-description')).toBe('This device moves to Till 2.');
});

it('sign out with an open session: close first, or sign out anyway', () => {
  const onCloseRegister = vi.fn();
  const { onConfirm } = show({ kind: 'signOut', amount: '$150.00', onCloseRegister, warnings: warn('signOut', 0, { open: true }) });
  expect(text('switch-confirm-title')).toBe('Till 1 is still open at $150.00. Close it first?');
  expect(text('switch-confirm-description')).toBe('A till left open stays open for the next cashier. The closure records who closed it.');
  expect(text('switch-confirm-confirm')).toBe('Sign out anyway');
  fireEvent.click(screen.getByTestId('switch-confirm-close-register'));
  expect(onCloseRegister).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
  expect(onConfirm).toHaveBeenCalledOnce();
  cleanup();
  show({ kind: 'signOut', warnings: warn('signOut', 0, { open: true }) });
  expect(text('switch-confirm-title')).toBe('Till 1 is still open. Close it first?');
  expect(screen.queryByTestId('switch-confirm-close-register')).toBeNull();
});

it('names each warning but the open session, which the title already names', () => {
  show({ kind: 'signOut', warnings: warn('signOut', 1, { tillUpdates: 3, parkedSales: 1, paidMinor: 200, open: true }) });
  expect(screen.getByTestId('switch-confirm-warnings').textContent).toBe(
    '1 unsent sale3 unsent till updates1 parked saleA sale is partly paid',
  );
  expect(screen.queryByTestId('switch-warning-openSession')).toBeNull();
});

it('confirm and cancel call their handlers; the hand-over print shows only on a cashier switch given one', () => {
  const onPrintHandover = vi.fn();
  const { onConfirm, onCancel } = show({ kind: 'cashier', onPrintHandover, warnings: warn('cashier') });
  fireEvent.click(screen.getByTestId('switch-confirm-handover'));
  expect(onPrintHandover).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByTestId('switch-confirm-cancel'));
  expect(onCancel).toHaveBeenCalledOnce();
  expect(onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('switch-confirm-confirm'));
  expect(onConfirm).toHaveBeenCalledOnce();
  cleanup();
  show({ kind: 'register', onPrintHandover, warnings: warn('register') });
  expect(screen.queryByTestId('switch-confirm-handover')).toBeNull();
  cleanup();
  show({ kind: 'cashier', warnings: warn('cashier') });
  expect(screen.queryByTestId('switch-confirm-handover')).toBeNull();
});

const slip: Omit<HandoverSlipData, 'document'> = {
  registerName: 'Till 1', cashierName: 'Sam', openedByName: 'Alex', openedAtTime: '08:00', salesCount: 1,
  expected: { cash: 15000 }, unsentSales: 2, unsentTillUpdates: 0,
};

it('HandoverSlip renders the slip, and no expected figures while blind', () => {
  render(<HandoverSlip slip={slip} currency="USD" />);
  expect(text('handover-slip-title')).toBe('Hand-over slip');
  expect(text('handover-slip-register')).toBe('Till 1 · open since 08:00 · Alex');
  expect(text('handover-slip-cashier')).toBe('Handed over by Sam');
  expect(text('handover-slip-sales')).toBe('1 sale');
  expect(text('handover-slip-expected-cash')).toBe(`Expected Cash ${formatMoney({ amount: 15000, currency: 'USD' })}`);
  expect(text('handover-slip-unsent-sales')).toBe('2 unsent sales');
  expect(screen.queryByTestId('handover-slip-unsent-till-updates')).toBeNull();
  cleanup();
  render(<HandoverSlip slip={{ ...slip, expected: null }} currency="USD" />);
  expect(screen.queryByTestId('handover-slip-expected-cash')).toBeNull();
});
