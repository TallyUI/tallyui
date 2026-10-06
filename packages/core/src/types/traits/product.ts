import type { ProductPrice } from '../money';
import type { StockLevel } from '../stock';

/** A flat product category: `id` is the backend's id as a string (unique per backend), `name` its label. */
export interface ProductCategory {
  id: string;
  name: string;
}

/** One purchasable variant of a product, in backend-neutral terms. */
export interface VariantSummary {
  /** Backend variant id; the id sent in order lines. */
  id: string;
  /** Variant label, e.g. 'S / White'; undefined when the backend has none. */
  title?: string;
  /**
   * The variant's value in each option group, keyed by group name. A group the variant accepts any value of
   * (WooCommerce "Any …") has no key. Undefined when the backend gives the variant no option groups.
   */
  options?: Record<string, string>;
  sku?: string;
  /** First non-empty of the backend's barcode fields. */
  barcode?: string;
  prices: ProductPrice[];
  stock: StockLevel;
}

/** One option group a product's variants are chosen by, e.g. Size with S, M and L. */
export interface VariantOptionGroup {
  /** The backend's id for the group, when it has one that tells apart groups with the same name. */
  id?: string;
  name: string;
  /** The group's values in the backend's order. */
  values: string[];
}

/**
 * Store-level facts a connector may need to interpret a raw document, for
 * backends whose documents omit them (WooCommerce product prices carry no
 * currency).
 */
export interface TraitContext {
  /** The store's ISO 4217 currency code. */
  currency?: string;
}

/**
 * Product traits — the stable interface that UI components program against.
 *
 * Each connector implements these accessors to extract standard product data
 * from its own schema shape. Components call these instead of reaching into
 * the raw document, so they work identically across WooCommerce, Medusa,
 * Vendure, Shopify, etc.
 *
 * The generic `Doc` type is the connector's raw RxDB document type.
 *
 * Price and stock are read through the backend-neutral `getPrices` and
 * `getStock`. The older string-price and WooCommerce-style stock accessors
 * remain for existing consumers and are deprecated.
 */
export interface ProductTraits<Doc = any> {
  /** Product display name */
  getName: (doc: Doc) => string;

  /** SKU / stock keeping unit */
  getSku: (doc: Doc) => string | undefined;

  /**
   * The product's price list: base prices, plus sale prices while a sale
   * applies, per currency. Pass the list to `resolvePrice` for the price to
   * charge. For variable products this describes the default variant.
   */
  getPrices: (doc: Doc, context?: TraitContext) => ProductPrice[];

  /** Stock state of the whole product across its variants; `quantity` is the total on hand when every variant is tracked, else undefined. */
  getStock: (doc: Doc) => StockLevel;

  /** All purchasable variants, in id order (connectors store variants sorted by id). Optional: connectors without variant support omit it. */
  getVariants?: (doc: Doc, context?: TraitContext) => VariantSummary[];

  /**
   * The option groups the product's variants are chosen by, in the backend's display order; [] when the product has
   * none. Optional: connectors without it leave pickers to `getVariants` titles.
   */
  getVariantOptions?: (doc: Doc) => VariantOptionGroup[];

  /**
   * The backend's tax class id for the variant `variantId`, or for the product (its default variant) when omitted.
   * The id is a key of `StoreSettings.taxRatesPpm`; undefined means the default class. Optional: without it, every
   * line is taxed at the default rate.
   */
  getTaxClass?: (doc: Doc, variantId?: string) => string | undefined;

  /**
   * Whether the variant `variantId` (or the product's default variant) is taxed: 'none' means the line carries no
   * tax. Undefined means taxable. Optional: without it, every line is taxable.
   */
  getTaxStatus?: (doc: Doc, variantId?: string) => 'taxable' | 'none' | undefined;

  /** @deprecated Use `getPrices` with `resolvePrice`. */
  getPrice: (doc: Doc) => string | undefined;

  /** Regular (non-sale) price. @deprecated Use `getPrices` with `resolvePrice`. */
  getRegularPrice: (doc: Doc) => string | undefined;

  /** Sale price, if on sale. @deprecated Use `getPrices` with `resolvePrice`. */
  getSalePrice: (doc: Doc) => string | undefined;

  /** Whether the product is currently on sale. @deprecated Use `getPrices` with `resolvePrice`. */
  isOnSale: (doc: Doc) => boolean;

  /** Primary image URL */
  getImageUrl: (doc: Doc) => string | undefined;

  /** All image URLs */
  getImageUrls: (doc: Doc) => string[];

  /** Short description / excerpt */
  getDescription: (doc: Doc) => string | undefined;

  /** Stock status. @deprecated Use `getStock`. */
  getStockStatus: (doc: Doc) => 'instock' | 'outofstock' | 'onbackorder' | 'unknown';

  /** Stock quantity (null if not tracked). @deprecated Use `getStock`. */
  getStockQuantity: (doc: Doc) => number | null;

  /** Whether this product has variants/variations */
  hasVariants: (doc: Doc) => boolean;

  /** Whether the product may be sold at the register now: published/active, not a draft, archived or disabled. */
  isSellable: (doc: Doc) => boolean;

  /** Number of purchasable variants; 1 for a simple product. */
  getVariantCount: (doc: Doc) => number;

  /** Product type (simple, variable, etc. — connector-specific but useful for UI hints) */
  getType: (doc: Doc) => string;

  /** Barcode / UPC / EAN */
  getBarcode: (doc: Doc) => string | undefined;

  /** Categories as simple label strings */
  getCategoryNames: (doc: Doc) => string[];

  /**
   * The product's categories as `{ id, name }`, in the document's order, without entries that have no name.
   * Optional: without it, the pos category helpers use `getCategoryNames` with each name as its id.
   */
  getCategories?: (doc: Doc) => ProductCategory[];

  /** The connector-specific unique ID (as string for consistency) */
  getId: (doc: Doc) => string;
}
