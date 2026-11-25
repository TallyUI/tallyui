// Ported from medusapos/app `563b03c4` `lib/order-store.test.ts` (ADR-052, TV7), word for word.
import { describe, expect, it } from 'vitest';
import { createOrderBuilder } from '../order';
import { finalizeOrder } from './finalize';
import { needsAttention, UPDATE_UNSENDABLE, UPDATE_UNSENDABLE_MESSAGE } from './needs-attention';
import type { PosOrder } from './types';

function sale(): PosOrder {
  const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: false, getTaxRatePpm: () => 0 } });
  builder.addLine({ productId: 'shirt', variantId: 'blue', name: 'Blue shirt', unitPrice: { amount: 1200, currency: 'EUR' } });
  builder.addPayment({ method: 'cash', amountMinor: 1200 });
  return finalizeOrder(builder.getSnapshot());
}

describe('needsAttention', () => {
  it('shows a pending reopened sale the outbox could not build', () => {
    const order: PosOrder = { ...sale(), storeOrderId: 'store-1', error: { code: UPDATE_UNSENDABLE, message: UPDATE_UNSENDABLE_MESSAGE } };
    expect(needsAttention([order])).toEqual([order]);
  });
  it('does not show a pending order without that mark', () => {
    expect(needsAttention([sale()])).toEqual([]);
  });

  it.each<Partial<PosOrder>>([{}, { localWarnings: [{ code: 'customer_omitted', field: 'email' }] }, { lateSessionId: 'closed' }])(
    'leaves out refused orders only once a finalized successor is in the list: %j', (extra) => {
      const rejected: PosOrder = { ...sale(), syncStatus: 'rejected', createdAt: '2026-01-01T00:00:00Z', ...extra };
      const reopened: PosOrder = { ...rejected, id: 'reopened', reopenedAt: '2026-01-01T12:00:00Z' };
      expect(needsAttention([reopened, rejected])).toEqual([reopened, rejected]);
      const successor: PosOrder = { ...sale(), saleId: reopened.id, syncStatus: 'applied', createdAt: '2026-01-02T00:00:00Z' };
      expect(needsAttention([reopened, rejected, successor])).toEqual([rejected]);
      successor.syncStatus = 'rejected';
      expect(needsAttention([reopened, rejected, successor])).toEqual([successor, rejected]);
    },
  );

  it.each(['pending', 'applied', 'rejected'] as const)('includes a %s order with local warnings', (syncStatus) => {
    const base = sale();
    const warned: PosOrder = { ...base, syncStatus, localWarnings: [{ code: 'customer_omitted', field: 'email' }] };
    expect(needsAttention([base, { ...base, syncStatus: 'applied', localWarnings: [] }, warned])).toEqual([warned]);
  });

  it('selects rejected and applied-with-warnings orders newest first without changing the input', () => {
    const base = sale();
    const rejected: PosOrder = { ...base, id: 'rejected', syncStatus: 'rejected', createdAt: '2026-01-01T00:00:00Z' };
    const warned: PosOrder = { ...base, id: 'warned', syncStatus: 'applied', createdAt: '2026-01-03T00:00:00Z',
      warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] };
    const orders: PosOrder[] = [rejected, base, { ...base, syncStatus: 'applied', warnings: [] }, warned,
      { ...base, syncStatus: 'applied' }, { ...base, warnings: warned.warnings }];
    expect(needsAttention(orders)).toEqual([warned, rejected]);
    expect(orders[0]).toBe(rejected);
  });

  it('does not flag an applied order whose only warning has an unknown code, and flags a tax_rate_mismatch', () => {
    const base = sale();
    const unknown: PosOrder = { ...base, id: 'unknown', syncStatus: 'applied',
      warnings: [{ code: 'future_code' }] as unknown as PosOrder['warnings'] };
    const taxed: PosOrder = { ...base, id: 'taxed', syncStatus: 'applied',
      warnings: [{ code: 'tax_rate_mismatch', ratePpm: 200000, expectedMinor: 120, serverMinor: 100 }] };
    expect(needsAttention([unknown, taxed])).toEqual([taxed]);
  });

  it('does not flag register_session_unknown alone, but flags it with insufficient_stock', () => {
    const base = sale();
    const waiting: PosOrder = { ...base, id: 'waiting', syncStatus: 'applied',
      warnings: [{ code: 'register_session_unknown', sessionId: 's-1' }] };
    const warned: PosOrder = { ...base, id: 'warned', syncStatus: 'applied',
      warnings: [{ code: 'register_session_unknown', sessionId: 's-1' },
        { code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] };
    expect(needsAttention([waiting, warned])).toEqual([warned]);
  });

  // Registers c1a (ADR-032, late sale). Revert: drop the lateSessionId case from needsAttention.
  it('selects a late sale whatever its sync status, newest first, without changing the input', () => {
    const base = sale();
    const pending: PosOrder = { ...base, id: 'late-pending', lateSessionId: 'closed', createdAt: '2026-01-02T00:00:00Z' };
    const applied: PosOrder = { ...base, id: 'late-applied', syncStatus: 'applied', lateSessionId: 'closed', createdAt: '2026-01-04T00:00:00Z' };
    const orders = [pending, base, applied, { ...base, syncStatus: 'applied' as const }];
    const before = structuredClone(orders);
    expect(needsAttention(orders)).toEqual([applied, pending]);
    expect(orders).toEqual(before);
  });

  it('selects a pending order only when its commandId is in stuckCommandIds', () => {
    const base = sale();
    const stuck: PosOrder = { ...base, id: 'stuck', commandId: 'command-stuck', createdAt: '2026-01-01T00:00:00Z' };
    const waiting: PosOrder = { ...base, id: 'waiting', commandId: 'command-waiting', createdAt: '2026-01-02T00:00:00Z' };
    const done: PosOrder = { ...base, id: 'done', commandId: 'command-done', syncStatus: 'applied', createdAt: '2026-01-03T00:00:00Z' };
    const rejected: PosOrder = { ...base, id: 'rejected', syncStatus: 'rejected', createdAt: '2026-01-04T00:00:00Z' };
    const orders = [stuck, waiting, done, rejected];
    expect(needsAttention(orders, { stuckCommandIds: ['command-stuck', 'command-done'] })).toEqual([rejected, stuck]);
    expect(needsAttention(orders, { stuckCommandIds: [] })).toEqual([rejected]);
    expect(needsAttention(orders, {})).toEqual([rejected]);
  });

  it('without options selects as before: no pending order', () => {
    const base = sale();
    const rejected: PosOrder = { ...base, id: 'rejected', syncStatus: 'rejected' };
    expect(base.syncStatus).toBe('pending');
    expect(needsAttention([base, rejected])).toEqual([rejected]);
  });
});

