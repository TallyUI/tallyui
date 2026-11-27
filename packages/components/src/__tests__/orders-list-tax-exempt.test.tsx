import { cleanup, render, screen, within } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PosOrder } from '@tallyui/pos';
import { OrdersList } from '../sale/orders-list';

afterEach(() => cleanup());

it('X13 shows a refused exempt sale as Not accepted, with the invalid_payload sentence and Retry but not Reopen', () => {
  const createdAt = '2026-11-22T10:00:00.000Z';
  const order: PosOrder = { id: 'sale', commandId: 'command', createdAt, updatedAt: createdAt, currency: 'EUR', pricesIncludeTax: false,
    customer: null, lines: [{ id: 'line', productId: 'p', sku: '', name: 'Item', quantity: 1, unitPriceMinor: 300, discountMinor: 0, netMinor: 300, taxLines: [] }],
    payments: [{ id: 'first', method: 'cash', amountMinor: 100 }, { id: 'second', method: 'cash', amountMinor: 200 }],
    subtotalMinor: 300, discountMinor: 0, taxMinor: 0, totalMinor: 300, taxExempt: true, taxRounding: { granularity: 'per_order', mode: 'half_away_from_zero' },
    syncStatus: 'rejected', error: { code: 'invalid_payload', data: { storeCode: 'tax_exempt_unsupported' },
      message: "This store's WooCommerce connector does not carry tax exemption yet; complete the sale without it." } };
  render(<OrdersList orders={[order]} onRetry={async () => 1} onReopen={vi.fn()} />);
  const attention = within(screen.getByRole('heading', { name: 'Needs attention' }).parentElement!);
  expect(attention.getByText(/· Not accepted$/)).toBeTruthy();
  expect(attention.getByText("The online store refused this sale: this till sent it in a form the store can't read. Ask the store owner to look at the till's sync log.")).toBeTruthy();
  expect(attention.getByRole('button', { name: 'Retry' })).toBeTruthy();
  expect(attention.queryByRole('button', { name: 'Reopen' })).toBeNull();
});
