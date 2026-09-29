import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError } from '@tallyui/core';
import { createMedusaCustomer, getMedusaCustomer, searchMedusaCustomers, toCustomer } from './customers';
import { medusaAdminUserConnector, medusaConnector, medusaCreateCustomer, medusaGetCustomer, medusaSearchCustomers } from './index';
import fixture from './customers.fixture.json';

const baseUrl = 'https://medusa.test';
const headers = { Authorization: 'Bearer admin-token' };
const input = { email: 'tally-fixture-1790577165@tally.test', firstName: 'Fixture', lastName: 'Customer' };
const expected = [
  { id: 'cus_01M35QXXPAW0N6S1EB0Z0XG6PY', name: 'Omar Smith', firstName: 'Omar', lastName: 'Smith', email: 'customer0035@tally.test', phone: '+45 65579366' },
  { id: 'cus_01M35QXXPFHS0659SCPR73A17H', name: 'Elijah Smith', firstName: 'Elijah', lastName: 'Smith', email: 'customer0088@tally.test' },
  { id: 'cus_01M35QXXPFX044EZSR19JQX1TQ', name: 'Hana Smith', firstName: 'Hana', lastName: 'Smith', email: 'customer0092@tally.test', phone: '+45 65050285' },
];
const created = { id: 'cus_01M3KBEGSNVW84XF51BT46P4A8', name: 'Fixture Customer', ...input };
const response = (entry: { status: number; body: unknown }) => new Response(JSON.stringify(entry.body), { status: entry.status });
const calls = [
  ['search', () => searchMedusaCustomers(baseUrl, headers, 'smith')],
  ['create', () => createMedusaCustomer(baseUrl, headers, input)],
  ['get', () => getMedusaCustomer(baseUrl, headers, expected[0].id)],
] as const;

