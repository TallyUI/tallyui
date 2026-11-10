import { describe, expectTypeOf, it } from 'vitest';
import type { Customer, CustomerAddress, CustomerInput, CustomerPatch, CustomerTaxId, SyncContext, TallyConnector } from '@tallyui/core';

describe('TallyConnector.updateCustomer', () => {
  it('is optional, takes context, id and patch, and resolves a Customer', () => {
    expectTypeOf<Pick<TallyConnector, 'updateCustomer'>>().toEqualTypeOf<{
      updateCustomer?: (context: SyncContext, id: string, patch: CustomerPatch) => Promise<Customer>;
    }>();
  });

  it('a connector without updateCustomer still compiles', () => {
    const value: Pick<TallyConnector, 'searchCustomers' | 'createCustomer' | 'getCustomer' | 'updateCustomer'> = {};
    expectTypeOf(value.updateCustomer).toEqualTypeOf<((context: SyncContext, id: string, patch: CustomerPatch) => Promise<Customer>) | undefined>();
  });
});

describe('CustomerPatch', () => {
  it('is a partial of CustomerInput, so email is optional', () => {
    expectTypeOf<CustomerPatch>().toEqualTypeOf<Partial<CustomerInput>>();
    expectTypeOf<CustomerPatch['email']>().toEqualTypeOf<string | undefined>();
  });

  it('carries addresses and tax ids', () => {
    expectTypeOf<CustomerPatch['billing']>().toEqualTypeOf<CustomerAddress | undefined>();
    expectTypeOf<CustomerPatch['shipping']>().toEqualTypeOf<CustomerAddress | undefined>();
    expectTypeOf<CustomerPatch['taxIds']>().toEqualTypeOf<CustomerTaxId[] | undefined>();
  });
});

describe('Customer', () => {
  it('carries the same addresses and tax ids', () => {
    expectTypeOf<Customer['billing']>().toEqualTypeOf<CustomerAddress | undefined>();
    expectTypeOf<Customer['shipping']>().toEqualTypeOf<CustomerAddress | undefined>();
    expectTypeOf<Customer['taxIds']>().toEqualTypeOf<CustomerTaxId[] | undefined>();
  });
});

describe('CustomerTaxId', () => {
  it('requires type and value', () => {
    // @ts-expect-error: value is required
    const missing: CustomerTaxId = { type: 'eu_vat' };
    expectTypeOf(missing).not.toBeNever();
  });
});
