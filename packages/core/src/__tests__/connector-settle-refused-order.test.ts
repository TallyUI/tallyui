import { describe, expectTypeOf, it } from 'vitest';
import type { RefusedOrderSettlement, SettleCancelRequest, SettleOutcome, SettlePayment, SettlePayRequest, SettlePayResult, SyncContext, TallyConnector } from '../types/connector';
import type { PaymentMethodKind } from '../types/commands';
import type { SettleReverseLeg, SettleReverseRequest, SettleReverseResult } from '../index';

describe('TallyConnector settleRefusedOrder types', () => {
  it('names the reverse legs, request and result; reverse is optional', () => {
    type Reverse = (context: SyncContext, request: SettleReverseRequest) => Promise<SettleReverseResult>;
    expectTypeOf<RefusedOrderSettlement['reverse']>().toEqualTypeOf<Reverse | undefined>();
    expectTypeOf<SettleReverseRequest>().toExtend<SettleCancelRequest>();
    expectTypeOf<SettleReverseRequest['legs']>().toEqualTypeOf<readonly SettleReverseLeg[]>();
    expectTypeOf<SettleReverseLeg>().toEqualTypeOf<{ paymentId: string; commandId: string }>();
    expectTypeOf<SettleReverseResult>().toEqualTypeOf<{ outcome: SettleOutcome; voided: readonly string[] }>();
  });
  it('accepts a connector without settleRefusedOrder', () => {
    expectTypeOf<Omit<TallyConnector, 'settleRefusedOrder'>>().toExtend<TallyConnector>();
  });

  it('accepts a connector implementing settleRefusedOrder.cancel', () => {
    type Cancel = (context: SyncContext, request: SettleCancelRequest) => Promise<SettleOutcome>;
    type ConnectorWithSettle = Omit<TallyConnector, 'settleRefusedOrder'> & { settleRefusedOrder: { cancel: Cancel } };
    expectTypeOf<ConnectorWithSettle>().toExtend<TallyConnector>();
    expectTypeOf<TallyConnector['settleRefusedOrder']>().toEqualTypeOf<RefusedOrderSettlement | undefined>();
    expectTypeOf<RefusedOrderSettlement['cancel']>().toEqualTypeOf<Cancel | undefined>();
  });

  it('allows undefined for settleRefusedOrder and for its cancel', () => {
    expectTypeOf<undefined>().toExtend<TallyConnector['settleRefusedOrder']>();
    expectTypeOf<Record<string, never>>().toExtend<RefusedOrderSettlement>();
  });

  it('names the outcomes and their fields', () => {
    expectTypeOf<SettleOutcome['kind']>().toEqualTypeOf<'done' | 'changed' | 'refused' | 'gone' | 'retry'>();
    expectTypeOf<{ kind: 'changed'; status: string; capturedMinor: number }>().toExtend<SettleOutcome>();
    expectTypeOf<{ kind: 'changed'; status: string }>().not.toExtend<SettleOutcome>();
    expectTypeOf<SettleCancelRequest>().toEqualTypeOf<{ storeOrderId: string; clientOrderId: string; attemptId: string }>();
  });

  it('#1101 slice 3: names the pay request and result, and pay is optional', () => {
    type Pay = (context: SyncContext, request: SettlePayRequest) => Promise<SettlePayResult>;
    expectTypeOf<RefusedOrderSettlement['pay']>().toEqualTypeOf<Pay | undefined>();
    expectTypeOf<{ cancel: undefined; pay: Pay }>().toExtend<RefusedOrderSettlement>();
    expectTypeOf<SettlePayment>().toEqualTypeOf<{ id: string; method: PaymentMethodKind; amountMinor: number; tenderedMinor?: number }>();
    expectTypeOf<SettlePayRequest>().toExtend<SettleCancelRequest>();
    expectTypeOf<SettlePayRequest['currency']>().toEqualTypeOf<string>();
    expectTypeOf<SettlePayRequest['payments']>().toEqualTypeOf<readonly SettlePayment[]>();
    expectTypeOf<SettlePayResult>().toEqualTypeOf<{ outcome: SettleOutcome; recorded: readonly string[] }>();
  });
});
