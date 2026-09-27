# RxDB's query cache: which reads may decide money or sync

**The rule:** in TallyUI and every connector built on it, a read that decides **money** (a sale, a payment, a closure, a stock decision) or **sync** (what is sent, pulled, tombstoned or re-fetched) never goes through a cached `RxQuery`. It uses `readFresh`/`countFresh`, a primary-key read of storage (`collection.storageInstance.findDocumentsById`), or a live `watchFresh`. A cached `find()`/`findOne()`/`count()` is fine only for display, or where the safety argument below applies and is written down next to the read.

## Why

RxDB 16.21.1 has a bug in its query cache. A document written while a cached `RxQuery`'s storage read is in flight is counted as seen, but is missing from the result. RxDB caches the `RxQuery` per query string, so:
- every later `exec()`/`count()` of the same query returns the stale result;
- its `.$` carries on from the stale result;
- a later write that matches the query doesn't heal it, and nor does an unrelated one.

It heals only on the next write to the missed document itself, on more than 100 change events between two runs of the query, on cache eviction (more than 100 cached queries), or on a restart. No subscription is needed: a plain `exec()` that overlaps a write is enough.

In TallyUI this left a raced sale unsent in the order outbox until the app restarted (fixed in #146). It also left the register's live `expected` and sales count stale (fixed in #151).

**How the helpers work:**
- `readFresh(collection, query)` sends RxDB's own prepared query (`collection.find(query).getPreparedQuery()`, which carries the `_deleted: false` filter, the sort and the limit) straight to `collection.storageInstance.query`, and returns plain document data.
- `countFresh` does the same through `storageInstance.count`.
- `watchFresh(collection, query)` re-reads with `readFresh` on subscribe and on every `collection.eventBulks$` event, once per storage write batch (#153).

The helpers go through the same wrapped storage instance an `RxQuery` uses. They haven't been tested with key compression or field encryption, and no TallyUI collection uses either.

## When a cached read is still safe

Each point was traced in RxDB 16.21.1's source or shown by a probe during the 2026-09-28 audit:
- **Only a storage read can go stale:** the first run of a cached query, a re-run after more than 100 change events, or event-reduce's full re-run. Other runs are answered from the cache without reading storage.
- **Runs of one `RxQuery` are serialised.** A writer that first reads a document through the same query, then writes, can't land inside that query's storage read.
- **A primary-key `findOne(id)` can't race when the document is in RxDB's document cache.** It can race when the document is cold.
- **A write through `incrementalModify`/`incrementalPatch` is safe even from a stale handle.** The modifier sees the stored state, and the write retries on a revision conflict. Any **decision** made from the stale handle's fields, before the write, is not safe.
- **Local documents (`getLocal`, `getLocal$`) have no query cache.** A cold read is point-in-time, and the next read is fresh.
- **RxDB replication never uses `RxQuery`.** Checkpoints, pull and push read storage instances directly.

## The audit (2026-09-28, TallyUI `main` at `486803e`)

**Scope:** every `.exec()`, `.$`, `.count(`, `findOne(`, `findByIds(`, `.find(` and `getLatest()` in `packages/pos/src`, `packages/database/src` and `connectors/*/src`, tests excluded. **Counts:** MONEY 2, SYNC 2, DISPLAY 17, NONE 18. Line numbers are as of that commit.

### MONEY and SYNC: being fixed

| Cost | Read | What a stale result costs | Fix |
|---|---|---|---|
| MONEY (latent) | `session-store.ts:64` (`requireLiveSession`, used by `stampSession`, `recordMovement` and `voidMovement`) | A sale stamped onto a closed session (on no Z, with no late-sale fact), or a movement recorded on a closed session and missing from its frozen closure. It's safe today only because the one status writer reads through the same `findOne` first; a writer that skips that read (such as a server-side close) would expose it. | A primary-key storage read, before any server-sync work |
| MONEY (latent) | `session-store.ts:218` (`recordMovement`'s re-read) | As above | The same |
| SYNC | `id-reconcile.ts:78` | A product inserted during the read is never checked, so a backend delete is never tombstoned. A product deleted during the read is re-enqueued and counted as a tombstone on every pass, which can trip the mass-delete brake. | `readFresh` (the helper moves to `@tallyui/database`) |
| SYNC | `fingerprint-reconcile.ts:106` | A product inserted during the read is never re-checked, so a missed price is never corrected | The same |

### DISPLAY: a stale result shows a cashier something out of date

| Read | Purpose | Stale until |
|---|---|---|
| `pos/src/product/stock.ts:11` | `stockOverlay$`, the stock badges | A removed key stays until restart; a stale value until the next pass changes that key |
| `database/src/reconcile.ts:98` | Stock pass: which rows changed | Shares the cached query above. A missing row is re-upserted on the next pass. |
| `pos/src/product/stock.ts:22` | `stockOverlayAsOf$`, the "stock as of" time | The next pass's local-doc write |
| `pos/src/register/register-document.ts:91` | `observeRegister$`, the closure reservation | The next register-document write |
| `pos/src/register/session-store.ts:79` | `requireOpenSession`, the tender and movement gate | One call: the gate's own patch writes the document, and a closed id it returned is refused by the stamp check |
| `pos/src/register/session-store.ts:220` | `recordMovement`: does the frozen closure count this movement? | Exposed only after more than 100 closure events |
| `pos/src/register/session-store.ts:307` | `writeClosure`: already frozen? | As above. If stale, the insert conflicts and the winner's Z stands. |
| `pos/src/register/session-store.ts:419` | `writeClosure`: fetch the winner after a conflict | As above |
| `pos/src/order/order-manager.ts:38` | `parkedOrders$` | The parked order's next write (no in-repo caller) |
| `pos/src/order/order-manager.ts:81` | `resumeOrder` | The next write to that draft |
| `pos/src/order/order-manager.ts:152` | `deleteParkedOrder` | As above |
| `pos/src/repository/create-repository.ts:11` | `findById$` (generic) | The next write to that document (no in-repo caller) |
| `pos/src/repository/create-repository.ts:18` | `findAll$` | The next write to the missed document |
| `pos/src/repository/create-repository.ts:26` | `search$` | As above |
| `pos/src/repository/create-repository.ts:42` | `count$`, which stays off by one | Restart, or more than 100 events |
| `pos/src/repository/create-repository.ts:53` | `update`'s handle (the patch itself is safe) | The next write to that document |
| `pos/src/repository/create-repository.ts:60` | `remove`'s handle | As above |

### NONE: proven safe, and why

| Read | Why it's safe |
|---|---|
| `order-outbox.ts:112-114`, `:161` | The decision is a primary-key storage read, or is made inside the `incrementalModify` modifier. `findOne` is only the handle. |
| `order-outbox.ts:180` | `collection.$` is an event stream, not a query |
| `use-order-outbox.ts` (`current`, `record`, `isStored`) | A React ref; `record` decides from the storage write's own result; `isStored` is a primary-key storage read |
| `session-store.ts:142`/`:149` (`transition`), `:173` (`closeSession`) | The guard runs again inside `incrementalModify`, which sees the stored state |
| `session-store.ts:238`/`:248` (`voidMovement`) | It checks fields no code changes after insert; the claim is made inside the modifier |
| `session-store.ts:414`, `register-document.ts:64`/`:101` | Local documents, which have no query cache; writes go through `incrementalModify` |
| `use-register-session.ts:221` | `readRegister`, a local document |
| `reconcile.ts:71` | A one-shot `getLocal` at start |
| `reconcile.ts:112` | `bulkRemove`'s internal `findByIds`: a new id list each pass, and the pass is the only writer |
| `pos-order/open.ts:39` | A storage-instance read, not an `RxQuery` |
| Replication (`database/src/replication.ts`, connector pull/push handlers) | RxDB replication reads storage instances directly; connector handlers read no local collection |

## For connector authors

A new backend's connector (pull and push handlers, reconcile passes, stock feeds) follows the rule at the top. Reads that decide what to send, tombstone, re-fetch or charge go through `readFresh`/`countFresh`/`watchFresh` or a primary-key storage read. Where a cached read is kept on purpose, a comment next to it says which safety argument above applies.
