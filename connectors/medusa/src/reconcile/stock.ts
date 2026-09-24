import type { StockReconcileAdapter } from '@tallyui/core';

type Level = { stocked_quantity: number; reserved_quantity: number };

/** Admin API list limit; about 6 requests for 5,000 inventory items. */
const PAGE_SIZE = 1000;
const FIELDS = 'id,location_levels.stocked_quantity,location_levels.reserved_quantity,location_levels.location_id';

/**
 * Sorted quantity pairs. Local documents carry no location_id, so compare
 * quantities only and a first pass does not rewrite every document.
 */
const pairsKey = (levels: Level[] = []) =>
  levels.map((l) => JSON.stringify([l.stocked_quantity, l.reserved_quantity])).sort().join();

/**
 * Stock reconciler for Medusa v2 products (ADR-060). Inventory changes never
 * touch the product, so replication misses them. Pages are keyed by
 * inventory item id; each value is its location levels' quantities.
 */
export const medusaStockReconcile: StockReconcileAdapter = {
  async *fetchPages(context) {
    for (let offset = 0, count = 1; offset < count; offset += PAGE_SIZE) {
      // Offset paging needs a total order, or items can be skipped or repeated between pages.
      const params = new URLSearchParams({ limit: String(PAGE_SIZE), offset: String(offset), fields: FIELDS, order: 'id' });
      const response = await fetch(`${context.baseUrl}/admin/inventory-items?${params}`, {
        headers: { ...context.headers, 'Content-Type': 'application/json' },
        signal: context.signal,
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(`Medusa API error: ${response.status}${error?.message ? `: ${error.message}` : ''}`);
      }
      const data = await response.json() as { inventory_items: Array<{ id: string; location_levels?: Level[] }>; count: number };
      count = data.count;
      yield new Map(data.inventory_items.map((item) => [item.id, (item.location_levels ?? [])
        .map(({ stocked_quantity, reserved_quantity }) => ({ stocked_quantity, reserved_quantity }))]));
    }
  },
  patch(doc, stock) {
    let changed = false;
    const variants = (doc.variants ?? []).map((variant: any) => {
      let variantChanged = false;
      const inventory_items = (variant.inventory_items ?? []).map((item: any) => {
        const levels = stock.get(item.inventory_item_id) as Level[] | undefined;
        if (!levels || pairsKey(levels) === pairsKey(item.inventory?.location_levels)) return item;
        variantChanged = true;
        return { ...item, inventory: { ...item.inventory, location_levels: levels } };
      });
      if (!variantChanged) return variant;
      changed = true;
      return { ...variant, inventory_items };
    });
    return changed ? { variants } : undefined;
  },
};
