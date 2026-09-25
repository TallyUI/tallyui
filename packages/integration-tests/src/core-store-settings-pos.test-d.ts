import { describe, expectTypeOf, it } from 'vitest';
import type { StoreSettings } from '@tallyui/core';
import type { TaxRateMap } from '@tallyui/pos';

// core has no declared dependency on pos (pos depends on core, not the
// reverse); this type-only cross-layer check lives here, split out of
// packages/core/src/types/store-settings.test-d.ts.
describe('StoreSettings types', () => {
  it('taxRatesPpm is assignable to @tallyui/pos TaxRateMap', () => {
    expectTypeOf<StoreSettings['taxRatesPpm']>().toMatchTypeOf<TaxRateMap>();
    expectTypeOf<TaxRateMap>().toMatchTypeOf<StoreSettings['taxRatesPpm']>();
  });
});
