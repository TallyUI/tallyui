import { expect, it } from 'vitest';
import { replacedOrderIds } from './reopened';
import type { PosOrder } from './types';

it.each(['rejected', 'applied', 'pending'] as const)('only replaces a rejected predecessor (%s)', (syncStatus) => {
  const orders = [{ id: 'refused', syncStatus }, { id: 'successor', saleId: 'refused', syncStatus: 'pending' as const }];
  expect(replacedOrderIds(orders)).toEqual(new Set(syncStatus === 'rejected' ? ['refused'] : []));
});

it('does not treat an order as its own successor', () => {
  expect(replacedOrderIds([{ id: 'refused', saleId: 'refused', syncStatus: 'rejected' }])).toEqual(new Set());
});

it.each([undefined, '2026-10-13T12:00:00.000Z'])('requires a successor in the list, regardless of reopenedAt (%s)', (reopenedAt) => {
  const order: Pick<PosOrder, 'id' | 'saleId' | 'syncStatus' | 'reopenedAt'> = { id: 'refused', syncStatus: 'rejected', reopenedAt };
  expect(replacedOrderIds([order])).toEqual(new Set());
  expect(replacedOrderIds([order, { id: 'unrelated', saleId: 'other', syncStatus: 'applied' }])).toEqual(new Set());
});
