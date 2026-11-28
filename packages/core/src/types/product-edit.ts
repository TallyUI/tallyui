import type { SyncContext } from './connector';
import { CustomerServiceError } from './customers';

/** One product, or one of its variants, that a till edits. */
export interface ProductEditTarget { productId: string; variantId?: string }

/** A stored price: integer minor units of `currency`, on the stated tax basis. The connector converts; the UI never does. */
export interface ProductEditPrice { amount: number; currency: string; taxInclusive: boolean }

/** The currency and tax basis a price edit was opened on, copied from the snapshot. */
export interface ProductEditBasis { currency: string; taxInclusive: boolean }

/**
 * What this one target can edit, read fresh from the store, bound to the one record a write would touch.
 * A key is present only when the target maps to exactly one writable record; otherwise the field is read-only.
 */
export interface ProductEditSnapshot {
  basePrice?: ProductEditPrice;
  /** `amount: null` = no sale price set. */
  salePrice?: { amount: number | null; currency: string; taxInclusive: boolean };
  /** The stored on-hand count at one location, never a displayed "available" figure. `quantity: null` = tracked but unset. */
  stockOnHand?: { quantity: number | null; location?: { id: string; name: string } };
  manageStock?: { value: 'on' | 'off' | 'inherit' };
}

/** Exactly one field per call: `from` is the value the edit was opened on, `to` the new value. Copy a price's basis or stock's `location?.id ?? null` from that snapshot. */
export type ProductEditChange =
  | { field: 'basePrice'; from: number; to: number; basis: ProductEditBasis }
  | { field: 'salePrice'; from: number | null; to: number | null; basis: ProductEditBasis }
  | { field: 'stockOnHand'; from: number | null; to: number; locationId: string | null }
  | { field: 'manageStock'; from: 'on' | 'off' | 'inherit'; to: 'on' | 'off' };

/** The one field named by a change. */
export type ProductEditField = ProductEditChange['field'];

/** The store's answer to a one-field edit. */
export type ProductEditResult =
  /** The store's values after the write. */
  | { status: 'saved'; snapshot: ProductEditSnapshot }
  /** The store already held `to`; nothing was written. Never show this as the cashier's own save or proof an earlier send landed. */
  | { status: 'already'; snapshot: ProductEditSnapshot }
  /** Nothing was written; `snapshot` is the store's fresh value. */
  | { status: 'conflict'; snapshot: ProductEditSnapshot }
  | { status: 'refused'; code: 'invalid' | 'forbidden' | 'not_found'; message?: string };

/** `update` wrote, and the store's answer shows prices other than those sent; nothing is repaired. Show the message and keep it on screen. */
export class ProductEditPricesChangedError extends CustomerServiceError {
  /** Each changed, missing or new price id; the edited price is included when it did not show the amount sent. */
  readonly priceIds: readonly string[];
  constructor(priceIds: readonly string[], options?: { status?: number }) {
    super('server', `Prices on this product changed unexpectedly (${priceIds.join(', ')}). Check them in the store's admin.`, options);
    this.name = 'ProductEditPricesChangedError';
    this.priceIds = priceIds;
  }
}

/** Online only. Both methods reject with `ConnectorUnauthorizedError` for credentials and `CustomerServiceError` for transport failures. A rejection from `update` does not prove nothing was written: `ProductEditPricesChangedError` means the write landed; read again. */
export interface ProductEdit {
  /** Read when the edit opens. `null` means nothing on this target is editable. */
  read(context: SyncContext, target: ProductEditTarget): Promise<ProductEditSnapshot | null>;
  /** Submit exactly one field for the target. */
  update(context: SyncContext, target: ProductEditTarget, change: ProductEditChange): Promise<ProductEditResult>;
}

/** Compare against the fresh store value before writing (ADR-095). A resend that finds `to` does not write again. */
export function decideProductEdit(change: ProductEditChange, fresh: ProductEditSnapshot | null): { action: 'write' } | ProductEditResult {
  let current: ProductEditChange['from'] | undefined;
  if ((change.field === 'basePrice' || change.field === 'salePrice') &&
      (typeof change.basis?.currency !== 'string' || typeof change.basis?.taxInclusive !== 'boolean')) return { status: 'refused', code: 'invalid' };
  switch (change.field) {
    case 'basePrice':
      if (!Number.isSafeInteger(change.to) || change.to < 0) return { status: 'refused', code: 'invalid' };
      current = fresh?.basePrice?.amount;
      break;
    case 'salePrice':
      if (change.to !== null && (!Number.isSafeInteger(change.to) || change.to < 0)) return { status: 'refused', code: 'invalid' };
      current = fresh?.salePrice?.amount;
      break;
    case 'stockOnHand':
      if ((typeof change.locationId !== 'string' && change.locationId !== null) || !Number.isSafeInteger(change.to)) return { status: 'refused', code: 'invalid' };
      current = fresh?.stockOnHand?.quantity;
      break;
    case 'manageStock':
      if (change.to !== 'on' && change.to !== 'off') return { status: 'refused', code: 'invalid' };
      current = fresh?.manageStock?.value;
      break;
  }
  if (fresh === null) return { status: 'refused', code: 'not_found' };
  if (current === undefined) return { status: 'conflict', snapshot: fresh };
  if (change.field === 'stockOnHand' && (fresh.stockOnHand?.location?.id ?? null) !== change.locationId) return { status: 'conflict', snapshot: fresh };
  if (change.field === 'basePrice' || change.field === 'salePrice') {
    const price = fresh[change.field];
    if (price?.currency !== change.basis.currency || price.taxInclusive !== change.basis.taxInclusive) return { status: 'conflict', snapshot: fresh };
  }
  if (current === change.to) return { status: 'already', snapshot: fresh };
  if (current === change.from) return { action: 'write' };
  return { status: 'conflict', snapshot: fresh };
}
