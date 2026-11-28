import { describe, expect, it } from 'vitest';
import { decideProductEdit, type ProductEditChange, type ProductEditSnapshot } from './product-edit';

const price = { currency: 'EUR', taxInclusive: true };
const cases: {
  change: ProductEditChange; before: ProductEditSnapshot; after: ProductEditSnapshot; other: ProductEditSnapshot;
  invalid: readonly unknown[];
}[] = [
  { change: { field: 'basePrice', from: 125, to: 0 }, before: { basePrice: { ...price, amount: 125 } },
    after: { basePrice: { ...price, amount: 0 } }, other: { basePrice: { ...price, amount: 100 } },
    invalid: [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, null] },
  { change: { field: 'salePrice', from: 50, to: null }, before: { salePrice: { ...price, amount: 50 } },
    after: { salePrice: { ...price, amount: null } }, other: { salePrice: { ...price, amount: 75 } },
    invalid: [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] },
  { change: { field: 'stockOnHand', from: null, to: -2 }, before: { stockOnHand: { quantity: null } },
    after: { stockOnHand: { quantity: -2 } }, other: { stockOnHand: { quantity: 0 } },
    invalid: [1.5, Number.MAX_SAFE_INTEGER + 1, null] },
  { change: { field: 'manageStock', from: 'inherit', to: 'on' }, before: { manageStock: { value: 'inherit' } },
    after: { manageStock: { value: 'on' } }, other: { manageStock: { value: 'off' } }, invalid: ['inherit'] },
];

describe.each(cases)('decideProductEdit: $change.field', ({ change, before, after, other, invalid }) => {
  it.each(invalid)('refuses invalid to (%s), even before a missing target', (to) => {
    const invalidChange = { ...change, to } as ProductEditChange;
    expect(decideProductEdit(invalidChange, before)).toEqual({ status: 'refused', code: 'invalid' });
    expect(decideProductEdit(invalidChange, null)).toEqual({ status: 'refused', code: 'invalid' });
  });

  it('refuses a missing target', () => {
    expect(decideProductEdit(change, null)).toEqual({ status: 'refused', code: 'not_found' });
  });

  it('returns a conflict when the field is missing', () => {
    expect(decideProductEdit(change, {})).toEqual({ status: 'conflict', snapshot: {} });
  });

  it('returns already when the store holds to', () => {
    expect(decideProductEdit(change, after)).toEqual({ status: 'already', snapshot: after });
  });

  it('returns already before write when from equals to', () => {
    const unchanged = { ...change, from: change.to } as ProductEditChange;
    expect(decideProductEdit(unchanged, after)).toEqual({ status: 'already', snapshot: after });
  });

  it('writes when the store still holds from', () => {
    expect(decideProductEdit(change, before)).toEqual({ action: 'write' });
  });

  it('returns a conflict with the fresh snapshot when the store holds neither value', () => {
    expect(decideProductEdit(change, other)).toEqual({ status: 'conflict', snapshot: other });
  });
});
