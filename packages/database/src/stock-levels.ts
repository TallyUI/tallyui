import type { RxJsonSchema } from 'rxdb';

/** Collection holding the stock reconcile overlay (ADR-060). Local only: never replicated. */
export const STOCK_LEVELS_COLLECTION = 'stock_levels';

/** One overlay row: the connector's stock value for one key (Vendure variant id, Medusa inventory item id). */
export interface StockLevelRow {
  id: string;
  /** The value `fetchPages` gave for this key, stored as is. */
  value: unknown;
  /** ISO 8601 time of the pass that wrote the row. */
  updatedAt: string;
}

export const stockLevelsSchema: RxJsonSchema<StockLevelRow> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 255 },
    // Untyped: any JSON value the connector yields.
    value: {},
    updatedAt: { type: 'string' },
  },
  required: ['id', 'value', 'updatedAt'],
};
