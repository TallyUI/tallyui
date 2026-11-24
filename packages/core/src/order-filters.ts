import type { ListOrdersQuery, OrderFilterField } from './types/orders';

/** Every ListOrdersQuery filter field, in the order refusals name them. */
export const ORDER_FILTER_FIELDS: readonly OrderFilterField[] = [
  'status', 'customerId', 'cashierId', 'registerId', 'paymentMethod', 'storeId', 'createdVia', 'dateRange', 'modifiedAfter',
];

/** listOrders was asked to filter by fields the connector does not support (`TallyConnector.orderFilters`). */
export class UnsupportedOrderFilterError extends Error {
  readonly code = 'unsupported_order_filter';
  readonly fields: OrderFilterField[];
  constructor(fields: OrderFilterField[]) {
    super(`listOrders does not support: ${fields.join(', ')}`);
    this.name = 'UnsupportedOrderFilterError';
    this.fields = fields;
  }
}

/** The filter fields a query sets (a field counts when its value is not undefined; dateRange counts when after or before is set). */
export function orderFilterFields(query: ListOrdersQuery | undefined): OrderFilterField[] {
  if (!query) return [];
  return ORDER_FILTER_FIELDS.filter((field) => {
    if (field === 'dateRange') return query.dateRange?.after !== undefined || query.dateRange?.before !== undefined;
    return query[field] !== undefined;
  });
}

/**
 * Throws UnsupportedOrderFilterError naming every set field not in `supported`, in OrderFilterField order. A connector
 * calls this first in listOrders. An empty string is a set value, so it is refused too. When `dateRange` is set and
 * supported, it is checked with `assertOrderDateRange`; a set and supported `modifiedAfter` must be a UTC instant
 * ending in Z, as a `dateRange` end must.
 */
export function assertOrderFiltersSupported(query: ListOrdersQuery | undefined, supported: readonly OrderFilterField[] | undefined): void {
  const set = orderFilterFields(query);
  const missing = set.filter((field) => !supported?.includes(field));
  if (missing.length > 0) throw new UnsupportedOrderFilterError(missing);
  if (set.includes('dateRange')) assertOrderDateRange(query?.dateRange);
  if (set.includes('modifiedAfter')) instantMs('modifiedAfter', query?.modifiedAfter);
}

const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?Z$/;

function instantMs(label: 'dateRange.after' | 'dateRange.before' | 'modifiedAfter', value: unknown): number {
  const ms = typeof value === 'string' && UTC_INSTANT.test(value) ? Date.parse(value) : Number.NaN;
  if (Number.isNaN(ms)) throw new TypeError(`${label} must be an ISO 8601 UTC instant ending in Z: ${String(value)}`);
  return ms;
}

/**
 * Throws a TypeError for a dateRange end that is not an ISO UTC instant ending in Z, or after > before. `after` equal
 * to `before` passes: an empty range is the caller's business.
 */
export function assertOrderDateRange(range: ListOrdersQuery['dateRange']): void {
  const after = range?.after === undefined ? undefined : instantMs('dateRange.after', range.after);
  const before = range?.before === undefined ? undefined : instantMs('dateRange.before', range.before);
  if (after !== undefined && before !== undefined && after > before) {
    throw new TypeError(`dateRange.after (${range?.after}) is later than dateRange.before (${range?.before})`);
  }
}
