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

describe('a rounding bridge within ADR-048 tolerance', () => {
  it.each<[string, number, number, number, number, boolean]>([
    ['B1 positive bridge at T', 1, 0, 0, 1, false],
    ['B2 negative bridge at T', 1, 0, 0, -1, false],
    ['B3 positive bridge above T', 1, 0, 0, 2, true],
    ['B4 negative bridge above T', 1, 0, 0, -2, true],
    ['B5 a fee row counts', 2, 1, 0, 2, false],
    ['B6 a shipping row counts', 2, 0, 1, 2, false],
    ['B7 at T with both surcharges', 3, 1, 1, 3, false],
    ['B7 above T with both surcharges', 3, 1, 1, 4, true],
    ['B8 an empty order has zero tolerance', 0, 0, 0, 1, true],
  ])('%s', (_name, lines, fees, shipping, bridgeMinor, listed) => {
    const base = sale();
    const order: PosOrder = { ...base, syncStatus: 'applied',
      lines: Array.from({ length: lines }, (_, index) => ({ ...base.lines[0], id: `line-${index}` })),
      fees: Array.from({ length: fees }, () => ({} as NonNullable<PosOrder['fees']>[number])),
      shipping: Array.from({ length: shipping }, () => ({} as NonNullable<PosOrder['shipping']>[number])),
      warnings: [{ code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1200 - bridgeMinor, bridgeMinor }] };
    expect(needsAttention([order])).toEqual(listed ? [order] : []);
  });

  const mismatch = { code: 'total_mismatch', expectedMinor: 1200, serverMinor: 1199 } as const;
  const bridged = { ...mismatch, bridgeMinor: 1 };
  it.each<[string, Partial<PosOrder>]>([
    ['B9 mismatch without a bridge', { warnings: [mismatch] }],
    ['B10 malformed bridge', { warnings: [{ ...bridged, serverMinor: 1198 }] }],
    ['B11 bridge plus insufficient stock', { warnings: [bridged, { code: 'insufficient_stock', variantId: 'blue', quantity: 1 }] }],
    ['B12 bridge plus tax rate mismatch', { warnings: [bridged, { code: 'tax_rate_mismatch', ratePpm: 55000, expectedMinor: 120, serverMinor: 100 }] }],
    ['B13 bridge on a rejected sale', { syncStatus: 'rejected', warnings: [bridged] }],
  ])('%s remains listed', (_name, overrides) => {
    const order: PosOrder = { ...sale(), syncStatus: 'applied', ...overrides };
    expect(needsAttention([order])).toEqual([order]);
  });
});

describe('ADR-048 tolerance with discounts as taxed rows', () => {
  const base = sale();
  const mismatch = (bridgeMinor: number) => ({ code: 'total_mismatch' as const, expectedMinor: 1200, serverMinor: 1200 - bridgeMinor, bridgeMinor });
  const warned = (discounts: number[], bridge: number, extra: Partial<PosOrder> = {}): PosOrder => ({
    ...base, syncStatus: 'applied', warnings: [mismatch(bridge)],
    lines: discounts.map((discountMinor, index) => ({ ...base.lines[0], id: `line-${index}`, discountMinor })), ...extra,
  });
  const carried = (...shares: number[]): PosOrder['coupons'] => [{ code: 'c', couponId: '1', discountMinor: 0, discountTaxMinor: 0, carried: true,
    lines: shares.map((discountMinor, index) => ({ lineId: `line-${index}`, discountMinor, discountTaxMinor: 0 })) }];
  const charges = { fees: [{} as NonNullable<PosOrder['fees']>[number]], shipping: [{} as NonNullable<PosOrder['shipping']>[number]] };
  const six = [5, 5, 5, 5, 5, 5];
  const cases: [string, PosOrder, boolean | undefined, boolean][] = [
    ['V1 absent flag', warned([5, 5], 2), undefined, true],
    ['V2 at T', warned([5, 5], 2), true, false],
    ['V3 above T', warned([5, 5], 3), true, true],
    ['V4 false flag', warned([5, 5], 2), false, true],
    ['V5 no discounted lines', warned([0, 0], 2), true, true],
    ['V6 three discounts at T', warned([5, 5, 5], 3), true, false],
    ['V6 three discounts above T', warned([5, 5, 5], 4), true, true],
    ['V7 six discounts at T', warned(six, 6), true, false],
    ['V7 six discounts above T', warned(six, 7), true, true],
    ['V8 fee and shipping at T', warned([5, 0, 0], 3, charges), true, false],
    ['V8 fee and shipping above T', warned([5, 0, 0], 4, charges), true, true],
    ['V9 carried share at T', warned([0, 0], 2, { coupons: carried(3, 0) }), true, false],
    ['V9 carried share above T', warned([0, 0], 3, { coupons: carried(3, 0) }), true, true],
    ['V10 one line counted once at T', warned([5], 1, { coupons: carried(2) }), true, false],
    ['V10 one line counted once above T', warned([5], 2, { coupons: carried(2) }), true, true],
    ['V11 tax mismatch remains listed', warned([5, 5], 1, { warnings: [mismatch(1), { code: 'tax_rate_mismatch', ratePpm: 55000, expectedMinor: 120, serverMinor: 100 }] }), true, true],
    ['V12 rejected remains listed', warned([5, 5], 1, { syncStatus: 'rejected' }), true, true],
  ];
  it.each(cases)('%s', (_name, order, flag, listed) => {
    const result = flag === undefined ? needsAttention([order]) : needsAttention([order], { discountsAreTaxedRows: flag });
    expect(result).toEqual(listed ? [order] : []);
  });

  it('V13 unchanged without the flag', () => {
    const orders = cases.map(([, order]) => order);
    const baseline = needsAttention(orders);
    expect(baseline).toContain(orders[0]);
    expect(needsAttention(orders, {})).toEqual(baseline);
    expect(needsAttention(orders, { discountsAreTaxedRows: false })).toEqual(baseline);
  });

  it('V14 a discount the payload nets to zero is not a taxed row', () => {
    const builder = createOrderBuilder({ currency: 'EUR', taxContext: { pricesIncludeTax: true, getTaxRatePpm: () => 2_000_000 } });
    for (const productId of ['shirt', 'mug']) {
      const lineId = builder.addLine({ productId, name: productId, unitPrice: { amount: 600, currency: 'EUR' } });
      builder.applyLineDiscount(lineId, { type: 'fixed', value: 1 });
    }
    builder.addPayment({ method: 'cash', amountMinor: builder.getSnapshot().totalMinor });
    const order: PosOrder = { ...finalizeOrder(builder.getSnapshot(), { capabilities: { orderCreate: 4 } }), syncStatus: 'applied', warnings: [mismatch(2)] };
    expect(order.lines.map((line) => line.discountMinor)).toEqual([1, 1]);
    expect(needsAttention([order], { discountsAreTaxedRows: true })).toEqual([order]);
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
