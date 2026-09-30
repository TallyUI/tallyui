---
'@tallyui/database': minor
---

A reconcile result now says whether its pass was complete, so a till never shows a partial pass's "0 not sold" as current (found by the Medusa POS app's 3.0.0-next.0 adoption).

- **`complete`** on `CatalogueReconcileSummary`, `FingerprintReconcileResult` and `IdReconcileResult`: true when the pass ran from its first page to its last in one go, so `unlisted` and `unreported` are real counts. It is false for a resumed pass, whose counts are 0. For the fingerprint result, the pass must also have read at least one page.
- **`lastCompleteAt`** on the runner's and the fingerprint wrapper's state: when the last complete pass finished. It is persisted with the runner's gate, and is available before the first pass after a restart.
- **A failed pass that finished no page** is restarted rather than resumed. It re-reads from the first page anyway, so it now runs as a complete pass.
