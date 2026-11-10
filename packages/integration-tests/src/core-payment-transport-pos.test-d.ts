import { describe, expectTypeOf, it } from 'vitest';
import type { PaymentTransport } from '@tallyui/core';
import type { PaymentTransport as PosPaymentTransport } from '@tallyui/pos';

// core has no declared dependency on pos (pos depends on core, not the
// reverse); this type-only cross-layer check lives here alongside
// core-store-settings-pos.test-d.ts.
describe('PaymentTransport types', () => {
  it('matches @tallyui/pos PaymentTransport', () => {
    expectTypeOf<PaymentTransport>().toEqualTypeOf<PosPaymentTransport>();
  });
});
