import type { StockReconcileAdapter } from '@tallyui/core';

import { gql } from '../replication/products';

type StockLevel = { stockLocationId: string; stockOnHand: number; stockAllocated: number };

/** Admin API maximum `take`. */
const PAGE_SIZE = 1000;

const VARIANT_STOCK_QUERY = `
  query VariantStock($options: ProductVariantListOptions) {
    productVariants(options: $options) {
      items { id stockLevels { stockLocationId stockOnHand stockAllocated } }
      totalItems
    }
  }
`;

/** Compared by value as sorted tuples; neither key nor level order is guaranteed. */
const levelsKey = (levels: StockLevel[] = []) =>
  levels.map((l) => JSON.stringify([l.stockLocationId, l.stockOnHand, l.stockAllocated])).sort().join();

/**
 * Stock reconciler for Vendure products (ADR-060). Stock edits bump only the
 * variant's updatedAt and allocations bump nothing, so replication misses them.
 * Pages are keyed by variant id; each value is the variant's stockLevels.
 */
export const vendureStockReconcile: StockReconcileAdapter = {
  async *fetchPages(context) {
    for (let skip = 0, total = 1; skip < total; skip += PAGE_SIZE) {
      const body = await gql(context, VARIANT_STOCK_QUERY, { options: { take: PAGE_SIZE, skip, sort: { id: 'ASC' } } });
      const { items, totalItems } = body.data.productVariants as { items: Array<{ id: string; stockLevels: StockLevel[] }>; totalItems: number };
      total = totalItems;
      yield new Map(items.map((v) => [v.id, v.stockLevels]));
    }
  },
  patch(doc, stock) {
    const variants: any[] = doc.variants ?? [];
    let changed = false;
    const next = variants.map((v) => {
      const levels = stock.get(v.id) as StockLevel[] | undefined;
      if (!levels || levelsKey(levels) === levelsKey(v.stockLevels)) return v;
      changed = true;
      return { ...v, stockLevels: levels };
    });
    return changed ? { variants: next } : undefined;
  },
};
