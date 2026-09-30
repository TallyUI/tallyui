import { ConnectorUnauthorizedError, CustomerServiceError, type Customer, type CustomerInput } from '@tallyui/core';

type MedusaCustomer = { id: string; deleted_at?: string | null } & Record<string, unknown>;
type CustomerInit = { signal?: AbortSignal; fetch?: typeof fetch };

export function toCustomer(raw: MedusaCustomer): Customer {
  const customer: Customer = { id: raw.id, name: raw.id };
  for (const [key, value] of [
    ['firstName', raw.first_name], ['lastName', raw.last_name], ['email', raw.email],
    ['phone', raw.phone], ['company', raw.company_name],
  ] as const) {
    if (typeof value === 'string' && value.length > 0) customer[key] = value;
  }
  customer.name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || customer.email || customer.id;
  return customer;
}

function errorMessage(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return String(error);
}

async function customerRequest(url: string, key: 'customers' | 'customer', init: RequestInit & CustomerInit) {
  const { fetch: doFetch = fetch, ...requestInit } = init;
  let res: Response;
  try {
    res = await doFetch(url, requestInit);
  } catch (error) {
    throw new CustomerServiceError('network', errorMessage(error));
  }
  if (res.status === 401 || res.status === 403) throw new ConnectorUnauthorizedError(`Medusa rejected the credentials (HTTP ${res.status})`, res.status as 401 | 403);
  if (res.status === 404 && key === 'customer' && init.method === 'GET') return null;
  if (!res.ok && res.status !== 400) throw new CustomerServiceError('server', `HTTP ${res.status}`);
  let body;
  try {
    body = await res.json();
  } catch {
    throw new CustomerServiceError(res.status === 400 ? 'invalid' : 'server', res.status === 400 ? 'HTTP 400' : 'unexpected response');
  }
  if (res.status === 400) throw new CustomerServiceError('invalid', body?.message ?? 'HTTP 400');
  if (key === 'customers' ? !Array.isArray(body?.[key]) : !body?.[key]) throw new CustomerServiceError('server', 'unexpected response');
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
