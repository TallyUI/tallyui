import { decideProductEdit, type ProductEditSnapshot } from '@tallyui/core';
import { describeProductEditConformance, type ProductEditHarness } from './conformance';

const reference: ProductEditHarness = {
  setup(field, initial) {
    let value: unknown = initial;
    let writes = 0;
    const price = { currency: 'EUR', taxInclusive: true };
    function snapshot(): ProductEditSnapshot {
      switch (field) {
        case 'basePrice': return { basePrice: { ...price, amount: value as number } };
        case 'salePrice': return { salePrice: { ...price, amount: value as number | null } };
        case 'stockOnHand': return { stockOnHand: { quantity: value as number | null } };
        case 'manageStock': return { manageStock: { value: value as 'on' | 'off' | 'inherit' } };
      }
    }
    return {
      edit: {
        async read() { return snapshot(); },
        async update(_context, _target, change) {
          const result = decideProductEdit(change, snapshot());
          if ('status' in result) return result;
          value = change.to;
          writes++;
          return { status: 'saved', snapshot: snapshot() };
        },
      },
      context: { connectorId: 'reference', baseUrl: 'https://reference.test', headers: {} },
      target: { productId: '1', variantId: '2' },
      stored: () => value,
      writes: () => writes,
      changeBehindTheTill(next) { value = next; },
    };
  },
};

describeProductEditConformance('reference', reference, [
  { field: 'basePrice', from: 150, to: 125, other: 100 },
  { field: 'salePrice', from: null, to: 90, other: 80 },
  { field: 'stockOnHand', from: null, to: -1, other: 12 },
  { field: 'manageStock', from: 'inherit', to: 'on', other: 'off' },
]);
