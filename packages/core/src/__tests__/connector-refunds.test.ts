import { describe, expect, expectTypeOf, it } from 'vitest';
import type { SyncContext, TallyConnector } from '../types/connector';
import { StoreRefundsUnsupportedError, type ListRefundsQuery, type StoreRefundPage } from '../index';

describe('TallyConnector dated refunds (ADR-081 decision 7)', () => {
  it('C1 makes listRefunds optional and types it', () => {
    type ListRefunds = (context: SyncContext, query?: ListRefundsQuery) => Promise<StoreRefundPage>;
    expectTypeOf<Omit<TallyConnector, 'listRefunds'>>().toExtend<TallyConnector>();
    expectTypeOf<Omit<TallyConnector, 'listRefunds'> & { listRefunds: ListRefunds }>().toExtend<TallyConnector>();
    expectTypeOf<TallyConnector['listRefunds']>().toEqualTypeOf<ListRefunds | undefined>();

    const query = {
      page: 2, perPage: 25, orderId: '137',
      dateRange: { after: '2026-11-01T00:00:00.000Z', before: '2026-11-02T00:00:00.000Z' },
    } satisfies Required<ListRefundsQuery>;
    expectTypeOf(query).toExtend<ListRefundsQuery>();
    const page = {
      refunds: [{ id: '22', orderId: '19', refundedAt: '2026-11-24T18:32:36.000Z', currency: 'USD', amountMinor: 440, reason: 'Damaged' }],
      orphans: [{ id: '24', orderId: '21', refundedAt: '2026-11-24T18:32:45.000Z' }],
      hasMore: false, unreadable: 1, total: 3,
    } satisfies Required<StoreRefundPage>;
    expectTypeOf(page).toExtend<StoreRefundPage>();
  });

  it('C2 exports StoreRefundsUnsupportedError from the package index', () => {
    const error = new StoreRefundsUnsupportedError('x');
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('StoreRefundsUnsupportedError');
    expect(error.code).toBe('store_refunds_unsupported');
    expect(error.message).toBe('x');
  });
});
