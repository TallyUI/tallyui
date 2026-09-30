---
'@tallyui/connector-woocommerce': minor
'@tallyui/connector-medusa': minor
'@tallyui/connector-vendure': minor
'@tallyui/core': minor
'@tallyui/database': minor
---

**One reconcile feed per store session** (#307, a release gate). The WooCommerce and Medusa reconcile feeds were module-level singletons, so after a store switch in one runtime, store A's queued tombstones and refetches could reach store B's database.

- **New factories.** `createWooCommerceConnector()`, `createMedusaConnector()` and `createMedusaAdminUserConnector()` each build their own feed; `createVendureConnector(options)` already did. **Build a connector per store session**, anew on each sign-in or store change.
- **Deprecated exports.** `woocommerceConnector`, `medusaConnector`, `medusaAdminUserConnector` and `vendureConnector` are deprecated: one instance for the whole app can leak queued reconcile work across stores. **They are removed in 4.0.**
- **A development warning.** `startReplication` warns once when the same adapter object replicates into two collections at once.
- **Refetch budget by requests.** `refetchBatchSize` on the reconcile adapters makes a page that enqueues `n` refetches take `ceil(n / refetchBatchSize)` request-budget slots (WooCommerce 100, Medusa 100, Vendure 1,000).
- **WooCommerce 426 errors.** A foreign (non-WCPOS) 426 keeps the store's `code` beside its message, and the message is capped at 200 characters.
