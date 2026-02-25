# RxDB Replication Layer Implementation Plan

> **For Claude:** REQUIRED: Use /execute-plan to implement this plan task-by-task.

**Goal:** Offline-first bidirectional replication between TallyUI's RxDB layer and remote e-commerce backends, using RxDB's built-in `replicateRxCollection` protocol.

**Architecture:** Each connector implements a `ReplicationAdapter` interface that provides checkpoint-based pull/push handlers. A thin orchestrator in `@tallyui/database` wires these to `replicateRxCollection`. Storage is platform-specific: Dexie/IndexedDB for web, a custom SQLite adapter over expo-sqlite for React Native, in-memory for dev/SSR.

**Tech Stack:** RxDB 16.21.1, rxjs 7.8.2, Dexie.js (via `rxdb/plugins/storage-dexie`), expo-sqlite, Vitest

**Design doc:** `docs/plans/2026-02-25-rxdb-replication-design.md`

---

## Task 1: Set Up Vitest

The monorepo has no test framework. All packages echo "no tests yet". Set up Vitest at the root so every package can run tests.

**Files:**
- Modify: `package.json` (root)
- Create: `vitest.config.ts` (root)
- Modify: `turbo.json`

**Step 1: Install vitest**

```bash
pnpm add -D -w vitest
```

**Step 2: Create root vitest config**

Create `vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
  },
  resolve: {
    alias: {
      '@tallyui/core': path.resolve(__dirname, 'packages/core/src/index.ts'),
      '@tallyui/database': path.resolve(__dirname, 'packages/database/src/index.ts'),
    },
  },
});
```

**Step 3: Verify vitest runs**

```bash
pnpm vitest run
```

Expected: exits cleanly with "no test files found" or similar.

**Step 4: Commit**

```bash
git add vitest.config.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest test framework"
```

---

## Task 2: Add ReplicationAdapter Type

Add the new `ReplicationAdapter` interface to `@tallyui/core`. This is the contract each connector will implement.

**Files:**
- Create: `packages/core/src/types/replication.ts`
- Modify: `packages/core/src/types/index.ts` (barrel re-export, find it via the existing exports)
- Modify: `packages/core/src/index.ts` (barrel re-export)

**Step 1: Write the type test**

Create `packages/core/src/types/replication.test-d.ts`:

```typescript
import { describe, expectTypeOf, it } from 'vitest';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

describe('ReplicationAdapter types', () => {
  it('accepts a typed adapter with custom checkpoint', () => {
    type Product = { id: string; name: string; _deleted: boolean };
    type Checkpoint = { id: string; modified: string };

    const adapter: ReplicationAdapter<Product, Checkpoint> = {} as any;

    expectTypeOf(adapter.pull.handler).toBeFunction();
    expectTypeOf(adapter.push).toEqualTypeOf<ReplicationAdapter<Product, Checkpoint>['push']>();
  });

  it('requires _deleted on document type', () => {
    type Doc = { id: string; _deleted: boolean };
    type Adapter = ReplicationAdapter<Doc>;
    expectTypeOf<Adapter['pull']['handler']>().toBeFunction();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/core --typecheck
```

Expected: FAIL — `ReplicationAdapter` doesn't exist yet.

**Step 3: Create the replication types**

Create `packages/core/src/types/replication.ts`:

```typescript
import type { RxReplicationPullStreamItem, RxReplicationWriteToMasterRow } from 'rxdb';
import type { Observable } from 'rxjs';

import type { SyncContext } from './connector';

/**
 * Replication adapter interface for a single collection.
 *
 * Each connector implements this to provide pull/push handlers
 * compatible with RxDB's replicateRxCollection protocol.
 *
 * CheckpointType is connector-specific (cursor, offset+timestamp, etc).
 */
export interface ReplicationAdapter<RxDocType, CheckpointType = any> {
  pull: {
    /**
     * Fetch documents changed since the last checkpoint.
     * Return an empty documents array when fully caught up.
     */
    handler: (
      lastCheckpoint: CheckpointType | undefined,
      batchSize: number,
      context: SyncContext
    ) => Promise<{
      documents: Array<RxDocType & { _deleted: boolean }>;
      checkpoint: CheckpointType;
    }>;

    /**
     * Optional real-time event stream.
     * Emit { documents, checkpoint } for live updates,
     * or 'RESYNC' to trigger a full pull cycle.
     */
    stream$?: Observable<RxReplicationPullStreamItem<RxDocType, CheckpointType>>;
  };

  push?: {
    /**
     * Push local changes to the remote API.
     * Return an array of conflict documents (server's version wins).
     * Return empty array if no conflicts.
     */
    handler: (
      changeRows: RxReplicationWriteToMasterRow<RxDocType>[],
      context: SyncContext
    ) => Promise<Array<RxDocType & { _deleted: boolean }>>;

    /** Max documents per push batch. Defaults to 100. */
    batchSize?: number;
  };
}
```

**Step 4: Export from barrel**

Add to `packages/core/src/types/index.ts` (or wherever the types barrel is):

```typescript
export type { ReplicationAdapter } from './replication';
```

Add to `packages/core/src/index.ts`:

```typescript
export type { ReplicationAdapter } from './types';
```

**Step 5: Run type test to verify it passes**

```bash
pnpm vitest run packages/core --typecheck
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/core/src/types/replication.ts packages/core/src/types/replication.test-d.ts packages/core/src/types/index.ts packages/core/src/index.ts
git commit -m "feat(core): add ReplicationAdapter type interface"
```

---

## Task 3: Update TallyConnector Interface

Add an optional `replication` property to `TallyConnector` alongside the existing `sync` property. Also add `connectorId` to `SyncContext`.

**Files:**
- Modify: `packages/core/src/types/connector.ts`

**Step 1: Update SyncContext**

In `packages/core/src/types/connector.ts`, add `connectorId` to `SyncContext`:

```typescript
export interface SyncContext {
  /** Unique connector identifier (used as replication namespace) */
  connectorId: string;
  /** Base URL for the API */
  baseUrl: string;
  /** Authenticated headers */
  headers: Record<string, string>;
  /** Optional abort signal */
  signal?: AbortSignal;
}
```

**Step 2: Add replication property to TallyConnector**

In the same file, add the `replication` property to `TallyConnector`:

```typescript
import type { ReplicationAdapter } from './replication';

export interface TallyConnector {
  // ... existing fields ...

  /** Sync configuration for each collection (legacy — use replication instead) */
  sync: {
    products: CollectionSync;
    [key: string]: CollectionSync;
  };

  /** Replication adapters for each collection (RxDB replication protocol) */
  replication?: {
    products?: ReplicationAdapter<any>;
    [key: string]: ReplicationAdapter<any> | undefined;
  };
}
```

**Step 3: Verify typecheck passes**

```bash
pnpm turbo typecheck
```

Expected: PASS — `replication` is optional so existing connectors still compile.

**Step 4: Commit**

```bash
git add packages/core/src/types/connector.ts
git commit -m "feat(core): add replication to TallyConnector, connectorId to SyncContext"
```

---

## Task 4: Build Replication Orchestrator

Create the `startReplication()` function in `@tallyui/database`. This wires a `ReplicationAdapter` to RxDB's `replicateRxCollection`.

**Files:**
- Create: `packages/database/src/replication.ts`
- Create: `packages/database/src/replication.test.ts`
- Modify: `packages/database/src/index.ts`

**Step 1: Write the failing test**

