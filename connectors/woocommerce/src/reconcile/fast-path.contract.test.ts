// @vitest-environment node
// The WCPOS products fast path (#313), pinned to the answer recorded from woocommerce-pos (#2116, #2119, #2121):
// the request the adapter sends, the entries it makes of the answer, and the fake store that stands in for it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import fixture from '../__tests__/fixtures/wcpos-products-fast-path.json';
import { at, closeTills, context, createFakeStore } from '../__tests__/fake-store';
import { toProductDocument } from '../replication/products';
import { wooBulkListingUrl, wooCatalogueReconcile, wooReconcileFingerprint } from './catalogue';
import { createWooReconcileFeed } from './feed';

afterEach(closeTills);

const { query } = fixture.request;
const { body } = fixture.response;

describe('the WCPOS products fast path contract (#313)', () => {
  it('1. the request is the recorded one: path /products, the same query parameters and no others', () => {
    const url = new URL(wooBulkListingUrl('https://s/wp-json/wcpos/v2'));
    expect(url.pathname).toBe('/wp-json/wcpos/v2/products');
    expect(Object.fromEntries(url.searchParams)).toEqual(query);
    expect([...url.searchParams.keys()]).toHaveLength(Object.keys(query).length);
  });

  it('2. the recorded answer becomes entries keyed by id, with the id as remote and the tuple fingerprint', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => (String(input).endsWith('/status')
      ? Response.json({ healthy: true, capabilities: ['products_id_fast_path'] })
      : new Response(JSON.stringify(body), { headers: fixture.response.headers })));
    const pages = [];
    for await (const page of wooCatalogueReconcile(createWooReconcileFeed()).fetchPages(context)) pages.push(page);
    expect(pages.map((p) => p.entries.length)).toEqual([0, 4]);
    expect(pages[1].entries).toEqual(body.map((row) => ({ key: String(row.id), fingerprint: wooReconcileFingerprint(row), remote: row.id })));
    expect(pages[1].entries.map((e) => e.key)).toEqual(['13', '12', '11', '10']);
  });

  it('3. each row fingerprints like the hydrated product the pull delivers; the draft is absent, from the recording and the fake', async () => {
    for (const row of body) {
      const hydrated = toProductDocument({ ...row, uuid: `u${row.id}`, name: `Product ${row.id}`, status: 'publish' });
      expect(wooReconcileFingerprint(hydrated)).toBe(wooReconcileFingerprint(row));
    }
    expect(Object.keys(fixture.products)).toContain('14');
    expect(body.map((row) => row.id)).not.toContain(14);

    // The fake store seeded with the recorded products answers the recorded body (its order is approximated).
    const store = createFakeStore(0);
    for (const row of body) store.rows.push({ ...row, uuid: `u${row.id}`, name: `Product ${row.id}`, status: 'publish', ...at(row.date_modified_gmt) });
    store.rows.push({ id: 14, uuid: 'u14', name: 'Draft', status: 'draft', stock_quantity: 2, stock_status: 'instock', ...at(body[0].date_modified_gmt) });
    const response = await fetch(wooBulkListingUrl(context.baseUrl));
    const byId = (rows: Array<{ id: number }>) => [...rows].sort((a, b) => a.id - b.id);
    expect(byId(await response.json())).toEqual(byId(body));
    expect(response.headers.get('X-WP-Total')).toBe(fixture.response.headers['X-WP-Total']);
  });
});
