import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConnectorUnauthorizedError } from '@tallyui/core';
import { wooReceiptTemplates } from './receipt-templates';
import { createWooCommerceConnector } from './index';
// Hand-built, not recorded: the rows follow the plugin's Templates.php and Templates_Controller.php shape.
import templates from './__tests__/fixtures/templates-hand-built/templates.json';

const context = {
  connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2',
  headers: { Authorization: 'Bearer woo-token' }, signal: new AbortController().signal,
};
const logicless = {
  id: '64965', kind: 'receipt', title: 'Store receipt', engine: 'html', body: '<div>{{store.name}}</div>', dataModel: 'wcpos',
};
const thermal = {
  id: '64966', kind: 'receipt', title: 'Thermal receipt', engine: 'thermal',
  body: '<receipt paper-width="48"><text>{{store.name}}</text></receipt>', paper: '80mm', dataModel: 'wcpos',
};
const row = (overrides: Record<string, unknown>) => ({ ...templates[2], ...overrides });
const respond = (body: unknown) => vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(Response.json(body));

afterEach(() => { vi.restoreAllMocks(); });

describe('WooCommerce receipt templates', () => {
  it('reads the receipt templates in one GET and keeps the renderable published ones in server order', async () => {
    const spy = respond(templates);
    await expect(wooReceiptTemplates(context)).resolves.toStrictEqual([logicless, thermal]);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/templates`, {
      method: 'GET', headers: context.headers, signal: context.signal,
    });
  });

  it('asks for another kind by type', async () => {
    const spy = respond(templates);
    await expect(wooReceiptTemplates(context, 'closure')).resolves.toStrictEqual([{
      id: '64968', kind: 'closure', title: 'Closure report', engine: 'thermal',
      body: '<receipt paper-width="32"><text>{{store.name}} closure</text></receipt>', paper: '58mm', dataModel: 'wcpos',
    }]);
    expect(spy).toHaveBeenCalledExactlyOnceWith(`${context.baseUrl}/templates?type=closure`, {
      method: 'GET', headers: context.headers, signal: context.signal,
    });
  });

  it.each([
    ['a wrong type', row({ type: 'report' })],
    ['a legacy-php engine with content', row({ engine: 'legacy-php' })],
    ['empty content', row({ content: '' })],
    ['missing content', { ...row({}), content: undefined }],
    ['a disabled row', row({ is_disabled: true })],
    ['a draft that is not virtual', row({ status: 'draft' })],
    ['an empty id', row({ id: '' })],
    ['a non-string title', row({ title: 42 })],
    ['null', null],
  ])('skips %s', async (_label, body) => {
    respond([body]);
    await expect(wooReceiptTemplates(context)).resolves.toStrictEqual([]);
  });

  it('keeps a virtual thermal row with no status', async () => {
    const { status: _status, ...virtual } = row({ id: 'plugin-thermal', is_virtual: true, is_disabled: false });
    respond([virtual]);
    await expect(wooReceiptTemplates(context)).resolves.toStrictEqual([{ ...thermal, id: 'plugin-thermal' }]);
  });

  it('gives a paper only for a known thermal width', async () => {
    respond([row({ paper_width: '100mm' }), { ...templates[1], paper_width: '80mm' }]);
    const { paper: _paper, ...noPaper } = thermal;
    await expect(wooReceiptTemplates(context)).resolves.toStrictEqual([noPaper, logicless]);
  });

  it('keeps the first of two rows with the same id', async () => {
    respond([templates[2], row({ title: 'Second copy' })]);
    await expect(wooReceiptTemplates(context)).resolves.toStrictEqual([thermal]);
  });

  it('gives [] when the store has no templates route', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 404 }));
    await expect(wooReceiptTemplates(context)).resolves.toStrictEqual([]);
  });

  it('throws ConnectorUnauthorizedError for a 401', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 401 }));
    await expect(wooReceiptTemplates(context)).rejects.toBeInstanceOf(ConnectorUnauthorizedError);
  });

  it('throws for a server error', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response('', { status: 500 }));
    await expect(wooReceiptTemplates(context)).rejects.toThrow('WooCommerce API error: 500');
  });

  it.each([
    ['a JSON object', () => Response.json({ templates })],
    ['a non-JSON body', () => new Response('<html>oops</html>', { status: 200 })],
  ])('rejects %s', async (_label, body) => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(body());
    await expect(wooReceiptTemplates(context)).rejects.toThrow('unexpected templates response');
  });

  it('is wired into the connector', () => {
    expect(createWooCommerceConnector().receiptTemplates).toBe(wooReceiptTemplates);
  });
});
