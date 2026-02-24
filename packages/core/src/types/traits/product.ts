/**
 * Product traits — the stable interface that UI components program against.
 *
 * Each connector implements these accessors to extract standard product data
 * from its own schema shape. Components call these instead of reaching into
 * the raw document, so they work identically across WooCommerce, Medusa,
 * Vendure, Shopify, etc.
 *
 * The generic `Doc` type is the connector's raw RxDB document type.
 */
export interface ProductTraits<Doc = any> {
  /** Product display name */
  getName: (doc: Doc) => string;

  /** SKU / stock keeping unit */
  getSku: (doc: Doc) => string | undefined;

  /** Current selling price as a string (connector-native format) */
  getPrice: (doc: Doc) => string | undefined;

  /** Regular (non-sale) price */
  getRegularPrice: (doc: Doc) => string | undefined;

  /** Sale price, if on sale */
  getSalePrice: (doc: Doc) => string | undefined;

  /** Whether the product is currently on sale */
  isOnSale: (doc: Doc) => boolean;

  /** Primary image URL */
  getImageUrl: (doc: Doc) => string | undefined;

  /** All image URLs */
  getImageUrls: (doc: Doc) => string[];

  /** Short description / excerpt */
  getDescription: (doc: Doc) => string | undefined;

  /** Stock status */
  getStockStatus: (doc: Doc) => 'instock' | 'outofstock' | 'onbackorder' | 'unknown';

  /** Stock quantity (null if not tracked) */
  getStockQuantity: (doc: Doc) => number | null;

  /** Whether this product has variants/variations */
  hasVariants: (doc: Doc) => boolean;

  /** Product type (simple, variable, etc. — connector-specific but useful for UI hints) */
  getType: (doc: Doc) => string;

  /** Barcode / UPC / EAN */
  getBarcode: (doc: Doc) => string | undefined;

  /** Categories as simple label strings */
  getCategoryNames: (doc: Doc) => string[];

  /** The connector-specific unique ID (as string for consistency) */
  getId: (doc: Doc) => string;
}
