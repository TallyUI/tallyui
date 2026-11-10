import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError } from '@tallyui/core';
import { createVendureCustomer, getVendureCustomer, searchVendureCustomers, toVendureCustomer, updateVendureCustomer } from './customers';
import { createVendureConnector } from './index';
import search from './__tests__/fixtures/customers/1a-customers-search-matches.json';
import noMatches from './__tests__/fixtures/customers/1b-customers-search-none.json';
import create from './__tests__/fixtures/customers/2a-createCustomer-success.json';
import duplicate from './__tests__/fixtures/customers/2b-createCustomer-duplicate-email.json';
import get from './__tests__/fixtures/customers/3-customer-with-addresses.json';
import update from './__tests__/fixtures/customers/4a-updateCustomer-success.json';
import updateConflict from './__tests__/fixtures/customers/4b-updateCustomer-duplicate-email.json';

const context = {
  connectorId: 'vendure', baseUrl: 'https://vendure.test',
  headers: { Authorization: 'Bearer admin-token', 'vendure-token': 'channel-token' },
  signal: new AbortController().signal,
};
const input = { email: 'ada.fixture@example.com', firstName: 'Ada', lastName: 'Lovelace', phone: '+44 20 7946 0001' };
const adam = { id: '3', name: 'Adam Fixture', firstName: 'Adam', lastName: 'Fixture', email: 'adam.fixture@example.com' };
const ada = { id: '2', name: 'Ada Lovelace', firstName: 'Ada', lastName: 'Lovelace', email: 'ada.fixture@example.com', phone: '+44 20 7946 0001' };

afterEach(() => vi.restoreAllMocks());

