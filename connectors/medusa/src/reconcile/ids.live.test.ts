// @vitest-environment node
// Read-only: changes nothing on the server.
import { describe, expect, it } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { medusaAdminUserAuth, medusaConnector } from '../index';
import { fetchByIds, fetchPages } from './ids';

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa id reconcile', () => {
  it('filters on updated_at[$gte], reads every product by id, and fetches known ids', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl, { email: MEDUSA_DEV_EMAIL!, password: MEDUSA_DEV_PASSWORD! });
    expect(token).toBeTruthy();
    const context: SyncContext = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };

    // A mark far in the future: Medusa 2.21 only honours the operator form.
    const futureMark = '2099-01-01T00:00:00.000Z';
    const futureParams = new URLSearchParams({ 'updated_at[$gte]': futureMark, limit: '1' });
    const futureResponse = await fetch(`${baseUrl}/admin/products?${futureParams}`, { headers: context.headers });
    expect(futureResponse.ok).toBe(true);
    expect((await futureResponse.json()).count).toBe(0);

    const futurePull = await medusaConnector.replication!.products!.pull.handler(
      { offset: 0, updated_at: futureMark }, 50, context,
    );
    expect(futurePull.documents).toEqual([]);

    // The newest product's own updated_at as the mark: the handler must
    // return only that product (or its ties), never the whole catalogue.
    const newestResponse = await fetch(`${baseUrl}/admin/products?limit=1&order=-updated_at&fields=id,updated_at`, { headers: context.headers });
    expect(newestResponse.ok).toBe(true);
    const { products: newestProducts } = await newestResponse.json();
    expect(newestProducts.length).toBeGreaterThan(0);
    const newestMark: string = newestProducts[0].updated_at;

    const countResponse = await fetch(`${baseUrl}/admin/products?limit=1&fields=id`, { headers: context.headers });
    expect(countResponse.ok).toBe(true);
    const { count: totalCount } = await countResponse.json();

    // 1ms before the newest mark: the handler reads the high-water mark
    // first, and a checkpoint equal to that mark takes the "unchanged
    // mark, nothing new" early return, so the bound must be strictly older.
    const sinceMark = new Date(Date.parse(newestMark) - 1).toISOString();
    const newestPull = await medusaConnector.replication!.products!.pull.handler(
      { offset: 0, updated_at: sinceMark }, 50, context,
    );
    expect(newestPull.documents.length).toBeGreaterThan(0);
    for (const doc of newestPull.documents) {
      expect(Date.parse((doc as { updated_at?: string }).updated_at!)).toBeGreaterThanOrEqual(Date.parse(sinceMark));
    }
    expect(newestPull.documents.map((doc) => (doc as { id?: string }).id)).toContain(newestProducts[0].id);
    expect(newestPull.documents.length).toBeLessThan(totalCount);

    // fetchPages reads the whole catalogue, pages = ceil(count / 1000).
    const pages: Array<Array<{ id: string; variantIds: string[] }>> = [];
    for await (const page of fetchPages(context)) pages.push(page);
    const total = pages.reduce((sum, page) => sum + page.length, 0);
    expect(total).toBe(totalCount);
    expect(pages).toHaveLength(Math.ceil(totalCount / 1000));

    // fetchByIds of 3 known ids returns exactly those 3.
    const knownIds = pages[0].slice(0, 3).map((row) => row.id);
    expect(knownIds).toHaveLength(3);
    const byIds = await fetchByIds(knownIds, context);
    expect(byIds.map((p: any) => p.id).sort()).toEqual([...knownIds].sort());
  }, 60000);
});