Create `packages/database/src/replication.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

import { startReplication } from './replication';
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

addRxPlugin(RxDBDevModePlugin);

const testSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
};

const context: SyncContext = {
  connectorId: 'test',
  baseUrl: 'https://example.com',
  headers: {},
};

describe('startReplication', () => {
  let db: any;

  beforeEach(async () => {
    db = await createRxDatabase({
      name: `test_${Date.now()}`,
      storage: getRxStorageMemory(),
      multiInstance: false,
      ignoreDuplicate: true,
    });
    await db.addCollections({ products: { schema: testSchema } });
  });

  afterEach(async () => {
    await db?.close();
  });

  it('starts replication and pulls documents', async () => {
    const adapter: ReplicationAdapter<any, any> = {
      pull: {
        handler: vi.fn().mockResolvedValueOnce({
          documents: [
            { id: '1', name: 'Widget', _deleted: false },
          ],
          checkpoint: { id: '1' },
        }).mockResolvedValue({
          documents: [],
          checkpoint: { id: '1' },
        }),
      },
    };

    const state = startReplication({
      collection: db.products,
      adapter,
      context,
    });

    await state.awaitInSync();

    const docs = await db.products.find().exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('Widget');

    await state.cancel();
  });

  it('returns RxReplicationState with observables', async () => {
    const adapter: ReplicationAdapter<any, any> = {
      pull: {
        handler: vi.fn().mockResolvedValue({ documents: [], checkpoint: {} }),
      },
    };

    const state = startReplication({
      collection: db.products,
      adapter,
      context,
    });

    expect(state.error$).toBeDefined();
    expect(state.active$).toBeDefined();
    expect(state.received$).toBeDefined();

    await state.cancel();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/database/src/replication.test.ts
```

Expected: FAIL — `./replication` module doesn't exist.

**Step 3: Implement startReplication**

Create `packages/database/src/replication.ts`:

```typescript
import { replicateRxCollection, type RxReplicationState } from 'rxdb/plugins/replication';
import type { RxCollection } from 'rxdb';

import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export interface StartReplicationOptions<RxDocType, CheckpointType = any> {
  collection: RxCollection<RxDocType>;
  adapter: ReplicationAdapter<RxDocType, CheckpointType>;
  context: SyncContext;
  /** Keep syncing after initial pull (default: true) */
  live?: boolean;
  /** Retry interval in ms on error (default: 5000) */
  retryTime?: number;
  /** Start immediately (default: true) */
  autoStart?: boolean;
}

/**
 * Start RxDB replication for a single collection using a ReplicationAdapter.
 *
 * Returns the RxReplicationState which exposes observables for monitoring
 * and methods like cancel(), awaitInSync(), reSync().
 */
export function startReplication<RxDocType, CheckpointType = any>({
  collection,
  adapter,
  context,
  live = true,
  retryTime = 5000,
  autoStart = true,
}: StartReplicationOptions<RxDocType, CheckpointType>): RxReplicationState<RxDocType, CheckpointType> {
  return replicateRxCollection({
    collection,
    replicationIdentifier: `${context.connectorId}-${collection.name}`,
    pull: {
      handler: (checkpoint, batchSize) =>
        adapter.pull.handler(checkpoint as CheckpointType | undefined, batchSize, context),
      stream$: adapter.pull.stream$,
    },
    push: adapter.push
      ? {
          handler: (rows) => adapter.push!.handler(rows, context),
          batchSize: adapter.push.batchSize,
        }
      : undefined,
    live,
    retryTime,
    autoStart,
  });
}
```

**Step 4: Export from barrel**

Add to `packages/database/src/index.ts`:

```typescript
export { startReplication } from './replication';
export type { StartReplicationOptions } from './replication';
```

**Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/database/src/replication.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/replication.ts packages/database/src/replication.test.ts packages/database/src/index.ts
git commit -m "feat(database): add startReplication orchestrator"
```

---

## Task 5: WooCommerce Replication Pull Handler

Implement the WooCommerce `ReplicationAdapter` pull handler using checkpoint-based pagination.

**Files:**
- Create: `connectors/woocommerce/src/replication/products.ts`
- Create: `connectors/woocommerce/src/replication/products.test.ts`

**Step 1: Write the failing test**

Create `connectors/woocommerce/src/replication/products.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { wooProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'woocommerce',
  baseUrl: 'https://example.com/wp-json/wc/v3',
  headers: { Authorization: 'Basic dGVzdDp0ZXN0' },
};

describe('wooProductReplication.pull.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint (undefined)', async () => {
    const mockProducts = [
      { id: 1, uuid: 'abc', name: 'Widget', date_modified_gmt: '2026-01-01T00:00:00' },
      { id: 2, uuid: 'def', name: 'Gadget', date_modified_gmt: '2026-01-02T00:00:00' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockProducts), { status: 200 }),
    );

    const result = await wooProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(2);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint).toEqual({
      id: 'def',
      modified: '2026-01-02T00:00:00',
    });
  });

  it('fetches products after a checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const checkpoint = { id: 'abc', modified: '2026-01-01T00:00:00' };
    const result = await wooProductReplication.pull.handler(checkpoint, 100, context);

    expect(result.documents).toHaveLength(0);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('modified_after=2026-01-01T00:00:00');
    expect(calledUrl).toContain('orderby=modified');
    expect(calledUrl).toContain('order=asc');
  });

  it('uses batchSize as per_page', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    await wooProductReplication.pull.handler(undefined, 25, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('per_page=25');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run connectors/woocommerce/src/replication/products.test.ts
```

Expected: FAIL — module doesn't exist.

**Step 3: Implement the pull handler**

Create `connectors/woocommerce/src/replication/products.ts`:

```typescript
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type WooProductCheckpoint = {
  id: string;
  modified: string;
};

/**
 * WooCommerce product replication adapter.
 *
 * Pull: GET /products with modified_after ordering.
 * Push: PUT /products/<id> for updates, POST /products for creates.
 *
 * Checkpoint tracks the last-seen { id, modified } so we only
 * fetch products changed since the previous sync.
 */
export const wooProductReplication: ReplicationAdapter<any, WooProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        per_page: String(batchSize),
        orderby: 'modified',
        order: 'asc',
      });

      if (lastCheckpoint?.modified) {
        params.set('modified_after', lastCheckpoint.modified);
      }

      const response = await fetch(`${context.baseUrl}/products?${params}`, {
        headers: {
          ...context.headers,
          'Content-Type': 'application/json',
        },
        signal: context.signal,
      });

      if (!response.ok) {
        throw new Error(`WooCommerce API error: ${response.status}`);
      }

      const products: any[] = await response.json();

      // Add _deleted: false since the WC REST API only returns non-deleted products.
      // Deletions are handled separately (WC doesn't include trashed in default queries).
      const documents = products.map((p) => ({ ...p, _deleted: false }));

      const checkpoint: WooProductCheckpoint = products.length > 0
        ? {
            id: String(products[products.length - 1].uuid ?? products[products.length - 1].id),
            modified: products[products.length - 1].date_modified_gmt,
          }
        : lastCheckpoint ?? { id: '', modified: '' };

      return { documents, checkpoint };
    },
  },

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        try {
          const isCreate = !row.assumedMasterState;
          const method = isCreate ? 'POST' : 'PUT';
          const url = isCreate
            ? `${context.baseUrl}/products`
            : `${context.baseUrl}/products/${doc.id}`;

          const response = await fetch(url, {
            method,
            headers: {
              ...context.headers,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(doc),
            signal: context.signal,
          });

          if (!response.ok) {
            // Server rejected — treat server state as conflict winner
            if (row.assumedMasterState) {
              conflicts.push({ ...row.assumedMasterState, _deleted: false });
            }
          }
        } catch {
          if (row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        }
      }

      return conflicts;
    },
  },
};
```

**Step 4: Run test to verify it passes**

```bash
pnpm vitest run connectors/woocommerce/src/replication/products.test.ts
```

Expected: PASS

**Step 5: Commit**

```bash
git add connectors/woocommerce/src/replication/
git commit -m "feat(woocommerce): add replication pull+push handlers for products"
```

---

## Task 6: Wire WooCommerce Connector

Add the replication adapter to the WooCommerce connector's `TallyConnector` export.

**Files:**
- Modify: `connectors/woocommerce/src/index.ts`

**Step 1: Import and add replication**

In `connectors/woocommerce/src/index.ts`, import the adapter and add it:

```typescript
import { wooProductReplication } from './replication/products';

