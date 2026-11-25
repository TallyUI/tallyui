import { describe, expectTypeOf, it } from 'vitest';
import type { RefusedOrderSettlement, SettleCancelRequest, SettleOutcome, SyncContext, TallyConnector } from '../types/connector';

describe('TallyConnector settleRefusedOrder types', () => {
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
});
