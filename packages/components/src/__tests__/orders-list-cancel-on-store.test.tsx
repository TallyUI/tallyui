// Needs attention's "Cancel order on store" (#1101 slice 1b) and the Retry it replaces. Every expected string is written
// out here, not imported from the component file.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import type { SettleOutcome } from '@tallyui/core';
import type { PosOrder } from '@tallyui/pos';
import { PortalHost } from '@tallyui/primitives';
import { OrdersList } from '../sale/orders-list';

afterEach(() => cleanup());
/** The confirm dialog renders through a portal, as in confirm-dialog.test.tsx. */
const show = (list: ReactElement) => render(<>{list}<PortalHost /></>);

type Handler = (order: PosOrder) => Promise<SettleOutcome | { kind: 'not_offered' }>;
function refused(id: string, code = 'invalid_payload', data: Record<string, unknown> = { orderId: '115', displayId: '1001' }, overrides: Partial<PosOrder> = {}): PosOrder {
  const createdAt = '2026-11-25T10:00:00.000Z';
  return {
    id, sessionId: 'open', commandId: `command-${id}`, createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: `line-${id}`, productId: 'shirt', variantId: 'blue', name: 'Blue shirt', sku: 'BLUE', quantity: 1,
      unitPriceMinor: 1200, discountMinor: 0, netMinor: 1200, taxLines: [] }],
    payments: [{ id: `payment-${id}`, method: 'cash', amountMinor: 1200 }], customer: null,
    subtotalMinor: 1200, discountMinor: 0, taxMinor: 0, totalMinor: 1200, syncStatus: 'rejected',
    error: { code, message: 'created, not paid', data }, taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...overrides,
  };
}
const settlement = (state: NonNullable<PosOrder['storeSettlement']>['state']): PosOrder['storeSettlement'] =>
  ({ kind: 'cancel', state, attemptId: 'attempt-1', at: '2026-11-25T10:00:00.000Z' });
const attention = () => within(screen.getByRole('heading', { name: 'Needs attention' }).parentElement!);
const recent = () => within(screen.getByRole('heading', { name: 'Recent' }).parentElement!);
const button = (id: string) => screen.queryByTestId(`order-${id}-cancel-on-store`);
const done: Handler = async () => ({ kind: 'done', status: 'cancelled' });

