import { describe, expect, it } from 'vitest';
import {
  ORDER_FILTER_FIELDS, UnsupportedOrderFilterError, assertOrderDateRange, assertOrderFiltersSupported, orderFilterFields,
  type ListOrdersQuery, type OrderFilterField,
} from '../index';

const EVERY_FIELD: ListOrdersQuery = {
  status: 'completed', customerId: '0', cashierId: '3', registerId: 'reg-1', paymentMethod: 'pos_cash', storeId: '2',
  createdVia: 'woocommerce-pos', dateRange: { after: '2026-11-01T00:00:00.000Z', before: '2026-11-02T00:00:00.000Z' },
};

const ONE_FIELD: Record<OrderFilterField, ListOrdersQuery> = {
  status: { status: 'completed' },
  customerId: { customerId: '0' },
  cashierId: { cashierId: '3' },
  registerId: { registerId: 'reg-1' },
  paymentMethod: { paymentMethod: 'pos_cash' },
  storeId: { storeId: '2' },
  createdVia: { createdVia: 'checkout' },
  dateRange: { dateRange: { before: '2026-11-02T00:00:00Z' } },
};

function refusal(run: () => void): UnsupportedOrderFilterError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(UnsupportedOrderFilterError);
    return error as UnsupportedOrderFilterError;
  }
  throw new Error('expected UnsupportedOrderFilterError');
}

describe('ORDER_FILTER_FIELDS', () => {
  it('lists the eight fields in order', () => {
    expect(ORDER_FILTER_FIELDS).toEqual([
      'status', 'customerId', 'cashierId', 'registerId', 'paymentMethod', 'storeId', 'createdVia', 'dateRange',
    ]);
  });
});

describe('orderFilterFields', () => {
  it('finds no filter in an absent, empty or paging-only query', () => {
    expect(orderFilterFields(undefined)).toEqual([]);
    expect(orderFilterFields({})).toEqual([]);
    expect(orderFilterFields({ page: 2, search: 'x' })).toEqual([]);
  });

  it.each(ORDER_FILTER_FIELDS)('detects %s alone', (field) => {
    expect(orderFilterFields(ONE_FIELD[field])).toEqual([field]);
  });

  it('counts dateRange only when an end is set', () => {
    expect(orderFilterFields({ dateRange: {} })).toEqual([]);
    expect(orderFilterFields({ dateRange: { after: '2026-11-01T00:00:00Z' } })).toEqual(['dateRange']);
  });

  it('lists every set field in OrderFilterField order', () => {
    expect(orderFilterFields(EVERY_FIELD)).toEqual([...ORDER_FILTER_FIELDS]);
  });
});

describe('assertOrderFiltersSupported', () => {
  it('passes when every set field is supported', () => {
    expect(() => assertOrderFiltersSupported(EVERY_FIELD, ORDER_FILTER_FIELDS)).not.toThrow();
  });

  it('names exactly the unsupported fields, in OrderFilterField order', () => {
    const error = refusal(() => assertOrderFiltersSupported(EVERY_FIELD, ['dateRange', 'status', 'customerId', 'storeId']));
    expect(error.fields).toEqual(['cashierId', 'registerId', 'paymentMethod', 'createdVia']);
    expect(refusal(() => assertOrderFiltersSupported({ customerId: '1', status: 'x' }, [])).fields).toEqual(['status', 'customerId']);
  });

  it('refuses any filter when supported is undefined, but passes a plain page query', () => {
    expect(() => assertOrderFiltersSupported({ page: 2, perPage: 25, search: 'x' }, undefined)).not.toThrow();
    expect(() => assertOrderFiltersSupported(undefined, undefined)).not.toThrow();
    expect(refusal(() => assertOrderFiltersSupported({ status: 'completed' }, undefined)).fields).toEqual(['status']);
    expect(refusal(() => assertOrderFiltersSupported({ storeId: '2' }, [])).fields).toEqual(['storeId']);
  });

  it('refuses an empty string as a set value', () => {
    expect(refusal(() => assertOrderFiltersSupported({ status: '' }, ['customerId'])).fields).toEqual(['status']);
  });

  it('checks a supported dateRange', () => {
    expect(() => assertOrderFiltersSupported({ dateRange: { after: '2026-11-01T00:00:00' } }, ['dateRange'])).toThrow(TypeError);
  });
});

describe('assertOrderDateRange', () => {
  it('passes UTC instants ending in Z, either end alone, and after equal to before', () => {
    expect(() => assertOrderDateRange({ after: '2026-11-01T00:00:00.000Z' })).not.toThrow();
    expect(() => assertOrderDateRange({ before: '2026-11-02T00:00:00Z' })).not.toThrow();
    expect(() => assertOrderDateRange({ after: '2026-11-01T00:00:00Z', before: '2026-11-01T00:00:00.000Z' })).not.toThrow();
    expect(() => assertOrderDateRange(undefined)).not.toThrow();
  });

  it.each([
    ['a missing Z', { after: '2026-11-01T00:00:00' }],
    ['a date-only string', { before: '2026-11-01' }],
    ['an unparseable value', { after: '2026-13-45T99:00:00Z' }],
    ['a non-date string', { before: 'yesterday' }],
    ['a +10:00 offset', { after: '2026-11-01T00:00:00+10:00' }],
    ['a lowercase z', { after: '2026-11-01T00:00:00z' }],
  ])('throws a TypeError for %s', (_label, range) => {
    expect(() => assertOrderDateRange(range)).toThrow(TypeError);
  });

  it('throws a TypeError when after is later than before', () => {
    expect(() => assertOrderDateRange({ after: '2026-11-02T00:00:00Z', before: '2026-11-01T23:59:59.999Z' })).toThrow(TypeError);
  });
});

describe('UnsupportedOrderFilterError', () => {
  it('carries its code, fields, name and a message naming the fields', () => {
    const error = refusal(() => assertOrderFiltersSupported({ cashierId: '3', registerId: 'reg-1' }, ['status']));
    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('unsupported_order_filter');
    expect(error.fields).toEqual(['cashierId', 'registerId']);
    expect(error.name).toBe('UnsupportedOrderFilterError');
    expect(error.message).toBe('listOrders does not support: cashierId, registerId');
  });
});
