import type { CollectionSync, SyncContext } from '@tallyui/core';
import { normalizeId, parseLinkNext } from '../replication/products';

/**
 * Shopify product sync implementation.
 *
 * Uses the Admin REST API. Shopify uses cursor-based pagination via
 * the Link header (page_info parameter), not page numbers.
 */
export const shopifyProductSync: CollectionSync = {
  fetchAllIds: async (context: SyncContext) => {
    const entries: { id: string; dateModified?: string }[] = [];
    let url = `${context.baseUrl}/admin/api/2024-01/products.json?fields=id,updated_at&limit=250`;

    while (url) {
      const res = await fetch(url, {
        headers: context.headers,
        signal: context.signal,
      });

      if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);

      const data = await res.json();
      for (const product of data.products ?? []) {
        entries.push({
          id: String(product.id),
          dateModified: product.updated_at,
        });
      }

      // Parse cursor-based pagination from Link header
      url = parseLinkNext(res.headers.get('Link'));
    }

    return entries;
  },

  fetchByIds: async (ids: string[], context: SyncContext) => {
    // Shopify REST API supports fetching by comma-separated IDs
    const idsParam = ids.join(',');
    const res = await fetch(
      `${context.baseUrl}/admin/api/2024-01/products.json?ids=${idsParam}`,
      {
        headers: context.headers,
        signal: context.signal,
      },
    );

    if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);

    const data = await res.json();
    return (data.products ?? []).map(normalizeId);
  },

  fetchModifiedAfter: async (date: string, context: SyncContext) => {
    const products: any[] = [];
    let url = `${context.baseUrl}/admin/api/2024-01/products.json?updated_at_min=${date}&limit=250`;

    while (url) {
      const res = await fetch(url, {
        headers: context.headers,
        signal: context.signal,
      });

      if (!res.ok) throw new Error(`Shopify API error: ${res.status}`);

      const data = await res.json();
      products.push(...(data.products ?? []).map(normalizeId));

      url = parseLinkNext(res.headers.get('Link'));
    }

    return products;
  },
};