describe('Vendure customers', () => {
  it('maps the recorded search and sends the trimmed query in the session channel', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(search.response, { status: search.httpStatus }));
    await expect(searchVendureCustomers(context, '  ada  ')).resolves.toStrictEqual([adam, ada]);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/admin-api`, expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', ...context.headers }, signal: context.signal,
    }));
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(sent.variables).toStrictEqual({ q: 'ada', take: 20 });
    expect(sent.query).toBe(search.query.replace('id createdAt updatedAt title', 'id').replace(' customFields', ''));
  });

  it.each([[500, 50], [0, 1]])('clamps limit %i to %i', async (limit, take) => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(noMatches.response, { status: noMatches.httpStatus }));
    await searchVendureCustomers(context, 'ada', { limit });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).variables).toStrictEqual({ q: 'ada', take });
  });

  it('does not request a blank query', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    await expect(searchVendureCustomers(context, ' \t\n ')).resolves.toStrictEqual([]);
    expect(spy).not.toHaveBeenCalled();
  });

  it('returns an empty list for the recorded search with no matches', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(noMatches.response, { status: noMatches.httpStatus }));
    await expect(searchVendureCustomers(context, noMatches.variables.q)).resolves.toStrictEqual([]);
  });

  it('drops the vendurepos walk-in customer from search', async () => {
    const items = [{ id: '1', emailAddress: 'walk-in@vendurepos.local' }, ...search.response.data.customers.items];
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { customers: { items } } }));
    await expect(searchVendureCustomers(context, 'ada')).resolves.toStrictEqual([adam, ada]);
  });

  it('creates and maps the recorded customer with the required input fields', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(create.response, { status: create.httpStatus }));
    await expect(createVendureCustomer(context, { ...input, company: 'Ignored Co' })).resolves.toStrictEqual(ada);
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(sent.variables).toStrictEqual(create.variables);
    expect(sent.query).toBe(create.query.replace('id createdAt updatedAt title', 'id').replace(' customFields', ''));
  });

  it('sends empty names and omits the phone when creating with only an email', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(create.response, { status: create.httpStatus }));
    await createVendureCustomer(context, { email: input.email });
    expect(JSON.parse(spy.mock.calls[0]![1]!.body as string).variables).toStrictEqual({
      input: { emailAddress: input.email, firstName: '', lastName: '' },
    });
  });

  it('rejects a recorded duplicate email with the server message', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(duplicate.response, { status: duplicate.httpStatus }));
    const result = createVendureCustomer(context, { email: input.email, firstName: 'Ada', lastName: 'Again' });
    await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
    await expect(result).rejects.toMatchObject({ code: 'invalid', message: 'The email address is not available.' });
  });

  it('looks up the recorded customer by id, selecting only the customer fields', async () => {
    const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(get.response, { status: get.httpStatus }));
    await expect(getVendureCustomer(context, '2')).resolves.toStrictEqual(ada);
    const sent = JSON.parse(spy.mock.calls[0]![1]!.body as string);
    expect(sent.variables).toStrictEqual(get.variables);
    expect(sent.query.replace(/\s+/g, ' ')).toBe('query One($id: ID!) { customer(id: $id) { id firstName lastName emailAddress phoneNumber } }');
  });

  it('returns null for an unknown customer', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { customer: null } }));
    await expect(getVendureCustomer(context, 'missing')).resolves.toBeNull();
  });

  it.each([{ data: {} }, {}])('rejects a malformed lookup response (%j)', async (body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(body, { status: 200 }));
    const result = getVendureCustomer(context, '2');
    await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
    await expect(result).rejects.toMatchObject({ code: 'server', message: 'unexpected response' });
  });

  describe('update', () => {
    const replies = (...bodies: unknown[]) => {
      const spy = vi.spyOn(globalThis, 'fetch');
      for (const body of bodies) spy.mockResolvedValueOnce(Response.json(body));
      return spy;
    };
    const sent = (spy: ReturnType<typeof replies>): Array<{ query: string; variables: unknown }> =>
      spy.mock.calls.map((call) => JSON.parse(call[1]!.body as string));
    const created = { data: { createCustomerAddress: { id: '5' } } };
    const updated = { data: { updateCustomerAddress: { id: '1' } } };
    const billing = { firstName: 'Ada', lastName: 'Lovelace', address1: '1 Bill Road', city: 'London', postcode: 'N1 1AA', country: 'GB', email: 'dropped@example.com' };
    const vendureBilling = { fullName: 'Ada Lovelace', company: '', streetLine1: '1 Bill Road', streetLine2: '', city: 'London', province: '', postalCode: 'N1 1AA', countryCode: 'GB', phoneNumber: '' };
    const shipping = { company: 'Fixture GmbH', address1: '2 Ship Lane', country: 'DE' };
    const vendureShipping = { fullName: '', company: 'Fixture GmbH', streetLine1: '2 Ship Lane', streetLine2: '', city: '', province: '', postalCode: '', countryCode: 'DE', phoneNumber: '' };

    it('reads the customer, then sends only the patched field and maps the recorded-shape result', async () => {
      const spy = replies(get.response, update.response);
      await expect(updateVendureCustomer(context, '2', { phone: '+44 20 7946 0002' })).resolves.toStrictEqual({ ...ada, phone: '+44 20 7946 0002' });
      const [read, write] = sent(spy);
      expect(read.variables).toStrictEqual({ id: '2' });
      expect(read.query.replace(/\s+/g, ' ')).toBe('query Addresses($id: ID!) { customer(id: $id) { id firstName lastName emailAddress phoneNumber addresses { id defaultShippingAddress defaultBillingAddress } } }');
      expect(write).toStrictEqual({ query: update.query, variables: update.variables });
    });

    it('drops company and tax ids, as create does, and resolves the stored customer unchanged', async () => {
      const spy = replies(get.response);
      await expect(updateVendureCustomer(context, '2', { company: 'Ignored Co', taxIds: [{ type: 'gb_vat', value: 'GB123' }] })).resolves.toStrictEqual(ada);
      expect(spy).toHaveBeenCalledOnce();
    });

    it('gives billing its own new default when the recorded default is shared with shipping', async () => {
      const spy = replies(get.response, created, updated);
      await expect(updateVendureCustomer(context, '2', { billing })).resolves.toStrictEqual(ada);
      expect(sent(spy).slice(1).map((body) => body.variables)).toStrictEqual([
        { customerId: '2', input: { ...vendureBilling, defaultBillingAddress: true } },
        { input: { id: '1', defaultBillingAddress: false } },
      ]);
      expect(sent(spy)[1].query).toContain('createCustomerAddress(customerId: $customerId, input: $input) { id }');
      expect(sent(spy)[2].query).toContain('updateCustomerAddress(input: $input) { id }');
    });

    it('then rewrites the shared address in place for shipping, once it is shipping alone', async () => {
      const spy = replies(get.response, created, updated, updated);
      await updateVendureCustomer(context, '2', { billing, shipping });
      expect(sent(spy).slice(1).map((body) => body.variables)).toStrictEqual([
        { customerId: '2', input: { ...vendureBilling, defaultBillingAddress: true } },
        { input: { id: '1', defaultBillingAddress: false } },
        { input: { id: '1', ...vendureShipping } },
      ]);
    });

    it('rewrites a default billing address that is billing alone in place', async () => {
      const addresses = [{ id: '1', defaultBillingAddress: true, defaultShippingAddress: false }, { id: '4', defaultBillingAddress: false, defaultShippingAddress: true }];
      const spy = replies({ data: { customer: { ...get.response.data.customer, addresses } } }, updated);
      await updateVendureCustomer(context, '2', { billing });
      expect(sent(spy).slice(1).map((body) => body.variables)).toStrictEqual([{ input: { id: '1', ...vendureBilling } }]);
    });

    it.each([{ country: 'GB' }, { address1: '1 Bill Road' }])('refuses an address Vendure cannot store (%j) before any request', async (address) => {
      const spy = vi.spyOn(globalThis, 'fetch');
      await expect(updateVendureCustomer(context, '2', { shipping: address })).rejects.toMatchObject({ code: 'invalid', status: undefined });
      expect(spy).not.toHaveBeenCalled();
    });

    it('refuses an unknown customer id', async () => {
      const spy = replies({ data: { customer: null } });
      const result = updateVendureCustomer(context, 'missing', { phone: '+44 20 7946 0002' });
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'invalid', message: 'unknown customer', status: 200 });
      expect(spy).toHaveBeenCalledOnce();
    });

    it('refuses the email conflict with its message and writes no address', async () => {
      const spy = replies(get.response, updateConflict.response);
      const result = updateVendureCustomer(context, '2', { email: 'adam.fixture@example.com', billing });
      await expect(result).rejects.toMatchObject({ code: 'invalid', message: 'The email address is not available.', status: 200 });
      expect(sent(spy)[1].variables).toStrictEqual(updateConflict.variables);
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it.each([
      [Response.json({}, { status: 503 }), { code: 'server', status: 503 }],
      [Response.json({ data: {} }), { code: 'server', message: 'unexpected response' }],
    ])('classifies a failed update mutation after the read (%#)', async (reply, error) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(get.response)).mockResolvedValueOnce(reply);
      await expect(updateVendureCustomer(context, '2', { firstName: 'Augusta' })).rejects.toMatchObject(error);
    });
  });

  it('omits empty fields and falls back to email, then id for the name', () => {
    expect(toVendureCustomer({ id: '2', firstName: '', lastName: null, emailAddress: input.email, phoneNumber: '' }))
      .toStrictEqual({ id: '2', name: input.email, email: input.email });
    expect(toVendureCustomer({ id: '2', emailAddress: '', phoneNumber: null })).toStrictEqual({ id: '2', name: '2' });
    expect(toVendureCustomer({ id: '2', firstName: 'Ada' })).toStrictEqual({ id: '2', name: 'Ada', firstName: 'Ada' });
    expect(toVendureCustomer({ id: '2', lastName: 'Lovelace' })).toStrictEqual({ id: '2', name: 'Lovelace', lastName: 'Lovelace' });
  });

  it.each([undefined, null, {}])('rejects a non-array search result (%s)', async (items) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: { customers: { items } } }));
    const result = searchVendureCustomers(context, 'ada');
    await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
    await expect(result).rejects.toMatchObject({ code: 'server', message: 'unexpected response' });
  });

  it('rejects a missing create result', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ data: {} }));
    const result = createVendureCustomer(context, input);
    await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
    await expect(result).rejects.toMatchObject({ code: 'server', message: 'unexpected response' });
  });

  const calls = [
    ['search', () => searchVendureCustomers(context, 'ada')],
    ['create', () => createVendureCustomer(context, input)],
    ['get', () => getVendureCustomer(context, '2')],
    ['update', () => updateVendureCustomer(context, '2', { phone: '+44 20 7946 0002' })],
  ] as const;
  describe.each(calls)('%s errors', (_name, call) => {
    it('carries the HTTP status', async () => {
      vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({}, { status: 500 }))
        .mockResolvedValueOnce(Response.json({ errors: [{ message: 'Server failed' }] }))
        .mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await expect(call()).rejects.toMatchObject({ code: 'server', status: 500 });
      await expect(call()).rejects.toMatchObject({ code: 'server', status: 200 });
      const error = await call().catch((error: unknown) => error);
      expect(error).toBeInstanceOf(CustomerServiceError);
      expect((error as CustomerServiceError).status).toBeUndefined();
    });

    it.each([401, 403])('preserves HTTP %i as an authorization error', async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}, { status }));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
      await expect(result).rejects.toMatchObject({ status });
    });

    it('classifies HTTP 500 as a server error', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({}, { status: 500 }));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'server', message: 'Vendure API error: 500' });
    });

    it('classifies GraphQL errors as server errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json({ errors: [{ message: 'Server failed' }] }));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'server', message: 'Vendure GraphQL error: Server failed' });
    });

    it('classifies a rejected fetch as a network error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new TypeError('Failed to fetch'));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'network', message: 'Failed to fetch' });
    });

    it('preserves FORBIDDEN as status 403 when the administrator probe succeeds', async () => {
      const spy = vi.spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(Response.json({ errors: [{ message: 'Forbidden', extensions: { code: 'FORBIDDEN' } }] }))
        .mockResolvedValueOnce(Response.json({ data: { activeAdministrator: { id: '1' } } }));
      const result = call();
      await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
      await expect(result).rejects.toMatchObject({ status: 403 });
      expect(spy).toHaveBeenCalledTimes(2);
      expect(JSON.parse(spy.mock.calls[1]![1]!.body as string).query).toContain('activeAdministrator');
      for (const [url, init] of spy.mock.calls) {
        expect(url).toBe(`${context.baseUrl}/admin-api`);
        expect(init?.headers).toMatchObject(context.headers);
        expect(init?.signal).toBe(context.signal);
      }
    });
  });

  it('exposes the four functions on the connector', () => {
    const connector = createVendureConnector();
    expect(connector.searchCustomers).toBe(searchVendureCustomers);
    expect(connector.createCustomer).toBe(createVendureCustomer);
    expect(connector.getCustomer).toBe(getVendureCustomer);
    expect(connector.updateCustomer).toBe(updateVendureCustomer);
  });
});
