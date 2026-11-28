import { describe, expectTypeOf, it } from 'vitest';
import type { ProductEditBasis, ProductEditChange, ProductEditField, ProductEditResult } from '@tallyui/core';

describe('Product edit types', () => {
  it('requires a basis only for price changes', () => {
    type KeysByField = { [Field in ProductEditField]: keyof Extract<ProductEditChange, { field: Field }> };
    type ValueKeys = 'field' | 'from' | 'to';
    expectTypeOf<KeysByField>().toEqualTypeOf<{
      basePrice: ValueKeys | 'basis'; salePrice: ValueKeys | 'basis'; stockOnHand: ValueKeys; manageStock: ValueKeys;
    }>();
    expectTypeOf<Extract<ProductEditChange, { field: 'basePrice' | 'salePrice' }>>().toExtend<{ basis: ProductEditBasis }>();
    expectTypeOf<keyof ProductEditBasis>().toEqualTypeOf<'currency' | 'taxInclusive'>();
  });

  it('names the four possible results', () => {
    expectTypeOf<ProductEditResult['status']>().toEqualTypeOf<'saved' | 'already' | 'conflict' | 'refused'>();
  });
});