describe('attention handled (ADR-092 6f)', () => {
  it.each<[string, Partial<PosOrder>]>([
    ['rejected', { syncStatus: 'rejected' }],
    ['applied with a known warning', { syncStatus: 'applied', warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] }],
    ['late (lateSessionId)', { lateSessionId: 'closed' }],
    ['with local warnings', { localWarnings: [{ code: 'customer_omitted', field: 'email' }] }],
  ])('N1 leaves out a %s order stamped for its commandId, and keeps it stamped for another or unstamped', (_reason, extra) => {
    const order: PosOrder = { ...sale(), ...extra };
    expect(needsAttention([{ ...order, attentionHandledFor: order.commandId }])).toEqual([]);
    const other: PosOrder = { ...order, attentionHandledFor: 'another-command' };
    expect(needsAttention([other])).toEqual([other]);
    expect(needsAttention([order])).toEqual([order]);
  });

  it('N2 returns only the unstamped rejected order, newest first as before', () => {
    const base = sale();
    const stamped: PosOrder = { ...base, id: 'stamped', syncStatus: 'rejected', createdAt: '2026-01-03T00:00:00Z', attentionHandledFor: base.commandId };
    const older: PosOrder = { ...base, id: 'older', commandId: 'command-older', syncStatus: 'rejected', createdAt: '2026-01-01T00:00:00Z' };
    const newer: PosOrder = { ...base, id: 'newer', commandId: 'command-newer', syncStatus: 'applied', createdAt: '2026-01-02T00:00:00Z',
      warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] };
    expect(needsAttention([stamped, older])).toEqual([older]);
    expect(needsAttention([older, stamped, newer])).toEqual([newer, older]);
  });

  // #1101: a refused sale whose order the store created (storeOrderLeft) is not hidden by the stamp.
  const left = (data: Record<string, unknown>): PosOrder => {
    const order = sale();
    return { ...order, syncStatus: 'rejected', attentionHandledFor: order.commandId, error: { code: 'invalid_payload', message: 'm', data } };
  };
  it('N3 keeps a stamped refusal whose order the store created', () => {
    const order = left({ orderId: '115', displayId: '1001', recorded: 1 });
    expect(needsAttention([order])).toEqual([order]);
  });
  it('N4 still hides a stamped refusal without data.orderId, and a stamped applied order with a warning', () => {
    const applied: PosOrder = { ...left({ orderId: '115' }), syncStatus: 'applied', warnings: [{ code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] };
    expect(needsAttention([left({ storeCode: 'wcpos_command_conflict' }), applied])).toEqual([]);
  });
  it('N5 hides a stamped refusal with a store order once its finalized successor is in the list', () => {
    const order: PosOrder = { ...left({ orderId: '115' }), reopenedAt: '2026-01-01T12:00:00Z', createdAt: '2026-01-01T00:00:00Z' };
    const successor: PosOrder = { ...sale(), saleId: order.id, syncStatus: 'applied', createdAt: '2026-01-02T00:00:00Z' };
    expect(needsAttention([order, successor])).toEqual([]);
  });
});

describe('a refused sale settled on the store (#1101)', () => {
  const left = (storeSettlement?: PosOrder['storeSettlement'], extra: Partial<PosOrder> = {}): PosOrder => ({
    ...sale(), syncStatus: 'rejected', error: { code: 'invalid_payload', message: 'x', data: { orderId: '115' } }, storeSettlement, ...extra,
  });
  const settled = (state: NonNullable<PosOrder['storeSettlement']>['state']) => ({ kind: 'cancel' as const, state, attemptId: 'a', at: '2026-11-25T10:00:00.000Z' });

  it.each(['done', 'gone'] as const)('leaves out a row whose cancel is %s', (state) => {
    expect(needsAttention([left(settled(state))])).toEqual([]);
  });
  it.each(['sending', 'changed', 'refused'] as const)('keeps a row whose cancel is %s', (state) => {
    const order = left(settled(state));
    expect(needsAttention([order])).toEqual([order]);
  });
  it('17: keeps a done row that has local warnings', () => {
    const order = left(settled('done'), { localWarnings: [{ code: 'customer_omitted', field: 'email' }] });
    expect(needsAttention([order])).toEqual([order]);
  });
});
