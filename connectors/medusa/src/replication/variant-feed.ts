import type { ReplicationAdapter, SyncContext } from '@tallyui/core';
import { fetchByIds } from '../reconcile/ids';
import { MEDUSA_PRODUCT_FIELDS, toDocument, type MedusaProductCheckpoint } from './products';

/** Admin API list limit (ADR-060); the default variant page size. */
const MAX_LIMIT = 1000;

async function get(path: string, context: SyncContext) {
  const response = await fetch(`${context.baseUrl}${path}`, {
    headers: { ...context.headers, 'Content-Type': 'application/json' },
    signal: context.signal,
  });
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(`Medusa API error: ${response.status}${error?.message ? `: ${error.message}` : ''}`);
  }
  return response.json();
}

/**
 * Variant feed for Medusa products (ADR-060, amendment 8).
 *
 * On Medusa 2.21 a price-only edit bumps the variant's `updated_at` but not
 * the product's, through both the admin's batch route and the single-variant
 * route, so the product feed never sees it. This pull adapter pages changed
 * variants with the same pass and offset design as `medusaProductReplication`
 * and re-delivers their parent products, re-fetched with the id reconcile's
 * `fetchByIds` in the same document shape, into the `products` collection.
 * It runs as a sub-adapter of the connector's combined `replication.products`
 * adapter (`combinePullAdapters`), not as its own replication. Parents that
 * no longer exist are skipped; deletions are the id reconcile's job.
 *
 * With no checkpoint, the first pass re-delivers every product that has
 * variants, once. That is deliberate: it heals any price change the product
 * feed missed before this feed existed.
 *
 * `variantPageSize` (the variant page `limit`) is for tests and tuning.
 */
export const createMedusaVariantFeedReplication = (variantPageSize = MAX_LIMIT): ReplicationAdapter<any, MedusaProductCheckpoint> => ({
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      let offset = lastCheckpoint?.offset ?? 0;
      let passMark = lastCheckpoint?.pass_mark ?? lastCheckpoint?.updated_at ?? '';
      let passCount = lastCheckpoint?.pass_count;
      if (offset === 0 && lastCheckpoint?.pass_mark === undefined) {
        const markData = await get('/admin/product-variants?limit=1&order=-updated_at&fields=id,updated_at', context);
        passMark = markData.variants?.[0]?.updated_at ?? passMark;
        if (lastCheckpoint?.updated_at && passMark === lastCheckpoint.updated_at) {
          return { documents: [], checkpoint: lastCheckpoint };
        }
      }
      const page = (from: number): Promise<{ variants?: Array<{ product_id: string }>; count: number }> => {
        // Offsets need a total order, so page by the unique id within the fixed updated_at window.
        const params = new URLSearchParams({ limit: String(variantPageSize), offset: String(from), order: 'id', fields: 'id,product_id' });
        // Medusa 2.21 honours only the operator form; `updated_at[gte]` is silently dropped.
        // The columns are timestamptz and `$gte` includes ties, as in the product feed.
        if (lastCheckpoint?.updated_at) params.set('updated_at[$gte]', lastCheckpoint.updated_at);
        return get(`/admin/product-variants?${params}`, context);
      };

      // RxDB stops pulling on a page shorter than batchSize, so keep reading
      // variant pages until enough parents are delivered or the pass ends.
      // Count delivered documents, not parent ids, as Vendure's feed does, so
      // deleted parents (skipped) never cut a call short mid-pass.
      const seen = new Set<string>();
      const documents: Record<string, unknown>[] = [];
      let complete = false;
      while (!complete && documents.length < batchSize) {
        let data = await page(offset);
        if (offset > 0 && (!data.variants?.length || data.count < (passCount ?? data.count))) {
          offset = 0; // Rows vanished mid-pass: restart; re-reads are harmless, skips are not.
          data = await page(0);
        }
        const variants = data.variants ?? [];
        if (offset === 0) passCount = data.count;
        const parentIds = [...new Set(variants.map((v) => String(v.product_id)))].filter((id) => !seen.has(id));
        parentIds.forEach((id) => seen.add(id));
        if (parentIds.length) {
          documents.push(...(await fetchByIds(parentIds, context)).map((doc) => ({ ...doc, _deleted: false })));
        }
        offset += variants.length;
        complete = offset >= data.count || !variants.length;
      }

      // Keep the lower bound fixed while paging by id; advance it only at pass end.
      // RxDB merges checkpoints, so explicitly clear pass state at completion.
      const checkpoint: MedusaProductCheckpoint = complete
        ? { offset: 0, updated_at: passMark, pass_mark: undefined, pass_count: undefined }
        : { offset, updated_at: lastCheckpoint?.updated_at ?? '', pass_mark: passMark, pass_count: passCount };
      // RxDB saves no checkpoint from an empty page. If this call's variant
      // pages mapped to no live parents but the cursor moved, the cursor would
      // stick mid-pass and a later change below it would be lost. Carry the
      // checkpoint on one current product; re-delivering it is harmless.
      const moved = (['offset', 'updated_at', 'pass_mark', 'pass_count'] as const)
        .some((key) => checkpoint[key] !== lastCheckpoint?.[key]);
      if (!documents.length && moved) {
        const carrier = await get(`/admin/products?${new URLSearchParams({ limit: '1', fields: MEDUSA_PRODUCT_FIELDS })}`, context);
        documents.push(...(carrier.products ?? []).map((p: Record<string, unknown>) => ({ ...toDocument(p), _deleted: false })));
      }
      return { documents, checkpoint };
    },
  },
});
