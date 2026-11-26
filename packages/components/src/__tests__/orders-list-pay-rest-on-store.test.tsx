// Needs attention's "Pay the rest on store" (#1101 slice 3) and the Retry it replaces. Every expected string is written
// out here, not imported from the component file.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { formatMoney, type SettleOutcome } from '@tallyui/core';
import type { PosOrder } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { OrdersList } from '../sale/orders-list';

afterEach(() => cleanup());
/** The confirm dialog renders through a portal, as in confirm-dialog.test.tsx. */
const show = (list: ReactElement) => render(<>{list}<PortalHost /></>);
const eur = (amount: number) => formatMoney({ amount, currency: 'EUR' });

type Handler = (order: PosOrder) => Promise<SettleOutcome | { kind: 'not_offered' }>;
/** A 30.00 sale the store refused after recording `recorded` of its legs: cash 10.00, card 15.00, cash 5.00 (tendered 20.00). */
function partPaid(id: string, recorded = 1, overrides: Partial<PosOrder> = {}): PosOrder {
  const createdAt = '2026-11-25T10:00:00.000Z';
  return {
    id, sessionId: 'open', commandId: `command-${id}`, createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: `line-${id}`, productId: 'shirt', variantId: 'blue', name: 'Blue shirt', sku: 'BLUE', quantity: 1,
      unitPriceMinor: 3000, discountMinor: 0, netMinor: 3000, taxLines: [] }],
    payments: [{ id: `cash-${id}`, method: 'cash', amountMinor: 1000 }, { id: `card-${id}`, method: 'external', amountMinor: 1500 },
      { id: `coins-${id}`, method: 'cash', amountMinor: 500, tenderedMinor: 2000, changeMinor: 1500 }], customer: null,
    subtotalMinor: 3000, discountMinor: 0, taxMinor: 0, totalMinor: 3000, syncStatus: 'rejected',
    error: { code: 'invalid_payload', message: 'created, part paid', data: { orderId: '115', displayId: '1001', recorded } },
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...overrides,
  };
}
const settlement = (state: NonNullable<PosOrder['storeSettlement']>['state'], kind: 'pay' | 'cancel' = 'pay'): PosOrder['storeSettlement'] =>
  ({ kind, state, attemptId: 'attempt-1', at: '2026-11-25T10:00:00.000Z', payments: kind === 'pay' ? [{ id: 'n1', method: 'external', amountMinor: 1500 }] : undefined });
const attention = () => within(screen.getByRole('heading', { name: 'Needs attention' }).parentElement!);
const recent = () => within(screen.getByRole('heading', { name: 'Recent' }).parentElement!);
const button = (id: string) => screen.queryByTestId(`order-${id}-pay-rest-on-store`);
const done: Handler = async () => ({ kind: 'done', status: 'completed' });
const cancelDone: Handler = async () => ({ kind: 'done', status: 'cancelled' });

