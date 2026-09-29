import type { ReplicationAdapter } from '@tallyui/core';

export type WooProductCheckpoint = {
  id: string;
  modified: string;
};

export class WooMissingUuidError extends Error {
  name = 'WooMissingUuidError';
  productId: number;

  constructor(id: number) {
    super(`WooCommerce product ${id} has no uuid: the store must run the WCPOS Free plugin (1.10.0 or later) and be reached through its wcpos/v2 routes`);
    this.productId = id;
  }
}

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
      for (const product of products) {
        if (typeof product.uuid !== 'string' || product.uuid.length === 0) {
          throw new WooMissingUuidError(product.id);
        }
      }
      const documents = products.map((p) => ({ ...p, _deleted: false }));

      const checkpoint: WooProductCheckpoint = products.length > 0
        ? {
            id: products[products.length - 1].uuid,
            modified: products[products.length - 1].date_modified_gmt,
          }
        : lastCheckpoint ?? { id: '', modified: '' };

      return { documents, checkpoint };
    },
  },
};
