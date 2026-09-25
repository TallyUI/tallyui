import { combinePullAdapters, createReconcileFeed, type TallyConnector } from '@tallyui/core';

import { vendureAuth } from './auth';
import { vendureProductSchema } from './schemas/products';
import { createVendureProductTraits } from './traits/product';
import { createVendureProductSync } from './sync/products';
import { createVendureProductReplication } from './replication/products';
import { createVendureVariantFeedReplication } from './replication/variant-feed';
import { vendureStockReconcile } from './reconcile/stock';
import { createFetchByIds, fetchPages, variantIds } from './reconcile/ids';
import { vendureStoreSettings } from './store-settings';
import { vendureGlobalStockSettings } from './global-settings';

/**
 * Vendure connector for Tally UI.
 *
 * Connects to Vendure backends via the Admin GraphQL API.
 * Products are stored in RxDB using a schema that mirrors the Vendure API shape.
 *
 * ```ts
 * import { vendureConnector } from '@tallyui/connector-vendure';
 * import { ConnectorProvider } from '@tallyui/core';
 *
 * <ConnectorProvider connector={vendureConnector}>
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
      ids: { fetchPages, variantIds, enqueue: idFeed.enqueue },
    },

    storeSettings: vendureStoreSettings,
  };
};

export const vendureConnector = createVendureConnector();

// Re-export pieces for advanced usage
export { vendureAuth, vendureSignIn } from './auth';
export { vendureProductSchema } from './schemas/products';
export { vendureProductTraits } from './traits/product';
export { vendureProductSync } from './sync/products';
export { createVendureProductReplication, vendureProductReplication } from './replication/products';
export { createVendureVariantFeedReplication } from './replication/variant-feed';
export { vendureStockReconcile } from './reconcile/stock';
export { vendureStoreSettings } from './store-settings';
export { vendureGlobalStockSettings } from './global-settings';
