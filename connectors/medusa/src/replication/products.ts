import type { ReplicationAdapter } from '@tallyui/core';

import { medusaProductSchema } from '../schemas/products';

/** Top-level fields the RxDB schema declares; RxDB rejects any others. */
const SCHEMA_FIELDS = Object.keys(medusaProductSchema.properties);

/** Keeps only schema fields, so new Medusa API fields never fail validation. */
function toDocument(product: Record<string, unknown>) {
  const doc: Record<string, unknown> = {};
  for (const field of SCHEMA_FIELDS) {
    if (product[field] !== undefined) doc[field] = product[field];
  }
  return doc;
}

/**
 * A pass pages through every product with updated_at >= `updated_at`, in id
 * order, `offset` rows in. `pass_max` is the newest updated_at seen so far
 * this pass, and becomes the next pass's `updated_at`.
 */
export type MedusaProductCheckpoint = {
  offset: number;
  updated_at: string;
  pass_max?: string;
};

// The Admin API does not compute variants.inventory_quantity (only the Store
// API does), so fetch the inventory levels the traits sum instead.
const MEDUSA_PRODUCT_FIELDS = [
  '*variants',
  '*variants.prices',
  '+variants.inventory_items.required_quantity',
  '+variants.inventory_items.inventory.location_levels.stocked_quantity',
  '+variants.inventory_items.inventory.location_levels.reserved_quantity',
  '*images',
  '*categories',
  '*tags',
  '*options',
  '*options.values',
].join(',');

/**
 * Replication adapter for Medusa v2 products.
 *
 * Pull-only (id-ordered offset pages within an updated_at window) for RxDB's
 * replicateRxCollection. Catalogue data is server-owned; the POS never
 * writes products.
 */
export const medusaProductReplication: ReplicationAdapter<any, MedusaProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        limit: String(batchSize),
        offset: String(lastCheckpoint?.offset ?? 0),
        fields: MEDUSA_PRODUCT_FIELDS,
        // Offsets need a total order. Many products share an updated_at
        // (bulk writes), and Medusa sorts by one field only, so page by the
        // unique id within the fixed updated_at window.
        order: 'id',
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
      const documents = products.map((p) => ({ ...toDocument(p), _deleted: false }));

      // The updated_at window stays fixed for the whole pass, or the offset
      // would count from a different set. A short page ends the pass; the
      // next pass starts from the newest updated_at this pass saw.
      const passMax = products.reduce(
        (max, p) => (p.updated_at && p.updated_at > max ? p.updated_at : max),
        lastCheckpoint?.pass_max ?? lastCheckpoint?.updated_at ?? '',
      );
      const checkpoint: MedusaProductCheckpoint = products.length === 0
        ? lastCheckpoint?.pass_max
          ? { offset: 0, updated_at: lastCheckpoint.pass_max }
          : lastCheckpoint ?? { offset: 0, updated_at: '' }
        : products.length >= batchSize
          ? {
              offset: (lastCheckpoint?.offset ?? 0) + products.length,
              updated_at: lastCheckpoint?.updated_at ?? '',
              pass_max: passMax,
            }
          : { offset: 0, updated_at: passMax };

      return { documents, checkpoint };
    },
  },
};
