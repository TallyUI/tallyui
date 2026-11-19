import { describe, expectTypeOf, it } from 'vitest';
import type {
  AnyCommandEnvelope,
  CommandBatchRequest,
  CommandEnvelope,
  CommandType,
  CommandResult,
  CommandWarning,
  OrderAddress,
  OrderCreateCoupon,
  OrderCreateCouponLine,
  OrderCreateEnvelope,
  OrderCreatePayload,
  OrderCreatePayment,
  OrderRefundEnvelope,
  OrderReopenEnvelope,
  OrderUpdateEnvelope,
  OrderUpdatePayload,
  RegisterCommandEnvelope,
  RegisterCommandType,
} from '@tallyui/core';
import type { OrderCreateFee, OrderCreateShipping } from './commands';

describe('command types', () => {
  it('permits an OrderUpdateEnvelope in AnyCommandEnvelope (ADR-090)', () => {
    expectTypeOf<OrderUpdateEnvelope>().toExtend<AnyCommandEnvelope>();
    expectTypeOf<OrderUpdateEnvelope['type']>().toEqualTypeOf<'order.update'>();
    expectTypeOf<OrderUpdateEnvelope['version']>().toEqualTypeOf<1>();
    expectTypeOf<OrderUpdatePayload['createVersion']>().toEqualTypeOf<OrderCreateEnvelope['version']>();
    expectTypeOf<OrderUpdatePayload['lines'][number]['storeLineId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<OrderUpdatePayload['payments'][number]['paymentId']>().toEqualTypeOf<string | undefined>();
  });

  it('keeps required fee and shipping fields with optional store ids (ADR-090)', () => {
    expectTypeOf<NonNullable<OrderUpdatePayload['fees']>[number]>().toEqualTypeOf<OrderCreateFee & { storeLineId?: string }>();
    expectTypeOf<NonNullable<OrderUpdatePayload['shipping']>[number]>().toEqualTypeOf<OrderCreateShipping & { storeLineId?: string }>();
  });

  it('permits an OrderReopenEnvelope in AnyCommandEnvelope (ADR-090)', () => {
    expectTypeOf<OrderReopenEnvelope>().toExtend<AnyCommandEnvelope>();
  });

  it('permits an OrderRefundEnvelope in AnyCommandEnvelope (ADR-080)', () => {
    expectTypeOf<OrderRefundEnvelope>().toExtend<AnyCommandEnvelope>();
  });

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
    expectTypeOf<OrderCreatePayment['methodId']>().toEqualTypeOf<string | undefined>();
  });

  it('defines the warning codes', () => {
    expectTypeOf<CommandWarning['code']>().toEqualTypeOf<'total_mismatch' | 'insufficient_stock' | 'tax_rate_mismatch' | 'customer_ignored' | 'figures_mismatch' | 'register_session_unknown' | 'line_figures_mismatch'>();
  });

  it('pins bridgeMinor as optional on total_mismatch', () => {
    expectTypeOf<Extract<CommandWarning, { code: 'total_mismatch' }>['bridgeMinor']>().toEqualTypeOf<number | undefined>();
  });

  it('pins the envelope versions: 2 for a discounted order.create (ADR-062), 3 for one carrying ADR-065\'s figures, 4 with net discounts (#286), 6 with coupons (ADR-077), 7 with the sale\'s note (ADR-083), 8 with the tax address (#722), 9 with coupon lines (#790), 10 with payment method ids, 11 with untaxed customer addresses (ADR-086 d2 amended), 12 with tax ids, a line SKU and order meta (ADR-092)', () => {
    expectTypeOf<OrderCreateEnvelope['version']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>();
    expectTypeOf<CommandEnvelope<OrderCreatePayload>['version']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>();
    expectTypeOf<RegisterCommandEnvelope['version']>().toEqualTypeOf<number>();
    expectTypeOf<CommandEnvelope['version']>().toEqualTypeOf<1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12>();
    expectTypeOf<OrderCreateCoupon['lines']>().toEqualTypeOf<OrderCreateCouponLine[] | undefined>();
    expectTypeOf<OrderCreatePayload['discountMinor']>().toEqualTypeOf<number | undefined>();
    expectTypeOf<OrderCreatePayload['sessionId']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<OrderCreatePayload['note']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<OrderCreatePayload['taxAddress']>().toEqualTypeOf<'billing' | 'shipping' | undefined>();
    expectTypeOf<NonNullable<OrderCreatePayload['customer']>['billing']>().toEqualTypeOf<OrderAddress | undefined>();
  });
});
