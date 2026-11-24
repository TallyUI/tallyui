import { describe, expect, it } from 'vitest';
import { assertOrderFiltersSupported } from '@tallyui/core';
import { salesRangeQuery } from './sales-range-query';

const after = '2026-11-05T00:00:00.000Z';
const before = '2026-11-06T00:00:00.000Z';

describe('salesRangeQuery', () => {
  it('widens the read with modifiedAfter when the connector lists it', () => {
    expect(salesRangeQuery({ after, before }, ['dateRange', 'modifiedAfter'])).toStrictEqual({ modifiedAfter: after, dateRange: { before } });
  });

  it.each([[['dateRange'] as const], [undefined]])('reads by creation date with %o', (orderFilters) => {
    expect(salesRangeQuery({ after, before }, orderFilters)).toStrictEqual({ dateRange: { after, before } });
  });

  it("gives a query the connector's own check passes", () => {
    const woo = ['status', 'dateRange', 'modifiedAfter'] as const;
    expect(() => assertOrderFiltersSupported(salesRangeQuery({ after, before }, woo), woo)).not.toThrow();
    expect(() => assertOrderFiltersSupported(salesRangeQuery({ after, before }, ['dateRange']), ['dateRange'])).not.toThrow();
  });
});