describe('Pay the rest on store', () => {
  it('row 18: point to Give back and cancel only when offered', () => {
    const payments = [{ id: 'cash', method: 'cash' as const, amountMinor: 1000 }, { id: 'card', method: 'external' as const, amountMinor: 2000 }];
    for (const handler of [undefined, cancelDone]) {
      show(<OrdersList openSessionId="open" orders={[partPaid('o1', 1, { payments })]} onRetry={async () => 0} onPayRestOnStore={done} onReverseOnStore={handler} />);
      fireEvent.click(button('o1')!);
      expect(screen.getByTestId('order-o1-pay-rest-on-store-dialog').textContent).toContain(handler
        ? 'If the money was given back, use Give back and cancel instead.' : "If the money was given back, do not record it; a manager must check the order in the store's admin.");
      cleanup();
    }
  });
  it.each<[string, PosOrder, Handler | undefined, boolean]>([
    ['recorded 1, with the handler', partPaid('o1'), done, true],
    ['row 12: recorded 0', partPaid('o1', 0), done, false],
    ['row 16: no handler', partPaid('o1'), undefined, false],
    ['settled done', partPaid('o1', 1, { storeSettlement: settlement('done') }), done, false],
    // A pay gone is not on the store, so a press could only read 404 again; with money recorded it is still not settled.
    ['row 10b: a pay gone with 10.00 recorded is not offered again', partPaid('o1', 1, { storeSettlement: settlement('gone') }), done, false],
    ['changed', partPaid('o1', 1, { storeSettlement: settlement('changed') }), done, true],
    ['refused', partPaid('o1', 1, { storeSettlement: settlement('refused') }), done, true],
    ['every leg recorded', partPaid('o1', 3), done, false],
  ])('%s', (_name, order, handler, shown) => {
    show(<OrdersList orders={[order]} onRetry={async () => 0} onPayRestOnStore={handler} />);
    expect(button('o1') !== null).toBe(shown);
  });

  it('row 12: recorded 0 offers Cancel order on store instead', () => {
    show(<OrdersList openSessionId="open" orders={[partPaid('o1', 0)]} onRetry={async () => 0} onCancelOnStore={cancelDone} onPayRestOnStore={done} />);
    expect(button('o1')).toBeNull();
    expect(screen.getByTestId('order-o1-cancel-on-store')).toBeTruthy();
  });

  it('row 10: a gone pay with money recorded stays in Needs attention with its notice', () => {
    show(<OrdersList orders={[partPaid('o1', 1, { storeSettlement: settlement('gone') })]} onRetry={async () => 0} onPayRestOnStore={done} />);
    expect(attention().getByTestId('order-settlement-o1').textContent).toBe(`Order #1001 is not on the store any more; ${eur(1000)} was recorded on it.`);
  });

  it('row 10b: a pay gone with 10.00 recorded offers neither Pay the rest on store nor Retry', () => {
    show(<OrdersList orders={[partPaid('o1', 1, { storeSettlement: settlement('gone') })]} onRetry={async () => 0} onPayRestOnStore={done} />);
    expect(button('o1')).toBeNull();
    expect(attention().queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('only in Needs attention', () => {
    show(<OrdersList orders={[partPaid('o1')]} onRetry={async () => 0} onPayRestOnStore={done} />);
    expect(attention().getByTestId('order-o1-pay-rest-on-store')).toBeTruthy();
    expect(recent().queryByTestId('order-o1-pay-rest-on-store')).toBeNull();
    expect(button('o1')!.textContent).toBe('Pay the rest on store');
  });

  it('row 18: the dialog names each unrecorded leg, that no money is taken, and the give-back line; Keep as is calls nothing', () => {
    const handler = vi.fn<Handler>(done);
    show(<OrdersList orders={[partPaid('o1')]} onRetry={async () => 0} onPayRestOnStore={handler} />);
    fireEvent.click(button('o1')!);
    const dialog = within(screen.getByTestId('order-o1-pay-rest-on-store-dialog'));
    expect(dialog.getByText('Record the rest of order #1001 on the store?')).toBeTruthy();
    expect(dialog.getByText((_content, element) => element?.textContent === [
      `Card terminal ${eur(1500)}, already taken on this till.`,
      `Cash ${eur(500)}, already taken on this till.`,
      'No money is taken now.',
      "If the money was given back, do not record it; a manager must check the order in the store's admin.",
    ].join('\n') && element.children.length === 0)).toBeTruthy();
    expect(screen.getByTestId('order-o1-pay-rest-on-store-dialog-cancel').textContent).toBe('Keep as is');
    expect(screen.getByTestId('order-o1-pay-rest-on-store-dialog-confirm').textContent).toBe('Record on store');
    fireEvent.click(screen.getByTestId('order-o1-pay-rest-on-store-dialog-cancel'));
    expect(screen.queryByTestId('order-o1-pay-rest-on-store-dialog')).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it('confirm calls the handler once; in flight the button reads Recording on store… and a second press does nothing', async () => {
    let answer!: (outcome: SettleOutcome) => void;
    const handler = vi.fn<Handler>(() => new Promise((resolve) => { answer = resolve; }));
    const order = partPaid('o1');
    show(<OrdersList orders={[order]} onRetry={async () => 0} onPayRestOnStore={handler} />);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-pay-rest-on-store-dialog-confirm')); });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(order);
    expect(button('o1')!.textContent).toBe('Recording on store…');
    expect(button('o1')!.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(button('o1')!); });
    expect(screen.queryByTestId('order-o1-pay-rest-on-store-dialog')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    await act(async () => { answer({ kind: 'done', status: 'completed' }); });
    expect(screen.queryByTestId('order-o1-pay-rest-on-store-error')).toBeNull();
  });

  it.each<[string, Handler]>([
    ['a retry outcome', async () => ({ kind: 'retry', reason: 'network' })],
    ['a rejected handler', async () => { throw new Error('offline'); }],
  ])('%s says the store could not be reached, until the next press', async (_name, first) => {
    const handler = vi.fn<Handler>(first);
    show(<OrdersList orders={[partPaid('o1')]} onRetry={async () => 0} onPayRestOnStore={handler} />);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-pay-rest-on-store-dialog-confirm')); });
    expect(screen.getByTestId('order-o1-pay-rest-on-store-error').textContent).toBe('Could not reach the store. Try again.');
    handler.mockImplementationOnce(done);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-pay-rest-on-store-dialog-confirm')); });
    expect(screen.queryByTestId('order-o1-pay-rest-on-store-error')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it.each<[string, SettleOutcome, string]>([
    ['a not_completed retry says the store has not finished, not that it could not be reached', { kind: 'retry', reason: 'not_completed' },
      "The store has not finished this order yet. Try again, or check it in the store's admin."],
    ['any other retry still says Could not reach the store', { kind: 'retry', reason: 'network' }, 'Could not reach the store. Try again.'],
  ])('%s', async (_name, outcome, line) => {
    show(<OrdersList orders={[partPaid('o1')]} onRetry={async () => 0} onPayRestOnStore={async () => outcome} />);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-pay-rest-on-store-dialog-confirm')); });
    expect(screen.getByTestId('order-o1-pay-rest-on-store-error').textContent).toBe(line);
  });

  it('after an attempt that recorded leg 1, the dialog lists only leg 2', () => {
    const storeSettlement: PosOrder['storeSettlement'] = { kind: 'pay', state: 'refused', attemptId: 'attempt-1', at: '2026-11-25T10:00:00.000Z',
      payments: [{ id: 'n1', method: 'external', amountMinor: 1500, done: true }, { id: 'n2', method: 'cash', amountMinor: 500 }] };
    show(<OrdersList orders={[partPaid('o1', 1, { storeSettlement })]} onRetry={async () => 0} onPayRestOnStore={done} />);
    fireEvent.click(button('o1')!);
    const description = within(screen.getByTestId('order-o1-pay-rest-on-store-dialog')).getByText((_content, element) =>
      !!element?.textContent?.includes('No money is taken now.') && element.children.length === 0).textContent;
    expect(description).toContain(`Cash ${eur(500)}, already taken on this till.`);
    expect(description).not.toContain(`Card terminal ${eur(1500)}`);
  });

  it('a pay still sending reads Finish recording on store and calls the handler with no dialog', async () => {
    const handler = vi.fn<Handler>(done);
    show(<OrdersList orders={[partPaid('o1', 1, { storeSettlement: settlement('sending') })]} onRetry={async () => 0} onPayRestOnStore={handler} />);
    expect(button('o1')!.textContent).toBe('Finish recording on store');
    await act(async () => { fireEvent.click(button('o1')!); });
    expect(screen.queryByTestId('order-o1-pay-rest-on-store-dialog')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('Retry beside Pay the rest on store', () => {
  const retryLabels = () => attention().queryAllByRole('button').map((element) => element.textContent)
    .filter((text) => text === 'Retry' || text === 'Try the payment again');
  it.each<[string, PosOrder, Handler | undefined, string[]]>([
    ['recorded 1, with the handler', partPaid('o1'), done, []],
    ['insufficient_stock, recorded 1, with the handler', partPaid('o1', 1, { error: { code: 'insufficient_stock', message: 'x', data: { orderId: '115', recorded: 1 } } }), done, []],
    ['insufficient_stock, recorded 1, without the handler', partPaid('o1', 1, { error: { code: 'insufficient_stock', message: 'x', data: { orderId: '115', recorded: 1 } } }), undefined, ['Retry']],
  ])('%s', (_name, order, handler, labels) => {
    show(<OrdersList orders={[order]} onRetry={async () => 0} onPayRestOnStore={handler} />);
    expect(retryLabels()).toEqual(labels);
  });
});
