import { describe, expectTypeOf, it } from 'vitest';
import type { ProductEditChange, ProductEditField, ProductEditResult } from '@tallyui/core';

describe('Product edit types', () => {
  it('limits each change to the field and its two values', () => {
    type KeysByField = { [Field in ProductEditField]: keyof Extract<ProductEditChange, { field: Field }> };
    expectTypeOf<KeysByField>().toEqualTypeOf<Record<ProductEditField, 'field' | 'from' | 'to'>>();
  });

  it('names the four possible results', () => {
    expectTypeOf<ProductEditResult['status']>().toEqualTypeOf<'saved' | 'already' | 'conflict' | 'refused'>();
  });
});
