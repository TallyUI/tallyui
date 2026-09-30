// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { errorKind, type SyncContext, type SyncNotice } from '@tallyui/core';
import { startReplication } from '@tallyui/database';

import { WooTillUpdateRequiredError as ExportedError } from '../index';
import { wooProductSchema } from '../schemas/products';
import { wooProductReplication, WooTillUpdateRequiredError } from './products';

addRxPlugin(RxDBDevModePlugin);
const context: SyncContext = { connectorId: 'woocommerce', baseUrl: 'https://woo.test/wp-json/wcpos/v2', headers: {} };
const RETRY = 20;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(check: () => boolean, ms = 2000) {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out waiting');
    await sleep(5);
  }
}
const cleanup: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  for (const close of cleanup.splice(0).reverse()) await close();
  vi.restoreAllMocks();
});
// WCPOS 2.0's protocol gate refuses a POS request below protocol 2 with this body.
const gate = () => new Response(JSON.stringify({ code: 'wcpos_update_required', message: 'Update the POS' }), { status: 426 });

// A minimal `document`, so RxDB registers its visibilitychange handler (start() on 'visible').
function fakeDocument() {
  const listeners = new Set<() => void>();
  const page = {
    visibilityState: 'visible',
    addEventListener: (type: string, listener: () => void) => { if (type === 'visibilitychange') listeners.add(listener); },
    removeEventListener: (_type: string, listener: () => void) => { listeners.delete(listener); },
  };
  (globalThis as { document?: unknown }).document = page;
  cleanup.push(async () => { delete (globalThis as { document?: unknown }).document; });
  return { listeners, toggle: (state: string) => { page.visibilityState = state; for (const listener of [...listeners]) listener(); } };
}

it('re-exports WooTillUpdateRequiredError from the index', () => {
  expect(ExportedError).toBeTypeOf('function');
  expect(ExportedError).toBe(WooTillUpdateRequiredError);
});

it('a 426 on the mark request pauses the pull with one till notice, and resume() pulls again once the till is updated, through the real replication loop', async () => {
  const page = fakeDocument();
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => gate());
  const db = await createRxDatabase({
    name: `woo426${Date.now()}`, storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }), multiInstance: false,
  });
  cleanup.push(() => db.close());
  const { products } = await db.addCollections({ products: { schema: wooProductSchema } });
  const state = startReplication({ collection: products, adapter: wooProductReplication, context, retryTime: RETRY });
  cleanup.push(() => state.cancel());
  const notices: (SyncNotice | undefined)[] = [];
  state.notice$.subscribe((notice) => notices.push(notice));
  const errors: unknown[] = [];
  state.error$.subscribe((error) => errors.push(error));

  expect(page.listeners.size).toBe(1);
  await until(() => state.isPaused());
  expect(String(fetchSpy.mock.calls[0][0])).toContain('orderby=modified');
  page.toggle('hidden');
  page.toggle('visible');
  await sleep(RETRY * 5);
  state.reSync();
  await sleep(RETRY * 5);

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(notices).toEqual([undefined, { code: 'till_update_required', since: expect.any(Number), fixedBy: 'till' }]);
  expect(errors).toEqual([]);
  expect(state.isPaused()).toBe(true);

  // The till was updated: the store now answers, and resume() restarts the pull.
  const product = { id: 1, uuid: 'u1', name: 'Product 1', status: 'publish', date_modified_gmt: '2026-01-01T08:00:01' };
  fetchSpy.mockImplementation(async () => new Response(JSON.stringify([product]), { headers: { 'X-WP-Total': '1' } }));
  await state.resume();
  await until(() => fetchSpy.mock.calls.length > 1);
  await until(() => !state.isPaused());
  await state.awaitInSync();
  expect((await products.find().exec()).map((doc) => doc.uuid)).toEqual(['u1']);
  expect(notices).toEqual([undefined, { code: 'till_update_required', since: expect.any(Number), fixedBy: 'till' }, undefined]);
  expect(errors).toEqual([]);
});

it('a 426 on a page request is WooTillUpdateRequiredError, with the server code kept for diagnostics', async () => {
  const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => gate());
  const error = await wooProductReplication.pull.handler({ modified: '', offset: 2, pass_mark: '' }, 2, context).catch((e) => e);
  expect(fetchSpy).toHaveBeenCalledTimes(1);
  expect(String(fetchSpy.mock.calls[0][0])).toContain('orderby=id');
  expect(error).toBeInstanceOf(WooTillUpdateRequiredError);
  expect(error).toMatchObject({ name: 'WooTillUpdateRequiredError', code: 'till_update_required', fixedBy: 'till', serverCode: 'wcpos_update_required' });
  expect(errorKind(error)).toBe('till');
});

// Only the plugin's own gate means the till needs updating; any other 426 (a proxy, another plugin) is retried,
// with the store's code and message kept for the log, the message cut at 200 characters.
it.each([
  ['another code', JSON.stringify({ code: 'some_other_code', message: 'Use TLS 1.3' }), 'WooCommerce API error: 426 (some_other_code): Use TLS 1.3'],
  ['a code and no message', JSON.stringify({ code: 'some_other_code' }), 'WooCommerce API error: 426 (some_other_code)'],
  ['a message and no code', JSON.stringify({ message: 'Use TLS 1.3' }), 'WooCommerce API error: 426: Use TLS 1.3'],
  ['a 500-character message', JSON.stringify({ code: 'c', message: 'abcde'.repeat(100) }), `WooCommerce API error: 426 (c): ${'abcde'.repeat(40)}…`],
  ['a 200-character message', JSON.stringify({ code: 'c', message: 'abcde'.repeat(40) }), `WooCommerce API error: 426 (c): ${'abcde'.repeat(40)}`],
  ['no JSON', 'Upgrade Required', 'WooCommerce API error: 426'],
  ['nothing', null, 'WooCommerce API error: 426'],
])('a 426 with %s in the body is a transient error, never a till update', async (_name, body, message) => {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(body, { status: 426 }));
  const error = await wooProductReplication.pull.handler(undefined, 2, context).catch((e) => e);
  expect(error).not.toBeInstanceOf(WooTillUpdateRequiredError);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toBe(message);
  expect(error.fixedBy).toBeUndefined();
  expect(errorKind(error)).toBe('transient');
});
