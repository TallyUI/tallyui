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
    subtotalMinor: 1200, discountMinor: 0, taxMinor: 0, totalMinor: 1200, syncStatus: 'pending',
    taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' }, ...overrides,
  };
}
const formatDate = (iso: string) => `date:${iso.slice(0, 10)}`;
const headers = () => screen.getAllByRole('heading').map((heading) => heading.textContent);
// #269: each refusal code's sentence, word for word as the Front desk accepted it (2026-09-30).
const refusals = {
  invalid_payload: "The online store refused this sale: this till sent it in a form the store can't read. Ask the store owner to look at the till's sync log.",
  unsupported_version: "The online store refused this sale: the store's software is older than this till's. Ask the store owner to update the POS plugin.",
  idempotency_mismatch: "The online store has a different sale under this sale's number. Don't send it again; ask the store owner to compare the two.",
  store_configuration: 'The online store refused this sale: a setting on the store needs changing. Once the store owner fixes it, press Retry.',
  platform_error: "The online store refused this sale. Ask the store owner to look at the till's sync log.",
  internal_error: "The online store hit a fault in its POS plugin and refused this sale. Ask the store owner to look at the till's sync log.",
  insufficient_stock: "The online store refused this sale: it doesn't have enough stock of one of the items.",
  unsupported_tax_mode: "The online store refused this sale: its tax settings can't take a sale like this one. Ask the store owner to check them.",
  unknown_variant: 'The online store refused this sale: that product variation no longer exists.',
  invalid_quantity: "The online store refused this sale: a quantity or a discount on it isn't allowed.",
  underpaid: 'The online store refused this sale: the payments add up to less than the total.',
  unsupported_currency: "The online store refused this sale: the store doesn't take this currency.",
};

