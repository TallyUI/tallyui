// The reconcile runs beside real RxDB replication and must never cost a pulled version (ADR-060).
import { describe, it, expect, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';
import { wrappedValidateAjvStorage } from 'rxdb/plugins/validate-ajv';
import { Subject } from 'rxjs';

import { startStockReconcile } from './reconcile';
import { startReplication } from './replication';
import { STOCK_LEVELS_COLLECTION, stockLevelsSchema } from './stock-levels';
import type { ReplicationAdapter, StockReconcileAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

const storage = wrappedValidateAjvStorage({ storage: getRxStorageMemory() });
const productSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    variants: {
      type: 'array',
      items: { type: 'object', properties: { id: { type: 'string' }, stock: { type: 'number' }, price: { type: 'number' } } },
    },
  },
  required: ['id'],
};
type Variant = { id: string; stock: number; price: number };
type Doc = { id: string; variants: Variant[] };
const context: SyncContext = { connectorId: 'test', baseUrl: 'https://example.com', headers: {} };

/** In-memory server: products with a change sequence, and stock kept apart as on Vendure and Medusa. */
function makeServer() {
  const products = new Map<string, { doc: Doc; seq: number }>();
  let seq = 0;
  const put = (doc: Doc) => products.set(doc.id, { doc: structuredClone(doc), seq: ++seq });
  const stream$ = new Subject<'RESYNC'>();
  const adapter: ReplicationAdapter<Doc, { seq: number }> = {
    pull: {
      handler: async (checkpoint, batchSize) => {
        const from = checkpoint?.seq ?? 0;
        const rows = [...products.values()].filter((r) => r.seq > from).sort((a, b) => a.seq - b.seq).slice(0, batchSize);
        return {
          documents: rows.map((r) => ({ ...structuredClone(r.doc), _deleted: false })),
          checkpoint: { seq: rows.length ? rows[rows.length - 1].seq : from },
        };
      },
      stream$: stream$.asObservable(),
    },
  };
  return { put, stream$, adapter };
}

function stockAdapter(stock: Record<string, number>, afterPage?: () => void): StockReconcileAdapter<Doc> {
  return {
    async *fetchPages() {
      yield new Map(Object.entries(stock));
      afterPage?.();
    },
    overlay(doc, map) {
      if (!doc.variants.some((v) => map.has(v.id) && map.get(v.id) !== v.stock)) return undefined;
      return { variants: doc.variants.map((v) => (map.has(v.id) ? { ...v, stock: map.get(v.id) as number } : v)) };
    },
  };
}

describe('stock reconcile beside real replication', () => {
  let db: any;
  afterEach(async () => { await db?.close(); db = undefined; });

  async function setup() {
    if (db) await db.close();
    db = await createRxDatabase({ name: `rr_${Math.random().toString(36).slice(2)}`, storage, multiInstance: false });
    await db.addCollections({ products: { schema: productSchema }, [STOCK_LEVELS_COLLECTION]: { schema: stockLevelsSchema } });
    const server = makeServer();
    server.put({ id: 'p1', variants: [{ id: 'v1', stock: 5, price: 100 }] });
    server.put({ id: 'p2', variants: [{ id: 'v2', stock: 1, price: 50 }] });
    const repl = startReplication({ collection: db.products, adapter: server.adapter, context });
    await repl.awaitInitialReplication();
    await repl.awaitInSync();
    return { server, repl };
  }
  const local = async () => (await db.products.findOne('p1').exec()).toJSON();
  const settle = async (repl: { awaitInSync(): Promise<unknown> }) => {
    await repl.awaitInSync();
    await new Promise((resolve) => setTimeout(resolve, 50));
  };

  it('D: a server change emitted with no await beside the reconcile write is kept, every time', async () => {
    for (let i = 0; i < 20; i++) {
      const { server, repl } = await setup();
      const r = startStockReconcile({ collection: db.stock_levels, adapter: stockAdapter({ v1: 2 }), context });
      const pass = r.reconcileStock();
      const version = { id: 'p1', variants: [{ id: 'v1', stock: 5, price: 300 + i }] };
      server.put(version);
      server.stream$.next('RESYNC');
      expect(await pass).toMatchObject({ written: 1 });
      await settle(repl);
      expect(await local()).toEqual(version);
      r.stop();
      await repl.cancel();
    }
  });

  it('E: no pulled version is lost when the server changes between the read and the write', async () => {
    let lost = 0;
    for (let i = 0; i < 20; i++) {
      const { server, repl } = await setup();
      const version = { id: 'p1', variants: [{ id: 'v1', stock: 5, price: 400 + i }] };
      const adapter = stockAdapter({ v1: 2, v2: 1 }, () => {
        server.put(version);
        server.stream$.next('RESYNC');
      });
      const r = startStockReconcile({ collection: db.stock_levels, adapter, context });
      await r.reconcileStock();
      await settle(repl);
      if (JSON.stringify(await local()) !== JSON.stringify(version)) lost++;
      r.stop();
      await repl.cancel();
    }
    expect(lost).toBe(0);
  });

  it('leaves every products document untouched', async () => {
    const { repl } = await setup();
    const revs = async () => (await db.products.find().exec()).map((d: any) => [d.id, d.revision]);
    const before = await revs();
    const r = startStockReconcile({ collection: db.stock_levels, adapter: stockAdapter({ v1: 2, v2: 0 }), context });
    expect(await r.reconcileStock()).toMatchObject({ written: 2 });
    expect(await db.stock_levels.count().exec()).toBe(2);
    expect(await revs()).toEqual(before);
    r.stop();
    await repl.cancel();
  });
});
