import type { TallyConnector } from '@tallyui/core';

import { vendureAuth } from './auth';
import { vendureProductSchema } from './schemas/products';
import { createVendureProductTraits } from './traits/product';
import { createVendureProductSync } from './sync/products';
import { createVendureProductReplication } from './replication/products';
import { createVendureVariantFeedReplication } from './replication/variant-feed';
import { vendureStockReconcile } from './reconcile/stock';

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
 * `pricesIncludeTax` must equal the POS tax setting (`TaxContext.pricesIncludeTax`)
 * until TV4 reads both from one store-settings call.
 */
export const createVendureConnector = (options: { barcodeField?: string; stockLocationId?: string; pricesIncludeTax?: boolean; updatedAtSkewMs?: number } = {}): TallyConnector => ({
  id: 'vendure',
  name: 'Vendure',
  description: 'Connect to Vendure backends via the Admin GraphQL API',
  icon: undefined,

  auth: vendureAuth,

  schemas: {
    products: vendureProductSchema,
  },

  traits: {
    product: createVendureProductTraits(options.barcodeField, options.stockLocationId, options.pricesIncludeTax),
  },

  sync: {
    products: createVendureProductSync(options.barcodeField),
  },

  replication: {
    products: createVendureProductReplication(options.barcodeField, options.updatedAtSkewMs),
    // Second pull on the products collection, with its own replicationIdentifier (ADR-060).
    productVariantFeed: createVendureVariantFeedReplication(options.barcodeField, options.updatedAtSkewMs),
  },

  reconcile: {
    stock: vendureStockReconcile,
  },
});

export const vendureConnector = createVendureConnector();

// Re-export pieces for advanced usage
export { vendureAuth, vendureSignIn } from './auth';
export { vendureProductSchema } from './schemas/products';
export { vendureProductTraits } from './traits/product';
export { vendureProductSync } from './sync/products';
export { vendureProductReplication } from './replication/products';
export { createVendureVariantFeedReplication } from './replication/variant-feed';
export { vendureStockReconcile } from './reconcile/stock';