export const woocommerceConnector: TallyConnector = {
  // ... existing fields ...

  replication: {
    products: wooProductReplication,
  },
};
```

Also add the re-export at the bottom:

```typescript
export { wooProductReplication } from './replication/products';
```

**Step 2: Verify typecheck passes**

```bash
pnpm turbo typecheck
```

Expected: PASS

**Step 3: Commit**

```bash
git add connectors/woocommerce/src/index.ts
git commit -m "feat(woocommerce): wire replication adapter into connector"
```

---

## Task 7: Storage Factory

Create `getStorage()` in `@tallyui/database` that returns the right storage adapter per platform. Web uses Dexie (RxDB's IndexedDB wrapper). React Native will use the custom SQLite adapter (Task 12+). Dev/SSR stays in-memory.

**Files:**
- Create: `packages/database/src/storage.ts`
- Create: `packages/database/src/storage.test.ts`
- Modify: `packages/database/src/index.ts`
- Modify: `packages/database/package.json` (no new deps — Dexie is bundled with rxdb)

**Step 1: Write the failing test**

Create `packages/database/src/storage.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

import { getStorage } from './storage';

describe('getStorage', () => {
  it('returns a storage object with a name property', () => {
    const storage = getStorage();
    expect(storage).toBeDefined();
    expect(storage.name).toBeDefined();
    expect(typeof storage.createStorageInstance).toBe('function');
  });

  it('returns memory storage in node/test environment', () => {
    const storage = getStorage();
    // In Node.js (test env), we expect memory storage
    expect(storage.name).toBe('memory');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/database/src/storage.test.ts
```

Expected: FAIL — module doesn't exist.

**Step 3: Implement getStorage**

Create `packages/database/src/storage.ts`:

```typescript
import type { RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

/**
 * Returns the appropriate RxDB storage adapter for the current platform.
 *
 * - Web browser: Dexie (IndexedDB)
 * - React Native: SQLite (via @tallyui/storage-sqlite, when available)
 * - Node/SSR/test: In-memory
 *
 * Override by passing a storage directly to createTallyDatabase().
 */
export function getStorage(): RxStorage<any, any> {
  // Node.js / SSR / test — no persistent storage needed
  if (typeof window === 'undefined') {
    return getRxStorageMemory();
  }

  // Web browser — use Dexie (IndexedDB)
  // Dynamic import avoided here; Dexie is bundled with rxdb.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { getRxStorageDexie } = require('rxdb/plugins/storage-dexie');
  return getRxStorageDexie();
}
```

**Step 4: Export from barrel**

Add to `packages/database/src/index.ts`:

```typescript
export { getStorage } from './storage';
```

**Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/database/src/storage.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/database/src/storage.ts packages/database/src/storage.test.ts packages/database/src/index.ts
git commit -m "feat(database): add platform-aware getStorage factory"
```

---

## Task 8: Shopify Replication Adapter

Implement Shopify's `ReplicationAdapter` using cursor-based pagination via the Link header.

**Files:**
- Create: `connectors/shopify/src/replication/products.ts`
- Create: `connectors/shopify/src/replication/products.test.ts`
- Modify: `connectors/shopify/src/index.ts`

**Step 1: Write the failing test**

Create `connectors/shopify/src/replication/products.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { shopifyProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'shopify',
  baseUrl: 'https://my-store.myshopify.com',
  headers: { 'X-Shopify-Access-Token': 'shpat_test' },
};

describe('shopifyProductReplication.pull.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint', async () => {
    const mockProducts = [
      { id: 1001, title: 'T-Shirt', updated_at: '2026-01-15T10:00:00Z' },
    ];

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: mockProducts }), {
        status: 200,
        headers: {},
      }),
    );

    const result = await shopifyProductReplication.pull.handler(undefined, 250, context);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].id).toBe('1001'); // normalized to string
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint.updated_at).toBe('2026-01-15T10:00:00Z');
  });

  it('uses updated_at_min from checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [] }), { status: 200 }),
    );

    const checkpoint = { updated_at: '2026-01-10T00:00:00Z' };
    await shopifyProductReplication.pull.handler(checkpoint, 250, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('updated_at_min=2026-01-10T00:00:00Z');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run connectors/shopify/src/replication/products.test.ts
```

Expected: FAIL

**Step 3: Implement the adapter**

Create `connectors/shopify/src/replication/products.ts`:

```typescript
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type ShopifyProductCheckpoint = {
  updated_at: string;
};

export const shopifyProductReplication: ReplicationAdapter<any, ShopifyProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        limit: String(Math.min(batchSize, 250)),
      });

      if (lastCheckpoint?.updated_at) {
        params.set('updated_at_min', lastCheckpoint.updated_at);
      }

      const allProducts: any[] = [];
      let url: string | null =
        `${context.baseUrl}/admin/api/2024-01/products.json?${params}`;

      while (url) {
        const response = await fetch(url, {
          headers: context.headers,
          signal: context.signal,
        });

        if (!response.ok) {
          throw new Error(`Shopify API error: ${response.status}`);
        }

        const data = await response.json();
        const products = (data.products ?? []).map(normalizeId);
        allProducts.push(...products);

        // Follow cursor pagination via Link header
        url = parseLinkNext(response.headers.get('Link'));
      }

      const documents = allProducts.map((p) => ({ ...p, _deleted: false }));

      const checkpoint: ShopifyProductCheckpoint = allProducts.length > 0
        ? { updated_at: allProducts[allProducts.length - 1].updated_at }
        : lastCheckpoint ?? { updated_at: '' };

      return { documents, checkpoint };
    },
  },

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        try {
          const response = await fetch(
            `${context.baseUrl}/admin/api/2024-01/products/${doc.id}.json`,
            {
              method: 'PUT',
              headers: { ...context.headers, 'Content-Type': 'application/json' },
              body: JSON.stringify({ product: doc }),
              signal: context.signal,
            },
          );

          if (!response.ok && row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        } catch {
          if (row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        }
      }

      return conflicts;
    },
  },
};

function normalizeId(product: any) {
  return { ...product, id: String(product.id) };
}

function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}
```

**Step 4: Wire into connector**

In `connectors/shopify/src/index.ts`, import and add:

```typescript
import { shopifyProductReplication } from './replication/products';

// Add to shopifyConnector:
replication: {
  products: shopifyProductReplication,
},

// Add re-export:
export { shopifyProductReplication } from './replication/products';
```

**Step 5: Run tests + typecheck**

```bash
pnpm vitest run connectors/shopify/src/replication/products.test.ts
pnpm turbo typecheck
```

Expected: PASS

**Step 6: Commit**

```bash
git add connectors/shopify/src/replication/ connectors/shopify/src/index.ts
git commit -m "feat(shopify): add replication adapter for products"
```

---

## Task 9: Medusa Replication Adapter

Implement Medusa's `ReplicationAdapter` using offset-based pagination with date filtering.

**Files:**
- Create: `connectors/medusa/src/replication/products.ts`
- Create: `connectors/medusa/src/replication/products.test.ts`
- Modify: `connectors/medusa/src/index.ts`

**Step 1: Write the failing test**

Create `connectors/medusa/src/replication/products.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { medusaProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'medusa',
  baseUrl: 'https://medusa-backend.com',
  headers: { Authorization: 'Bearer test-token' },
};

describe('medusaProductReplication.pull.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products from initial checkpoint', async () => {
    const mockResponse = {
      products: [
        { id: 'prod_01', title: 'Hoodie', updated_at: '2026-02-01T00:00:00Z' },
      ],
      count: 1,
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await medusaProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint.updated_at).toBe('2026-02-01T00:00:00Z');
  });

  it('uses date filter from checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ products: [], count: 0 }), { status: 200 }),
    );

    const checkpoint = { offset: 0, updated_at: '2026-01-15T00:00:00Z' };
    await medusaProductReplication.pull.handler(checkpoint, 100, context);

    const calledUrl = (globalThis.fetch as any).mock.calls[0][0];
    expect(calledUrl).toContain('updated_at%5Bgte%5D=2026-01-15');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run connectors/medusa/src/replication/products.test.ts
```

**Step 3: Implement the adapter**

Create `connectors/medusa/src/replication/products.ts`:

```typescript
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type MedusaProductCheckpoint = {
  offset: number;
  updated_at: string;
};

export const medusaProductReplication: ReplicationAdapter<any, MedusaProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const params = new URLSearchParams({
        limit: String(batchSize),
        offset: String(lastCheckpoint?.offset ?? 0),
        fields: '*variants,*variants.prices,*images,*categories,*tags,*options,*options.values',
      });

      if (lastCheckpoint?.updated_at) {
        params.set('updated_at[gte]', lastCheckpoint.updated_at);
      }

      const response = await fetch(
        `${context.baseUrl}/admin/products?${params}`,
        {
          headers: { ...context.headers, 'Content-Type': 'application/json' },
          signal: context.signal,
        },
      );

      if (!response.ok) {
        throw new Error(`Medusa API error: ${response.status}`);
      }

      const data = await response.json();
      const products: any[] = data.products ?? [];

      const documents = products.map((p) => ({ ...p, _deleted: false }));

      const newOffset = (lastCheckpoint?.offset ?? 0) + products.length;
      const lastProduct = products[products.length - 1];

      const checkpoint: MedusaProductCheckpoint = lastProduct
        ? { offset: products.length < batchSize ? 0 : newOffset, updated_at: lastProduct.updated_at }
        : lastCheckpoint ?? { offset: 0, updated_at: '' };

      return { documents, checkpoint };
    },
  },

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        try {
          const response = await fetch(
            `${context.baseUrl}/admin/products/${doc.id}`,
            {
              method: 'POST',
              headers: { ...context.headers, 'Content-Type': 'application/json' },
              body: JSON.stringify(doc),
              signal: context.signal,
            },
          );

          if (!response.ok && row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        } catch {
          if (row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        }
      }

      return conflicts;
    },
  },
};
```

**Step 4: Wire into connector**

In `connectors/medusa/src/index.ts`:

```typescript
import { medusaProductReplication } from './replication/products';

// Add to medusaConnector:
replication: {
  products: medusaProductReplication,
},

// Add re-export:
export { medusaProductReplication } from './replication/products';
```

**Step 5: Run tests + typecheck**

```bash
pnpm vitest run connectors/medusa/src/replication/products.test.ts
pnpm turbo typecheck
```

**Step 6: Commit**

```bash
git add connectors/medusa/src/replication/ connectors/medusa/src/index.ts
git commit -m "feat(medusa): add replication adapter for products"
```

---

## Task 10: Vendure Replication Adapter

Implement Vendure's `ReplicationAdapter` using GraphQL with offset pagination and date filtering.

**Files:**
- Create: `connectors/vendure/src/replication/products.ts`
- Create: `connectors/vendure/src/replication/products.test.ts`
- Modify: `connectors/vendure/src/index.ts`

**Step 1: Write the failing test**

Create `connectors/vendure/src/replication/products.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SyncContext } from '@tallyui/core';

import { vendureProductReplication } from './products';

const context: SyncContext = {
  connectorId: 'vendure',
  baseUrl: 'https://vendure-server.com',
  headers: { Authorization: 'Bearer test-token' },
};

describe('vendureProductReplication.pull.handler', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('fetches products via GraphQL from initial checkpoint', async () => {
    const mockResponse = {
      data: {
        products: {
          items: [
            {
              id: '1',
              name: 'Laptop',
              updatedAt: '2026-03-01T00:00:00Z',
              variants: [],
            },
          ],
          totalItems: 1,
        },
      },
    };

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(mockResponse), { status: 200 }),
    );

    const result = await vendureProductReplication.pull.handler(undefined, 100, context);

    expect(result.documents).toHaveLength(1);
    expect(result.documents[0]._deleted).toBe(false);
    expect(result.checkpoint.updatedAt).toBe('2026-03-01T00:00:00Z');
  });

  it('uses updatedAt filter from checkpoint', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(
        JSON.stringify({ data: { products: { items: [], totalItems: 0 } } }),
        { status: 200 },
      ),
    );

    const checkpoint = { skip: 0, updatedAt: '2026-02-15T00:00:00Z' };
    await vendureProductReplication.pull.handler(checkpoint, 100, context);

    const body = JSON.parse((globalThis.fetch as any).mock.calls[0][1].body);
    expect(body.variables.options.filter.updatedAt.after).toBe('2026-02-15T00:00:00Z');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run connectors/vendure/src/replication/products.test.ts
```

**Step 3: Implement the adapter**

Create `connectors/vendure/src/replication/products.ts`:

```typescript
import type { ReplicationAdapter, SyncContext } from '@tallyui/core';

export type VendureProductCheckpoint = {
  skip: number;
  updatedAt: string;
};

const PRODUCTS_QUERY = `
  query GetProducts($options: ProductListOptions) {
    products(options: $options) {
      items {
        id
        createdAt
        updatedAt
        name
        slug
        description
        enabled
        featuredAsset { id preview }
        assets { id preview }
        collections { id name slug }
        facetValues { id name code facet { id name } }
        variants {
          id
          name
          sku
          price
          priceWithTax
          currencyCode
          stockLevel
          stockOnHand
          trackInventory
          featuredAsset { id preview }
          options { id name code }
          customFields
        }
      }
      totalItems
    }
  }
`;

export const vendureProductReplication: ReplicationAdapter<any, VendureProductCheckpoint> = {
  pull: {
    async handler(lastCheckpoint, batchSize, context) {
      const options: any = {
        take: batchSize,
        skip: lastCheckpoint?.skip ?? 0,
      };

      if (lastCheckpoint?.updatedAt) {
        options.filter = {
          updatedAt: { after: lastCheckpoint.updatedAt },
        };
      }

      const response = await fetch(`${context.baseUrl}/admin-api`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...context.headers },
        body: JSON.stringify({ query: PRODUCTS_QUERY, variables: { options } }),
        signal: context.signal,
      });

      if (!response.ok) {
        throw new Error(`Vendure API error: ${response.status}`);
      }

      const json = await response.json();
      const data = json.data?.products;
      const items: any[] = data?.items ?? [];

      const documents = items.map((p) => ({ ...p, _deleted: false }));

      const lastItem = items[items.length - 1];
      const newSkip = (lastCheckpoint?.skip ?? 0) + items.length;

      const checkpoint: VendureProductCheckpoint = lastItem
        ? {
            skip: items.length < batchSize ? 0 : newSkip,
            updatedAt: lastItem.updatedAt,
          }
        : lastCheckpoint ?? { skip: 0, updatedAt: '' };

      return { documents, checkpoint };
    },
  },

  push: {
    async handler(changeRows, context) {
      const conflicts: any[] = [];

      for (const row of changeRows) {
        const doc = row.newDocumentState as any;

        const mutation = `
          mutation UpdateProduct($input: UpdateProductInput!) {
            updateProduct(input: $input) { id }
          }
        `;

        try {
          const response = await fetch(`${context.baseUrl}/admin-api`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...context.headers },
            body: JSON.stringify({
              query: mutation,
              variables: { input: { id: doc.id, name: doc.name } },
            }),
            signal: context.signal,
          });

          if (!response.ok && row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        } catch {
          if (row.assumedMasterState) {
            conflicts.push({ ...row.assumedMasterState, _deleted: false });
          }
        }
      }

      return conflicts;
    },
  },
};
```

**Step 4: Wire into connector**

In `connectors/vendure/src/index.ts`:

```typescript
import { vendureProductReplication } from './replication/products';

// Add to vendureConnector:
replication: {
  products: vendureProductReplication,
},

// Add re-export:
export { vendureProductReplication } from './replication/products';
```

**Step 5: Run tests + typecheck**

```bash
pnpm vitest run connectors/vendure/src/replication/products.test.ts
pnpm turbo typecheck
```

**Step 6: Commit**

```bash
git add connectors/vendure/src/replication/ connectors/vendure/src/index.ts
git commit -m "feat(vendure): add replication adapter for products"
```

---

## Task 11: SQLite Storage Adapter — Package Scaffold

Create the `@tallyui/storage-sqlite` package with the basic structure and RxStorage factory.

**Files:**
- Create: `packages/storage-sqlite/package.json`
- Create: `packages/storage-sqlite/tsconfig.json`
- Create: `packages/storage-sqlite/src/index.ts`
- Create: `packages/storage-sqlite/src/types.ts`
- Modify: `tsconfig.json` (root — add path alias)

**Step 1: Create package.json**

Create `packages/storage-sqlite/package.json`:

```json
{
  "name": "@tallyui/storage-sqlite",
  "version": "0.1.0",
  "description": "RxDB storage adapter for SQLite via expo-sqlite",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "license": "MIT",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "rxdb": "16.21.1",
    "rxjs": "7.8.2"
  },
  "peerDependencies": {
    "expo-sqlite": ">=15.0.0"
  }
}
```

**Step 2: Create tsconfig.json**

Create `packages/storage-sqlite/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "outDir": "./dist"
  },
  "include": ["src/**/*.ts"]
}
```

**Step 3: Create types file**

Create `packages/storage-sqlite/src/types.ts`:

```typescript
/**
 * Minimal interface for the expo-sqlite database.
 * We depend on the interface, not the implementation,
 * so tests can provide a mock.
 */
export interface SQLiteDatabase {
  execSync(source: string): void;
  getAllSync<T>(source: string, params?: any[]): T[];
  runSync(source: string, params?: any[]): { changes: number; lastInsertRowId: number };
}

export interface SQLiteStorageSettings {
  /**
   * Provide an opened expo-sqlite database instance.
   * This keeps the storage adapter decoupled from the
   * specific expo-sqlite import/open mechanism.
   */
  database: SQLiteDatabase;
}
```

**Step 4: Create barrel export**

Create `packages/storage-sqlite/src/index.ts`:

```typescript
export { getRxStorageSQLite } from './rx-storage-sqlite';
export type { SQLiteDatabase, SQLiteStorageSettings } from './types';
```

Note: `rx-storage-sqlite.ts` will be created in the next task. For now, this file will cause a typecheck error — that's expected.

**Step 5: Add path alias to root tsconfig.json**

In `/Users/kilbot/Projects/tallyui/tsconfig.json`, add to `paths`:

```json
"@tallyui/storage-sqlite": ["packages/storage-sqlite/src/index.ts"],
"@tallyui/storage-sqlite/*": ["packages/storage-sqlite/src/*"]
```

**Step 6: Install deps and commit**

```bash
pnpm install
git add packages/storage-sqlite/ tsconfig.json pnpm-lock.yaml
git commit -m "chore: scaffold @tallyui/storage-sqlite package"
```

---

## Task 12: SQLite Storage — Core Implementation

Implement the `RxStorage` and `RxStorageInstance` interfaces backed by SQLite.

**Files:**
- Create: `packages/storage-sqlite/src/rx-storage-sqlite.ts`
- Create: `packages/storage-sqlite/src/storage-instance.ts`
- Create: `packages/storage-sqlite/src/storage-instance.test.ts`

**Step 1: Write the failing test**

Create `packages/storage-sqlite/src/storage-instance.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { RxDocumentData, RxJsonSchema } from 'rxdb';

import { getRxStorageSQLite } from './rx-storage-sqlite';
import type { SQLiteDatabase } from './types';

/**
 * In-memory SQLite mock using plain objects.
 * For real integration tests, use better-sqlite3 or similar.
 */
function createMockSQLiteDatabase(): SQLiteDatabase {
  const tables: Record<string, any[]> = {};

  return {
    execSync(sql: string) {
      // Extract table name from CREATE TABLE
      const match = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/);
      if (match && !tables[match[1]]) {
        tables[match[1]] = [];
      }
    },
    getAllSync<T>(sql: string, params?: any[]): T[] {
      const match = sql.match(/FROM "(\w+)"/);
      const table = match ? tables[match[1]] ?? [] : [];

      if (sql.includes('WHERE id IN')) {
        const ids = params ?? [];
        return table.filter((row: any) => ids.includes(row.id)) as T[];
      }

      return table as T[];
    },
    runSync(sql: string, params?: any[]) {
      const match = sql.match(/INTO "(\w+)"/i) ?? sql.match(/UPDATE "(\w+)"/i);
      if (match) {
        const tableName = match[1];
        if (!tables[tableName]) tables[tableName] = [];

        if (sql.startsWith('INSERT') && params) {
          const data = JSON.parse(params[1] as string);
          const existing = tables[tableName].findIndex((r: any) => r.id === params[0]);
          if (existing >= 0) {
            tables[tableName][existing] = data;
          } else {
            tables[tableName].push(data);
          }
        }
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
  };
}

const testSchema: RxJsonSchema<any> = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
};

describe('SQLite RxStorage', () => {
  it('creates a storage instance', async () => {
    const db = createMockSQLiteDatabase();
    const storage = getRxStorageSQLite({ database: db });

    expect(storage.name).toBe('sqlite');

    const instance = await storage.createStorageInstance({
      databaseInstanceToken: 'test-token',
      databaseName: 'test',
      collectionName: 'products',
      schema: testSchema,
      options: {},
      multiInstance: false,
      devMode: false,
    });

    expect(instance).toBeDefined();
    await instance.close();
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/storage-sqlite/src/storage-instance.test.ts
```

**Step 3: Implement the RxStorage factory**

Create `packages/storage-sqlite/src/rx-storage-sqlite.ts`:

```typescript
import type { RxStorage, RxStorageInstanceCreationParams } from 'rxdb';
import { RXDB_VERSION } from 'rxdb';

import { SQLiteStorageInstance } from './storage-instance';
import type { SQLiteStorageSettings, SQLiteDatabase } from './types';

export class RxStorageSQLite implements RxStorage<SQLiteDatabase, SQLiteStorageSettings> {
  public readonly name = 'sqlite';
  public readonly rxdbVersion = RXDB_VERSION;

  constructor(public readonly settings: SQLiteStorageSettings) {}

  async createStorageInstance<RxDocType>(
    params: RxStorageInstanceCreationParams<RxDocType, SQLiteStorageSettings>,
  ) {
    return SQLiteStorageInstance.create<RxDocType>(
      params,
      this.settings.database,
    );
  }
}

export function getRxStorageSQLite(settings: SQLiteStorageSettings): RxStorageSQLite {
  return new RxStorageSQLite(settings);
}
```

**Step 4: Implement the storage instance stub**

Create `packages/storage-sqlite/src/storage-instance.ts`:

```typescript
import type {
  BulkWriteRow,
  EventBulk,
  PreparedQuery,
  RxConflictResultionTask,
  RxConflictResultionTaskSolution,
  RxDocumentData,
  RxJsonSchema,
  RxStorageChangeEvent,
  RxStorageCountResult,
  RxStorageDefaultCheckpoint,
  RxStorageInstance,
  RxStorageInstanceCreationParams,
  RxStorageQueryResult,
  StringKeys,
} from 'rxdb';
import { Observable, Subject } from 'rxjs';

import type { SQLiteDatabase, SQLiteStorageSettings } from './types';

const DOC_TABLE = 'documents';

export class SQLiteStorageInstance<RxDocType>
  implements RxStorageInstance<RxDocType, SQLiteDatabase, SQLiteStorageSettings, RxStorageDefaultCheckpoint>
{
  private readonly changeSubject = new Subject<EventBulk<RxStorageChangeEvent<RxDocType>, RxStorageDefaultCheckpoint>>();
  private closed = false;

  private constructor(
    public readonly databaseInstanceToken: string,
    public readonly internals: SQLiteDatabase,
    public readonly options: Readonly<SQLiteStorageSettings>,
    public readonly collectionName: string,
    public readonly databaseName: string,
    public readonly schema: Readonly<RxJsonSchema<RxDocumentData<RxDocType>>>,
  ) {}

  private get tableName(): string {
    return `${this.databaseName}_${this.collectionName}`;
  }

  static async create<RxDocType>(
    params: RxStorageInstanceCreationParams<RxDocType, SQLiteStorageSettings>,
    database: SQLiteDatabase,
  ): Promise<SQLiteStorageInstance<RxDocType>> {
    const instance = new SQLiteStorageInstance<RxDocType>(
      params.databaseInstanceToken,
      database,
      params.options as SQLiteStorageSettings,
      params.collectionName,
      params.databaseName,
      params.schema as any,
    );

    // Create the table
    database.execSync(`
      CREATE TABLE IF NOT EXISTS "${instance.tableName}" (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        _deleted INTEGER DEFAULT 0,
        _rev TEXT,
        _meta_lwt REAL DEFAULT 0
      )
    `);

    return instance;
  }

  async bulkWrite(
    documentWrites: BulkWriteRow<RxDocType>[],
    context: string,
  ) {
    const errors: any[] = [];
    const successDocs: any[] = [];
    const primaryPath = this.schema.primaryKey as string;

    for (const writeRow of documentWrites) {
      const docId = (writeRow.document as any)[primaryPath];
      const docData = writeRow.document;

      try {
        this.internals.runSync(
          `INSERT OR REPLACE INTO "${this.tableName}" (id, data, _deleted, _rev, _meta_lwt) VALUES (?, ?, ?, ?, ?)`,
          [
            docId,
            JSON.stringify(docData),
            (docData as any)._deleted ? 1 : 0,
            (docData as any)._rev ?? '',
            (docData as any)._meta?.lwt ?? Date.now(),
          ],
        );
        successDocs.push(docData);
      } catch (err: any) {
        errors.push({
          status: 409,
          documentId: docId,
          writeRow,
          documentInDb: undefined,
          isError: true,
        });
      }
    }

    return { error: errors, success: successDocs };
  }

  async findDocumentsById(
    ids: string[],
    withDeleted: boolean,
  ): Promise<RxDocumentData<RxDocType>[]> {
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(',');
    let sql = `SELECT data FROM "${this.tableName}" WHERE id IN (${placeholders})`;
    if (!withDeleted) {
      sql += ' AND _deleted = 0';
    }

    const rows = this.internals.getAllSync<{ data: string }>(sql, ids);
    return rows.map((row) => JSON.parse(row.data));
  }

  async query(
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageQueryResult<RxDocType>> {
    // Basic implementation — full Mango query support in Task 13
    const rows = this.internals.getAllSync<{ data: string }>(
      `SELECT data FROM "${this.tableName}" WHERE _deleted = 0`,
    );
    const documents = rows.map((row) => JSON.parse(row.data));
    return { documents };
  }

  async count(
    preparedQuery: PreparedQuery<RxDocType>,
  ): Promise<RxStorageCountResult> {
    const rows = this.internals.getAllSync<{ count: number }>(
      `SELECT COUNT(*) as count FROM "${this.tableName}" WHERE _deleted = 0`,
    );
    return { count: rows[0]?.count ?? 0, mode: 'fast' };
  }

  async getAttachmentData(
    documentId: string,
    attachmentId: string,
    digest: string,
  ): Promise<string> {
    throw new Error('Attachments not supported in SQLite storage');
  }

  async getChangedDocumentsSince(
    limit: number,
    checkpoint?: RxStorageDefaultCheckpoint,
  ): Promise<{ documents: RxDocumentData<RxDocType>[]; checkpoint: RxStorageDefaultCheckpoint }> {
    let sql = `SELECT data FROM "${this.tableName}" WHERE _meta_lwt > ? ORDER BY _meta_lwt ASC LIMIT ?`;
    const params = [checkpoint?.lwt ?? 0, limit];

    const rows = this.internals.getAllSync<{ data: string }>(sql, params);
    const documents = rows.map((row) => JSON.parse(row.data));

    const lastDoc = documents[documents.length - 1] as any;
    const newCheckpoint: RxStorageDefaultCheckpoint = lastDoc
      ? { id: lastDoc[this.schema.primaryKey as string], lwt: lastDoc._meta?.lwt ?? 0 }
      : checkpoint ?? { id: '', lwt: 0 };

    return { documents, checkpoint: newCheckpoint };
  }

  changeStream(): Observable<EventBulk<RxStorageChangeEvent<RxDocType>, RxStorageDefaultCheckpoint>> {
    return this.changeSubject.asObservable();
  }

  async cleanup(minimumDeletedTime: number): Promise<boolean> {
    this.internals.runSync(
      `DELETE FROM "${this.tableName}" WHERE _deleted = 1 AND _meta_lwt < ?`,
      [Date.now() - minimumDeletedTime],
    );
    return true;
  }

  async close(): Promise<void> {
    this.closed = true;
    this.changeSubject.complete();
  }

  async remove(): Promise<void> {
    this.internals.execSync(`DROP TABLE IF EXISTS "${this.tableName}"`);
    await this.close();
  }

  conflictResultionTasks(): Observable<RxConflictResultionTask<RxDocType>> {
    return new Subject<RxConflictResultionTask<RxDocType>>().asObservable();
  }

  async resolveConflictResultionTask(
    _taskSolution: RxConflictResultionTaskSolution<RxDocType>,
  ): Promise<void> {
    // No-op — server-wins strategy handles conflicts in the adapter
  }
}
```

**Step 5: Run test to verify it passes**

```bash
pnpm vitest run packages/storage-sqlite/src/storage-instance.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/storage-sqlite/src/
git commit -m "feat(storage-sqlite): core RxStorage + RxStorageInstance implementation"
```

---

## Task 13: SQLite Storage — Mango Query Engine

Add Mango-style query translation to SQL for the `query()` and `count()` methods. Supports equality, `$gt`, `$gte`, `$lt`, `$lte`, `$in`, `$regex`, `$or`, `$and`, plus `sort`, `limit`, `skip`.

**Files:**
- Create: `packages/storage-sqlite/src/mango-to-sql.ts`
- Create: `packages/storage-sqlite/src/mango-to-sql.test.ts`
- Modify: `packages/storage-sqlite/src/storage-instance.ts`

**Step 1: Write the failing test**

Create `packages/storage-sqlite/src/mango-to-sql.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

import { mangoToSql } from './mango-to-sql';

describe('mangoToSql', () => {
  const table = 'test_products';

  it('handles empty selector', () => {
    const result = mangoToSql(table, {});
    expect(result.sql).toBe(`SELECT data FROM "${table}" WHERE _deleted = 0`);
    expect(result.params).toEqual([]);
  });

  it('handles equality selector', () => {
    const result = mangoToSql(table, { selector: { status: 'active' } });
    expect(result.sql).toContain("json_extract(data, '$.status') = ?");
    expect(result.params).toContain('active');
  });

  it('handles $gt operator', () => {
    const result = mangoToSql(table, { selector: { price: { $gt: 10 } } });
    expect(result.sql).toContain("json_extract(data, '$.price') > ?");
    expect(result.params).toContain(10);
  });

  it('handles $in operator', () => {
    const result = mangoToSql(table, { selector: { status: { $in: ['a', 'b'] } } });
    expect(result.sql).toContain("json_extract(data, '$.status') IN (?, ?)");
    expect(result.params).toEqual(expect.arrayContaining(['a', 'b']));
  });

  it('handles sort', () => {
    const result = mangoToSql(table, { sort: [{ name: 'asc' }] });
    expect(result.sql).toContain("ORDER BY json_extract(data, '$.name') ASC");
  });

  it('handles limit and skip', () => {
    const result = mangoToSql(table, { limit: 10, skip: 20 });
    expect(result.sql).toContain('LIMIT 10');
    expect(result.sql).toContain('OFFSET 20');
  });
});
```

**Step 2: Run test to verify it fails**

```bash
pnpm vitest run packages/storage-sqlite/src/mango-to-sql.test.ts
```

**Step 3: Implement the Mango-to-SQL translator**

Create `packages/storage-sqlite/src/mango-to-sql.ts`:

```typescript
/**
 * Translate a subset of RxDB's Mango query format to SQL.
 *
 * Uses SQLite's json_extract() to query fields inside the JSON data column.
 */
export interface MangoQuery {
  selector?: Record<string, any>;
  sort?: Array<Record<string, 'asc' | 'desc'>>;
  limit?: number;
  skip?: number;
}

export interface SqlQuery {
  sql: string;
  params: any[];
}

export function mangoToSql(tableName: string, query: MangoQuery): SqlQuery {
  const params: any[] = [];
  const conditions: string[] = ['_deleted = 0'];

  if (query.selector) {
    for (const [field, value] of Object.entries(query.selector)) {
      if (field === '$and') {
        for (const sub of value as Record<string, any>[]) {
          const subResult = buildConditions(sub, params);
          conditions.push(...subResult);
        }
      } else if (field === '$or') {
        const orClauses = (value as Record<string, any>[]).map((sub) => {
          const subParams: any[] = [];
          const subConditions = buildConditions(sub, subParams);
          params.push(...subParams);
          return `(${subConditions.join(' AND ')})`;
        });
        conditions.push(`(${orClauses.join(' OR ')})`);
      } else {
        const fieldConditions = buildFieldCondition(field, value, params);
        conditions.push(...fieldConditions);
      }
    }
  }

  let sql = `SELECT data FROM "${tableName}" WHERE ${conditions.join(' AND ')}`;

  if (query.sort && query.sort.length > 0) {
    const orderClauses = query.sort.map((sortEntry) => {
      const [field, direction] = Object.entries(sortEntry)[0];
      return `json_extract(data, '$.${field}') ${direction.toUpperCase()}`;
    });
    sql += ` ORDER BY ${orderClauses.join(', ')}`;
  }

  if (query.limit !== undefined) {
    sql += ` LIMIT ${query.limit}`;
  }

  if (query.skip !== undefined) {
    sql += ` OFFSET ${query.skip}`;
  }

  return { sql, params };
}

function buildConditions(selector: Record<string, any>, params: any[]): string[] {
  const conditions: string[] = [];
  for (const [field, value] of Object.entries(selector)) {
    conditions.push(...buildFieldCondition(field, value, params));
  }
  return conditions;
}

function buildFieldCondition(field: string, value: any, params: any[]): string[] {
  const jsonPath = `json_extract(data, '$.${field}')`;

  if (value === null || value === undefined || typeof value !== 'object') {
    // Direct equality
    params.push(value);
    return [`${jsonPath} = ?`];
  }

  const conditions: string[] = [];

  for (const [op, operand] of Object.entries(value)) {
    switch (op) {
      case '$eq':
        params.push(operand);
        conditions.push(`${jsonPath} = ?`);
        break;
      case '$gt':
        params.push(operand);
        conditions.push(`${jsonPath} > ?`);
        break;
      case '$gte':
        params.push(operand);
        conditions.push(`${jsonPath} >= ?`);
        break;
      case '$lt':
        params.push(operand);
        conditions.push(`${jsonPath} < ?`);
        break;
      case '$lte':
        params.push(operand);
        conditions.push(`${jsonPath} <= ?`);
        break;
      case '$ne':
        params.push(operand);
        conditions.push(`${jsonPath} != ?`);
        break;
      case '$in':
        const placeholders = (operand as any[]).map(() => '?').join(', ');
        params.push(...(operand as any[]));
        conditions.push(`${jsonPath} IN (${placeholders})`);
        break;
      case '$nin':
        const ninPlaceholders = (operand as any[]).map(() => '?').join(', ');
        params.push(...(operand as any[]));
        conditions.push(`${jsonPath} NOT IN (${ninPlaceholders})`);
        break;
      case '$regex':
        params.push(operand);
        conditions.push(`${jsonPath} LIKE ?`);
        break;
      default:
        // Unknown operator — treat as nested equality
        params.push(operand);
        conditions.push(`${jsonPath} = ?`);
    }
  }

  return conditions;
}
```

**Step 4: Update storage-instance.ts query() and count() to use mangoToSql**

In `packages/storage-sqlite/src/storage-instance.ts`, update the `query()` method:

```typescript
import { mangoToSql } from './mango-to-sql';

// Replace the existing query() method:
async query(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageQueryResult<RxDocType>> {
  const { sql, params } = mangoToSql(this.tableName, preparedQuery.query as any);
  const rows = this.internals.getAllSync<{ data: string }>(sql, params);
  const documents = rows.map((row) => JSON.parse(row.data));
  return { documents };
}

// Replace the existing count() method:
async count(preparedQuery: PreparedQuery<RxDocType>): Promise<RxStorageCountResult> {
  const { sql, params } = mangoToSql(this.tableName, preparedQuery.query as any);
  const countSql = sql.replace('SELECT data', 'SELECT COUNT(*) as count');
  const rows = this.internals.getAllSync<{ count: number }>(countSql, params);
  return { count: rows[0]?.count ?? 0, mode: 'fast' };
}
```

**Step 5: Run tests**

```bash
pnpm vitest run packages/storage-sqlite/src/mango-to-sql.test.ts
pnpm vitest run packages/storage-sqlite/src/storage-instance.test.ts
```

Expected: PASS

**Step 6: Commit**

```bash
git add packages/storage-sqlite/src/mango-to-sql.ts packages/storage-sqlite/src/mango-to-sql.test.ts packages/storage-sqlite/src/storage-instance.ts
git commit -m "feat(storage-sqlite): add Mango-to-SQL query translator"
```

---

## Task 14: SQLite Storage — Change Stream & Integration Test

Wire up proper change events in `bulkWrite()` so replication can track changes. Write an integration test that exercises the full RxDB → SQLite → replication flow.

**Files:**
- Modify: `packages/storage-sqlite/src/storage-instance.ts`
- Create: `packages/storage-sqlite/src/integration.test.ts`

**Step 1: Write the integration test**

Create `packages/storage-sqlite/src/integration.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { createRxDatabase, addRxPlugin } from 'rxdb';
import { RxDBDevModePlugin } from 'rxdb/plugins/dev-mode';

import { getRxStorageSQLite } from './rx-storage-sqlite';
import type { SQLiteDatabase } from './types';

addRxPlugin(RxDBDevModePlugin);

/**
 * Minimal in-memory SQLite mock for integration testing.
 * For production testing, swap with better-sqlite3 or actual expo-sqlite.
 */
function createInMemorySQLite(): SQLiteDatabase {
  const tables: Record<string, Map<string, any>> = {};

  return {
    execSync(sql: string) {
      const match = sql.match(/CREATE TABLE IF NOT EXISTS "(\w+)"/);
      if (match && !tables[match[1]]) {
        tables[match[1]] = new Map();
      }
      const dropMatch = sql.match(/DROP TABLE IF EXISTS "(\w+)"/);
      if (dropMatch) {
        delete tables[dropMatch[1]];
      }
    },
    getAllSync<T>(sql: string, params?: any[]): T[] {
      const tableMatch = sql.match(/FROM "(\w+)"/);
      if (!tableMatch) return [];
      const table = tables[tableMatch[1]];
      if (!table) return [];

      let rows = Array.from(table.values());

      // Handle WHERE _deleted = 0
      if (sql.includes('_deleted = 0')) {
        rows = rows.filter((r) => !r._deleted);
      }

      // Handle WHERE id IN (...)
      if (sql.includes('WHERE id IN') && params) {
        rows = rows.filter((r) => params.includes(r.id));
      }

      // Handle COUNT
      if (sql.includes('COUNT(*)')) {
        return [{ count: rows.length } as any];
      }

      // Handle _meta_lwt > ?
      if (sql.includes('_meta_lwt >') && params) {
        rows = rows.filter((r) => (r._meta_lwt ?? 0) > params[0]);
        if (params[1]) rows = rows.slice(0, params[1]);
      }

      return rows.map((r) => ({ data: JSON.stringify(r) })) as T[];
    },
    runSync(sql: string, params?: any[]) {
      if (sql.includes('INSERT OR REPLACE') && params) {
        const tableMatch = sql.match(/INTO "(\w+)"/);
        if (tableMatch) {
          const table = tables[tableMatch[1]];
          if (table) {
            const data = JSON.parse(params[1] as string);
            data._deleted = params[2] === 1;
            data._meta_lwt = params[4];
            table.set(params[0] as string, data);
          }
        }
      }
      if (sql.includes('DELETE FROM') && params) {
        // cleanup
      }
      return { changes: 1, lastInsertRowId: 1 };
    },
  };
}

const testSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object' as const,
  properties: {
    id: { type: 'string', maxLength: 100 },
    name: { type: 'string' },
  },
  required: ['id', 'name'],
};

describe('SQLite Storage integration with RxDB', () => {
  it('creates a database, inserts, and queries documents', async () => {
    const sqliteDb = createInMemorySQLite();
    const storage = getRxStorageSQLite({ database: sqliteDb });

    const db = await createRxDatabase({
      name: `integration_test_${Date.now()}`,
      storage,
      multiInstance: false,
      ignoreDuplicate: true,
    });

    await db.addCollections({
      items: { schema: testSchema },
    });

    await db.items.insert({ id: '1', name: 'Test Item' });

    const docs = await db.items.find().exec();
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe('Test Item');

    await db.close();
  });
});
```

**Step 2: Update bulkWrite to emit change events**

In `packages/storage-sqlite/src/storage-instance.ts`, update `bulkWrite()` to emit to the change subject after writing. Add event construction:

```typescript
// Add to imports:
import { now } from 'rxdb';

// In bulkWrite(), after the for loop, emit changes:
if (successDocs.length > 0) {
  const events: RxStorageChangeEvent<RxDocType>[] = successDocs.map((docData: any) => ({
    documentId: docData[primaryPath],
    operation: writeRow.previous ? 'UPDATE' : 'INSERT' as any,
    documentData: docData,
    previousDocumentData: writeRow.previous,
  }));

  this.changeSubject.next({
    id: String(Date.now()),
    events,
    checkpoint: {
      id: successDocs[successDocs.length - 1][primaryPath],
      lwt: now(),
    },
    context,
    startTime: now(),
    endTime: now(),
  });
}
```

Note: The exact shape of `RxStorageChangeEvent` and `EventBulk` will need to match the RxDB version. Adjust field names to match the actual types from rxdb 16.21.1.

**Step 3: Run integration test**

```bash
pnpm vitest run packages/storage-sqlite/src/integration.test.ts
```

This test may need iteration depending on how RxDB internally calls the storage methods. Debug and adjust the mock/implementation until RxDB can round-trip documents through the SQLite adapter.

**Step 4: Commit**

```bash
git add packages/storage-sqlite/src/
git commit -m "feat(storage-sqlite): change stream events and integration test"
```

---

## Task 15: Update getStorage for React Native

Update the storage factory to support the SQLite adapter when running in React Native.

**Files:**
- Modify: `packages/database/src/storage.ts`

**Step 1: Add React Native detection**

Update `packages/database/src/storage.ts`:

```typescript
import type { RxStorage } from 'rxdb';
import { getRxStorageMemory } from 'rxdb/plugins/storage-memory';

/**
 * Returns the appropriate RxDB storage adapter for the current platform.
 *
 * - Web browser: Dexie (IndexedDB)
 * - React Native: provide SQLite storage via createTallyDatabase({ storage })
 * - Node/SSR/test: In-memory
 */
export function getStorage(): RxStorage<any, any> {
  if (typeof window === 'undefined') {
    return getRxStorageMemory();
  }

  // React Native — no IndexedDB available.
  // Users must provide SQLite storage explicitly via createTallyDatabase({ storage }).
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    throw new Error(
      'React Native detected. Pass a storage adapter explicitly:\n' +
      '  import { getRxStorageSQLite } from "@tallyui/storage-sqlite";\n' +
      '  createTallyDatabase({ connector, storage: getRxStorageSQLite({ database }) })'
    );
  }

  const { getRxStorageDexie } = require('rxdb/plugins/storage-dexie');
  return getRxStorageDexie();
}
```

**Step 2: Verify existing tests still pass**

```bash
pnpm vitest run packages/database/
```

**Step 3: Commit**

```bash
git add packages/database/src/storage.ts
git commit -m "feat(database): detect React Native in getStorage, guide to explicit SQLite"
```

---

## Task 16: Deprecate CollectionSync + Final Cleanup

Mark `CollectionSync` as deprecated. Update barrel exports. Run full typecheck and test suite.

**Files:**
- Modify: `packages/core/src/types/connector.ts`
- Modify: `packages/core/src/index.ts`

**Step 1: Add deprecation JSDoc**

In `packages/core/src/types/connector.ts`, update `CollectionSync`:

```typescript
/**
 * @deprecated Use ReplicationAdapter instead. This interface will be removed
 * once all connectors have migrated to the RxDB replication protocol.
 */
export interface CollectionSync<T = any> {
  // ... existing fields unchanged ...
}
```

Also deprecate the `sync` property on `TallyConnector`:

```typescript
export interface TallyConnector {
  // ...

  /**
   * @deprecated Use `replication` instead.
   * Sync configuration for each collection (legacy pull-based sync).
   */
  sync: {
    products: CollectionSync;
    [key: string]: CollectionSync;
  };

  /** Replication adapters for each collection (RxDB replication protocol) */
  replication?: {
    products?: ReplicationAdapter<any>;
    [key: string]: ReplicationAdapter<any> | undefined;
  };
}
```

**Step 2: Run full typecheck and tests**

```bash
pnpm turbo typecheck
pnpm vitest run
```

Expected: All pass. Existing connector code still compiles since `sync` is still present.

**Step 3: Commit**

```bash
git add packages/core/src/types/connector.ts
git commit -m "chore(core): deprecate CollectionSync in favor of ReplicationAdapter"
```

---

## Summary

| Task | What | Package |
|------|------|---------|
| 1 | Set up Vitest | root |
| 2 | ReplicationAdapter type | @tallyui/core |
| 3 | Update TallyConnector + SyncContext | @tallyui/core |
| 4 | startReplication orchestrator | @tallyui/database |
| 5 | WooCommerce pull+push handlers | @tallyui/connector-woocommerce |
| 6 | Wire WooCommerce connector | @tallyui/connector-woocommerce |
| 7 | Storage factory (getStorage) | @tallyui/database |
| 8 | Shopify replication adapter | @tallyui/connector-shopify |
| 9 | Medusa replication adapter | @tallyui/connector-medusa |
| 10 | Vendure replication adapter | @tallyui/connector-vendure |
| 11 | SQLite package scaffold | @tallyui/storage-sqlite |
| 12 | SQLite core storage instance | @tallyui/storage-sqlite |
| 13 | Mango-to-SQL query engine | @tallyui/storage-sqlite |
| 14 | SQLite change stream + integration | @tallyui/storage-sqlite |
| 15 | getStorage React Native support | @tallyui/database |
| 16 | Deprecate CollectionSync | @tallyui/core |
