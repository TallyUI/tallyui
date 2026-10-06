---
'@tallyui/pos': minor
---

A register session whose stored status this build does not know (written by a later build, then the app rolled back) now makes the register "needs upgrade" instead of counting as open. `useRegisterSession` reports `needsUpgrade: true` and no current or sellable session. Opening, counting, closing, stamping a sale and recording cash on it refuse with `RegisterNeedsUpgradeError` (code `REGISTER_NEEDS_UPGRADE`), whose message can be shown to the cashier. Reconcile never sends such a status. `isKnownSessionStatus` is exported for apps that read session rows themselves.
