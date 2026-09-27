---
"@tallyui/core": minor
"@tallyui/database": patch
"@tallyui/pos": patch
---

`readFresh`, `countFresh` and `watchFresh` move to a new, side-effect-free subpath, `@tallyui/core/rxdb`. Core now lists `rxdb` (`>=16`) and `rxjs` (`>=7`) as optional peer dependencies, needed only by that subpath; core's main entry stays free of both. `@tallyui/pos` re-exports the helpers unchanged. The id and fingerprint reconciles in `@tallyui/database` read the local products with `readFresh` instead of a cached `find()`, so a product the pull inserts or deletes while a pass reads them no longer leaves every later pass reading a stale list (RxDB 16.21.1 bug 4): an inserted product is now checked, and tombstoned or re-fetched, on the next pass, and a deleted one is no longer re-enqueued or counted towards the mass-delete brake.
