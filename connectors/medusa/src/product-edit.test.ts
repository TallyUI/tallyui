import { describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, type SyncContext } from '@tallyui/core';
import { createMedusaAdminUserConnector, createMedusaConnector } from './index';

const edit = createMedusaAdminUserConnector().productEdit!;
const baseUrl = 'https://medusa.test';
const target = { productId: 'prod', variantId: 'variant' };
const change = { field: 'basePrice', from: 1500, to: 1250, basis: { currency: 'USD', taxInclusive: false } } as const;
const usd = { id: 'p_usd', amount: 15, currency_code: 'USD', rules: {}, min_quantity: null, max_quantity: null };
const eur = { id: 'p_eur', amount: 10, currency_code: 'eur' };
const sale = { ...usd, id: 'p_sale', amount: 8 };
const currencyPref = { attribute: 'currency_code', value: 'usd', is_tax_inclusive: false };
const regionPref = { attribute: 'region_id', value: 'reg', is_tax_inclusive: true };
const snapshot = (amount: number, taxInclusive = false) => ({ basePrice: { amount, currency: 'USD', taxInclusive } });
const product = (prices: unknown[]) => Response.json({ product: { variants: [{ id: target.variantId, prices }] } });
const list = (id: string) => ({ id: `list_${id}`, prices: [{ id }] });
const lists = (ids: string[] = [], count = ids.length) => Response.json({ price_lists: ids.map(list), count });
const prefs = (entries = [currencyPref]) => Response.json({ price_preferences: entries });

function fixture(...responses: Response[]) {
  const send = vi.fn<typeof fetch>();
  for (const response of responses) send.mockResolvedValueOnce(response);
  const context: SyncContext = { connectorId: 'medusa', baseUrl, headers: { Authorization: 'Bearer admin' },
    signal: new AbortController().signal, pricingContext: { region_id: 'reg', currency_code: 'usd' }, fetch: send };
  const posts = () => send.mock.calls.filter(([, init]) => init?.method === 'POST').map(([, init]) => JSON.parse(String(init?.body)));
  return { context, send, posts };
}

