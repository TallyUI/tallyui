import { describe, expectTypeOf, it } from 'vitest';
import type { SyncContext, TallyConnector } from '../types/connector';

describe('TallyConnector emailReceipt types', () => {
  it('accepts a connector without emailReceipt', () => {
    expectTypeOf<Omit<TallyConnector, 'emailReceipt'>>().toExtend<TallyConnector>();
  });

  it('accepts a connector implementing emailReceipt', () => {
    const emailReceipt = async (
      _context: SyncContext,
      _orderId: string,
      _email: string,
      _options?: { saveToBilling?: boolean },
    ): Promise<void> => {};

    type ConnectorWithReceipt = Omit<TallyConnector, 'emailReceipt'> & { emailReceipt: typeof emailReceipt };
    expectTypeOf<ConnectorWithReceipt>().toExtend<TallyConnector>();
    expectTypeOf<TallyConnector['emailReceipt']>().toEqualTypeOf<typeof emailReceipt | undefined>();
  });

  it('allows undefined for emailReceipt', () => {
    expectTypeOf<undefined>().toExtend<TallyConnector['emailReceipt']>();
  });
});
