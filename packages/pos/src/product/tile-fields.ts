/**
 * Which words a catalogue grid tile shows (vendurepos gap 9.9). Device-local, kept in app_settings as
 * `catalogue.tileFields`. v2 provenance: WCPOS monorepo `core/src/screens/main/pos/products/ui-settings-form.tsx`
 * (`gridFields`, nine switches). TallyUI's keys are camelCase; v2's tax and cost_of_goods_sold are not here yet.
 */
export const TILE_FIELDS = ['name', 'price', 'onSale', 'categories', 'sku', 'barcode', 'stock'] as const;
export type TileField = (typeof TILE_FIELDS)[number];
export type TileFields = Readonly<Record<TileField, boolean>>;

/** Today's tile: name, price with its on-sale strike, and the stock status. Desk 19 Nov (Q6): the default stays today's. */
export const DEFAULT_TILE_FIELDS: TileFields = Object.freeze({
  name: true, price: true, onSale: true, categories: false, sku: false, barcode: false, stock: true,
});

/**
 * Each field takes the value's own boolean, else its default, so a value stored before a field was added keeps its
 * switches. Unknown keys are dropped; a non-object (including an array) gives `undefined`.
 */
export function normalizeTileFields(value: unknown): TileFields | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const fields = {} as Record<TileField, boolean>;
  for (const field of TILE_FIELDS) {
    const own = Object.hasOwn(value, field) ? (value as Record<string, unknown>)[field] : undefined;
    fields[field] = typeof own === 'boolean' ? own : DEFAULT_TILE_FIELDS[field];
  }
  return fields;
}
