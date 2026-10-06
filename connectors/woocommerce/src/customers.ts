import { CustomerServiceError, type Customer, type CustomerInput, type SyncContext } from '@tallyui/core';
import { checkResponse } from './replication/products';

type WooCustomerRow = {
  id: number | string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
  billing?: {
    first_name?: string | null; last_name?: string | null; email?: string | null;
    phone?: string | null; company?: string | null;
  } | null;
};

export function toWooCustomer(raw: WooCustomerRow): Customer {
  const customer: Customer = { id: String(raw.id), name: String(raw.id) };
  for (const [key, value] of [
    ['firstName', raw.first_name || raw.billing?.first_name],
    ['lastName', raw.last_name || raw.billing?.last_name],
    ['email', raw.email || raw.billing?.email],
    ['phone', raw.billing?.phone], ['company', raw.billing?.company],
  ] as const) {
    if (typeof value === 'string' && value.length > 0) customer[key] = value;
  }
  customer.name = [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.company || customer.email || customer.id;
  return customer;
}

function newWooId(): string {
  if (!globalThis.crypto?.getRandomValues) throw new Error('connector-woocommerce: no random source');
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

async function customerRequest(context: SyncContext, route: string, init: RequestInit = {}) {
  let response: Response;
  try {
    response = await fetch(`${context.baseUrl}/${route}`, {
      ...init, headers: { ...init.headers, ...context.headers }, signal: context.signal,
    });
  } catch (error) {
    throw new CustomerServiceError('network', error instanceof Error ? error.message : String(error));
  }
  if ([401, 403, 426].includes(response.status)) await checkResponse(response);
  const body = await response.json().catch(() => undefined);
  if (!response.ok) {
    const invalid = [400, 404, 422].includes(response.status);
    throw new CustomerServiceError(invalid ? 'invalid' : 'server', invalid ? body?.message ?? `HTTP ${response.status}` : `HTTP ${response.status}`);
  }
  return { status: response.status, body };
}

export function createWooCustomers(options?: { newId?: () => string }) {
  const newId = options?.newId ?? newWooId;
  return {
    async searchCustomers(context: SyncContext, query: string, options?: { limit?: number }): Promise<Customer[]> {
      const q = query.trim();
      if (!q) return [];
      const params = new URLSearchParams({ search: q, role: 'customer', per_page: String(Math.max(1, Math.min(50, options?.limit ?? 20))) });
      const { body } = await customerRequest(context, `customers?${params}`, { method: 'GET' });
      if (!Array.isArray(body)) throw new CustomerServiceError('server', 'unexpected response');
      return body.map(toWooCustomer);
    },

    async getCustomer(context: SyncContext, id: string): Promise<Customer | null> {
      if (!/^\d+$/.test(id)) return null;
      const params = new URLSearchParams({ include: id, per_page: '1', role: 'all' });
      const { body } = await customerRequest(context, `customers?${params}`, { method: 'GET' });
      if (!Array.isArray(body)) throw new CustomerServiceError('server', 'unexpected response');
      const raw = body.find((row: WooCustomerRow) => String(row.id) === id);
      return raw ? toWooCustomer(raw) : null;
    },

    async createCustomer(context: SyncContext, input: CustomerInput): Promise<Customer> {
      const mutationId = newId();
      const recordId = newId();
      const fields = {
        ...(input.email ? { email: input.email } : {}),
        ...(input.firstName ? { first_name: input.firstName } : {}),
        ...(input.lastName ? { last_name: input.lastName } : {}),
      };
      const { status, body } = await customerRequest(context, 'push/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mutationId, operation: 'create', collection: 'customers', recordId, baseRevision: null,
          payload: { ...fields, billing: {
            ...fields, ...(input.phone ? { phone: input.phone } : {}), ...(input.company ? { company: input.company } : {}),
          } },
        }),
      });
      if ((status !== 200 && status !== 201) || !body?.document) throw new CustomerServiceError('server', 'unexpected response');
      return toWooCustomer(body.document);
    },

    async emailReceipt(context: SyncContext, orderId: string, email: string, options?: { saveToBilling?: boolean }): Promise<void> {
      if (!/^[1-9]\d*$/.test(orderId)) throw new CustomerServiceError('invalid', 'Invalid order ID');
      const { status, body } = await customerRequest(context, `orders/${encodeURIComponent(orderId)}/email`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, ...(options?.saveToBilling ? { save_to: 'billing' } : {}) }),
      });
      if (status !== 200 || body?.success !== true) throw new CustomerServiceError('server', 'unexpected response');
    },
  };
}
