import {
  ConnectorUnauthorizedError, CustomerServiceError, type Customer, type CustomerAddress, type CustomerInput, type CustomerPatch, type SyncContext,
} from '@tallyui/core';
import { gql, VendureApiError } from './replication/products';

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
const UPDATE_QUERY = `mutation Update($input: UpdateCustomerInput!) {
  updateCustomer(input: $input) {
    __typename
    ... on Customer { id firstName lastName emailAddress phoneNumber }
    ... on ErrorResult { errorCode message }
  }
}`;
const ADDRESSES_QUERY = `query Addresses($id: ID!) {
  customer(id: $id) { id firstName lastName emailAddress phoneNumber addresses { id defaultShippingAddress defaultBillingAddress } }
}`;
const CREATE_ADDRESS_QUERY = `mutation CreateAddress($customerId: ID!, $input: CreateAddressInput!) {
  createCustomerAddress(customerId: $customerId, input: $input) { id }
}`;
const UPDATE_ADDRESS_QUERY = `mutation UpdateAddress($input: UpdateAddressInput!) {
  updateCustomerAddress(input: $input) { id }
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

type VendureAddressRef = { id: string; defaultShippingAddress?: boolean | null; defaultBillingAddress?: boolean | null };
const SCALARS = [['firstName', 'firstName'], ['lastName', 'lastName'], ['email', 'emailAddress'], ['phone', 'phoneNumber']] as const;
// gql hands back only a 2xx body, and Vendure's recorded ErrorResult refusal (fixture 2b) came with HTTP 200.
const GRAPHQL_STATUS = { status: 200 };

/** A CustomerAddress as Vendure's address input; the patch replaces the stored address whole, so an absent field is ''. */
function toVendureAddressInput(address: CustomerAddress) {
  return {
    fullName: [address.firstName, address.lastName].filter(Boolean).join(' '), company: address.company ?? '',
    streetLine1: address.address1 ?? '', streetLine2: address.address2 ?? '', city: address.city ?? '',
    province: address.state ?? '', postalCode: address.postcode ?? '', countryCode: address.country ?? '',
    phoneNumber: address.phone ?? '',
  };
}

/**
 * Edits the customer through Vendure's own mutations: `updateCustomer` for its fields, then the address book, where
 * billing and shipping are the addresses flagged `defaultBillingAddress` / `defaultShippingAddress`. A default shared by
 * both kinds is never rewritten for one kind: that kind gets a new default address instead. Vendure stores no customer
 * company or tax ids and no address email, so those are dropped, as `createVendureCustomer` drops them.
 */
export async function updateVendureCustomer(context: SyncContext, id: string, patch: CustomerPatch): Promise<Customer> {
  const kinds = ([['billing', 'defaultBillingAddress', 'defaultShippingAddress'], ['shipping', 'defaultShippingAddress', 'defaultBillingAddress']] as const)
    .filter(([kind]) => patch[kind] !== undefined);
  if (kinds.some(([kind]) => !patch[kind]?.address1 || !patch[kind]?.country)) {
    throw new CustomerServiceError('invalid', 'Vendure addresses need address1 and country');
  }
  const current = (await customerGql(context, ADDRESSES_QUERY, { id }))?.data?.customer;
  if (current === null) throw new CustomerServiceError('invalid', 'unknown customer', GRAPHQL_STATUS);
  if (typeof current?.id !== 'string') throw new CustomerServiceError('server', 'unexpected response');

  let saved = current;
  const fields = SCALARS.filter(([key]) => patch[key] !== undefined);
  if (fields.length) {
    const input = Object.fromEntries([['id', id], ...fields.map(([key, field]) => [field, patch[key]])]);
    const result = (await customerGql(context, UPDATE_QUERY, { input }))?.data?.updateCustomer;
    if (result?.__typename !== 'Customer') {
      if (result?.__typename && result.message) throw new CustomerServiceError('invalid', result.message, GRAPHQL_STATUS);
      throw new CustomerServiceError('server', 'unexpected response');
    }
    saved = result;
  }

  const addresses: VendureAddressRef[] = Array.isArray(current.addresses) ? current.addresses : [];
  for (const [kind, flag, other] of kinds) {
    const address = toVendureAddressInput(patch[kind]!);
    const existing = addresses.find((entry) => entry[flag]);
    if (existing && !existing[other]) {
      await customerGql(context, UPDATE_ADDRESS_QUERY, { input: { id: existing.id, ...address } });
      continue;
    }
    await customerGql(context, CREATE_ADDRESS_QUERY, { customerId: id, input: { ...address, [flag]: true } });
    if (existing) {
      await customerGql(context, UPDATE_ADDRESS_QUERY, { input: { id: existing.id, [flag]: false } });
      existing[flag] = false;
    }
  }
  return toVendureCustomer(saved);
}

async function customerGql(context: SyncContext, query: string, variables: Record<string, unknown>): Promise<any> {
  try {
    return await gql(context, query, variables);
  } catch (error) {
    if (error instanceof ConnectorUnauthorizedError) throw error;
    throw new CustomerServiceError(error instanceof Error && error.message.startsWith('Vendure ') ? 'server' : 'network', error instanceof Error ? error.message : String(error), { status: error instanceof VendureApiError ? error.status : undefined });
  }
}

export async function getVendureCustomer(context: SyncContext, id: string): Promise<Customer | null> {
  const body = await customerGql(context, GET_QUERY, { id });
  const raw = body?.data?.customer;
  if (raw === null) return null;
  if (typeof raw?.id !== 'string') throw new CustomerServiceError('server', 'unexpected response');
  return toVendureCustomer(raw);
}
