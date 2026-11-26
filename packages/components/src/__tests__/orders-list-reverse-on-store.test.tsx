import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { formatMoney, type SettleOutcome } from '@tallyui/core';
import type { PosOrder } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { OrdersList } from '../sale/orders-list';

afterEach(cleanup);
const at = '2026-11-25T10:00:00.000Z';
const order: PosOrder = { id: 'sale', sessionId: 'open', commandId: 'command', createdAt: at, updatedAt: at, currency: 'EUR', pricesIncludeTax: false,
  lines: [], customer: null, totalMinor: 3500, subtotalMinor: 3500, taxMinor: 0, discountMinor: 0, syncStatus: 'rejected',
  error: { code: 'invalid_payload', message: 'No.', data: { orderId: '115', displayId: '1001', recorded: 2 } },
  payments: [{ id: 'cash', method: 'cash', amountMinor: 1000 }, { id: 'card', method: 'external', amountMinor: 500 },
    { id: 'rest', method: 'external', amountMinor: 2000 }], taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' } };
const id = 'order-sale-reverse-on-store';
const manager = "Taken in a session that has closed: a manager must settle this sale in the store's admin.";
const eur = (amount: number) => formatMoney({ amount, currency: 'EUR' });
const done = async (): Promise<SettleOutcome> => ({ kind: 'done', status: 'cancelled' });

it('D1: changing sessions dismisses the reverse confirmation', () => {
  const reverse = vi.fn(done), tree = (openSessionId: string) => <><OrdersList orders={[order]} openSessionId={openSessionId} onRetry={async () => 0} onReverseOnStore={reverse} /><PortalHost /></>;
  const view = render(tree('open')); fireEvent.click(screen.getByTestId(id));
  expect(screen.getByTestId(`${id}-dialog`)).toBeTruthy(); view.rerender(tree('next'));
  expect([screen.queryByTestId(`${id}-dialog`), screen.queryByTestId(`${id}-dialog-confirm`)]).toEqual([null, null]);
  expect(screen.getByText(manager)).toBeTruthy(); expect(reverse).not.toHaveBeenCalled();
});
it('N1: a late session is not an open session', () => {
  render(<OrdersList orders={[{ ...order, sessionId: undefined, lateSessionId: 'late' }]} onRetry={async () => 0} onReverseOnStore={done} />);
  expect(screen.queryByTestId(id)).toBeNull(); expect(screen.getByText(manager)).toBeTruthy();
});

it('row 14: no reverse handler means no button', () => {
  render(<OrdersList orders={[order]} onRetry={async () => 0} />);
  expect(screen.queryByTestId(id)).toBeNull();
  expect(screen.queryByText(manager)).toBeNull();
});

it.each([
  ['G2: a closed leg', 'open', 'closed', false],
  ['G4: no open session', undefined, 'open', false],
  ['G5: cannot finish with a closed leg', 'open', 'closed', true],
] as const)('%s', (_name, openSessionId, sessionId, sending) => {
  const sale: PosOrder = { ...order, payments: order.payments.map((leg) => leg.id === 'rest' ? { ...leg, sessionId } : leg),
    storeSettlement: sending ? { kind: 'reverse', state: 'sending', at, attemptId: 'attempt' } : undefined };
  render(<OrdersList orders={[sale]} openSessionId={openSessionId} onRetry={async () => 0} onReverseOnStore={done} />);
  expect(screen.queryByTestId(id)).toBeNull();
  expect(screen.getByText(manager)).toBeTruthy();
});

it('row 16: name each physical hand-back and confirm before calling', async () => {
  const reverse = vi.fn(done);
  render(<><OrdersList openSessionId="open" orders={[order]} onRetry={async () => 0} onReverseOnStore={reverse} /><PortalHost /></>);
  const button = screen.getByTestId(id);
  expect(button.textContent).toBe('Give back and cancel');
  expect(screen.queryByText(manager)).toBeNull();
  fireEvent.click(button);
  const element = screen.getByTestId(`${id}-dialog`), dialog = within(element);
  expect(element.textContent).not.toMatch(/refund/i);
  expect(dialog.getByText('Give the money back and cancel order #1001?')).toBeTruthy();
  expect(dialog.getByText((_content, node) => node?.textContent === [
    `Cash ${eur(1000)}: hand it back from the drawer.`, `Card ${eur(500)}: give it back on the card terminal.`,
    `Card ${eur(2000)}: give it back on the card terminal.`,
    'The store stops counting the payments it recorded and cancels the order.',
    'Hand the money back once this till shows the order cancelled. If you already gave it back, go ahead.',
  ].join('\n') && node.children.length === 0)).toBeTruthy();
  expect(screen.getByTestId(`${id}-dialog-cancel`).textContent).toBe('Keep order');
  expect(reverse).not.toHaveBeenCalled();
  const confirm = screen.getByTestId(`${id}-dialog-confirm`);
  expect(confirm.textContent).toBe('Give back and cancel');
  await act(async () => { fireEvent.click(confirm); });
  expect(reverse).toHaveBeenCalledWith(order);
});

it('row 19: pay stays first and either handler suppresses Retry', () => {
  const sale = { ...order, payments: [order.payments[0], order.payments[2]], error: { ...order.error!, data: { orderId: '115', recorded: 1 } } };
  const props = { openSessionId: 'open', orders: [sale], onRetry: async () => 0, onReverseOnStore: done };
  const view = render(<OrdersList {...props} onPayRestOnStore={done} />);
  const pay = screen.getByTestId('order-sale-pay-rest-on-store');
  expect(pay.compareDocumentPosition(screen.getByTestId(id)) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.queryByText('Retry')).toBeNull();
  view.rerender(<OrdersList {...props} />);
  expect(screen.getByTestId(id)).toBeTruthy();
  expect(screen.queryByText('Retry')).toBeNull();
});

it('finishes sending without a dialog and shows a retryable error', async () => {
  const sale: PosOrder = { ...order, storeSettlement: { kind: 'reverse', state: 'sending', at, attemptId: 'attempt',
    legs: [{ paymentId: 'cash', commandId: 'first' }, { paymentId: 'card', commandId: 'second' }] } };
  let finish!: (outcome: SettleOutcome) => void;
  const reverse = vi.fn(() => new Promise<SettleOutcome>((resolve) => { finish = resolve; }));
  render(<OrdersList openSessionId="open" orders={[sale]} onRetry={async () => 0} onReverseOnStore={reverse} />);
  const button = screen.getByTestId(id);
  expect(button.textContent).toBe('Finish cancelling on store');
  fireEvent.click(button);
  expect(screen.queryByTestId(`${id}-dialog`)).toBeNull();
  expect(button.textContent).toBe('Cancelling on store…');
  await act(async () => { finish({ kind: 'retry', reason: 'network' }); });
  expect(screen.getByTestId(`${id}-error`).textContent).toBe('Could not reach the store. Try again.');
});

it('Pay the rest is hidden after a give back took a leg off the store', () => {
  const sale: PosOrder = { ...order, storeSettlement: { kind: 'reverse', state: 'refused', at, attemptId: 'attempt',
    legs: [{ paymentId: 'cash', commandId: 'first', done: true }, { paymentId: 'card', commandId: 'second' }] } };
  render(<OrdersList openSessionId="open" orders={[sale]} onRetry={async () => 0} onPayRestOnStore={done} onReverseOnStore={done} />);
  expect(screen.queryByTestId('order-sale-pay-rest-on-store')).toBeNull();
  expect(screen.getByTestId(id)).toBeTruthy();
});
