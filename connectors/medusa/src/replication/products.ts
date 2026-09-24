import type { ReplicationAdapter } from '@tallyui/core';

import { medusaProductSchema } from '../schemas/products';

/** Top-level fields the RxDB schema declares; RxDB rejects any others. */
const SCHEMA_FIELDS = Object.keys(medusaProductSchema.properties);

/** Keeps only schema fields, so new Medusa API fields never fail validation. Also used by the id reconcile's `fetchByIds`, for an identical document shape. */
export function toDocument(product: Record<string, unknown>) {
  const doc: Record<string, unknown> = {};
  for (const field of SCHEMA_FIELDS) {
    if (product[field] !== undefined) doc[field] = product[field];
  }
  return doc;
}

/**
 * A pass pages through every product with updated_at >= `updated_at`, in id
 * order, `offset` rows in. The pass-start mark becomes the next lower bound.
 */
export type MedusaProductCheckpoint = {
  offset: number;
  updated_at: string;
  pass_max?: string;
  pass_mark?: string;
  pass_count?: number;
};

// The Admin API does not compute variants.inventory_quantity (only the Store
// API does), so fetch the inventory levels the traits sum instead.
export const MEDUSA_PRODUCT_FIELDS = [
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
      const offset = lastCheckpoint?.offset ?? 0;
      let passMark = lastCheckpoint?.pass_mark ?? lastCheckpoint?.updated_at ?? '';
      if (offset === 0 && lastCheckpoint?.pass_mark === undefined) {
        const markResponse = await fetch(
          `${context.baseUrl}/admin/products?limit=1&order=-updated_at&fields=id,updated_at`,
          { headers: { ...context.headers, 'Content-Type': 'application/json' }, signal: context.signal },
        );
        if (!markResponse.ok) {
          const error = await markResponse.json().catch(() => ({}));
          throw new Error(`Medusa API error: ${markResponse.status}${error?.message ? `: ${error.message}` : ''}`);
        }
        const markData = await markResponse.json();
        passMark = markData.products?.[0]?.updated_at ?? passMark;
        if (lastCheckpoint?.updated_at && passMark === lastCheckpoint.updated_at) {
          return { documents: [], checkpoint: lastCheckpoint };
        }
      }
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
        // Medusa 2.21 honours only the operator form; `updated_at[gte]` is silently dropped.
        params.set('updated_at[$gte]', lastCheckpoint.updated_at);
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
        const error = await response.json().catch(() => ({}));
        throw new Error(`Medusa API error: ${response.status}${error?.message ? `: ${error.message}` : ''}`);
      }

      const data = await response.json();
      const products: any[] = data.products ?? [];
      if (offset > 0 && (products.length === 0 || data.count < (lastCheckpoint?.pass_count ?? data.count))) {
        return medusaProductReplication.pull.handler({
          offset: 0, updated_at: lastCheckpoint?.updated_at ?? '', pass_mark: passMark,
        }, batchSize, context);
      }
      const documents = products.map((p) => ({ ...toDocument(p), _deleted: false }));

      // RxDB merges checkpoints, so clear pass state explicitly at completion.
      const checkpoint: MedusaProductCheckpoint = offset + products.length >= data.count
        ? { offset: 0, updated_at: passMark, pass_mark: undefined, pass_count: undefined }
        : {
            offset: offset + products.length,
            updated_at: lastCheckpoint?.updated_at ?? '',
            pass_mark: passMark,
            pass_count: offset === 0 ? data.count : lastCheckpoint?.pass_count ?? data.count,
          };

      return { documents, checkpoint };
    },
  },
};
