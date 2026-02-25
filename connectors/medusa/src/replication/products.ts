import type { ReplicationAdapter } from '@tallyui/core';

export type MedusaProductCheckpoint = {
  offset: number;
  updated_at: string;
};

const MEDUSA_PRODUCT_FIELDS =
  '*variants,*variants.prices,*images,*categories,*tags,*options,*options.values';

/**
 * Replication adapter for Medusa v2 products.
 *
 * Implements pull (offset-based pagination with updated_at filtering) and
 * push (POST to update individual products via Admin API). Designed for
 * use with RxDB's replicateRxCollection.
 */
export const medusaProductReplication: ReplicationAdapter<any, MedusaProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        limit: String(batchSize),
        offset: String(lastCheckpoint?.offset ?? 0),
        fields: MEDUSA_PRODUCT_FIELDS,
      });

      if (lastCheckpoint?.updated_at) {
        params.set('updated_at[gte]', lastCheckpoint.updated_at);
      }

      const response = await fetch(
        `${context.baseUrl}/admin/products?${params}`,
        {
          headers: {
            ...context.headers,
            'Content-Type': 'application/json',
          },
          signal: context.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Medusa API error: ${response.status}`);
      }

      const data = await response.json();
      const products: any[] = data.products ?? [];
      const documents = products.map((p) => ({ ...p, _deleted: false }));

      // Reset offset when batch is smaller than batchSize (end of page)
      const nextOffset = products.length < batchSize
        ? 0
        : (lastCheckpoint?.offset ?? 0) + products.length;

      const checkpoint: MedusaProductCheckpoint = products.length > 0
        ? {
            offset: nextOffset,
            updated_at: products[products.length - 1].updated_at,
          }
        : lastCheckpoint ?? { offset: 0, updated_at: '' };

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
            `${context.baseUrl}/admin/products/${doc.id}`,
            {
              method: 'POST',
              headers: {
                ...context.headers,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(doc),
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