describe('Cancel order on store', () => {
  const manager = "Taken in a session that has closed: a manager must settle this sale in the store's admin.";
  it('D2: changing sessions dismisses the cancel confirmation', () => {
    const cancel = vi.fn(done), dialog = 'order-o1-cancel-on-store-dialog', order = refused('o1');
    const tree = (openSessionId: string) => <><OrdersList orders={[order]} openSessionId={openSessionId} onRetry={async () => 0} onCancelOnStore={cancel} /><PortalHost /></>;
    const view = render(tree('open')); fireEvent.click(button('o1')!);
    expect(screen.getByTestId(dialog)).toBeTruthy(); view.rerender(tree('next'));
    expect([screen.queryByTestId(dialog), screen.queryByTestId(`${dialog}-confirm`)]).toEqual([null, null]);
    expect(screen.getByText(manager)).toBeTruthy(); expect(cancel).not.toHaveBeenCalled();
  });
  it('N2: a sale with no session cannot be cancelled', () => {
    const at = '2026-11-25T10:00:00.000Z';
    const order: PosOrder = { id: 'o1', commandId: 'command-o1', createdAt: at, updatedAt: at, currency: 'EUR', pricesIncludeTax: false,
      lines: [{ id: 'line', productId: 'shirt', name: 'Blue shirt', sku: 'BLUE', quantity: 1, unitPriceMinor: 1200, discountMinor: 0, netMinor: 1200, taxLines: [] }],
      payments: [{ id: 'payment', method: 'cash', amountMinor: 1200 }], customer: null,
      subtotalMinor: 1200, discountMinor: 0, taxMinor: 0, totalMinor: 1200, syncStatus: 'rejected',
      error: { code: 'invalid_payload', message: 'created, not paid', data: { orderId: '115', displayId: '1001' } },
      taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' } };
    render(<OrdersList orders={[order]} onRetry={async () => 0} onCancelOnStore={async () => ({ kind: 'done', status: 'cancelled' })} />);
    expect(button('o1')).toBeNull(); expect(screen.getByText(manager)).toBeTruthy();
  });
  it('G3: a leg without its own session belongs to the closed order session', () => {
    const order = { ...refused('o1'), sessionId: 'closed' };
    show(<OrdersList openSessionId="open" orders={[order]} onRetry={async () => 0} onCancelOnStore={done} />);
    expect(button('o1')).toBeNull();
    expect(screen.getByText("Taken in a session that has closed: a manager must settle this sale in the store's admin.")).toBeTruthy();
  });
  it.each<[string, PosOrder, Handler | undefined, boolean]>([
    ['recorded 0, with the handler', refused('o1', 'invalid_payload', { orderId: '115', recorded: 0 }), done, true],
    ['a total_mismatch refusal with a store order', refused('o1', 'invalid_payload', { orderId: '115', storeCode: 'total_mismatch' }), done, true],
    ['recorded 1', refused('o1', 'invalid_payload', { orderId: '115', recorded: 1 }), done, false],
    ['no handler', refused('o1'), undefined, false],
    ['settled done', refused('o1', 'invalid_payload', undefined, { storeSettlement: settlement('done') }), done, false],
    ['settled gone', refused('o1', 'invalid_payload', undefined, { storeSettlement: settlement('gone') }), done, false],
    ['no store order', refused('o1', 'invalid_payload', { storeCode: 'x' }), done, false],
  ])('18: %s', (_name, order, handler, shown) => {
    show(<OrdersList openSessionId="open" orders={[order]} onRetry={async () => 0} onCancelOnStore={handler} />);
    expect(button('o1') !== null).toBe(shown);
  });

  it('18: never in the Recent section', () => {
    show(<OrdersList openSessionId="open" orders={[refused('o1')]} onRetry={async () => 0} onCancelOnStore={done} />);
    expect(attention().getByTestId('order-o1-cancel-on-store')).toBeTruthy();
    expect(recent().queryByTestId('order-o1-cancel-on-store')).toBeNull();
    expect(screen.getAllByTestId('order-o1-cancel-on-store')).toHaveLength(1);
  });

  it('asks first, names the store reference, and Keep order calls nothing', () => {
    const handler = vi.fn<Handler>(done);
    show(<OrdersList openSessionId="open" orders={[refused('o1')]} onRetry={async () => 0} onCancelOnStore={handler} />);
    expect(button('o1')!.textContent).toBe('Cancel order on store');
    fireEvent.click(button('o1')!);
    const dialog = within(screen.getByTestId('order-o1-cancel-on-store-dialog'));
    expect(dialog.getByText('Cancel order #1001 on the store?')).toBeTruthy();
    expect(dialog.getByText('Order #1001 is waiting on the online store with nothing paid. This cancels it there. The payments taken on this till stay as they are.')).toBeTruthy();
    expect(screen.getByTestId('order-o1-cancel-on-store-dialog-cancel').textContent).toBe('Keep order');
    expect(screen.getByTestId('order-o1-cancel-on-store-dialog-confirm').textContent).toBe('Cancel order on store');
    fireEvent.click(screen.getByTestId('order-o1-cancel-on-store-dialog-cancel'));
    expect(screen.queryByTestId('order-o1-cancel-on-store-dialog')).toBeNull();
    expect(handler).not.toHaveBeenCalled();
  });

  it('21: confirm calls the handler once; in flight the button is disabled, reads Cancelling on store…, and a second press does nothing', async () => {
    let answer!: (outcome: SettleOutcome) => void;
    const handler = vi.fn<Handler>(() => new Promise((resolve) => { answer = resolve; }));
    const order = refused('o1');
    show(<OrdersList openSessionId="open" orders={[order]} onRetry={async () => 0} onCancelOnStore={handler} />);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-cancel-on-store-dialog-confirm')); });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toBe(order);
    expect(button('o1')!.textContent).toBe('Cancelling on store…');
    expect(button('o1')!.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(button('o1')!); });
    expect(screen.queryByTestId('order-o1-cancel-on-store-dialog')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
    await act(async () => { answer({ kind: 'done', status: 'cancelled' }); });
    expect(button('o1')!.textContent).toBe('Cancel order on store');
    expect(screen.queryByTestId('order-o1-cancel-on-store-error')).toBeNull();
  });

  it.each<[string, Handler]>([
    ['a retry outcome', async () => ({ kind: 'retry', reason: 'network' })],
    ['a rejected handler', async () => { throw new Error('offline'); }],
  ])('21: %s says the store could not be reached, until the next press', async (_name, first) => {
    const handler = vi.fn<Handler>(first);
    show(<OrdersList openSessionId="open" orders={[refused('o1')]} onRetry={async () => 0} onCancelOnStore={handler} />);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-cancel-on-store-dialog-confirm')); });
    expect(screen.getByTestId('order-o1-cancel-on-store-error').textContent).toBe('Could not reach the store. Try again.');
    let answer!: (outcome: SettleOutcome) => void;
    handler.mockImplementationOnce(() => new Promise((resolve) => { answer = resolve; }));
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-cancel-on-store-dialog-confirm')); });
    expect(screen.queryByTestId('order-o1-cancel-on-store-error')).toBeNull();
    await act(async () => { answer({ kind: 'done', status: 'cancelled' }); });
    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('21: not_offered clears the in-flight state and shows nothing else', async () => {
    show(<OrdersList openSessionId="open" orders={[refused('o1')]} onRetry={async () => 0} onCancelOnStore={async () => ({ kind: 'not_offered' })} />);
    fireEvent.click(button('o1')!);
    await act(async () => { fireEvent.click(screen.getByTestId('order-o1-cancel-on-store-dialog-confirm')); });
    expect(button('o1')!.textContent).toBe('Cancel order on store');
    expect(screen.queryByTestId('order-o1-cancel-on-store-error')).toBeNull();
  });

  it('21: a cancel still sending reads Finish cancelling on store and calls the handler with no dialog', async () => {
    const handler = vi.fn<Handler>(done);
    const order = refused('o1', 'invalid_payload', undefined, { storeSettlement: settlement('sending') });
    show(<OrdersList openSessionId="open" orders={[order]} onRetry={async () => 0} onCancelOnStore={handler} />);
    expect(button('o1')!.textContent).toBe('Finish cancelling on store');
    await act(async () => { fireEvent.click(button('o1')!); });
    expect(screen.queryByTestId('order-o1-cancel-on-store-dialog')).toBeNull();
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

describe('Retry beside Cancel order on store', () => {
  const retryLabels = () => attention().queryAllByRole('button').map((element) => element.textContent)
    .filter((text) => text === 'Retry' || text === 'Try the payment again');
  it.each<[string, PosOrder, Handler | undefined, string[]]>([
    ['insufficient_stock, recorded 0, with the handler', refused('o1', 'insufficient_stock', { orderId: '115', recorded: 0 }), done, ['Try the payment again']],
    ['insufficient_stock, recorded 0, without the handler', refused('o1', 'insufficient_stock', { orderId: '115', recorded: 0 }), undefined, ['Retry']],
    ['invalid_payload, recorded 0, with the handler', refused('o1', 'invalid_payload', { orderId: '115', recorded: 0 }), done, []],
    ['insufficient_stock, recorded 1, with the handler', refused('o1', 'insufficient_stock', { orderId: '115', recorded: 1 }), done, ['Retry']],
    ['insufficient_stock, no orderId, with the handler', refused('o1', 'insufficient_stock', { storeCode: 'x' }), done, ['Retry']],
  ])('19: %s', (_name, order, handler, labels) => {
    show(<OrdersList openSessionId="open" orders={[order]} onRetry={async () => 0} onCancelOnStore={handler} />);
    expect(retryLabels()).toEqual(labels);
  });

  it('19: Try the payment again resends the order', async () => {
    const onRetry = vi.fn(async () => 1);
    show(<OrdersList openSessionId="open" orders={[refused('o1', 'insufficient_stock')]} onRetry={onRetry} onCancelOnStore={done} />);
    await act(async () => { fireEvent.click(attention().getByText('Try the payment again')); });
    expect(onRetry).toHaveBeenCalledWith(['o1']);
  });
});
