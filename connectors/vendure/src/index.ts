import { combinePullAdapters, createReconcileFeed, type TallyConnector } from '@tallyui/core';

import { vendureAuth } from './auth';
import { readVendureCapabilities } from './capabilities';
import { vendureProductSchema } from './schemas/products';
import { createVendureProductTraits } from './traits/product';
import { createVendureProductSync } from './sync/products';
import { createVendureProductReplication } from './replication/products';
import { createVendureVariantFeedReplication } from './replication/variant-feed';
import { vendureStockReconcile } from './reconcile/stock';
import { createFetchByIds, fetchPages, variantIds } from './reconcile/ids';
import { fetchPages as fetchPricePages, fingerprint as priceFingerprint } from './reconcile/prices';
import { vendureStoreSettings } from './store-settings';
import { vendureGlobalStockSettings } from './global-settings';
import { searchVendureCustomers, createVendureCustomer, getVendureCustomer } from './customers';

/** Ids per fetchByIds request: it sends the reconcile feed's whole chunk (at most 1,000 ids, ADR-060) in one query. */
const VENDURE_IDS_PER_REQUEST = 1000;

/**
 * Vendure connector for Tally UI. Build one per store session, anew on each sign-in or store change:
 * each instance owns its reconcile feed, whose queued work must never reach another store's database (#307).
 *
 * Connects to Vendure backends via the Admin GraphQL API.
 * Products are stored in RxDB using a schema that mirrors the Vendure API shape.
 *
 * ```ts
 * import { createVendureConnector } from '@tallyui/connector-vendure';
 * import { ConnectorProvider } from '@tallyui/core';
 *
 * const connector = useMemo(() => createVendureConnector({ pricesIncludeTax }), [backendUrl, pricesIncludeTax]);
 * <ConnectorProvider connector={connector}>
 *   <App />
 * </ConnectorProvider>
 * ```
 *
 * `pricesIncludeTax` must equal the POS tax setting (`TaxContext.pricesIncludeTax`);
 * pass `settings.pricesIncludeTax` from `storeSettings`. `globalTrackInventory`
 * and `globalOutOfStockThreshold` are the channel's stock defaults; read them
 * with `vendureGlobalStockSettings` after sign-in, like `pricesIncludeTax`
 * from `storeSettings`.
 */
export const createVendureConnector = (options: {
  barcodeField?: string; stockLocationId?: string; pricesIncludeTax?: boolean; updatedAtSkewMs?: number;
  globalTrackInventory?: boolean; globalOutOfStockThreshold?: number;
} = {}): TallyConnector => {
  // The id reconcile's corrections reach `products` only through this pull adapter (ADR-060).
  const idFeed = createReconcileFeed({ fetchByIds: createFetchByIds(options.barcodeField) });
  return {
    id: 'vendure',
    name: 'Vendure',
    description: 'Connect to Vendure backends via the Admin GraphQL API',
    icon: undefined,

    auth: vendureAuth,

    schemas: {
      products: vendureProductSchema,
    },

    traits: {
      product: createVendureProductTraits(
        options.barcodeField, options.stockLocationId, options.pricesIncludeTax,
        options.globalTrackInventory, options.globalOutOfStockThreshold,
      ),
    },

    sync: {
      products: createVendureProductSync(options.barcodeField),
    },

    replication: {
      // One replication per collection: the product, variant and id-reconcile feeds
      // share it (ADR-060). reconcile is last so its fetch wins duplicates.
      products: combinePullAdapters({
        products: createVendureProductReplication(options.barcodeField, options.updatedAtSkewMs),
        variants: createVendureVariantFeedReplication(options.barcodeField, options.updatedAtSkewMs),
        reconcile: idFeed.adapter,
      }, { legacyKey: 'products' }),
    },

    reconcile: {
      stock: vendureStockReconcile,
      ids: { fetchPages, variantIds, enqueue: idFeed.enqueue, refetchBatchSize: VENDURE_IDS_PER_REQUEST },
      prices: { fetchPages: fetchPricePages, fingerprint: priceFingerprint, enqueue: idFeed.enqueue, refetchBatchSize: VENDURE_IDS_PER_REQUEST },
    },

    storeSettings: vendureStoreSettings,

    // Needs the administrator's ReadCustomer permission (and CreateCustomer to create).
    searchCustomers: searchVendureCustomers,
    createCustomer: createVendureCustomer,
    getCustomer: getVendureCustomer,

    // Re-reads a restored session's capabilities; with an API key and no sign-in, the only reader.
    capabilities: (context) => readVendureCapabilities(context.baseUrl, context.headers, { signal: context.signal }),
  };
};

/**
 * @deprecated One instance for the whole app: a store switch can leak queued reconcile work across stores.
 * Use createVendureConnector() per store session. Removed in 4.0.
 */
export const vendureConnector = createVendureConnector();

// Re-export pieces for advanced usage
export { vendureAuth, vendureAuthFieldSets, vendureSignIn, type VendureCredentialKind, type VendureCredentials } from './auth';
export { vendureProductSchema } from './schemas/products';
export { vendureProductTraits } from './traits/product';
export { vendureProductSync } from './sync/products';
export { createVendureProductReplication, vendureProductReplication } from './replication/products';
export { createVendureVariantFeedReplication } from './replication/variant-feed';
export { vendureStockReconcile } from './reconcile/stock';
export { vendureStoreSettings } from './store-settings';
export { vendureGlobalStockSettings } from './global-settings';
export { searchVendureCustomers, createVendureCustomer, getVendureCustomer, toVendureCustomer } from './customers';

export { ConnectorUnauthorizedError } from '@tallyui/core';
export { VendureTimezoneConfigError } from './replication/products';
