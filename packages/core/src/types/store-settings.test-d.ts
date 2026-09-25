import { describe, expectTypeOf, it } from 'vitest';
import type { StoreSettings, StoreSettingsChoice, StoreSettingsChoices, StoreSettingsErrorCode } from '@tallyui/core';
import { StoreSettingsError } from '@tallyui/core';

// The `taxRatesPpm` / @tallyui/pos `TaxRateMap` cross-layer check lives in
// @tallyui/integration-tests (core-store-settings-pos.test-d.ts), since core
// has no declared dependency on pos.
describe('StoreSettings types', () => {
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
