import { describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError, CustomerServiceError, type SyncContext } from '@tallyui/core';
import { createMedusaAdminUserConnector, createMedusaConnector } from './index';

const edit = createMedusaAdminUserConnector().productEdit!;
const baseUrl = 'https://medusa.test';
const target = { productId: 'prod', variantId: 'variant' };
const change = { field: 'basePrice', from: 1500, to: 1250, basis: { currency: 'USD', taxInclusive: false } } as const;
const usd = { id: 'p_usd', amount: 15, currency_code: 'USD', rules: {}, min_quantity: null, max_quantity: null };
const eur = { id: 'p_eur', amount: 10, currency_code: 'eur', rules: {}, min_quantity: null, max_quantity: null };
const usdWrite = { id: 'p_usd', currency_code: 'USD', min_quantity: null, max_quantity: null, amount: 12.5 };
const eurEcho = { id: 'p_eur', currency_code: 'eur', min_quantity: null, max_quantity: null };
const sale = { ...usd, id: 'p_sale', amount: 8 };
const currencyPref = { attribute: 'currency_code', value: 'usd', is_tax_inclusive: false };
const regionPref = { attribute: 'region_id', value: 'reg', is_tax_inclusive: true };
const snapshot = (amount: number, taxInclusive = false) => ({ basePrice: { amount, currency: 'USD', taxInclusive } });
const product = (prices: unknown[]) => Response.json({ product: { variants: [{ id: target.variantId, prices }] } });
const list = (id: string) => ({ id: `list_${id}`, prices: [{ id }] });
const lists = (ids: string[] = [], count = ids.length) => Response.json({ price_lists: ids.map(list), count });
const prefs = (entries: unknown[] = [currencyPref]) => Response.json({ price_preferences: entries });

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
    { name: 'null currency value', entries: [{ ...currencyPref, value: null, is_tax_inclusive: true }, currencyPref], expected: snapshot(1500) },
    { name: 'null region value', entries: [{ ...regionPref, value: null }, currencyPref], expected: snapshot(1500) },
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

  it.each([
    { name: 'USD then EUR', prices: [usd, eur], expected: [usdWrite, eurEcho] },
    { name: 'EUR then USD', prices: [eur, usd], expected: [eurEcho, usdWrite] },
    { name: 'price-list price', prices: [usd, sale], expected: [usdWrite] },
    { name: 'price-list price between defaults', prices: [usd, sale, eur], expected: [usdWrite, eurEcho] },
    { name: 'ruled EUR', prices: [usd, { ...eur, rules: { region_id: 'reg' } }], expected: [usdWrite, eurEcho] },
    { name: 'tier alongside base', prices: [usd, { ...usd, id: 'p_tier', min_quantity: 10 }],
      expected: [usdWrite, { id: 'p_tier', currency_code: 'USD', min_quantity: 10, max_quantity: null }] },
  ])('posts only the changed amount and echoes defaults in order: $name', async ({ prices, expected }) => {
    const saved = prices.map(price => price === usd ? { ...usd, amount: 12.51 } : price);
    const { context, send, posts } = fixture(product(prices), lists([sale.id]), prefs(), product(saved));
    expect(await edit.update(context, target, change)).toEqual({ status: 'saved', snapshot: snapshot(1251) });
    expect(posts()).toEqual([{ prices: expected }]);
    expect(send.mock.calls.map(([url]) => url)).toEqual([
      'products/prod', 'price-lists?fields=id,prices.id&limit=100&offset=0', 'price-preferences?limit=1000', 'products/prod/variants/variant',
    ].map(path => `${baseUrl}/admin/${path}`));
    for (const [, init] of send.mock.calls) {
      expect(init?.signal).toBe(context.signal);
      expect(init?.headers).toMatchObject(context.headers);
    }
    expect(send.mock.calls[3][1]?.headers).toHaveProperty('Content-Type', 'application/json');
  });

  it.each([
    { name: 'USD region rule collides with the base', prices: [usd, { ...usd, id: 'p_region', currency_code: 'usd', rules: { region_id: 'reg' } }] },
    ...['min_quantity', 'max_quantity'].map(key => ({ name: `USD region rule with zero ${key}`, prices: [usd, { ...usd, id: 'p_region', [key]: 0, rules: { region_id: 'reg' } }] })),
    { name: 'EUR region rule collides with another default', prices: [usd, eur, { ...eur, id: 'p_region', rules: { region_id: 'reg' } }] },
    ...['min_quantity', 'max_quantity', 'currency_code'].map(key => ({ name: `missing EUR ${key}`, prices: [usd, { ...eur, [key]: undefined }] })),
  ])('leaves unsafe defaults read-only without a POST: $name', async ({ prices }) => {
    const { context, posts } = fixture(product(prices), lists(), prefs(), product(prices), lists(), prefs());
    expect(await edit.read(context, target)).toBeNull();
    expect(await edit.update(context, target, change)).toEqual({ status: 'refused', code: 'not_found' });
    expect(posts()).toEqual([]);
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
    { field: 'salePrice', from: null, to: 100, basis: change.basis }, { field: 'stockOnHand', from: 1, to: 2, locationId: null }, { field: 'manageStock', from: 'off', to: 'on' },
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

  it.each([{ variants: [], ids: 'p_usd' }, { variants: [{ id: target.variantId, prices: [sale] }], ids: 'p_usd, p_sale' }])('rejects a saved response without a bound price', async ({ variants, ids }) => {
    const { context } = fixture(product([usd]), lists([sale.id]), prefs(), Response.json({ product: { variants } }));
    await expect(edit.update(context, target, change)).rejects.toMatchObject({ name: 'CustomerServiceError', code: 'server', message: `Prices on this product changed unexpectedly (${ids}). Check them in the store's admin.` });
  });

  describe('compares the prices returned after a write', () => {
    const edited = { ...usd, amount: 12.51 };
    const ruled = { ...eur, rules: { region_id: 'reg', nested: { first: 1, second: 2 } } };
    it.each([
      { name: 'only the edited amount differs', before: eur, after: eur },
      { name: 'rules key order and currency case differ', before: ruled, after: { ...ruled, currency_code: 'EUR', rules: { nested: { second: 2, first: 1 }, region_id: 'reg' } } },
    ])('saves when $name', async ({ before, after }) => {
      const { context } = fixture(product([usd, before]), lists(), prefs(), product([edited, after]));
      expect(await edit.update(context, target, change)).toEqual({ status: 'saved', snapshot: snapshot(1251) });
    });

    const added = { ...eur, id: 'p_new' };
    it.each([
      { name: 'missing EUR', prices: [edited, sale], ids: 'p_eur' },
      { name: 'EUR amount', prices: [edited, { ...eur, amount: 11 }, sale], ids: 'p_eur' },
      { name: 'EUR rules', prices: [edited, ruled, sale], ids: 'p_eur' },
      { name: 'absent EUR rules', prices: [edited, { ...eur, rules: undefined }, sale], ids: 'p_eur' },
      { name: 'EUR minimum', prices: [edited, { ...eur, min_quantity: 0 }, sale], ids: 'p_eur' },
      { name: 'EUR currency', prices: [edited, { ...eur, currency_code: 'gbp' }, sale], ids: 'p_eur' },
      { name: 'sale amount', prices: [edited, eur, { ...sale, amount: 9 }], ids: 'p_sale' },
      { name: 'new price', prices: [edited, eur, sale, added], ids: 'p_new' },
      { name: 'edited rules', prices: [{ ...edited, rules: ruled.rules }, eur, sale], ids: 'p_usd' },
      { name: 'edited maximum', prices: [{ ...edited, max_quantity: 1 }, eur, sale], ids: 'p_usd' },
      { name: 'missing and changed before new', prices: [added, { ...sale, amount: 9 }, edited], ids: 'p_eur, p_sale, p_new' },
      { name: 'missing variant', prices: undefined, ids: 'p_usd, p_eur, p_sale' },
    ])('rejects $name', async ({ prices, ids }) => {
      const response = prices ? product(prices) : Response.json({ product: { variants: [] } });
      const { context } = fixture(product([usd, eur, sale]), lists([sale.id]), prefs(), response);
      const result = edit.update(context, target, change);
      const message = `Prices on this product changed unexpectedly (${ids}). Check them in the store's admin.`;
      await expect(result).rejects.toThrow(new CustomerServiceError('server', message));
      await expect(result).rejects.toBeInstanceOf(CustomerServiceError);
      await expect(result).rejects.toMatchObject({ code: 'server', message, status: 200 });
    });
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
    expect(posts()).toEqual([{ prices: [{ id: 'p_jpy', currency_code: 'jpy', min_quantity: null, max_quantity: null, amount: 1200 }] }]);
  });
});
