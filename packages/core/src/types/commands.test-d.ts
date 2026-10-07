import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnyCommandEnvelope,
  CommandBatchRequest,
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
  it('defaults batches to order envelopes and permits register envelopes explicitly', () => {
    expectTypeOf<CommandBatchRequest['commands']>().toEqualTypeOf<CommandEnvelope[]>();
    expectTypeOf<CommandBatchRequest<AnyCommandEnvelope>['commands']>().toEqualTypeOf<AnyCommandEnvelope[]>();
  });

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
    expectTypeOf<CommandWarning['code']>().toEqualTypeOf<'total_mismatch' | 'insufficient_stock' | 'tax_rate_mismatch' | 'customer_ignored' | 'figures_mismatch' | 'register_session_unknown'>();
  });

  it('pins bridgeMinor as optional on total_mismatch', () => {
    expectTypeOf<Extract<CommandWarning, { code: 'total_mismatch' }>['bridgeMinor']>().toEqualTypeOf<number | undefined>();
  });

  it('pins the envelope versions: 2 for a discounted order.create (ADR-062), 3 for one carrying ADR-065\'s figures, 4 with net discounts (#286), 6 with coupons (ADR-077)', () => {
    expectTypeOf<OrderCreateEnvelope['version']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6>();
    expectTypeOf<CommandEnvelope<OrderCreatePayload>['version']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6>();
    expectTypeOf<RegisterCommandEnvelope['version']>().toEqualTypeOf<number>();
    expectTypeOf<CommandEnvelope['version']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6>();
    expectTypeOf<OrderCreatePayload['discountMinor']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<OrderCreatePayload['sessionId']>().toEqualTypeOf<string | undefined>();
  });
});
