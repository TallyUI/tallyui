import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { wooListRegisters } from './registers';
import { createWooCommerceConnector } from './index';

const context: SyncContext = {
  connectorId: 'woocommerce', baseUrl: 'https://registers.test/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer registers-token', 'X-WCPOS': '1' }, signal: new AbortController().signal,
};
const fetchMock = vi.fn<typeof fetch>();
let store: Record<string, unknown>;
let registersResponse: () => Response;
const twoRegisters = [
  { id: '0b6f8e2a-1111-4c3d-9e2f-000000000001', name: 'Front counter', store_id: 0, default_float: '150.0000', session: null },
  { id: '0b6f8e2a-2222-4c3d-9e2f-000000000002', name: 'Back bar', store_id: 3, default_float: null, session: null },
];

beforeEach(() => {
  store = { id: 0, currency: 'USD', expected_close_time: '17:30', variance_threshold: '' };
  registersResponse = () => Response.json(twoRegisters);
  fetchMock.mockReset().mockImplementation(async (input) => {
    const url = new URL(String(input));
    if (url.pathname.endsWith('/stores')) return Response.json([store]);
    if (url.pathname.endsWith('/registers')) return registersResponse();
    throw new Error(`Unexpected request: ${url}`);
  });
});

afterEach(() => { vi.restoreAllMocks(); });

const run = () => wooListRegisters({ ...context, fetch: fetchMock });

describe('wooListRegisters', () => {
  it('T1: maps ids, names and the USD float, leaving a null float out', async () => {
    expect(await run()).toStrictEqual([
      { id: twoRegisters[0].id, name: 'Front counter', defaultFloatMinor: 15000, expectedCloseTime: '17:30' },
      { id: twoRegisters[1].id, name: 'Back bar', expectedCloseTime: '17:30' },
    ]);
    expect(fetchMock.mock.calls).toEqual([
      [`${context.baseUrl}/stores`, { method: 'GET', headers: context.headers, signal: context.signal }],
      [`${context.baseUrl}/registers`, { method: 'GET', headers: context.headers, signal: context.signal }],
    ]);
  });

  it('T1: reads the float with the currency digits (JPY has none)', async () => {
    store.currency = 'jpy';
    expect((await run()).map((register) => register.defaultFloatMinor)).toStrictEqual([150, undefined]);
  });

  it('T2: copies the store close time onto every register', async () => {
    expect((await run()).map((register) => register.expectedCloseTime)).toStrictEqual(['17:30', '17:30']);
  });

  it.each(['', null, '5pm'])('T2: leaves the close time out for %j', async (value) => {
    store.expected_close_time = value;
    for (const register of await run()) expect(register).not.toHaveProperty('expectedCloseTime');
  });

  it('T3: returns [] when the store has no registers route (404)', async () => {
    registersResponse = () => Response.json({ code: 'rest_no_route' }, { status: 404 });
    expect(await run()).toStrictEqual([]);
  });

  it('T3: throws on a 500', async () => {
    registersResponse = () => new Response(null, { status: 500 });
    await expect(run()).rejects.toThrow('WooCommerce registers: HTTP 500');
  });

  it.each([401, 403])('T3: throws the unauthorized error on %i', async (status) => {
    registersResponse = () => new Response(null, { status });
    const result = run();
    await expect(result).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
    await expect(result).rejects.toMatchObject({ status, message: `WooCommerce registers: HTTP ${status}` });
  });

  it('throws when /stores fails, before asking for registers', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    await expect(run()).rejects.toThrow('WooCommerce stores: HTTP 500');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('throws when the registers body is not an array', async () => {
    registersResponse = () => Response.json({ registers: twoRegisters });
    await expect(run()).rejects.toThrow('WooCommerce registers: expected an array');
  });

  it('T4: skips a register with no name, warns once, and maps the others', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    registersResponse = () => Response.json([{ id: 'nameless', default_float: '10.00' }, ...twoRegisters]);
    expect((await run()).map((register) => register.name)).toStrictEqual(['Front counter', 'Back bar']);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('is wired into the connector', () => {
    expect(createWooCommerceConnector().listRegisters).toBe(wooListRegisters);
  });
});
