import { expect, it } from 'vitest';
import { extrasNotSent } from './extras-delivery';
import type { PosOrder, PosOrderLine } from './types';

type Order = Pick<PosOrder, 'customer' | 'meta' | 'lines' | 'sentVersion' | 'downgradedFrom'>;
const line = (overrides: Partial<PosOrderLine> = {}): PosOrderLine => ({
  id: 'l1', productId: 'shirt', variantId: 'blue', name: 'Blue shirt', sku: 'BLUE-EDIT', quantity: 1,
  unitPriceMinor: 600, discountMinor: 0, netMinor: 600, taxLines: [], ...overrides,
});
const taxIds = { customer: { taxIds: [{ type: 'eu_vat', value: 'DE123456789' }] } };
const meta = { meta: [{ key: 'gift', value: 'yes' }] };
const sku = { lines: [line({ catalogueSku: 'BLUE' })] };
const all = { ...taxIds, ...meta, ...sku };
const order = (overrides: Partial<Order>): Order => ({ customer: null, lines: [line()], ...overrides });
const none = { taxIds: false, meta: false, skuLineIds: [] };

it.each<[string, Order, ReturnType<typeof extrasNotSent>]>([
  ['E1 tax ids at 11', order({ ...taxIds, sentVersion: 11 }), { taxIds: true, meta: false, skuLineIds: [] }],
  ['E1 tax ids at 11 downgraded from 12', order({ ...taxIds, sentVersion: 11, downgradedFrom: 12 }), { taxIds: true, meta: false, skuLineIds: [] }],
  ['E2 meta at 11', order({ ...meta, sentVersion: 11 }), { taxIds: false, meta: true, skuLineIds: [] }],
  ['E3 an edited catalogue SKU at 11', order({ ...sku, sentVersion: 11 }), { taxIds: false, meta: false, skuLineIds: ['l1'] }],
  ['E4 all three at 6', order({ ...all, sentVersion: 6 }), { taxIds: true, meta: true, skuLineIds: ['l1'] }],
  ['E5 all three at 12', order({ ...all, sentVersion: 12 }), none],
  ['E6 all three not sent yet', order({ ...all }), none],
  ['E7 a line edited back', order({ lines: [line({ sku: 'BLUE', catalogueSku: 'BLUE' })], sentVersion: 11 }), none],
  ['E7 a line with no catalogueSku', order({ lines: [line()], sentVersion: 11 }), none],
  ['E8 only _-keyed meta at 11', order({ meta: [{ key: '_internal', value: 'x' }], sentVersion: 11 }), none],
  ['E9 a custom line with custom.sku at 11', order({ lines: [line({ productId: 'custom', variantId: undefined,
    custom: { name: 'Gift wrap', sku: 'WRAP', taxStatus: 'taxable' }, sku: 'WRAP', catalogueSku: 'OTHER' })], sentVersion: 11 }), none],
])('%s', (_name, input, expected) => {
  expect(extrasNotSent(input)).toEqual(expected);
});
