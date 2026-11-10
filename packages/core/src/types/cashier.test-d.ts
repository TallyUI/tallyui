import { describe, expectTypeOf, it } from 'vitest';
import type { Cashier, CashierPermission, SyncContext, TallyConnector } from '@tallyui/core';

describe('Cashier types', () => {
  it('makes the connector cashier optional', () => {
    expectTypeOf<TallyConnector['cashier']>().toEqualTypeOf<
      ((context: SyncContext) => Promise<Cashier | null>) | undefined
    >();
  });

  it('names the five permissions', () => {
    expectTypeOf<CashierPermission>().toEqualTypeOf<
      'viewReports' | 'manageClosures' | 'approveVariance' | 'refund' | 'discount'
    >();
  });

  it('shapes the cashier', () => {
    expectTypeOf<Cashier>().toEqualTypeOf<{ id: string; name: string; permissions: readonly CashierPermission[] }>();
  });

  it('a connector without cashier still compiles', () => {
    const value: Pick<TallyConnector, 'cashier'> = {};
    expectTypeOf(value.cashier).toEqualTypeOf<((context: SyncContext) => Promise<Cashier | null>) | undefined>();
  });
});
