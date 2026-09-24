import type { ProductPrice } from '../money';
import type { StockLevel } from '../stock';

/** One purchasable variant of a product, in backend-neutral terms. */
export interface VariantSummary {
  /** Backend variant id; the id sent in order lines. */
  id: string;
  /** Variant label, e.g. 'S / White'; undefined when the backend has none. */
  title?: string;
  sku?: string;
  /** First non-empty of the backend's barcode fields. */
  barcode?: string;
  prices: ProductPrice[];
  stock: StockLevel;
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

  /** The connector-specific unique ID (as string for consistency) */
  getId: (doc: Doc) => string;
}
