import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type WooProductCheckpoint = {
  id: string;
  modified: string;
};

/**
 * Replication adapter for WooCommerce products.
 *
 * Implements pull (cursor-based pagination by date_modified_gmt) and push
 * (individual create/update via WC REST API v3). Designed for use with
 * RxDB's replicateRxCollection.
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

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        try {
          const isCreate = !row.assumedMasterState;
          const method = isCreate ? 'POST' : 'PUT';
          const url = isCreate
            ? `${context.baseUrl}/products`
            : `${context.baseUrl}/products/${doc.id}`;

          const response = await fetch(url, {
            method,
            headers: {
              ...context.headers,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(doc),
            signal: context.signal,
          });

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