describe('OrdersList', () => {
  it('shows customer omissions and dropped payment references under Needs attention', () => {
    render(<OrdersList orders={[order('local', { syncStatus: 'applied', localWarnings: [
      { code: 'customer_omitted', field: 'email' }, { code: 'customer_omitted', field: 'id' },
      { code: 'payment_reference_dropped', paymentId: 'payment-local' },
    ] })]} onRetry={async () => 0} />);
    expect(headers()).toEqual(['Needs attention', 'Recent']);
    for (const field of ['email', 'id']) expect(screen.getAllByText(`The customer's ${field} couldn't be sent to the store, so the order isn't linked to them.`)).toHaveLength(2);
    expect(screen.getAllByText("The terminal's payment reference couldn't be kept; the payment is recorded without it.")).toHaveLength(2);
  });

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
    expect(screen.getAllByText(refusals.unknown_variant)).toHaveLength(2);
    expect(screen.getAllByText('Stock short by 1 for Blue shirt')).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  });

  // A stuck order's line: the same words for any reason, the hour numeric as the status line has it (#245).
  const stuckTime = (at: number) => new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const stuckLine = (at: number) => `Hasn't reached the online store since ${stuckTime(at)}.`;

  it.each(['timeout', 'status_503'])('shows a stuck %s order with the same words', (reason) => {
    const since = new Date(2026, 8, 29, 14, 2).getTime();
    render(<OrdersList orders={[order('s')]} onRetry={async () => 0}
      stuck={{ commandIds: ['command-s'], reason, since, orders: [{ commandId: 'command-s', since, reason }] }} />);
    expect(screen.getAllByText(stuckLine(since))).toHaveLength(2);
  });

  it('lists a stuck pending order under Needs attention, with since when it has not reached the store', () => {
    const since = new Date(2026, 8, 29, 14, 2).getTime();
    const line = stuckLine(since);
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
    expect(screen.queryByText(/reached the online store/)).toBeNull();
  });

  it('shows each stuck order with its own since, not the earliest across them, with the hour numeric', () => {
    const [early, late] = [new Date(2026, 8, 29, 9, 15).getTime(), new Date(2026, 8, 29, 13, 40).getTime()];
    expect(stuckTime(early)).not.toBe(stuckTime(late));
    const { container } = render(<OrdersList orders={[order('a'), order('b', { createdAt: '2026-09-25T09:00:00.000Z' })]}
      onRetry={async () => 0} formatDate={formatDate} stuck={{ commandIds: ['command-a', 'command-b'], since: early, reason: 'no_progress',
        orders: [{ commandId: 'command-a', since: early, reason: 'status_503' }, { commandId: 'command-b', since: late, reason: 'timeout' }] }} />);
    expect(screen.getAllByText(stuckLine(early))).toHaveLength(2);
    expect(screen.getAllByText(stuckLine(late))).toHaveLength(2);
    // 9:15, never 09:15.
    const twoDigit = new Date(early).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    expect(twoDigit).toMatch(/^09/);
    expect(stuckTime(early)).toMatch(/^9\D/);
    expect(container.textContent).not.toContain(twoDigit);
  });

  it.each(['timeout', 'status_503', 'status_404', 'no_progress'])('shows no reason code for a stuck %s order', (reason) => {
    const since = Date.now();
    const { container } = render(<OrdersList orders={[order('s')]} onRetry={async () => 0} formatDate={formatDate}
      stuck={{ commandIds: ['command-s'], reason, since, orders: [{ commandId: 'command-s', since, reason }] }} />);
    expect(screen.getAllByText(stuckLine(since))).toHaveLength(2);
    expect(container.textContent).not.toMatch(/status_|\([^)]*\)|Not syncing|keeps failing|refusing|no answer/);
    expect(container.textContent).not.toContain(reason);
  });

  it.each(Object.entries(refusals))('shows a %s refusal as its sentence in both sections, never the store\'s message or the code', (code, sentence) => {
    const message = `Store says ${code} happened (distinctive)`;
    const { container } = render(<OrdersList orders={[order('r', { syncStatus: 'rejected', error: { code, message } })]}
      onRetry={async () => 0} formatDate={formatDate} />);
    expect(headers()).toEqual(['Needs attention', 'Recent']);
    expect(screen.getAllByText(sentence)).toHaveLength(2);
    expect(container.textContent).not.toContain(message);
    expect(container.textContent).not.toContain(code);
    for (const element of Array.from(container.querySelectorAll('*'))) expect(element.textContent).not.toMatch(/^\s*:|:\s*$|\w+_\w+:/);
    // idempotency_mismatch isn't requeueable: no Retry. Every other code keeps it under Needs attention.
    expect(screen.queryAllByRole('button', { name: 'Retry' })).toHaveLength(code === 'idempotency_mismatch' ? 0 : 1);
  });

  it.each([
    ['an unknown code', { code: 'future_code', message: 'Something new (distinctive)' }],
    ['no error', undefined],
  ])('shows the generic sentence, with Retry, for a rejected order with %s', (_, error) => {
    const { container } = render(<OrdersList orders={[order('r', { syncStatus: 'rejected', error })]} onRetry={async () => 0} />);
    expect(screen.getAllByText(refusals.platform_error)).toHaveLength(2);
    expect(container.textContent).not.toMatch(/future_code|distinctive/);
    expect(screen.getAllByRole('button', { name: 'Retry' })).toHaveLength(1);
  });

  it('asks for a manual check instead of Retry on an idempotency mismatch', () => {
    render(<OrdersList orders={[order('m', { syncStatus: 'rejected', error: { code: 'idempotency_mismatch', message: 'Differs' } })]}
      onRetry={async () => 0} />);
    expect(screen.getAllByText(refusals.idempotency_mismatch)).toHaveLength(2);
    expect(screen.queryByText('Differs')).toBeNull();
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
    for (const label of [refusals.platform_error, 'Stock short by 2 for Blue shirt',
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
    expect(screen.queryAllByText(refusals.idempotency_mismatch)).toHaveLength(kind === 'idempotency_mismatch' ? 2 : 0);
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

  it('renders a customer_ignored as a guest sale naming the id', () => {
    const warned = order('w', { syncStatus: 'applied', warnings: [{ code: 'customer_ignored', customerId: 'cus_1' }] });
    render(<OrdersList orders={[warned]} onRetry={async () => 0} />);
    const expected = "The online store didn't recognise the customer on this sale, so it was saved as a guest sale. Customer id: cus_1.";
    expect(screen.getAllByText(expected)).toHaveLength(2);
  });

  const eur = (amount: number) => formatMoney({ amount, currency: 'EUR' });
  it.each([
    [`The online store worked out different figures for this sale. Subtotal: till ${eur(1050)}, store ${eur(1000)}.`,
      [{ field: 'subtotalMinor', tillMinor: 1050, serverMinor: 1000 }] as const],
    [`The online store worked out different figures for this sale. Subtotal: till ${eur(1050)}, store ${eur(1000)}. Tax: till ${eur(210)}, store ${eur(200)}.`,
      [{ field: 'subtotalMinor', tillMinor: 1050, serverMinor: 1000 }, { field: 'taxMinor', tillMinor: 210, serverMinor: 200 }] as const],
    [`The online store worked out different figures for this sale. grandTotalMinor: till ${eur(100)}, store ${eur(200)}.`,
      [{ field: 'grandTotalMinor', tillMinor: 100, serverMinor: 200 }] as const],
  ])('renders a figures_mismatch as one line: %s', (expected, fields) => {
    const warned = order('w', { syncStatus: 'applied', warnings: [{ code: 'figures_mismatch', fields: [...fields] }] });
    render(<OrdersList orders={[warned]} onRetry={async () => 0} />);
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