describe('Medusa variant base price', () => {
  it('is exposed only for admin users', () => {
    expect(edit).toBeDefined();
    expect(createMedusaConnector().productEdit).toBeUndefined();
  });

  it.each([
    { name: 'exclusive currency', entries: [currencyPref], expected: snapshot(1500) },
    { name: 'inclusive currency and region', entries: [{ ...currencyPref, is_tax_inclusive: true }, regionPref], expected: snapshot(1500, true) },
    { name: 'no preferences', entries: [], expected: snapshot(1500) },
    { name: 'disagreeing region', entries: [regionPref, currencyPref], expected: null },
    { name: 'another region', entries: [{ ...regionPref, value: 'reg_other' }, currencyPref], expected: snapshot(1500) },
    { name: 'inclusive till region only', entries: [regionPref], expected: null },
    { name: 'uppercase region', entries: [{ ...regionPref, value: 'REG' }], expected: null },
    { name: 'uppercase inclusive currency', entries: [{ ...currencyPref, value: 'USD', is_tax_inclusive: true }], expected: snapshot(1500, true) },
  ])('reads the tax basis: $name', async ({ entries, expected }) => {
    const { context } = fixture(product([usd]), lists(), prefs(entries));
    expect(await edit.read(context, target)).toEqual(expected);
  });

  it('excludes the unmarked price-list price', async () => {
    const { context } = fixture(product([sale, usd]), lists([sale.id]), prefs());
    expect(await edit.read(context, target)).toEqual(snapshot(1500));
  });

  it.each([
    { name: 'two unruled defaults', prices: [usd, { ...usd, id: 'p_second' }] },
    { name: 'region rule', prices: [{ ...usd, rules: { region_id: 'reg' } }] },
    { name: 'missing rules', prices: [{ ...usd, rules: undefined }] },
    { name: 'null rules', prices: [{ ...usd, rules: null }] },
    { name: 'array rules', prices: [{ ...usd, rules: [] }] },
    { name: 'missing minimum quantity', prices: [{ ...usd, min_quantity: undefined }] },
    { name: 'missing maximum quantity', prices: [{ ...usd, max_quantity: undefined }] },
    { name: 'minimum quantity', prices: [{ ...usd, min_quantity: 10 }] },
    { name: 'maximum quantity', prices: [{ ...usd, max_quantity: 10 }] },
    { name: 'tier alongside base', prices: [usd, { ...usd, id: 'p_tier', min_quantity: 10 }] },
    { name: 'sub-cent amount', prices: [{ ...usd, amount: 12.345 }] },
  ])('leaves $name read-only', async ({ prices }) => {
    const { context } = fixture(product(prices), lists(), prefs());
    expect(await edit.read(context, target)).toBeNull();
  });

  it('cannot bind without a till currency', async () => {
    for (const pricingContext of [undefined, { region_id: 'reg' }]) {
      const { context } = fixture(product([usd]), lists(), prefs());
      expect(await edit.read({ ...context, pricingContext }, target)).toBeNull();
    }
  });

  it.each(['no variant id', 'missing variant', 'missing product'])('does not edit a missing target: %s', async name => {
    const requested = name === 'no variant id' ? { productId: 'prod' } : target;
    const response = () => name === 'missing product' ? new Response(null, { status: 404 }) : Response.json({ product: { variants: [] } });
    const { context, send, posts } = fixture(response(), response());
    expect(await edit.read(context, requested)).toBeNull();
    expect(await edit.update(context, requested, change)).toEqual({ status: 'refused', code: 'not_found' });
    expect(send).toHaveBeenCalledTimes(name === 'no variant id' ? 0 : 2);
    expect(posts()).toEqual([]);
  });

  it('posts only the changed amount and default ids, in order, and reads the response', async () => {
    const { context, send, posts } = fixture(product([usd, sale, eur]), lists([sale.id]), prefs(), product([{ ...usd, amount: 12.5 }, sale, eur]));
    expect(await edit.update(context, target, change)).toEqual({ status: 'saved', snapshot: snapshot(1250) });
    expect(posts()).toEqual([{ prices: [{ id: 'p_usd', amount: 12.5 }, { id: 'p_eur' }] }]);
    expect(send.mock.calls.map(([url]) => url)).toEqual([
      'products/prod', 'price-lists?fields=id,prices.id&limit=100&offset=0', 'price-preferences?limit=1000', 'products/prod/variants/variant',
    ].map(path => `${baseUrl}/admin/${path}`));
    for (const [, init] of send.mock.calls) {
      expect(init?.signal).toBe(context.signal);
      expect(init?.headers).toMatchObject(context.headers);
    }
    expect(send.mock.calls[3][1]?.headers).toHaveProperty('Content-Type', 'application/json');
  });

  it('preserves a ruled default by id and reports the returned amount rather than the requested one', async () => {
    const ruled = { ...usd, id: 'p_region', rules: { region_id: 'reg' } };
    const { context, posts } = fixture(product([ruled, usd]), lists(), prefs(), product([ruled, { ...usd, amount: 12.51 }]));
    expect(await edit.update(context, target, change)).toEqual({ status: 'saved', snapshot: snapshot(1251) });
    expect(posts()).toEqual([{ prices: [{ id: 'p_region' }, { id: 'p_usd', amount: 12.5 }] }]);
  });

  it.each([{ amount: 12.5, status: 'already', minor: 1250 }, { amount: 10, status: 'conflict', minor: 1000 }])(
    'returns $status without a POST', async ({ amount, status, minor }) => {
      const { context, posts } = fixture(product([{ ...usd, amount }]), lists(), prefs());
      expect(await edit.update(context, target, change)).toEqual({ status, snapshot: snapshot(minor) });
      expect(posts()).toEqual([]);
    });

  it('conflicts without a POST if the currency preference changed since opening', async () => {
    const { context, posts } = fixture(product([usd]), lists(), prefs(), product([usd]), lists(), prefs([{ ...currencyPref, is_tax_inclusive: true }]));
    expect(await edit.read(context, target)).toEqual(snapshot(1500));
    expect(await edit.update(context, target, change)).toEqual({ status: 'conflict', snapshot: snapshot(1500, true) });
    expect(posts()).toEqual([]);
  });

  it.each([
    { field: 'salePrice', from: null, to: 100, basis: change.basis }, { field: 'stockOnHand', from: 1, to: 2 }, { field: 'manageStock', from: 'off', to: 'on' },
  ] as const)('never writes $field', async unsupported => {
    const { context, posts } = fixture(product([usd]), lists(), prefs());
    expect(await edit.update(context, target, unsupported)).toEqual({ status: 'conflict', snapshot: snapshot(1500) });
    expect(posts()).toEqual([]);
  });

  it.each([-1, 9007199254740991])('refuses %s without a POST', async to => {
    const { context, posts } = fixture(product([usd]), lists(), prefs());
    expect(await edit.update(context, target, { ...change, to })).toEqual({ status: 'refused', code: 'invalid' });
    expect(posts()).toEqual([]);
  });

  it.each([
    { status: 400, body: { message: 'Invalid price' }, result: { code: 'invalid', message: 'Invalid price' } },
    { status: 400, body: { message: 123 }, result: { code: 'invalid' } },
    { status: 403, body: {}, result: { code: 'forbidden' } },
    { status: 404, body: {}, result: { code: 'not_found' } },
  ])('maps POST $status to a refusal', async ({ status, body, result }) => {
    const { context } = fixture(product([usd]), lists(), prefs(), Response.json(body, { status }));
    expect(await edit.update(context, target, change)).toEqual({ status: 'refused', ...result });
  });

  it('rejects POST server and transport failures', async () => {
    for (const code of ['server', 'network']) {
      const { context, send } = fixture(product([usd]), lists(), prefs());
      if (code === 'server') send.mockResolvedValueOnce(new Response(null, { status: 500 }));
      else send.mockRejectedValueOnce(new Error('offline'));
      await expect(edit.update(context, target, change)).rejects.toMatchObject({ name: 'CustomerServiceError', code });
    }
  });

  it.each([401, 403])('rejects GET %s as unauthorized', async status => {
    const { context } = fixture(new Response(null, { status }));
    await expect(edit.read(context, target)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });

  it('rejects POST 401 as unauthorized', async () => {
    const { context } = fixture(product([usd]), lists(), prefs(), new Response(null, { status: 401 }));
    await expect(edit.update(context, target, change)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });

  it.each([{ variants: [] }, { variants: [{ id: target.variantId, prices: [sale] }] }])('rejects a saved response without a bound price', async ({ variants }) => {
    const { context } = fixture(product([usd]), lists([sale.id]), prefs(), Response.json({ product: { variants } }));
    await expect(edit.update(context, target, change)).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'server', message: 'unexpected response' });
  });

  it('excludes price-list ids from both pages', async () => {
    const ids = Array.from({ length: 150 }, (_, index) => `sale_${index}`);
    const { context, send } = fixture(product([usd, { ...sale, id: ids[0] }, { ...sale, id: ids[149] }]), lists(ids.slice(0, 100), 150), prefs(), lists(ids.slice(100), 150));
    expect(await edit.read(context, target)).toEqual(snapshot(1500));
    expect(send.mock.calls[3][0]).toBe(`${baseUrl}/admin/price-lists?fields=id,prices.id&limit=100&offset=100`);
  });

  it('stops after 50 incomplete price-list pages', async () => {
    const page = () => lists(['sale'], 51);
    const { context, send } = fixture(product([usd]), page(), prefs(), ...Array.from({ length: 49 }, page));
    await expect(edit.read(context, target)).rejects.toMatchObject({ code: 'server', message: 'too many price lists' });
    expect(send).toHaveBeenCalledTimes(52);
  });

  it('rejects malformed GETs with their HTTP status', async () => {
    for (const responses of [[new Response('not JSON')], [Response.json({})], [product([usd]), Response.json({}), prefs()], [product([usd]), lists(), Response.json({})]]) {
      const { context } = fixture(...responses);
      await expect(edit.read(context, target)).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'server', status: 200 });
    }
  });

  it('rejects an incomplete price-preferences list', async () => {
    const { context } = fixture(product([usd]), lists(), Response.json({ price_preferences: [currencyPref], count: 2 }));
    await expect(edit.read(context, target)).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'server', message: 'too many price preferences' });
  });

  it('posts JPY in whole units', async () => {
    const jpy = { ...usd, id: 'p_jpy', currency_code: 'jpy', amount: 1500 };
    const { context, posts } = fixture(product([jpy]), lists(), prefs([]), product([{ ...jpy, amount: 1200 }]));
    const result = await edit.update({ ...context, pricingContext: { currency_code: 'jpy' } }, target, { ...change, to: 1200, basis: { currency: 'JPY', taxInclusive: false } });
    expect(result).toEqual({ status: 'saved', snapshot: { basePrice: { amount: 1200, currency: 'JPY', taxInclusive: false } } });
    expect(posts()).toEqual([{ prices: [{ id: 'p_jpy', amount: 1200 }] }]);
  });
});
