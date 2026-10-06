import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError } from '@tallyui/core';
import { createWooCustomers, toWooCustomer } from './customers';
import { createWooCommerceConnector, WooTillUpdateRequiredError, WooTokenRefusedError } from './index';
import search from './__tests__/fixtures/customers-1.10.20/search-name-first.json';
import noMatches from './__tests__/fixtures/customers-1.10.20/search-nomatch.json';
import included from './__tests__/fixtures/customers-1.10.20/search-include.json';
import createRequest from './__tests__/fixtures/customers-1.10.20/push-customers-create-request.json';
import created from './__tests__/fixtures/customers-1.10.20/push-customers-create-response.json';
import existing from './__tests__/fixtures/customers-1.10.20/push-customers-same-record-new-mutation-response.json';
import duplicate from './__tests__/fixtures/customers-1.10.20/push-customers-dup-email-response.json';
import emailed from './__tests__/fixtures/customers-1.10.20/order-email-118-response.json';
import unknownOrder from './__tests__/fixtures/customers-1.10.20/order-email-unknown-order-response.json';

const context = {
  connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer woo-token' }, signal: new AbortController().signal,
};
const input = {
  email: 'g4-fixture-1791256221@example.invalid', firstName: 'Gee', lastName: 'Four',
  phone: '555-0144', company: 'Fourfold Supplies',
};
const customer = { id: '3', name: 'Gee Four', ...input };
const customers = createWooCustomers({ newId: () => createRequest.mutationId });

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('WooCommerce customers', () => {
  it('maps the recorded search and sends the trimmed query with customer role and session auth', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(search));
    await expect(customers.searchCustomers(context, '  Gee  ')).resolves.toStrictEqual([customer]);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/customers?search=Gee&role=customer&per_page=20`, {
      method: 'GET', headers: context.headers, signal: context.signal,
    });
  });

  it.each([[500, 50], [0, 1]])('clamps limit %i to %i', async (limit, perPage) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(noMatches));
    await customers.searchCustomers(context, 'Gee & Four', { limit });
    const url = new URL(spy.mock.calls[0]![0] as string);
    expect(Object.fromEntries(url.searchParams)).toStrictEqual({ search: 'Gee & Four', role: 'customer', per_page: String(perPage) });
  });

  it('does not request a blank query', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(customers.searchCustomers(context, ' \t\n ')).resolves.toStrictEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns the recorded empty search result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(noMatches));
    await expect(customers.searchCustomers(context, 'no match')).resolves.toStrictEqual([]);
  });

  it('gets the matching customer through include with all roles', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(included));
    await expect(customers.getCustomer(context, '3')).resolves.toStrictEqual(customer);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/customers?include=3&per_page=1&role=all`, {
      method: 'GET', headers: context.headers, signal: context.signal,
    });
  });

  it.each([[noMatches], [included]])('returns null when no row matches the requested id', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(body));
    await expect(customers.getCustomer(context, '99')).resolves.toBeNull();
  });

  it('does not request a non-numeric customer id', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(customers.getCustomer(context, 'abc')).resolves.toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([[201, created], [200, existing]] as const)('creates or returns the recorded customer at HTTP %i', async (status, body) => {
    const newId = vi.fn().mockReturnValueOnce(createRequest.mutationId).mockReturnValueOnce(createRequest.recordId);
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(body, { status }));
    await expect(createWooCustomers({ newId }).createCustomer(context, input)).resolves.toStrictEqual(customer);
    expect(newId).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/push/customers`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...context.headers }, signal: context.signal,
      body: expect.any(String),
    });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string)).toStrictEqual(createRequest);
    expect(createRequest.payload).not.toHaveProperty('password');
  });

  it('omits empty fields when creating with only an email', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(created, { status: 201 }));
    await customers.createCustomer(context, { email: input.email, firstName: '', lastName: '', phone: '', company: '' });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).payload).toStrictEqual({ email: input.email, billing: { email: input.email } });
  });

  it('returns the recorded duplicate-email refusal without retrying', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(duplicate, { status: 400 }));
    await expect(customers.createCustomer(context, input)).rejects.toMatchObject({ code: 'invalid', message: duplicate.message });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('generates RFC 4122 v4 ids by default', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(created, { status: 201 }));
    await createWooCustomers().createCustomer(context, input);
    const body = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(body.mutationId).toMatch(uuid);
    expect(body.recordId).toMatch(uuid);
    expect(body.mutationId).not.toBe(body.recordId);
  });

  it('refuses creation without a random source', async () => {
    vi.stubGlobal('crypto', undefined);
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(createWooCustomers().createCustomer(context, input)).rejects.toThrow('connector-woocommerce: no random source');
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([false, true])('emails a receipt with saveToBilling=%s', async (saveToBilling) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(emailed));
    await expect(customers.emailReceipt(context, '118', input.email, saveToBilling ? { saveToBilling } : undefined)).resolves.toBeUndefined();
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/orders/118/email`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...context.headers }, signal: context.signal,
      body: JSON.stringify({ email: input.email, ...(saveToBilling ? { save_to: 'billing' } : {}) }),
    });
  });

  it('returns the recorded unknown-order refusal', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(unknownOrder, { status: 404 }));
    await expect(customers.emailReceipt(context, '999999', input.email)).rejects.toMatchObject({ code: 'invalid', message: unknownOrder.message });
  });

  it.each(['x1', '0', '-1', '1.5', '1/2', ''])('refuses invalid order id %s without a request', async (id) => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const result = customers.emailReceipt(context, id, input.email);
    await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
    await expect(result).rejects.toMatchObject({ code: 'invalid' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('maps billing fallbacks, optional fields and the display-name priority', () => {
    expect(toWooCustomer({ id: 3, first_name: '', last_name: null, email: '', billing: search[0]!.billing })).toStrictEqual(customer);
    expect(toWooCustomer({ id: 3, first_name: 'Top', last_name: 'Level', email: 'top@example.invalid', billing: search[0]!.billing }))
      .toStrictEqual({ ...customer, firstName: 'Top', lastName: 'Level', name: 'Top Level', email: 'top@example.invalid' });
    expect(toWooCustomer({ id: 3, email: input.email, billing: { company: input.company } }))
      .toStrictEqual({ id: '3', name: input.company, email: input.email, company: input.company });
    expect(toWooCustomer({ id: 3, email: input.email })).toStrictEqual({ id: '3', name: input.email, email: input.email });
    expect(toWooCustomer({ id: 3, first_name: '', billing: { phone: '', company: '' } })).toStrictEqual({ id: '3', name: '3' });
  });

  describe.each([
    ['search', () => customers.searchCustomers(context, 'Gee')],
    ['get', () => customers.getCustomer(context, '3')],
    ['create', () => customers.createCustomer(context, input)],
    ['email', () => customers.emailReceipt(context, '118', input.email)],
  ] as const)('%s errors', (_name, call) => {
    it.each([401, 403])('preserves unauthorized status %i', async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}, { status }));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
      await expect(result).rejects.toMatchObject({ status });
    });

    it.each([
      [403, 'jwt_auth_invalid_token', WooTokenRefusedError],
      [426, 'wcpos_update_required', WooTillUpdateRequiredError],
    ] as const)('preserves HTTP %i code %s', async (status, code, error) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ code }, { status }));
      await expect(call()).rejects.toBeInstanceOf(error);
    });

    it.each([400, 404, 422])('classifies HTTP %i as invalid with a missing message', async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}, { status }));
      await expect(call()).rejects.toMatchObject({ code: 'invalid', message: `HTTP ${status}` });
    });

    it.each([409, 500])('classifies HTTP %i as server without retrying', async (status) => {
      const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ message: 'Store error' }, { status }));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'server', message: `HTTP ${status}` });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('classifies rejected fetch as network without retrying', async () => {
      const spy = vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'network', message: 'Failed to fetch' });
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('rejects an unexpected success body', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}));
      await expect(call()).rejects.toMatchObject({ code: 'server', message: 'unexpected response' });
    });
  });

  it('requires HTTP 200 and success === true to confirm receipt email', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(Response.json({ success: false }))
      .mockResolvedValueOnce(Response.json(emailed, { status: 201 }));
    await expect(customers.emailReceipt(context, '118', input.email)).rejects.toMatchObject({ code: 'server' });
    await expect(customers.emailReceipt(context, '118', input.email)).rejects.toMatchObject({ code: 'server' });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('exposes all four customer functions on each connector', () => {
    const connector = createWooCommerceConnector();
    for (const key of ['searchCustomers', 'getCustomer', 'createCustomer', 'emailReceipt'] as const) {
      expect(connector[key]).toBeTypeOf('function');
    }
  });
});
