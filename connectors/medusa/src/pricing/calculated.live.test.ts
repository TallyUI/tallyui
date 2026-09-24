// @vitest-environment node
// Read-only: changes nothing on the server. It never prints the publishable key.
import { describe, expect, it, vi } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { SyncContext } from '@tallyui/core';
import { startFingerprintReconcile } from '@tallyui/database';
import { medusaAdminUserAuth, medusaConnector, medusaProductSchema } from '../index';
import { medusaStoreSettings } from '../store-settings';
import { fetchByIds, fetchPages } from '../reconcile/ids';

addRxPlugin(RxDBDevModePlugin);

const { MEDUSA_DEV_URL, MEDUSA_DEV_EMAIL, MEDUSA_DEV_PASSWORD } = process.env;

describe.skipIf(!MEDUSA_DEV_URL || !MEDUSA_DEV_EMAIL || !MEDUSA_DEV_PASSWORD)('live Medusa calculated prices', () => {
  it('prices documents through the store API, and a full calculated-price pass against them finds no drift', async () => {
    const baseUrl = MEDUSA_DEV_URL!;
    const { token } = await medusaAdminUserAuth.signIn!(baseUrl, { email: MEDUSA_DEV_EMAIL!, password: MEDUSA_DEV_PASSWORD! });
    const admin: SyncContext = { connectorId: 'medusa', baseUrl, headers: medusaAdminUserAuth.getHeaders({ token }) };
    const settings = await medusaStoreSettings(admin, { country: 'de' });
    expect(settings.pricingContext).toBeDefined();
    const context: SyncContext = { ...admin, pricingContext: settings.pricingContext };

    // One fetchByIds page (100 products), enriched; then the whole catalogue, for the pass below.
    const ids: string[] = [];
    for await (const page of fetchPages(admin)) ids.push(...page.map((p) => p.id));
    const firstPage = await fetchByIds(ids.slice(0, 100), context);
    const docs = await fetchByIds(ids, context);
    const traits = medusaConnector.traits.product;
    const onSale = (list: Record<string, unknown>[]) => list.filter((doc) => traits.getPrices(doc).some((p) => p.kind === 'sale')).length;
    const variantsOnSale = docs.flatMap((doc) => traits.getVariants!(doc)).filter((v) => v.prices.some((p) => p.kind === 'sale')).length;
    console.log(`calculated prices: getPrices shows a sale on ${onSale(firstPage)} of the first 100 products and ${onSale(docs)} of ${docs.length}; ${variantsOnSale} variants are on sale`);
    // medusa-dev has one price list (1,386 prices). If none of it is a sale, this reports it rather than fails.
    if (onSale(docs) === 0) console.log('calculated prices: no sale price found; medusa-dev\'s price list may be an override list');

    const db = await createRxDatabase({
      name: `medusa_calculated_live_${Date.now()}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: { schema: medusaProductSchema } });
    await db.products.bulkInsert(docs);

    // Count the pass's requests and bytes by wrapping fetch.
    const realFetch = globalThis.fetch;
    let requests = 0;
    let bytes = 0;
    const spy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const response = await realFetch(input, init);
      requests++;
      bytes += (await response.clone().arrayBuffer()).byteLength;
      return response;
    });
    const runner = startFingerprintReconcile({
      collection: db.products, adapter: medusaConnector.reconcile!.calculatedPrices!, context, reSync: () => {}, maxPages: 1000,
    });
    const started = performance.now();
    const result = await runner.reconcile();
    const ms = Math.round(performance.now() - started);
    spy.mockRestore();
    console.log(`calculated-price pass: ${requests} requests, ${ms} ms, ${bytes} bytes, pages ${result.pages}, compared ${result.compared}, unreported ${result.unreported}`);
    expect(result.truncated).toBe(false);
    expect(result.queued).toBe(0);
    runner.stop();
    await db.close();
  }, 180000);
});
