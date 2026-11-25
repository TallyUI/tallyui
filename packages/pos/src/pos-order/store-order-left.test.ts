import { describe, expect, it } from 'vitest';
import { storeOrderLeft } from './store-order-left';
import type { PosOrder } from './types';

type Input = Parameters<typeof storeOrderLeft>[0];
const pay = (...amounts: number[]): PosOrder['payments'] => amounts.map((amountMinor, i) => ({ id: `p${i}`, method: 'cash', amountMinor }));
const refused = (data: Record<string, unknown> | undefined, extra: Partial<Input> = {}): Input => ({
  syncStatus: 'rejected', payments: pay(500, 500),
  error: { code: 'invalid_payload', message: 'WooCommerce order #115 was created but not paid: Conflict.', ...(data ? { data } : {}) }, ...extra,
});

describe('storeOrderLeft (#1101)', () => {
  it('names the store order by orderId when displayId is absent, with nothing recorded', () => {
    expect(storeOrderLeft(refused({ orderId: '115', storeCode: 'wcpos_command_conflict' })))
      .toEqual({ orderId: '115', reference: '115', recordedMinor: 0 });
  });

  it('names it by displayId when present', () => {
    expect(storeOrderLeft(refused({ orderId: '115', displayId: '1001' })))
      .toEqual({ orderId: '115', reference: '1001', recordedMinor: 0 });
    expect(storeOrderLeft(refused({ orderId: '115', displayId: '' }))?.reference).toBe('115');
    expect(storeOrderLeft(refused({ orderId: '115', displayId: 1001 }))?.reference).toBe('115');
  });

  it.each<[string, PosOrder['payments'], unknown, number]>([
    ['recorded 1 of 500 + 500', pay(500, 500), 1, 500],
    ['the first payment, not the last', pay(300, 700), 1, 300],
    ['recorded 2 of 2', pay(500, 500), 2, 1000],
    ['recorded 3 of 2', pay(500, 500), 3, 1000],
    ['a free sale, recorded absent', [], undefined, 0],
    ['recorded 0', pay(500, 500), 0, 0],
    ['recorded -1', pay(500, 500), -1, 0],
    ['recorded 1.5', pay(500, 500), 1.5, 0],
    ["recorded '1'", pay(500, 500), '1', 0],
    ['recorded NaN', pay(500, 500), Number.NaN, 0],
  ])('sums what was recorded: %s', (_name, payments, recorded, recordedMinor) => {
    expect(storeOrderLeft(refused({ orderId: '115', ...(recorded === undefined ? {} : { recorded }) }, { payments }))?.recordedMinor).toBe(recordedMinor);
  });

  it.each<[string, Input]>([
    ["orderId ''", refused({ orderId: '' })],
    ['orderId 115 (a number)', refused({ orderId: 115 })],
    ['orderId absent', refused({ storeCode: 'wcpos_command_conflict' })],
    ['data absent', refused(undefined)],
    ['error absent', { syncStatus: 'rejected', payments: pay(500) }],
    ['pending with stale data', refused({ orderId: '115', recorded: 1 }, { syncStatus: 'pending' })],
    ['applied with stale data', refused({ orderId: '115', recorded: 1 }, { syncStatus: 'applied' })],
    ['a reopened order (storeOrderId set)', refused({ orderId: '115' }, { storeOrderId: '115' })],
  ])('gives nothing for %s', (_name, order) => {
    expect(storeOrderLeft(order)).toBeUndefined();
  });
});
