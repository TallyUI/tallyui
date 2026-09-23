/**
 * Backend-neutral stock state.
 *
 * - `in_stock`: sellable now. `quantity` is set when the backend tracks it.
 * - `out_of_stock`: tracked and none left; not sellable.
 * - `backorder`: none left but the backend accepts orders anyway.
 * - `unknown`: the backend did not say.
 *
 * `quantity` is undefined when stock is not tracked, which is different from
 * a tracked quantity of 0.
 */
export type StockStatus = 'in_stock' | 'out_of_stock' | 'backorder' | 'unknown';

export interface StockLevel {
  status: StockStatus;
  /** Units on hand, when tracked. May be negative on backorder. */
  quantity?: number;
}
