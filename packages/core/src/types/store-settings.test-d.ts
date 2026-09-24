import { describe, expectTypeOf, it } from 'vitest';
import type { StoreSettings, StoreSettingsChoice, StoreSettingsChoices, StoreSettingsErrorCode } from '@tallyui/core';
import { StoreSettingsError } from '@tallyui/core';
// @tallyui/core has no runtime or declared dependency on @tallyui/pos (pos depends on
// core, not the reverse); this type-only import resolves through the workspace's shared
// `@tallyui/pos` path alias (tsconfig paths / vitest.config.ts), so it is importable here.
import type { TaxRateMap } from '@tallyui/pos';

describe('StoreSettings types', () => {
  it('taxRatesPpm is assignable to @tallyui/pos TaxRateMap', () => {
    expectTypeOf<StoreSettings['taxRatesPpm']>().toMatchTypeOf<TaxRateMap>();
    expectTypeOf<TaxRateMap>().toMatchTypeOf<StoreSettings['taxRatesPpm']>();
  });

  it('pricingContext is optional and opaque', () => {
    expectTypeOf<StoreSettings['pricingContext']>().toEqualTypeOf<Record<string, string> | undefined>();
  });

  it('StoreSettingsChoice fields are all optional', () => {
    expectTypeOf<StoreSettingsChoice>().toEqualTypeOf<{ region?: string; country?: string; channel?: string }>();
  });
});

describe('StoreSettingsError', () => {
  it('carries code and choices', () => {
    expectTypeOf<StoreSettingsError['code']>().toEqualTypeOf<StoreSettingsErrorCode>();
    expectTypeOf<StoreSettingsError['choices']>().toEqualTypeOf<StoreSettingsChoices | undefined>();
    expectTypeOf(StoreSettingsError).instance.toHaveProperty('code');
    expectTypeOf(StoreSettingsError).instance.toHaveProperty('choices');
  });
});
