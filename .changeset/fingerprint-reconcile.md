---
'@tallyui/core': minor
'@tallyui/database': minor
'@tallyui/connector-medusa': minor
---

Add the fingerprint reconcile (ADR-060 amendment 8): a neutral runner that compares a remote fingerprint per product against the local documents and re-delivers products whose fingerprint differs, through the collection's pull. `@tallyui/core` adds the `FingerprintReconcileAdapter` contract (`fetchPages`, a pure `fingerprint` and `enqueue`) and an optional `reconcile.prices` on `TallyConnector`. `@tallyui/database` adds `startFingerprintReconcile`, which runs no pass at start by default and otherwise mirrors the id reconcile: a complete, successful pass only, `state$` (`running`, `lastResult`, `lastError`), and `stop()`. `@tallyui/connector-medusa` adds `reconcile.prices`, a nightly base-price backstop (`MEDUSA_PRICE_RECONCILE_INTERVAL_MS`) for the variant feed (ADR-060 job D1): it fingerprints each product's base prices (variant id, currency and amount, sorted, price-list prices excluded) from `/admin/product-variants`. Nothing is written locally; corrections arrive only through the reconcile feed's pull.
