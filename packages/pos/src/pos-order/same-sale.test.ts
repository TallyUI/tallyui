import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../order';
import { finalizeOrder } from './finalize';
import { OrderContentMismatchError, sameSale } from './same-sale';
import type { PosOrder } from './types';

function order(): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'shirt', variantId: 'blue', name: 'Blue shirt', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addLine({ productId: 'shirt', variantId: 'red', name: 'Red shirt', unitPrice: { amount: 800, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 1500 });
  builder.addPayment({ method: 'external', amountMinor: 500 });
  return finalizeOrder(builder.getSnapshot(), { registerId: 'register-1' });
}

describe('sameSale', () => {
  const stored = order();

  it('is true for the same content, whatever the commandId and the fields that carry no money', () => {
    const requeued: PosOrder = { ...stored, commandId: 'another', updatedAt: 'later', syncStatus: 'rejected', note: 'n' };
    expect(sameSale(stored, requeued)).toBe(true);
  });

  const line = (i: number, patch: Partial<PosOrder['lines'][number]>) =>
    ({ ...stored, lines: stored.lines.map((entry, j) => j === i ? { ...entry, ...patch } : entry) });
  const payment = (i: number, patch: Partial<PosOrder['payments'][number]>) =>
    ({ ...stored, payments: stored.payments.map((entry, j) => j === i ? { ...entry, ...patch } : entry) });
  it.each<[string, PosOrder]>([
    ['totalMinor', { ...stored, totalMinor: stored.totalMinor + 1 }],
    ['currency', { ...stored, currency: 'USD' }],
    ['a line id', line(1, { id: 'other-line' })],
    ['a line quantity', line(0, { quantity: 2 })],
    ['a line netMinor', line(1, { netMinor: 799 })],
    ['the line order', { ...stored, lines: [...stored.lines].reverse() }],
    ['a missing line', { ...stored, lines: stored.lines.slice(0, 1) }],
    ['an extra line', { ...stored, lines: [...stored.lines, stored.lines[0]] }],
    ['a payment method', payment(1, { method: 'cash' })],
    ['a payment amountMinor', payment(0, { amountMinor: 1499 })],
    ['the payment order', { ...stored, payments: [...stored.payments].reverse() }],
    ['a missing payment', { ...stored, payments: stored.payments.slice(1) }],
    ['an extra payment', { ...stored, payments: [...stored.payments, stored.payments[0]] }],
  ])('is false for a different %s, either way round', (_field, retried) => {
    expect(sameSale(stored, retried)).toBe(false);
    expect(sameSale(retried, stored)).toBe(false);
  });

  it('OrderContentMismatchError names the order id', () => {
    const error = new OrderContentMismatchError(stored.id);
    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({ name: 'OrderContentMismatchError', orderId: stored.id });
    expect(error.message).toContain(stored.id);
  });
});
