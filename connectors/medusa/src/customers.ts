import { ConnectorUnauthorizedError, CustomerServiceError, type Customer, type CustomerAddress, type CustomerInput, type CustomerPatch } from '@tallyui/core';

type MedusaAddress = { id: string; is_default_billing?: boolean; is_default_shipping?: boolean } & Record<string, unknown>;
type MedusaCustomer = { id: string; deleted_at?: string | null; addresses?: MedusaAddress[] } & Record<string, unknown>;
type CustomerInit = { signal?: AbortSignal; fetch?: typeof fetch };

/** CustomerAddress key → Medusa customer-address field (Medusa addresses have no email). */
const ADDRESS_FIELDS = [
  ['firstName', 'first_name'], ['lastName', 'last_name'], ['company', 'company'], ['address1', 'address_1'],
  ['address2', 'address_2'], ['city', 'city'], ['state', 'province'], ['postcode', 'postal_code'],
  ['country', 'country_code'], ['phone', 'phone'],
] as const;

function toAddress(raw: MedusaAddress): CustomerAddress {
  const address: CustomerAddress = {};
  for (const [key, field] of ADDRESS_FIELDS) {
    const value = raw[field];
    if (typeof value === 'string' && value.length > 0) address[key] = key === 'country' ? value.toUpperCase() : value;
  }
  return address;
}

