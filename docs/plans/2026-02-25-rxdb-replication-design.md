# RxDB Replication Layer Design

## Goal

Offline-first bidirectional replication between TallyUI's RxDB layer and remote e-commerce backends, using RxDB's built-in replication protocol.

## Decisions

- **Replication engine**: RxDB `replicateRxCollection`
- **Storage**: IndexedDB (web), custom SQLite adapter via expo-sqlite (mobile), in-memory (dev/SSR)
- **Sync direction**: Bidirectional (pull + push)
- **Conflict resolution**: Server-wins
- **Live sync**: Real-time streams where backends support them, polling fallback elsewhere
- **SQLite adapter**: Custom-built over expo-sqlite (no RxDB premium dependency)

## Architecture

```
Remote API ←→ ReplicationAdapter (per connector) ←→ replicateRxCollection ←→ RxDB Storage ←→ UI
                                                                              ↑
                                                                    IndexedDB (web)
                                                                    SQLite (mobile)
                                                                    Memory (dev/SSR)
```

## New Interface: ReplicationAdapter

Replaces the current `CollectionSync` interface. Maps directly onto RxDB's pull/push handler contract.

```typescript
import type { RxReplicationPullStreamItem, RxReplicationWriteToMasterRow } from 'rxdb';
import type { Observable } from 'rxjs';

export interface ReplicationAdapter<T, CheckpointType = any> {
  pull: {
    handler: (
      lastCheckpoint: CheckpointType | undefined,
      batchSize: number,
      context: SyncContext
    ) => Promise<{
      documents: T[];
      checkpoint: CheckpointType;
    }>;
    stream$?: Observable<RxReplicationPullStreamItem<T, CheckpointType>>;
  };

  push?: {
    handler: (
      changeRows: RxReplicationWriteToMasterRow<T>[],
      context: SyncContext
    ) => Promise<T[]>; // returns conflict documents
    batchSize?: number;
  };
}
```

## Storage Layer

A `getStorage()` factory in `@tallyui/database` returns the right adapter per platform:

- **Web**: `getRxStorageIndexedDB()` from `rxdb/plugins/storage-indexeddb`
- **React Native**: Custom `getRxStorageSQLite()` wrapping expo-sqlite
- **Dev/SSR**: `getRxStorageMemory()` (existing default)

## Custom SQLite Storage Adapter

New package `@tallyui/storage-sqlite` implementing RxDB's `RxStorage` interface over `expo-sqlite`.

Key methods:

- `createStorageInstance()` — creates tables per collection
- `bulkWrite()` — INSERT/UPDATE with conflict detection
- `findDocumentsById()` — SELECT by primary key
- `query()` — translate RxDB Mango-style queries to SQL
- `getChangedDocumentsSince()` — checkpoint-based change feed for replication
- `changeStream()` — Observable of local write events
- `cleanup()` / `close()` / `remove()` — lifecycle

Mango-to-SQL query translation starts with a subset: equality, `$gt`, `$lt`, `$in`, `$regex`, `sort`, `limit`, `skip`.

## Replication Orchestrator

A `startReplication()` function in `@tallyui/database` wires up RxDB replication for each collection:

```typescript
function startReplication<T>(
  collection: RxCollection<T>,
  adapter: ReplicationAdapter<T>,
  context: SyncContext,
  options?: { live?: boolean; retryTime?: number }
) {
  return replicateRxCollection({
    collection,
    replicationIdentifier: `${context.connectorId}-${collection.name}`,
    pull: {
      handler: (checkpoint, batchSize) =>
        adapter.pull.handler(checkpoint, batchSize, context),
      stream$: adapter.pull.stream$,
    },
    push: adapter.push
      ? {
          handler: (rows) => adapter.push!.handler(rows, context),
          batchSize: adapter.push.batchSize,
        }
      : undefined,
    live: options?.live ?? true,
    retryTime: options?.retryTime ?? 5000,
    autoStart: true,
  });
}
```

## Conflict Resolution

Server-wins. The push handler sends local changes to the API. If the server rejects or returns a newer version, we return the server's version as a "conflict" document. RxDB automatically overwrites the local copy.

## Connector Implementations

### WooCommerce

- **Checkpoint**: `{ id: string; modified: string }`
- **Pull**: `?modified_after=<checkpoint.modified>&orderby=modified&order=asc&per_page=<batchSize>`
- **Push**: `PUT /products/<id>` for updates, `POST /products` for creates
- **Stream**: WCPOS SSE if available, polling fallback for vanilla WooCommerce

### Shopify

- **Checkpoint**: `{ updated_at: string; cursor?: string }`
- **Pull**: `?updated_at_min=<checkpoint.updated_at>&limit=<batchSize>`, follows `Link` header
- **Push**: `PUT /admin/api/products/<id>.json`
- **Stream**: Polling (webhooks need a proxy)

### Medusa

- **Checkpoint**: `{ offset: number; updated_at: string }`
- **Pull**: `?updated_at[gte]=<checkpoint.updated_at>&offset=<offset>&limit=<batchSize>`
- **Push**: `POST /admin/products/<id>`
- **Stream**: Polling

### Vendure

- **Checkpoint**: `{ skip: number; updatedAt: string }`
- **Pull**: GraphQL with `filter: { updatedAt: { after: checkpoint.updatedAt } }`, `take`, `skip`
- **Push**: GraphQL mutations (`updateProduct`, `createProduct`)
- **Stream**: GraphQL subscriptions possible in the future, polling initially

## Package Changes

| Package | Changes |
|---------|---------|
| `@tallyui/core` | Add `ReplicationAdapter` type, deprecate `CollectionSync` |
| `@tallyui/database` | Add `getStorage()` factory, `startReplication()` orchestrator |
| `@tallyui/storage-sqlite` | New package: RxDB storage adapter over expo-sqlite |
| Each connector | Rewrite sync files to implement `ReplicationAdapter` |
| `apps/demo` | Keep in-memory for demo mode |

### New Dependencies

- `rxdb/plugins/replication` (bundled with rxdb)
- `rxdb/plugins/storage-indexeddb` (web)
- `expo-sqlite` (mobile, already in Expo ecosystem)

## Migration Order

1. Add `ReplicationAdapter` interface to `@tallyui/core` alongside `CollectionSync`
2. Build `@tallyui/storage-sqlite` package
3. Add storage factory + replication orchestrator to `@tallyui/database`
4. Migrate WooCommerce connector first (most mature)
5. Migrate remaining connectors (Shopify, Medusa, Vendure)
6. Add real-time stream support where backends allow it
7. Remove deprecated `CollectionSync`
