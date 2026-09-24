import { describe, it, afterEach } from 'vitest';

import { createTallyDatabase, type TallyDatabase } from '@tallyui/database';
import { woocommerceConnector } from '@tallyui/connector-woocommerce';
import { medusaConnector } from '@tallyui/connector-medusa';

import { wooSampleProducts, medusaSampleProducts } from './sample-data';

/**
 * Regression test for backlog 37: the demo's sample data must validate
 * against each connector's real RxDB schema (dev-mode validation on), the
 * same way a live sync would. Insert every sample product one at a time so
 * a failure names the product that broke the schema.
 */
describe('demo sample data seeds validated collections', () => {
  const databases: TallyDatabase[] = [];

  afterEach(async () => {
    await Promise.all(databases.splice(0).map((db) => db.close()));
  });

  it('inserts every WooCommerce sample product', async () => {
    const db = await createTallyDatabase({
      connector: woocommerceConnector,
      name: `test_woo_seed_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    databases.push(db);

    for (const product of wooSampleProducts) {
      try {
        await db.products.insert(product);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `WooCommerce sample product "${product.name}" (id ${product.id}) failed schema validation: ${reason}`
        );
      }
    }
  });

  it('inserts every Medusa sample product', async () => {
    const db = await createTallyDatabase({
      connector: medusaConnector,
      name: `test_medusa_seed_${Date.now()}_${Math.random().toString(36).slice(2)}`,
    });
    databases.push(db);

    for (const product of medusaSampleProducts) {
      try {
        await db.products.insert(product);
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(
          `Medusa sample product "${product.title}" (id ${product.id}) failed schema validation: ${reason}`
        );
      }
    }
  });
});
