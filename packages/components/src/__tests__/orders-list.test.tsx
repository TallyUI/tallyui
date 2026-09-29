// OrdersList (ADR-052, TV7), lifted from medusapos/app `563b03c4` `app/orders.tsx`. medusapos/app does have a test
// of the screen, `describe('Orders screen and sync status')` in `apps/expo/tests/products-screen.test.tsx`
// (medusapos/app `563b03c4487cbdcab6fbfb53d8a19afd9112b1094`, the same pin TV7 lifted from): the five tests below
// marked "Ported from medusapos/app" carry that describe's titles word for word, adapted to OrdersList's props
// (`orders`, `onRetry`, `formatDate`, `footer`) in place of the screen, `useOutboxContext` and `requeue`. Left out
// (2026-09-27 review): "redirects Orders to login when signed out" (session/routing, stays in the app, not
// OrdersList) and "shows retry seconds and updates the countdown" (exercises `<SyncStatus>` directly, not
// OrdersList). Every other test here is TallyUI's own, written from OrdersList's code.
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatMoney } from '@tallyui/core';
import type { PosOrder } from '@tallyui/pos';
import { OrdersList } from '../sale/orders-list';

afterEach(() => cleanup());

function order(id: string, overrides: Partial<PosOrder> = {}): PosOrder {
  const createdAt = '2026-09-25T10:00:00.000Z';
  return {
    id, commandId: `command-${id}`, createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    lines: [{ id: `line-${id}`, productId: 'shirt', variantId: 'blue', name: 'Blue shirt', sku: 'BLUE', quantity: 2,
      unitPriceMinor: 600, discountMinor: 0, netMinor: 1200, taxLines: [] }],
    payments: [{ id: `payment-${id}`, method: 'cash', amountMinor: 1200 }], customer: null,
    subtotalMinor: 1200, discountMinor: 0, taxMinor: 0, totalMinor: 1200, syncStatus: 'pending', ...overrides,
  };
}
const formatDate = (iso: string) => `date:${iso.slice(0, 10)}`;
const headers = () => screen.getAllByRole('heading').map((heading) => heading.textContent);

