import { describe, expectTypeOf, it } from 'vitest';
import type { Customer, CustomerAddress, CustomerInput, CustomerPage, CustomerPatch, CustomerTaxId, SyncContext, TallyConnector } from '@tallyui/core';

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

describe('TallyConnector.searchCustomersPage', () => {
  it('is optional, takes a 1-based page and resolves a CustomerPage', () => {
    expectTypeOf<Pick<TallyConnector, 'searchCustomersPage'>>().toEqualTypeOf<{
      searchCustomersPage?: (context: SyncContext, query: string, options?: { limit?: number; page?: number }) => Promise<CustomerPage>;
    }>();
  });

  it('a page may carry no total', () => {
    expectTypeOf<CustomerPage['total']>().toEqualTypeOf<number | undefined>();
  });
});

describe('Customer.createdAt', () => {
  it('is an optional string the till never sends', () => {
    expectTypeOf<Customer['createdAt']>().toEqualTypeOf<string | undefined>();
    expectTypeOf<CustomerInput>().not.toHaveProperty('createdAt');
  });
});

describe('CustomerTaxId', () => {
  it('requires type and value', () => {
    // @ts-expect-error: value is required
    const missing: CustomerTaxId = { type: 'eu_vat' };
    expectTypeOf(missing).not.toBeNever();
  });
});
