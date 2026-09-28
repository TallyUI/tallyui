import { describe, expectTypeOf, it } from 'vitest';
import type {
  CommandEnvelope,
  CommandType,
  CommandResult,
  CommandWarning,
  OrderCreateEnvelope,
  OrderCreatePayload,
  OrderCreatePayment,
  RegisterCommandEnvelope,
  RegisterCommandType,
} from '@tallyui/core';

describe('command types', () => {
  it('pins the order and register command types', () => {
    expectTypeOf<CommandType>().toEqualTypeOf<'order.create'>();
    expectTypeOf<RegisterCommandEnvelope['type']>().toEqualTypeOf<RegisterCommandType>();
  });

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
    expectTypeOf<RegisterCommandEnvelope['version']>().toEqualTypeOf<number>();
    expectTypeOf<CommandEnvelope['version']>().toEqualTypeOf<1 | 2 | 3>();
    expectTypeOf<OrderCreatePayload['discountMinor']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<OrderCreatePayload['sessionId']>().toEqualTypeOf<string | undefined>();
  });
});
