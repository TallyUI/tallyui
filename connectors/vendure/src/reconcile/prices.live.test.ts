// @vitest-environment node
// Read-only: changes nothing on the server (queries plus the login mutation only).
import { describe, expect, it } from 'vitest';
import { addRxPlugin, createRxDatabase } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import type { SyncContext } from '@tallyui/core';
import { connectorCollection, startFingerprintReconcile } from '@tallyui/database';
import { createVendureConnector } from '../index';
import { vendureProductSchema } from '../schemas/products';
import { createFetchByIds } from './ids';
import { gql } from '../replication/products';

addRxPlugin(RxDBDevModePlugin);

const { VENDURE_DEV_URL, VENDURE_DEV_USER, VENDURE_DEV_PASSWORD } = process.env;

describe.skipIf(!VENDURE_DEV_URL)('live Vendure price reconcile', () => {
  it('finds no drift against documents just fetched with the replication\'s fields, reading ceil(totalItems/1000) pages', async () => {
    const baseUrl = VENDURE_DEV_URL!;
    const endpoint = `${baseUrl}/admin-api`;
    const startedAt = Date.now();
    let requests = 0;

    const login = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: `mutation Login($username: String!, $password: String!) {
          login(username: $username, password: $password) { __typename }
        }`,
        variables: { username: VENDURE_DEV_USER ?? 'superadmin', password: VENDURE_DEV_PASSWORD ?? 'superadmin' },
      }),
    });
    requests++;
    expect(login.ok).toBe(true);
    const token = login.headers.get('vendure-auth-token');
    expect(token).toBeTruthy();
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const context: SyncContext = { connectorId: 'vendure', baseUrl, headers };

    const countResponse = await gql(context, '{ productVariants(options: { take: 1 }) { totalItems } }');
    requests++;
    const totalItems: number = countResponse.data.productVariants.totalItems;

    // Every product id the price adapter reports, fetched fresh in the replication's document shape.
    const connector = createVendureConnector();
    const ids = new Set<string>();
    for await (const page of connector.reconcile!.prices!.fetchPages(context)) {
      requests++;
      for (const id of page.keys()) ids.add(id);
    }
    const fetchByIds = createFetchByIds();
    const docs: Record<string, unknown>[] = [];
    // The Admin API's take must not exceed 1,000; chunk the id lookup the same way the reconcile feed does.
    for (let i = 0; i < ids.size; i += 1000) {
      docs.push(...await fetchByIds([...ids].slice(i, i + 1000), context));
      requests++;
    }

    const db = await createRxDatabase({
      name: `vendure_price_live_${Date.now()}`, multiInstance: false,
      storage: wrappedValidateAjvStorage({ storage: getRxStorageMemory() }),
    });
    await db.addCollections({ products: connectorCollection(vendureProductSchema) });
    await db.products.bulkInsert(docs as Record<string, unknown>[]);

    const runner = startFingerprintReconcile({
      collection: db.products, adapter: connector.reconcile!.prices!, context, reSync: () => {},
    });
    const result = await runner.reconcile();
    expect(result.truncated).toBe(false);
    expect(result.pages).toBe(Math.ceil(totalItems / 1000));
    expect(result.queued).toBe(0);
    runner.stop();
    await db.close();

    // eslint-disable-next-line no-console -- the spec asks for the live test's requests and time to be logged.
    console.log(`Vendure price live test: ${requests} requests, ${Date.now() - startedAt} ms, ${totalItems} variants, ${ids.size} products.`);
  }, 60000);
});
