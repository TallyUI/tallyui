import { describe, expectTypeOf, it } from 'vitest';
import type { SyncContext, TallyConnector } from '../types/connector';
import type { ListOrdersQuery, StoreOrder, StoreOrderPage } from '../index';
import type { OrderFilterField } from '../index';

describe('TallyConnector order history types', () => {
  it('makes orderFilters optional and readonly', () => {
    expectTypeOf<Omit<TallyConnector, 'orderFilters'>>().toExtend<TallyConnector>();
    expectTypeOf<TallyConnector['orderFilters']>().toEqualTypeOf<readonly OrderFilterField[] | undefined>();
  });

  it('names exactly the eight order filter fields', () => {
    expectTypeOf<OrderFilterField>().toEqualTypeOf<
      'status' | 'customerId' | 'cashierId' | 'registerId' | 'paymentMethod' | 'storeId' | 'createdVia' | 'dateRange'
    >();
  });

  it('accepts every filter field on ListOrdersQuery', () => {
    const query = {
      page: 2, perPage: 25, search: 'x', status: 'completed', customerId: '0', cashierId: '3', registerId: 'reg-1',
      paymentMethod: 'pos_cash', storeId: '2', createdVia: 'woocommerce-pos',
      dateRange: { after: '2026-11-01T00:00:00.000Z', before: '2026-11-02T00:00:00.000Z' },
    } satisfies Required<ListOrdersQuery>;
    expectTypeOf(query).toExtend<ListOrdersQuery>();
    expectTypeOf<{ dateRange: { after: string } }>().toExtend<ListOrdersQuery>();
    expectTypeOf<{ dateRange: { before: string } }>().toExtend<ListOrdersQuery>();
  });

  it('accepts a connector without listOrders or getOrders', () => {
    expectTypeOf<Omit<TallyConnector, 'listOrders' | 'getOrders'>>().toExtend<TallyConnector>();
    expectTypeOf<undefined>().toExtend<TallyConnector['listOrders']>();
    expectTypeOf<undefined>().toExtend<TallyConnector['getOrders']>();
  });

  it('types listOrders and getOrders', () => {
    type ListOrders = (context: SyncContext, query?: ListOrdersQuery) => Promise<StoreOrderPage>;
    type GetOrders = (context: SyncContext, ids: readonly string[]) => Promise<StoreOrder[]>;

    type ConnectorWithOrders = Omit<TallyConnector, 'listOrders' | 'getOrders'> & {
      listOrders: ListOrders;
      getOrders: GetOrders;
    };
    expectTypeOf<ConnectorWithOrders>().toExtend<TallyConnector>();
    expectTypeOf<TallyConnector['listOrders']>().toEqualTypeOf<ListOrders | undefined>();
    expectTypeOf<TallyConnector['getOrders']>().toEqualTypeOf<GetOrders | undefined>();
  });

  it('exports the order types', () => {
    const order = {
      id: '136',
      reference: '136',
      clientOrderId: 'till-order',
      status: 'completed',
      placedAt: '2026-10-06T04:54:03.000Z',
      currency: 'USD',
      pricesIncludeTax: false,
      customer: null,
      lines: [
        {
          id: '20',
          clientLineId: 'till-line',
          productId: '80',
          variantId: '80',
          name: 'Espresso',
          sku: 'COF-ESP',
          quantity: 3,
          subtotalMinor: 900,
          subtotalTaxMinor: 97,
          totalMinor: 900,
          taxMinor: 97,
        },
      ],
      fees: [{ name: 'Loyalty', totalMinor: -100, taxMinor: 0 }],
      shipping: [{ name: 'Delivery', totalMinor: 400, taxMinor: 0 }],
      coupons: [{ code: 'save5', discountMinor: 500, discountTaxMinor: 0 }],
      taxLines: [{ label: 'CA State', code: 'US-CA-CA STATE-1', ratePpm: 72500, amountMinor: 65 }],
      discountMinor: 0,
      discountTaxMinor: 0,
      taxMinor: 116,
      totalMinor: 3291,
      payments: [{ method: 'pos_cash', title: 'Cash', kind: 'cash', amountMinor: 3291 }],
      refunds: [{ id: '140', amountMinor: 350, reason: 'Damaged' }],
    } satisfies StoreOrder;

    expectTypeOf(order).toExtend<StoreOrder>();
  });
});
