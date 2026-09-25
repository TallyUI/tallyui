// OrdersList (ADR-052, TV7), lifted from medusapos/app `563b03c4` `app/orders.tsx`. medusapos has no test of the
// screen's sections or retry (its `feedback-link.test.tsx` covers only the app's feedback link, which stays in the
// app and arrives here through `footer`), so these are written from the screen's code.
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
});
