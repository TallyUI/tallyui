import type { ReplicationAdapter } from '@tallyui/core';

export type ShopifyProductCheckpoint = {
  updated_at: string;
};

/**
 * Parse the "next" URL from Shopify's Link header for cursor pagination.
 * Returns an empty string if there's no next page.
 */
function parseLinkNext(linkHeader: string | null): string {
  if (!linkHeader) return '';
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : '';
}

/**
 * Shopify IDs are integers but RxDB primary keys must be strings.
 */
function normalizeId(product: any) {
  return { ...product, id: String(product.id) };
}

/**
 * Replication adapter for Shopify products.
 *
 * Implements pull (cursor-based pagination via Link header, filtered by
 * updated_at_min) and push (PUT to update individual products via Admin
 * REST API). Designed for use with RxDB's replicateRxCollection.
 */
export const shopifyProductReplication: ReplicationAdapter<any, ShopifyProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        limit: String(batchSize),
      });

      if (lastCheckpoint?.updated_at) {
        params.set('updated_at_min', lastCheckpoint.updated_at);
      }

      let url: string = `${context.baseUrl}/admin/api/2024-01/products.json?${params}`;
      const allProducts: any[] = [];

      while (url) {
        const response = await fetch(url, {
          headers: {
            ...context.headers,
            'Content-Type': 'application/json',
          },
          signal: context.signal,
        });

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status}`);
        }

        const data = await response.json();
        const products = (data.products ?? []).map(normalizeId);
        allProducts.push(...products);

        url = parseLinkNext(response.headers.get('Link'));
      }

      const documents = allProducts.map((p) => ({ ...p, _deleted: false }));

      const checkpoint: ShopifyProductCheckpoint = allProducts.length > 0
        ? { updated_at: allProducts[allProducts.length - 1].updated_at }
        : lastCheckpoint ?? { updated_at: '' };

      return { documents, checkpoint };
    },
  },

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        try {
          const response = await fetch(
            `${context.baseUrl}/admin/api/2024-01/products/${doc.id}.json`,
            {
              method: 'PUT',
              headers: {
                ...context.headers,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ product: doc }),
              signal: context.signal,
            },
          );

          if (!response.ok) {
            if (row.assumedMasterState) {
              conflicts.push({ ...row.assumedMasterState, _deleted: false });
            }
          }
        } catch {
          if (row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        }
      }

      return conflicts;
    },
  },
};
