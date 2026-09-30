---
'@tallyui/connector-woocommerce': minor
'@tallyui/database': patch
---

The WooCommerce connector gets a daily reconciliation pass (#248, part B), a safety net for edits the incremental pull can miss: the spring-forward hour, an over-excluding filter, a same-second edit, a shift without `X-WP-Total`, trashed or unpublished products, and stock written without a modified-time bump.

- `reconcile.catalogue` lists the published catalogue with no date filter, comparing date, stock quantity and stock status. It re-reads deletion candidates by id and removes only those that are gone, trashed or unpublished. Everything else it re-pulls through the collection's own pull.
- `replication.products` now combines the product pull with the reconcile feed, with `legacyKey: 'products'`, so existing installs keep their checkpoint.
- A product the store cannot be asked about (no numeric id) is never deleted.
- The WCPOS bulk-ID fast path is read from `wcpos/v2/status` `capabilities` (`products_id_fast_path`). It stays dormant until wcpos/woocommerce-pos#2113 ships.
- `@tallyui/database`: the catalogue runner's gate check has a 60-second floor, so a bad interval can no longer re-arm it on every tick.
