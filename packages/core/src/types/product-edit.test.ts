import { describe, expect, it } from 'vitest';
import { decideProductEdit, type ProductEditChange, type ProductEditSnapshot } from './product-edit';

const price = { currency: 'EUR', taxInclusive: true };
const cases: {
  change: ProductEditChange; before: ProductEditSnapshot; after: ProductEditSnapshot; other: ProductEditSnapshot;
  invalid: readonly unknown[];
}[] = [
  { change: { field: 'basePrice', from: 125, to: 0, basis: price }, before: { basePrice: { ...price, amount: 125 } },
    after: { basePrice: { ...price, amount: 0 } }, other: { basePrice: { ...price, amount: 100 } },
    invalid: [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, null] },
  { change: { field: 'salePrice', from: 50, to: null, basis: price }, before: { salePrice: { ...price, amount: 50 } },
    after: { salePrice: { ...price, amount: null } }, other: { salePrice: { ...price, amount: 75 } },
    invalid: [-1, 1.5, Number.MAX_SAFE_INTEGER + 1] },
  { change: { field: 'stockOnHand', from: null, to: -2, locationId: null }, before: { stockOnHand: { quantity: null } },
    after: { stockOnHand: { quantity: -2 } }, other: { stockOnHand: { quantity: 0 } },
    invalid: [1.5, Number.MAX_SAFE_INTEGER + 1, null] },
  { change: { field: 'manageStock', from: 'inherit', to: 'on' }, before: { manageStock: { value: 'inherit' } },
    after: { manageStock: { value: 'on' } }, other: { manageStock: { value: 'off' } }, invalid: ['inherit'] },
];

describe.each(cases)('decideProductEdit: $change.field', ({ change, before, after, other, invalid }) => {
  if (change.field === 'basePrice' || change.field === 'salePrice') {
    const basis = { currency: 'USD', taxInclusive: false };
    it.each([
      { ...basis, taxInclusive: true, amount: change.from },
      { ...basis, currency: 'EUR', amount: change.from },
      { ...basis, taxInclusive: true, amount: change.to },
    ])('conflicts with a fresh price on another basis: %o', freshPrice => {
      const fresh = { [change.field]: freshPrice };
      expect(decideProductEdit({ ...change, basis }, fresh)).toEqual({ status: 'conflict', snapshot: fresh });
    });

    it.each([undefined, { ...basis, currency: 1 }, { ...basis, taxInclusive: 0 }])('refuses invalid basis %o before a missing target', invalidBasis => {
      const invalidChange = { ...change, basis: invalidBasis } as unknown as ProductEditChange;
      expect(decideProductEdit(invalidChange, null)).toEqual({ status: 'refused', code: 'invalid' });
    });
  }

  if (change.field === 'stockOnHand') {
    const location = { id: 'loc_a', name: 'Shop' };
    it('writes a count at the location it was opened on', () => {
      expect(decideProductEdit({ ...change, locationId: location.id }, { stockOnHand: { quantity: change.from, location } })).toEqual({ action: 'write' });
    });

    it.each([
      { locationId: 'loc_a', id: 'loc_b', quantity: change.from }, { locationId: 'loc_a', id: 'loc_b', quantity: change.to },
      { locationId: null, id: 'loc_a', quantity: change.from }, { locationId: 'loc_a', id: null, quantity: change.from },
    ])('conflicts when the location changes: %o', ({ locationId, id, quantity }) => {
      const fresh = { stockOnHand: { quantity, ...(id === null ? {} : { location: { id, name: 'Shop' } }) } };
      expect(decideProductEdit({ ...change, locationId }, fresh)).toEqual({ status: 'conflict', snapshot: fresh });
    });

    it.each([{}, { locationId: undefined }, { locationId: 1 }])('refuses invalid location %o before a missing target', invalidLocation => {
      const { field, from, to } = change;
      const invalidChange = { field, from, to, ...invalidLocation } as unknown as ProductEditChange;
      expect(decideProductEdit(invalidChange, null)).toEqual({ status: 'refused', code: 'invalid' });
    });
  }

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
