# TallyUI WooCommerce connector

## Requirements

- **WooCommerce 5.8 or later.** The product pull filters by modification date with `modified_after`, added in WooCommerce 5.8, and compares it in GMT with `dates_are_gmt`, added in 5.4.
- **The WCPOS Free plugin, 1.10.0 or later.** The connector reads through its `wcpos/v2` routes, which add each product's `uuid`. Set `SyncContext.baseUrl` to `<site>/wp-json/wcpos/v2`.

## Authentication

`auth.getHeaders({ token })` sends the WCPOS access token as `Authorization: Bearer <token>`, together with the POS marker `X-WCPOS: 1`. Without a token it throws `WooMissingTokenError`. WooCommerce consumer keys are not supported.

## Product pull

The pull works in passes:
- a small request finds the store's newest `date_modified_gmt`;
- the pass then pages every product modified since the last pass, by id with an offset;
- if a product leaves the window mid-pass (read from `X-WP-Total`), the pass restarts.

When nothing has changed, a poll costs one request. Products whose `status` is not `publish` reach the till as deletions.

Dates are sent as GMT digits **without** a timezone offset, together with `dates_are_gmt=true`. WordPress parses an offset-bearing date in the site's timezone before it compares it with the GMT column, so an explicit offset would shift the filter by the site's UTC offset.

## Reconciliation

The incremental pull can miss an edit: a `modified_after` that over-excludes (including a bound in the site's spring-forward hour), an edit in the same second as the last mark, a removal mid-pass on a store that hides `X-WP-Total`, a trashed product, or a stock change written without a modified-time bump. `reconcile.catalogue` is the daily safety net for all of them. Run it with `@tallyui/database`'s `startCatalogueReconcile`, beside the product replication, on the same collection.
- It reads `wcpos/v2/status` once per pass, then lists every published product (`status=publish`, `_fields=id,uuid,date_modified_gmt,stock_quantity,stock_status`, 100 per page) with no date filter.
- A product whose `(date_modified_gmt, stock_quantity, stock_status)` differs from the till's copy, or that the till lacks, is refetched by id through the product pull (`replication.products` combines the product feed with a reconcile feed). Nothing is written locally.
- A product the till holds but the listing omits is removed only when a by-id re-read (`include=`, `status=any`) finds it gone, trashed or unpublished, and within the runner's mass-delete brake.
- An existing install keeps its pull checkpoint: the combined pull reads it under `legacyKey: 'products'`.
- The WCPOS bulk-id fast path is dormant: it is chosen only when `status.capabilities` includes `products_id_fast_path` (wcpos/woocommerce-pos#2113), and until its id-to-uuid mapping exists the listing stays paged.

## Errors

- `ConnectorUnauthorizedError` (`code: 'unauthorized'`), from `@tallyui/core` and re-exported here: the store rejected the token (401 or 403), or `WooMissingTokenError` (a subclass) was thrown for a missing token. The app should sign in again.
- `WooDateFilterError` (`code: 'unsupported_store'`): the store returned a product outside the requested date window, so it does not honour `modified_after` (WooCommerce before 5.8, or a proxy that drops the parameter). An app should show its own words for the `code`; the message, `This store needs WooCommerce 5.8 or later to sync products.`, is a plain fallback. The diagnostics are in `productId`, `bound` (the `modified_after` sent) and `received`. Today the pull retries a failed request every 5 s (RxDB's `retryTime`), one mark request each time. Stopping on errors that cannot recover is shared replication work.
- `WooMissingUuidError`: a product came back without a `uuid`, so the store is not running the WCPOS Free plugin 1.10.0 or later, or the connector is not reaching it through `wcpos/v2`.
