import type { OrderFilterField } from '@tallyui/core';
import type { StoreOrdersRangeQuery } from './use-store-orders-in-range';

/**
 * The read for a sales report over `[after, before)`: UTC instants with a `Z`, such as `orderFiltersQuery` gives for
 * store days. When the connector lists `modifiedAfter`, the read is widened to orders changed at or after `after` and
 * created before `before`, so an order created earlier and paid in the range is fetched. `reportOrderFromStoreOrder`
 * then places each order on its paid day, and the report's own range test drops one paid outside the range.
 * Otherwise the read is by creation date.
 */
export function salesRangeQuery(
  range: { after: string; before: string },
  orderFilters: readonly OrderFilterField[] | undefined,
): StoreOrdersRangeQuery {
  return orderFilters?.includes('modifiedAfter')
    ? { modifiedAfter: range.after, dateRange: { before: range.before } }
    : { dateRange: { after: range.after, before: range.before } };
}