describe('Medusa customers', () => {
  afterEach(() => vi.restoreAllMocks());

  it('maps a recorded search to neutral customers', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.search));
    await expect(searchMedusaCustomers(baseUrl, headers, 'smith')).resolves.toStrictEqual(expected);
  });

  it('sends the query and limit, trimmed and clamped', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response(fixture.search));
    for (const [limit, sent] of [[undefined, 20], [500, 50], [0, 1], [3, 3]] as const) {
      await searchMedusaCustomers(baseUrl, headers, '  smith  ', { limit });
      expect(spy).toHaveBeenLastCalledWith(`${baseUrl}/admin/customers?q=smith&limit=${sent}`, expect.objectContaining({ method: 'GET', headers }));
      expect(spy.mock.lastCall?.[1]?.headers).toBe(headers);
    }
    await searchMedusaCustomers(baseUrl, headers, '  a b@x.test  ');
    expect(spy).toHaveBeenLastCalledWith(`${baseUrl}/admin/customers?q=a%20b%40x.test&limit=20`, expect.objectContaining({ headers }));
  });

  it('an empty query makes no request', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(searchMedusaCustomers(baseUrl, headers, ' \t\n ')).resolves.toStrictEqual([]);
    await expect(searchMedusaCustomers(baseUrl, headers, '')).resolves.toStrictEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('an empty result is an empty list', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.searchEmpty));
    await expect(searchMedusaCustomers(baseUrl, headers, 'nobody-here')).resolves.toStrictEqual([]);
  });

  it('gets a customer by id, and a 404 is null', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(fixture.get))
      .mockResolvedValueOnce(response(fixture.notFound));
    await expect(getMedusaCustomer(baseUrl, headers, expected[0].id)).resolves.toStrictEqual(expected[0]);
    expect(spy).toHaveBeenLastCalledWith(`${baseUrl}/admin/customers/${expected[0].id}`, expect.objectContaining({ method: 'GET', headers }));
    await expect(getMedusaCustomer(baseUrl, headers, 'cus_does/not exist')).resolves.toBeNull();
    expect(spy).toHaveBeenLastCalledWith(`${baseUrl}/admin/customers/cus_does%2Fnot%20exist`, expect.objectContaining({ method: 'GET', headers }));
  });

  it('creates a customer with only the given fields, and maps the 200 response', async () => {
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(fixture.create))
      .mockResolvedValueOnce(response({ ...fixture.create, status: 201 }));
    for (const status of [200, 201]) {
      await expect(createMedusaCustomer(baseUrl, headers, input), `HTTP ${status}`).resolves.toStrictEqual(created);
      expect(spy).toHaveBeenLastCalledWith(`${baseUrl}/admin/customers`, expect.objectContaining({
        method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' },
      }));
      expect(JSON.parse(spy.mock.lastCall?.[1]?.body as string)).toStrictEqual({
        email: input.email, first_name: 'Fixture', last_name: 'Customer',
      });
    }
  });

  it('omits empty optional create fields and sends supplied phone and company fields', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response(fixture.create));
    await createMedusaCustomer(baseUrl, headers, { email: input.email, firstName: '', lastName: '', phone: '', company: '' });
    expect(JSON.parse(spy.mock.lastCall?.[1]?.body as string)).toStrictEqual({ email: input.email });
    await createMedusaCustomer(baseUrl, headers, { ...input, phone: '+45 12345678', company: 'Fixture Co' });
    expect(JSON.parse(spy.mock.lastCall?.[1]?.body as string)).toStrictEqual({
      email: input.email, first_name: 'Fixture', last_name: 'Customer', phone: '+45 12345678', company_name: 'Fixture Co',
    });
  });

  it("a 400 on create is CustomerServiceError invalid, with the server's message", async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.createInvalid));
    const result = createMedusaCustomer(baseUrl, headers, { email: 'not-an-email' });
    await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
    await expect(result).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'invalid', message: 'Invalid request: Invalid email address' });
  });

  it.each(calls)('a 401 throws ConnectorUnauthorizedError: %s', async (_name, call) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response(fixture.unauthorized));
    const result = call();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 401, message: 'Medusa rejected the credentials (HTTP 401)' });
  });

  it.each(calls)('a 403 throws ConnectorUnauthorizedError: %s', async (_name, call) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(response({ ...fixture.unauthorized, status: 403 }));
    const result = call();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status: 403, message: 'Medusa rejected the credentials (HTTP 403)' });
  });

  it.each(calls)('a 500, a network failure or an unexpected body is CustomerServiceError: %s', async (_name, call) => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const cases = [
      { reply: new Response('server failed', { status: 500 }), code: 'server', message: 'HTTP 500' },
      { error: new Error('offline'), code: 'network', message: 'offline' },
      { error: new DOMException('cancelled', 'AbortError'), code: 'network', message: 'cancelled' },
      { reply: response({ status: 200, body: {} }), code: 'server', message: 'unexpected response' },
      { reply: new Response('not JSON'), code: 'server', message: 'unexpected response' },
      { reply: response(fixture.createInvalid), code: 'invalid', message: 'Invalid request: Invalid email address' },
      { reply: response({ status: 400, body: {} }), code: 'invalid', message: 'HTTP 400' },
    ];
    for (const entry of cases) {
      if (entry.error) spy.mockRejectedValueOnce(entry.error);
      else spy.mockResolvedValueOnce(entry.reply!);
      const result = call();
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: entry.code, message: entry.message });
    }
  });

  it('a 404 on search or create is a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => response(fixture.notFound));
    for (const [, call] of calls.slice(0, 2)) {
      await expect(call()).rejects.toMatchObject({ code: 'server', message: 'HTTP 404' });
    }
  });

  it('drops a deleted customer from search, and get returns null for it', async () => {
    const deleted = { ...fixture.get.body.customer, deleted_at: '2026-09-28T08:00:00.000Z' };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response({ ...fixture.search, body: { ...fixture.search.body, customers: [deleted, ...fixture.search.body.customers.slice(1)] } }))
      .mockResolvedValueOnce(response({ ...fixture.get, body: { customer: deleted } }));
    await expect(searchMedusaCustomers(baseUrl, headers, 'smith')).resolves.toStrictEqual(expected.slice(1));
    await expect(getMedusaCustomer(baseUrl, headers, deleted.id)).resolves.toBeNull();
  });

  it('name falls back to company, then email, then id', () => {
    const raw = { ...fixture.get.body.customer, first_name: '', last_name: null, company_name: 'Smith Co' };
    expect(toCustomer(raw)).toStrictEqual({ id: raw.id, name: 'Smith Co', company: 'Smith Co', email: raw.email, phone: raw.phone });
    expect(toCustomer({ ...raw, company_name: '' }).name).toBe(raw.email);
    expect(toCustomer({ ...raw, company_name: null, email: '' }).name).toBe(raw.id);
    expect(toCustomer({ ...raw, company_name: null, email: null, phone: 123 })).toStrictEqual({ id: raw.id, name: raw.id });
    expect(toCustomer({ ...raw, first_name: 'Omar' }).name).toBe('Omar');
    expect(toCustomer({ ...raw, last_name: 'Smith' }).name).toBe('Smith');
  });

  it('only the admin-user connector has customer methods', async () => {
    expect(medusaConnector.searchCustomers).toBeUndefined();
    expect(medusaConnector.createCustomer).toBeUndefined();
    expect(medusaConnector.getCustomer).toBeUndefined();
    expect(medusaAdminUserConnector.searchCustomers).toBe(medusaSearchCustomers);
    expect(medusaAdminUserConnector.createCustomer).toBe(medusaCreateCustomer);
    expect(medusaAdminUserConnector.getCustomer).toBe(medusaGetCustomer);
    const context = { connectorId: 'medusa', baseUrl, headers, signal: new AbortController().signal };
    const spy = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(response(fixture.search))
      .mockResolvedValueOnce(response(fixture.create))
      .mockResolvedValueOnce(response(fixture.get));
    await expect(medusaAdminUserConnector.searchCustomers!(context, 'smith', { limit: 3 })).resolves.toStrictEqual(expected);
    expect(spy).toHaveBeenLastCalledWith(`${baseUrl}/admin/customers?q=smith&limit=3`, expect.anything());
    await expect(medusaAdminUserConnector.createCustomer!(context, input)).resolves.toStrictEqual(created);
    await expect(medusaAdminUserConnector.getCustomer!(context, expected[0].id)).resolves.toStrictEqual(expected[0]);
    for (const [, init] of spy.mock.calls) {
      expect(init?.signal).toBe(context.signal);
      expect(init?.headers).toMatchObject(headers);
    }
  });

  it('uses an injected fetch and passes the signal for all three calls', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch');
    const injectedFetch = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(response(fixture.search))
      .mockResolvedValueOnce(response(fixture.create))
      .mockResolvedValueOnce(response(fixture.get));
    const init = { fetch: injectedFetch, signal: new AbortController().signal };
    await expect(searchMedusaCustomers(baseUrl, headers, 'smith', init)).resolves.toStrictEqual(expected);
    await expect(createMedusaCustomer(baseUrl, headers, input, init)).resolves.toStrictEqual(created);
    await expect(getMedusaCustomer(baseUrl, headers, expected[0].id, init)).resolves.toStrictEqual(expected[0]);
    expect(globalFetch).not.toHaveBeenCalled();
    expect(injectedFetch).toHaveBeenCalledTimes(3);
    for (const [, request] of injectedFetch.mock.calls) expect(request?.signal).toBe(init.signal);
  });
});
