import { describe, expectTypeOf, it } from 'vitest';
import type {
  CommandEnvelope,
  CommandResult,
  CommandWarning,
  OrderCreatePayload,
  OrderCreatePayment,
} from '@tallyui/core';

describe('command types', () => {
  it('preserves the envelope payload type', () => {
    expectTypeOf<CommandEnvelope<OrderCreatePayload>['payload']>().toEqualTypeOf<OrderCreatePayload>();
  });

  it('defines the result statuses', () => {
    expectTypeOf<CommandResult['status']>().toEqualTypeOf<'applied' | 'duplicate' | 'rejected'>();
  });

  it('defines the payment methods', () => {
    expectTypeOf<OrderCreatePayment['method']>().toEqualTypeOf<'cash' | 'external'>();
  });

  it('defines the warning codes', () => {
    expectTypeOf<CommandWarning['code']>().toEqualTypeOf<'total_mismatch' | 'insufficient_stock'>();
  });

  it('pins the envelope versions: 2 only for a discounted order.create (ADR-062)', () => {
    expectTypeOf<CommandEnvelope['version']>().toEqualTypeOf<1 | 2>();
    expectTypeOf<OrderCreatePayload['discountMinor']>().toEqualTypeOf<number | undefined>();
  });
});
