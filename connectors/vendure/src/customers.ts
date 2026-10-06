import { ConnectorUnauthorizedError, CustomerServiceError, type Customer, type CustomerInput, type SyncContext } from '@tallyui/core';
import { gql } from './replication/products';

// The vendurepos plugin's walk-in customer is never a person to attach to a sale.
const WALK_IN_EMAIL = 'walk-in@vendurepos.local';

const SEARCH_QUERY = `query Search($q: String!, $take: Int!) {
  customers(options: {
    filter: { emailAddress: { contains: $q }, firstName: { contains: $q }, lastName: { contains: $q } },
    filterOperator: OR, take: $take, sort: { lastName: ASC }
  }) {
    totalItems
    items { id firstName lastName emailAddress phoneNumber }
  }
}`;
const CREATE_QUERY = `mutation Create($input: CreateCustomerInput!) {
  createCustomer(input: $input) {
    __typename
    ... on Customer { id firstName lastName emailAddress phoneNumber }
    ... on ErrorResult { errorCode message }
  }
}`;
const GET_QUERY = `query One($id: ID!) {
  customer(id: $id) { id firstName lastName emailAddress phoneNumber }
}`;

export function toVendureCustomer(raw: { id: string; firstName?: string | null; lastName?: string | null; emailAddress?: string | null; phoneNumber?: string | null }): Customer {
  const customer: Customer = { id: raw.id, name: raw.id };
  for (const [key, value] of [
    ['firstName', raw.firstName], ['lastName', raw.lastName],
    ['email', raw.emailAddress], ['phone', raw.phoneNumber],
  ] as const) {
    if (typeof value === 'string' && value.length > 0) customer[key] = value;
  }
  customer.name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email || customer.id;
  return customer;
}

export async function searchVendureCustomers(context: SyncContext, query: string, options?: { limit?: number }): Promise<Customer[]> {
  const q = query.trim();
  if (!q) return [];
  const take = Math.max(1, Math.min(50, options?.limit ?? 20));
  const body = await customerGql(context, SEARCH_QUERY, { q, take });
  const items = body?.data?.customers?.items;
  if (!Array.isArray(items)) throw new CustomerServiceError('server', 'unexpected response');
  return items.filter((raw) => raw.emailAddress !== WALK_IN_EMAIL).map(toVendureCustomer);
}

export async function createVendureCustomer(context: SyncContext, input: CustomerInput): Promise<Customer> {
  const variables = { input: {
    emailAddress: input.email, firstName: input.firstName ?? '', lastName: input.lastName ?? '',
    ...(input.phone ? { phoneNumber: input.phone } : {}),
  } };
  const body = await customerGql(context, CREATE_QUERY, variables);
  const result = body?.data?.createCustomer;
  if (result?.__typename === 'Customer') return toVendureCustomer(result);
  if (result?.__typename && result.message) throw new CustomerServiceError('invalid', result.message);
  throw new CustomerServiceError('server', 'unexpected response');
}

async function customerGql(context: SyncContext, query: string, variables: Record<string, unknown>): Promise<any> {
  try {
    return await gql(context, query, variables);
  } catch (error) {
    if (error instanceof ConnectorUnauthorizedError) throw error;
    throw new CustomerServiceError(error instanceof Error && error.message.startsWith('Vendure ') ? 'server' : 'network', error instanceof Error ? error.message : String(error));
  }
}

export async function getVendureCustomer(context: SyncContext, id: string): Promise<Customer | null> {
  const body = await customerGql(context, GET_QUERY, { id });
  const raw = body?.data?.customer;
  if (raw === null) return null;
  if (typeof raw?.id !== 'string') throw new CustomerServiceError('server', 'unexpected response');
  return toVendureCustomer(raw);
}
