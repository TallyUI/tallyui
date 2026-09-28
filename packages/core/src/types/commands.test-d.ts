import { describe, expectTypeOf, it } from 'vitest';
import type {
  CommandEnvelope,
  CommandResult,
  CommandWarning,
  OrderCreateEnvelope,
  OrderCreatePayload,
  OrderCreatePayment,
  RegisterSessionOpenPayload,
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

  it('pins the envelope versions: 2 for a discounted order.create (ADR-062), 3 for one carrying ADR-065\'s figures', () => {
    expectTypeOf<OrderCreateEnvelope['version']>().toEqualTypeOf<1 | 2 | 3>();
    expectTypeOf<CommandEnvelope<OrderCreatePayload>['version']>().toEqualTypeOf<1 | 2 | 3>();
    expectTypeOf<CommandEnvelope<RegisterSessionOpenPayload>['version']>().toEqualTypeOf<number>();
    expectTypeOf<CommandEnvelope['version']>().toEqualTypeOf<number>();
    expectTypeOf<OrderCreatePayload['discountMinor']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<OrderCreatePayload['sessionId']>().toEqualTypeOf<string | undefined>();
  });
});
