// @vitest-environment node
// Read-only: medusa-dev is shared, so this changes nothing on the server.
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { SyncContext } from '@tallyui/core';
import { medusaAdminUserAuth } from '../index';
import { createMedusaVariantFeedReplication } from './variant-feed';

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa variant feed', () => {
  afterEach(() => vi.restoreAllMocks());

  it('filters variants on updated_at[$gte] and re-delivers only the changed variants\' parents', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl, { email: MEDUSA_DEV_EMAIL!, password: MEDUSA_DEV_PASSWORD! });
    const context: SyncContext = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };
    const get = async (path: string) => {
      const response = await fetch(`${baseUrl}${path}`, { headers: context.headers });
      expect(response.ok).toBe(true);
      return response.json();
    };
    const feed = createMedusaVariantFeedReplication();
    // Every request the feed sends, read through to the real server.
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const urls = () => fetchSpy.mock.calls.map(([input]) => new URL(String(input)));

    // A future mark: the variant route must honour the operator form, and the
    // feed fetches no parents. The mark moves back to the newest variant, so
    // the feed may return one carrier product to keep that checkpoint.
    const futureMark = '2099-01-01T00:00:00.000Z';
    expect((await get(`/admin/product-variants?${new URLSearchParams({ 'updated_at[$gte]': futureMark, limit: '1' })}`)).count).toBe(0);
    fetchSpy.mockClear();
    const future = await feed.pull.handler({ offset: 0, updated_at: futureMark }, 50, context);
    expect(urls().filter((url) => url.searchParams.getAll('id[]').length)).toEqual([]);
    expect(future.documents.length).toBeLessThanOrEqual(1);

    // 1 ms before the newest variant's updated_at: that variant's parent, not the whole catalogue.
    const { variants: [newest] } = await get('/admin/product-variants?limit=1&order=-updated_at&fields=id,updated_at,product_id');
    expect(newest).toBeDefined();
    const { count: totalProducts } = await get('/admin/products?limit=1&fields=id');
    const since = new Date(Date.parse(newest.updated_at) - 1).toISOString();
    const recent = await feed.pull.handler({ offset: 0, updated_at: since }, 50, context);
    expect(recent.documents.map((doc) => (doc as { id?: string }).id)).toContain(newest.product_id);
    expect(recent.documents.length).toBeLessThan(totalProducts);
  }, 60000);
});