export function toCustomer(raw: MedusaCustomer): Customer {
  const customer: Customer = { id: raw.id, name: raw.id };
  for (const [key, value] of [
    ['firstName', raw.first_name], ['lastName', raw.last_name], ['email', raw.email],
    ['phone', raw.phone], ['company', raw.company_name],
  ] as const) {
    if (typeof value === 'string' && value.length > 0) customer[key] = value;
  }
  customer.name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || customer.email || customer.id;
  // Medusa's billing and shipping are the address-book entries flagged as defaults; only present when asked for (?fields=*addresses).
  const billing = raw.addresses?.find((address) => address.is_default_billing);
  const shipping = raw.addresses?.find((address) => address.is_default_shipping);
  if (billing) customer.billing = toAddress(billing);
  if (shipping) customer.shipping = toAddress(shipping);
  return customer;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

/** `missing: 'invalid'` refuses a 404 like a 400 (update: an id the store doesn't have). */
async function customerRequest(url: string, key: 'customers' | 'customer', init: RequestInit & CustomerInit & { missing?: 'invalid' }) {
  const { fetch: doFetch = fetch, missing, ...requestInit } = init;
  let res: Response;
  try {
    res = await doFetch(url, requestInit);
  } catch (error) {
    throw new CustomerServiceError('network', errorMessage(error));
  }
  if (res.status === 401 || res.status === 403) throw new ConnectorUnauthorizedError(`Medusa rejected the credentials (HTTP ${res.status})`, res.status as 401 | 403);
  if (res.status === 404 && key === 'customer' && init.method === 'GET') return null;
  const refused = res.status === 400 || (res.status === 404 && missing === 'invalid');
  if (!res.ok && !refused) throw new CustomerServiceError('server', `HTTP ${res.status}`, { status: res.status });
  let body;
  try {
    body = await res.json();
  } catch {
    throw new CustomerServiceError(refused ? 'invalid' : 'server', refused ? `HTTP ${res.status}` : 'unexpected response', { status: res.status });
  }
  if (refused) throw new CustomerServiceError('invalid', body?.message ?? `HTTP ${res.status}`, { status: res.status });
  if (key === 'customers' ? !Array.isArray(body?.[key]) : !body?.[key]) throw new CustomerServiceError('server', 'unexpected response', { status: res.status });
  return body[key];
}

export async function searchMedusaCustomers(baseUrl: string, headers: Record<string, string>, query: string, init: CustomerInit & { limit?: number } = {}): Promise<Customer[]> {
  if (!query.trim()) return [];
  const limit = Math.max(1, Math.min(50, init.limit ?? 20));
  const customers: MedusaCustomer[] = await customerRequest(`${baseUrl}/admin/customers?q=${encodeURIComponent(query.trim())}&limit=${limit}`, 'customers', { method: 'GET', headers, signal: init.signal, fetch: init.fetch });
  return customers.filter((raw) => raw.deleted_at == null).map(toCustomer);
}

export async function createMedusaCustomer(baseUrl: string, headers: Record<string, string>, input: CustomerInput, init: CustomerInit = {}): Promise<Customer> {
  const body = {
    email: input.email,
    ...(input.firstName ? { first_name: input.firstName } : {}),
    ...(input.lastName ? { last_name: input.lastName } : {}),
    ...(input.phone ? { phone: input.phone } : {}),
    ...(input.company ? { company_name: input.company } : {}),
  };
  const customer = await customerRequest(`${baseUrl}/admin/customers`, 'customer', { ...init, method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return toCustomer(customer);
}

export async function getMedusaCustomer(baseUrl: string, headers: Record<string, string>, id: string, init: CustomerInit = {}): Promise<Customer | null> {
  const customer: MedusaCustomer | null = await customerRequest(`${baseUrl}/admin/customers/${encodeURIComponent(id)}`, 'customer', { ...init, method: 'GET', headers });
  return customer === null || customer.deleted_at != null ? null : toCustomer(customer);
}

const blankToNull = (value: string | undefined) => (value ? value : null);

function toMedusaAddress(address: CustomerAddress): Record<string, string | null> {
  return Object.fromEntries(ADDRESS_FIELDS.map(([key, field]) => [field, blankToNull(key === 'country' ? address.country?.toLowerCase() : address[key])]));
}

/**
 * Medusa's own way: `POST /admin/customers/{id}` for the customer's fields, then the address book for billing and
 * shipping (the addresses flagged `is_default_billing` / `is_default_shipping`), each replaced whole. An address that
 * is both defaults is split rather than edited for one of them. `taxIds` is not sent: Medusa customers have no tax
 * ids, and createMedusaCustomer drops them too. The customer POST runs first, so an unknown id or a refused field
 * changes nothing; an address refused after it leaves the customer's fields saved.
 */
export async function updateMedusaCustomer(baseUrl: string, headers: Record<string, string>, id: string, patch: CustomerPatch, init: CustomerInit = {}): Promise<Customer> {
  const url = `${baseUrl}/admin/customers/${encodeURIComponent(id)}`;
  const post = (path: string, body: object): Promise<MedusaCustomer> => customerRequest(`${url}${path}?fields=*addresses`, 'customer', {
    ...init, method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(body), missing: 'invalid',
  });
  const fields = [['email', 'email'], ['firstName', 'first_name'], ['lastName', 'last_name'], ['phone', 'phone'], ['company', 'company_name']] as const;
  let customer = await post('', Object.fromEntries(fields.filter(([key]) => patch[key] !== undefined).map(([key, field]) => [field, blankToNull(patch[key])])));
  const billing = customer.addresses?.find((address) => address.is_default_billing);
  const shipping = customer.addresses?.find((address) => address.is_default_shipping);
  const shared = billing !== undefined && billing.id === shipping?.id;
  if (patch.billing) {
    customer = billing && (!shared || patch.shipping)
      ? await post(`/addresses/${encodeURIComponent(billing.id)}`, toMedusaAddress(patch.billing))
      : await post('/addresses', { ...toMedusaAddress(patch.billing), is_default_billing: true });
  }
  if (patch.shipping) {
    customer = shipping && !shared
      ? await post(`/addresses/${encodeURIComponent(shipping.id)}`, toMedusaAddress(patch.shipping))
      : await post('/addresses', { ...toMedusaAddress(patch.shipping), is_default_shipping: true });
  }
  return toCustomer(customer);
}
