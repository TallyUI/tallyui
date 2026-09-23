import type { ReplicationAdapter } from '@tallyui/core';

export type WooProductCheckpoint = {
  id: string;
  modified: string;
};

/**
 * Replication adapter for WooCommerce products.
 *
 * Pull-only (cursor-based pagination by date_modified_gmt) for RxDB's
 * replicateRxCollection. Catalogue data is server-owned; the POS never
 * writes products.
 */
export const wooProductReplication: ReplicationAdapter<any, WooProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        per_page: String(batchSize),
        orderby: 'modified',
        order: 'asc',
      });

      if (lastCheckpoint?.modified) {
        params.set('modified_after', lastCheckpoint.modified);
      }

      const response = await fetch(`${context.baseUrl}/products?${params}`, {
        headers: {
          ...context.headers,
          'Content-Type': 'application/json',
        },
        signal: context.signal,
      });

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      const products: any[] = await response.json();
      const documents = products.map((p) => ({ ...p, _deleted: false }));

      const checkpoint: WooProductCheckpoint = products.length > 0
        ? {
            id: String(products[products.length - 1].uuid ?? products[products.length - 1].id),
            modified: products[products.length - 1].date_modified_gmt,
          }
        : lastCheckpoint ?? { id: '', modified: '' };

      return { documents, checkpoint };
    },
  },
};
