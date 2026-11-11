import { describe, expect, it } from 'vitest';
import { assertOrderDateRange } from '@tallyui/core';
import { orderFiltersQuery } from './order-filters-query';

describe('orderFiltersQuery', () => {
  it('copies set fields and leaves unset fields absent', () => {
    const query = orderFiltersQuery({ status: 'completed', cashierId: '7', createdVia: 'woocommerce-pos', storeId: undefined }, 'UTC');
    expect(query).toStrictEqual({ status: 'completed', cashierId: '7', createdVia: 'woocommerce-pos' });
    expect(Object.keys(query)).not.toContain('storeId');
    expect(orderFiltersQuery({
      status: 's', customerId: '0', cashierId: 'c', registerId: 'r', paymentMethod: 'pos_cash', storeId: '2', createdVia: 'v',
    }, 'UTC')).toStrictEqual({
      status: 's', customerId: '0', cashierId: 'c', registerId: 'r', paymentMethod: 'pos_cash', storeId: '2', createdVia: 'v',
    });
    expect(orderFiltersQuery({}, 'UTC')).toStrictEqual({});
  });

  it('turns one Sydney store day into the instants it starts and the next day starts', () => {
    expect(orderFiltersQuery({ dateRange: { from: '2026-11-11', to: '2026-11-11' } }, 'Australia/Sydney').dateRange)
      .toStrictEqual({ after: '2026-11-10T13:00:00.000Z', before: '2026-11-11T13:00:00.000Z' });
  });

  it('uses each end its own offset across the Sydney DST change on 2026-10-04', () => {
    // AEST (+10) on 3 October; AEDT (+11) from 02:00 on 4 October.
    expect(orderFiltersQuery({ dateRange: { from: '2026-10-03', to: '2026-10-04' } }, 'Australia/Sydney').dateRange)
      .toStrictEqual({ after: '2026-10-02T14:00:00.000Z', before: '2026-10-04T13:00:00.000Z' });
    expect(orderFiltersQuery({ dateRange: { from: '2026-10-04', to: '2026-10-04' } }, 'Australia/Sydney').dateRange)
      .toStrictEqual({ after: '2026-10-03T14:00:00.000Z', before: '2026-10-04T13:00:00.000Z' });
  });

  it('gives midnight Z in UTC, across a month end', () => {
    expect(orderFiltersQuery({ dateRange: { from: '2026-10-28', to: '2026-10-31' } }, 'UTC').dateRange)
      .toStrictEqual({ after: '2026-10-28T00:00:00.000Z', before: '2026-11-01T00:00:00.000Z' });
  });

  it('gives a range that passes assertOrderDateRange', () => {
    for (const timezone of ['UTC', 'Australia/Sydney', 'America/New_York', 'device']) {
      const { dateRange } = orderFiltersQuery({ dateRange: { from: '2026-03-01', to: '2026-11-11' } }, timezone);
      expect(() => assertOrderDateRange(dateRange)).not.toThrow();
      expect(dateRange?.after).toMatch(/\.000Z$/);
      expect(dateRange?.before).toMatch(/\.000Z$/);
    }
  });
});
