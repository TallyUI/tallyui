import type { ReplicationAdapter, SyncContext } from '@tallyui/core';
import { gql, PRODUCT_LIST_QUERY, toProductDocument, type VendureProductCheckpoint } from './products';

/** Vendure Admin API maximum `take`; variant pages and parent re-fetch chunks use it. */
const MAX_TAKE = 1000;

const variants = (context: SyncContext, fields: string, options: Record<string, any>) => gql(context, `
  query GetVariants($options: ProductVariantListOptions) {
    productVariants(options: $options) { items { ${fields} } totalItems }
  }
`, { options }).then((res) => res.data.productVariants as { items: any[]; totalItems: number });

/**
 * Variant feed for Vendure products (ADR-060, decision 3).
 *
 * A variant price or stock edit bumps `ProductVariant.updatedAt` but not
 * `Product.updatedAt`, so the product feed never sees it. This pull adapter
 * pages changed variants with the same pass and high-water design as
 * `createVendureProductReplication` and re-delivers their parent products,
 * in the same document shape, into the `products` collection. Run it as a
 * second replication with its own identifier. Parents that no longer exist
 * are skipped; deletions are the id reconcile's job.
 *
 * With no checkpoint, the first pass re-delivers every product that has
 * variants, once. That is deliberate: it heals any price or stock change the
 * product feed missed before this feed existed.
 *
 * `variantPageSize` (the variant page `take`) is for tests and tuning.
 */
export const createVendureVariantFeedReplication = (barcodeField?: string, updatedAtSkewMs = 0, variantPageSize = MAX_TAKE): ReplicationAdapter<any, VendureProductCheckpoint> => ({
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      if (batchSize > MAX_TAKE || variantPageSize > MAX_TAKE) throw new Error('Vendure Admin API take must not exceed 1000');
      let passHighWater = lastCheckpoint?.passHighWater ?? lastCheckpoint?.updatedAt ?? '';
      let skip = lastCheckpoint?.skip ?? 0;
      let passTotal = lastCheckpoint?.passTotal;
      if (!skip) {
        const head = await variants(context, 'id updatedAt', { take: 1, sort: { updatedAt: 'DESC' } });
        passHighWater = head.items[0]?.updatedAt ?? lastCheckpoint?.updatedAt ?? '';
        if (!head.items.length || (lastCheckpoint?.updatedAt && passHighWater === lastCheckpoint.updatedAt)) {
          return { documents: [], checkpoint: lastCheckpoint ?? { skip: 0, updatedAt: '' } };
        }
        for (const overlap of [1, 0]) {
          if (overlap === 0 && updatedAtSkewMs > 0) continue;
          const probe = await variants(context, 'id updatedAt', { take: 1, sort: { updatedAt: 'DESC' }, filter: {
            updatedAt: { after: new Date(Date.parse(passHighWater) + (overlap === 0 ? 1 : -1) - updatedAtSkewMs).toISOString() },
          } });
          if (overlap === 1 && probe.totalItems === 0) {
            throw new Error('Vendure updatedAt filters miss changes: run Vendure with TZ=UTC or set updatedAtSkewMs to at least the magnitude of the server UTC offset in milliseconds.');
          }
          if (overlap === 0 && probe.totalItems > 0) {
            console.warn('Vendure updatedAt filters over-fetch because the server is not in UTC.');
          }
        }
      }
      const filter = lastCheckpoint?.updatedAt
        // Vendure after is strict; overlap by 1 ms to include timestamp ties.
        ? { updatedAt: { after: new Date(Date.parse(lastCheckpoint.updatedAt) - 1 - updatedAtSkewMs).toISOString() } }
        : undefined;
      const page = (from: number) => variants(context, 'id productId', { take: variantPageSize, skip: from, sort: { id: 'ASC' }, filter });

      // RxDB stops pulling on a page shorter than batchSize, so keep reading
      // variant pages until enough parents are delivered or the pass ends.
      const seen = new Set<string>();
      const documents: Record<string, unknown>[] = [];
      let complete = false;
      while (!complete && documents.length < batchSize) {
        let data = await page(skip);
        if (skip > 0 && (!data.items.length || data.totalItems < (passTotal ?? data.totalItems))) {
          skip = 0; // Rows vanished mid-pass: restart; re-reads are harmless, skips are not.
          data = await page(0);
        }
        if (skip === 0) passTotal = data.totalItems;
        const parentIds = [...new Set(data.items.map((v) => String(v.productId)))].filter((id) => !seen.has(id));
        parentIds.forEach((id) => seen.add(id));
        if (parentIds.length) { // At most variantPageSize (<= MAX_TAKE) ids: one variant page's worth.
          const res = await gql(context, PRODUCT_LIST_QUERY(barcodeField), {
            options: { take: parentIds.length, filter: { id: { in: parentIds } } },
          });
          documents.push(...(res.data?.products?.items ?? []).map(toProductDocument));
        }
        skip += data.items.length;
        complete = skip >= data.totalItems || !data.items.length;
      }

      // Keep the lower bound fixed while paging by id; advance it only at pass end.
      // RxDB merges checkpoints, so explicitly clear pass state at completion.
      const checkpoint: VendureProductCheckpoint = complete
        ? { skip: 0, updatedAt: passHighWater, passHighWater: undefined, passTotal: undefined }
        : { skip, updatedAt: lastCheckpoint?.updatedAt ?? '', passHighWater, passTotal };
      return { documents, checkpoint };
    },
  },
});
