import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError } from '@tallyui/core';
import { createVendureCustomer, getVendureCustomer, searchVendureCustomers, toVendureCustomer } from './customers';
import { createVendureConnector } from './index';
import search from './__tests__/fixtures/customers/1a-customers-search-matches.json';
import noMatches from './__tests__/fixtures/customers/1b-customers-search-none.json';
import create from './__tests__/fixtures/customers/2a-createCustomer-success.json';
import duplicate from './__tests__/fixtures/customers/2b-createCustomer-duplicate-email.json';
import get from './__tests__/fixtures/customers/3-customer-with-addresses.json';

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
  ] as const;
  describe.each(calls)('%s errors', (_name, call) => {
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

  it('exposes the three functions on the connector', () => {
    const connector = createVendureConnector();
    expect(connector.searchCustomers).toBe(searchVendureCustomers);
    expect(connector.createCustomer).toBe(createVendureCustomer);
    expect(connector.getCustomer).toBe(getVendureCustomer);
  });
});