describe('OrdersList', () => {
  it('shows only Recent when no order needs attention, with each status label, money and date', () => {
    render(<OrdersList orders={[order('a'), order('b', { syncStatus: 'applied', serverRefs: { orderId: 'o', displayId: '42', totalMinor: 1200 } })]}
      onRetry={async () => 0} formatDate={formatDate} />);
    expect(headers()).toEqual(['Recent']);
    const money = formatMoney({ amount: 1200, currency: 'EUR' });
    expect(screen.getByText(`date:2026-09-25 · ${money} · Waiting to sync`)).toBeTruthy();
    expect(screen.getByText(`date:2026-09-25 · ${money} · Synced`)).toBeTruthy();
    expect(screen.getByText('Order #42 · 2 items')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('lists rejected and warned orders under Needs attention as well as Recent', () => {
    const rejected = order('r', { syncStatus: 'rejected', error: { code: 'unknown_variant', message: 'Variant was removed' } });
    const warned = order('w', { syncStatus: 'applied', warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] });
    render(<OrdersList orders={[rejected, warned, order('p')]} onRetry={async () => 0} formatDate={formatDate} />);
    expect(headers()).toEqual(['Needs attention', 'Recent']);
    expect(screen.getAllByText(/· Not accepted$/)).toHaveLength(2);
    expect(screen.getAllByText('unknown_variant: Variant was removed')).toHaveLength(2);
    expect(screen.getAllByText('Stock short by 1 for Blue shirt')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  });

  it('lists a stuck pending order under Needs attention, with why it is not syncing and since when', () => {
    const since = new Date(2026, 8, 29, 14, 2).getTime();
    const time = new Date(since).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    const line = `Not syncing: the store keeps failing (status_503) since ${time}`;
    const stuck = order('s', { createdAt: '2026-09-25T09:00:00.000Z' });
    render(<OrdersList orders={[stuck, order('p'), order('x', { commandId: 'command-a', syncStatus: 'applied' })]} onRetry={async () => 0}
      formatDate={formatDate} stuck={{ commandIds: ['command-s', 'command-a'], reason: 'status_503', since,
        orders: ['command-s', 'command-a'].map((commandId) => ({ commandId, since, reason: 'status_503' })) }} />);
    expect(headers()).toEqual(['Needs attention', 'Recent']);
    expect(screen.getAllByText(line)).toHaveLength(2);
    const attention = screen.getAllByText(/· Waiting to sync$/);
    expect(attention).toHaveLength(3);
    expect(attention[0].nextSibling?.textContent).toBe(line);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    cleanup();
    render(<OrdersList orders={[stuck]} onRetry={async () => 0} formatDate={formatDate} />);
    expect(headers()).toEqual(['Recent']);
    expect(screen.queryByText(/Not syncing/)).toBeNull();
  });

  it('shows each stuck order with its own since and reason, not the earliest across them', () => {
    const [early, late] = [new Date(2026, 8, 29, 9, 15).getTime(), new Date(2026, 8, 29, 13, 40).getTime()];
    const time = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    expect(time(early)).not.toBe(time(late));
    render(<OrdersList orders={[order('a'), order('b', { createdAt: '2026-09-25T09:00:00.000Z' })]} onRetry={async () => 0}
      formatDate={formatDate} stuck={{ commandIds: ['command-a', 'command-b'], since: early, reason: 'no_progress', orders: [
        { commandId: 'command-a', since: early, reason: 'status_503' }, { commandId: 'command-b', since: late, reason: 'no_progress' }] }} />);
    expect(screen.getAllByText(`Not syncing: the store keeps failing (status_503) since ${time(early)}`)).toHaveLength(2);
    expect(screen.getAllByText(`Not syncing: the store keeps failing (no_progress) since ${time(late)}`)).toHaveLength(2);
  });

  it('asks for a manual check instead of Retry on an idempotency mismatch', () => {
    render(<OrdersList orders={[order('m', { syncStatus: 'rejected', error: { code: 'idempotency_mismatch', message: 'Differs' } })]}
      onRetry={async () => 0} />);
    expect(screen.getByText('This sale needs checking against the store before it can be sent again.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  // Registers c1a (ADR-032, late sale).
  it('explains a late sale under Needs attention and Recent, with Retry only when it is also rejected', () => {
    const late = 'Taken after the register closed. It is not in that register\'s closure.';
    const view = render(<OrdersList orders={[order('l', { lateSessionId: 'closed' })]} onRetry={async () => 0} />);
    expect(headers()).toEqual(['Needs attention', 'Recent']);
    expect(screen.getAllByText(late)).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    view.rerender(<OrdersList orders={[order('l', { lateSessionId: 'closed', syncStatus: 'rejected', error: { code: 'invalid', message: 'no' } })]}
      onRetry={async () => 0} />);
    expect(screen.getAllByText(late)).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  });

  it('calls onRetry with the order id and stays retrying until the order leaves rejected', async () => {
    const rejected = order('r', { syncStatus: 'rejected', error: { code: 'unknown_variant', message: 'gone' } });
    let settle!: (count: number) => void;
    const onRetry = vi.fn(() => new Promise<number>((resolve) => { settle = resolve; }));
    const view = render(<OrdersList orders={[rejected]} onRetry={onRetry} />);
    const retry = () => screen.getByRole('button', { name: 'Retry' });
    expect(retry().getAttribute('aria-disabled')).toBeNull();
    await act(async () => { fireEvent.click(retry()); });
    expect(onRetry).toHaveBeenCalledWith(['r']);
    expect(retry().getAttribute('aria-disabled')).toBe('true');
    await act(async () => { fireEvent.click(retry()); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => { settle(1); });
    expect(retry().getAttribute('aria-disabled')).toBe('true');
    view.rerender(<OrdersList orders={[{ ...rejected, syncStatus: 'pending', error: undefined }]} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
  });

  it('enables Retry again when nothing was requeued', async () => {
    const onRetry = vi.fn(async () => 0);
    render(<OrdersList orders={[order('r', { syncStatus: 'rejected' })]} onRetry={onRetry} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    expect(onRetry).toHaveBeenCalledWith(['r']);
    expect(screen.getByRole('button', { name: 'Retry' }).getAttribute('aria-disabled')).toBeNull();
  });

  it('renders the footer after the sections, and keeps an unparseable date as is by default', () => {
    render(<OrdersList orders={[order('a', { createdAt: 'corrupt date' })]} onRetry={async () => 0}
      footer={<span>Send feedback</span>} />);
    expect(screen.getByText('Send feedback')).toBeTruthy();
    expect(screen.getByText(/^corrupt date · /)).toBeTruthy();
  });

  // Ported from medusapos/app `563b03c4`'s `describe('Orders screen and sync status')`.
  it('shows only Recent when no orders need attention', () => {
    render(<OrdersList orders={[order('a'), order('b', { syncStatus: 'applied' })]} onRetry={async () => 0}
      footer={<a href="#">Send feedback</a>} />);
    expect(headers()).toEqual(['Recent']);
    expect(screen.getByRole('link', { name: 'Send feedback' })).toBeTruthy();
  });

  it('lists attention first, including errors, both warnings, totals and server display IDs', () => {
    // A single, one-item line (unlike this file's other orders' default quantity of 2), to match
    // medusapos/app's savedSale() and its "1 item"/"3 items" assertions below.
    const base = order('base', { lines: [{ id: 'line-base', productId: 'shirt', variantId: 'blue', name: 'Blue shirt',
      sku: 'BLUE', quantity: 1, unitPriceMinor: 1200, discountMinor: 0, netMinor: 1200, taxLines: [] }],
      subtotalMinor: 1200, totalMinor: 1200 });
    const rejected = { ...base, id: 'rejected', syncStatus: 'rejected' as const, error: { code: 'invalid', message: 'Unknown variant' } };
    const warned = { ...base, id: 'warned', syncStatus: 'applied' as const, serverRefs: { orderId: 'server', displayId: '42', totalMinor: 1000 },
      lines: base.lines.map((line) => ({ ...line, quantity: 3 })),
      warnings: [{ code: 'insufficient_stock' as const, variantId: 'blue', quantity: 2 },
        { code: 'total_mismatch' as const, serverMinor: 1000, expectedMinor: 1200 }] };
    render(<OrdersList orders={[rejected, warned, base]} onRetry={async () => 0} formatDate={formatDate} />);
    expect(headers()).toEqual(['Needs attention', 'Recent']);
    const money = formatMoney({ amount: base.totalMinor, currency: base.currency });
    for (const label of ['invalid: Unknown variant', 'Stock short by 2 for Blue shirt',
      `Store total ${formatMoney({ amount: 1000, currency: base.currency })} vs POS ${formatMoney({ amount: 1200, currency: base.currency })}`,
      'Order #42 · 3 items']) {
      expect(screen.getAllByText(label)).toHaveLength(2);
    }
    expect(screen.getAllByText('1 item')).toHaveLength(3);
    const dateAndTotal = `${formatDate(base.createdAt)} · ${money}`;
    expect(screen.getByText(`${dateAndTotal} · Waiting to sync`)).toBeTruthy();
    expect(screen.getAllByText(`${dateAndTotal} · Synced`)).toHaveLength(2);
    expect(screen.getAllByText(`${dateAndTotal} · Not accepted`)).toHaveLength(2);
  });

  it.each(['invalid', 'idempotency_mismatch', 'warnings'])('offers Retry only for requeueable rejections: %s', async (kind) => {
    const base = order('r');
    const orders: PosOrder[] = [kind === 'warnings'
      ? { ...base, syncStatus: 'applied', warnings: [{ code: 'total_mismatch', serverMinor: 1000, expectedMinor: 1200 }] }
      : { ...base, syncStatus: 'rejected', error: { code: kind, message: 'Rejected' } }];
    const onRetry = vi.fn().mockResolvedValue(1);
    render(<OrdersList orders={orders} onRetry={onRetry} />);
    if (kind === 'invalid') {
      await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
      expect(onRetry).toHaveBeenCalledExactlyOnceWith(['r']);
    } else {
      expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
      expect(onRetry).not.toHaveBeenCalled();
    }
    expect(screen.queryByText('This sale needs checking against the store before it can be sent again.') !== null).toBe(kind === 'idempotency_mismatch');
  });

  it('renders no warning line and no NaN for an unknown warning code', () => {
    const warned = order('w', { syncStatus: 'applied', warnings: [{ code: 'future_code' }] as unknown as PosOrder['warnings'] });
    render(<OrdersList orders={[warned]} onRetry={async () => 0} />);
    expect(screen.queryByText(/NaN/)).toBeNull();
    expect(headers()).toEqual(['Recent']);
  });

  it('renders a tax_rate_mismatch with the rate as a percentage and both amounts', () => {
    const warned = order('w', { syncStatus: 'applied',
      warnings: [{ code: 'tax_rate_mismatch', ratePpm: 55000, expectedMinor: 120, serverMinor: 100 }] });
    render(<OrdersList orders={[warned]} onRetry={async () => 0} />);
    const expected = `Tax at 5.5%: store ${formatMoney({ amount: 100, currency: 'EUR' })} vs POS ${formatMoney({ amount: 120, currency: 'EUR' })}`;
    expect(screen.getAllByText(expected)).toHaveLength(2);
  });

  it('renders the rounding line for a total_mismatch with a positive bridgeMinor', () => {
    const warned = order('w', { syncStatus: 'applied',
      warnings: [{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1195, bridgeMinor: 5 }] });
    render(<OrdersList orders={[warned]} onRetry={async () => 0} />);
    const expected = `Store calculated ${formatMoney({ amount: 1195, currency: 'EUR' })}; a rounding line of +${formatMoney({ amount: 5, currency: 'EUR' })} brought it to ${formatMoney({ amount: 1200, currency: 'EUR' })}`;
    expect(screen.getAllByText(expected)).toHaveLength(2);
  });

  it('renders the rounding line for a total_mismatch with a negative bridgeMinor', () => {
    const warned = order('w', { syncStatus: 'applied',
      warnings: [{ code: 'total_mismatch', expectedMinor: 1195, serverMinor: 1200, bridgeMinor: -5 }] });
    render(<OrdersList orders={[warned]} onRetry={async () => 0} />);
    const expected = `Store calculated ${formatMoney({ amount: 1200, currency: 'EUR' })}; a rounding line of ${formatMoney({ amount: -5, currency: 'EUR' })} brought it to ${formatMoney({ amount: 1195, currency: 'EUR' })}`;
    expect(screen.getAllByText(expected)).toHaveLength(2);
  });

  it.each([0, 1])('blocks repeat Retry taps until requeue resolves %s or the order leaves rejected', async (result) => {
    const rejected: PosOrder = { ...order('r'), syncStatus: 'rejected' };
    let resolve!: (count: number) => void;
    const onRetry = vi.fn(() => new Promise<number>((done) => { resolve = done; }));
    render(<OrdersList orders={[rejected]} onRetry={onRetry} />);
    const retry = screen.getByRole('button', { name: 'Retry' });
    act(() => { fireEvent.click(retry); fireEvent.click(retry); });
    expect(onRetry).toHaveBeenCalledExactlyOnceWith(['r']);
    expect(retry.getAttribute('aria-disabled')).toBe('true');
    await act(async () => { resolve(result); });
    expect(retry.getAttribute('aria-disabled')).toBe(result === 0 ? null : 'true');
    fireEvent.click(retry);
    expect(onRetry).toHaveBeenCalledTimes(result === 0 ? 2 : 1);
  });

  it.each(['pending', 'applied'] as const)('clears Retry state when the outbox reports %s', async (syncStatus) => {
    const rejected: PosOrder = { ...order('r'), syncStatus: 'rejected' };
    const onRetry = vi.fn().mockResolvedValue(1);
    const view = render(<OrdersList orders={[rejected]} onRetry={onRetry} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Retry' })); });
    view.rerender(<OrdersList orders={[{ ...rejected, syncStatus }]} onRetry={onRetry} />);
    expect(screen.queryByRole('button', { name: 'Retry' })).toBeNull();
    view.rerender(<OrdersList orders={[rejected]} onRetry={onRetry} />);
    expect(screen.getByRole('button', { name: 'Retry' }).getAttribute('aria-disabled')).toBeNull();
  });
});
