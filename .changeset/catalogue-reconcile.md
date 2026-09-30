---
'@tallyui/core': minor
'@tallyui/database': minor
---

**One catalogue reconcile runner** replaces the id and fingerprint reconcile runners (#248, part A). `startIdReconcile` and `startFingerprintReconcile` remain as thin wrappers with their options and results.

- **`startCatalogueReconcile` (new)** compares the backend's product listing with the till in one pass and hands what differs to the collection's pull. It:
  - stays within a request budget (30 a minute by default) instead of a page cap, so large catalogues never truncate;
  - keeps its daily gate and a resume cursor in RxDB local documents, so it does not run on every start, and it resumes after an interruption;
  - deletes only in an uninterrupted pass, and only what the connector confirms gone. The mass-delete brake is checked on the candidates *before* the connector is asked, and the connector is asked in chunks (`confirmChunk`, default 100), each within the budget;
  - stops or skips by `errorKind`;
  - logs what it did through an optional `log` callback.
- **Behaviour changes for the existing runners:**
  - there is no pass 5 s after every start: the daily gate is checked at the start delay and then hourly;
  - `maxPages` is ignored;
  - requests are paced by the budget;
  - differences are refetched page by page;
  - apps that run more than one runner on the same collection pass a distinct `stateId`.
- **`createReconcileFeed`:**
  - it takes an optional `key` to match fetched documents by the local primary key, so it works where `doc.id` is not the primary key; `fetchByIds` then receives the queued entries;
  - a `tombstone` entry is deleted without a fetch;
  - a fetched document keeps a `_deleted` the connector set.
- **`@tallyui/core`** adds `CatalogueReconcileAdapter` and `TallyConnector.reconcile.catalogue`.
- **Connector collections** enable RxDB local documents.
