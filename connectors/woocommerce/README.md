# TallyUI WooCommerce connector

## Requirements

- **WooCommerce 5.8 or later.** The product pull filters by modification date with `modified_after`, added in WooCommerce 5.8, and compares it in GMT with `dates_are_gmt`, added in 5.4.
- **The WCPOS Free plugin, 1.10.0 or later.** The connector reads through its `wcpos/v2` routes, which add each product's `uuid`. Set `SyncContext.baseUrl` to `<site>/wp-json/wcpos/v2`.

## Authentication

`auth.getHeaders({ token })` sends the WCPOS access token as `Authorization: Bearer <token>`, together with the POS marker `X-WCPOS: 1`. Without a token it throws `WooMissingTokenError`. WooCommerce consumer keys are not supported.

It also sends `X-WCPOS-Protocol: 2`, which WCPOS 2.0 requires of POS requests, and `X-WCPOS-Client: tallyui/<connector version>` (lowercase `[a-z0-9._-]`, at most 32 characters), which WCPOS uses only for consent-gated telemetry.

## Product pull

The pull works in passes:
- a small request finds the store's newest `date_modified_gmt`;
- the pass then pages every product modified since the last pass, by id with an offset;
- if a product leaves the window mid-pass (read from `X-WP-Total`), the pass restarts.

When nothing has changed, a poll costs one request. Products whose `status` is not `publish` reach the till as deletions.

Dates are sent as GMT digits **without** a timezone offset, together with `dates_are_gmt=true`. WordPress parses an offset-bearing date in the site's timezone before it compares it with the GMT column, so an explicit offset would shift the filter by the site's UTC offset.

## Reconciliation

The incremental pull can miss an edit: a `modified_after` that over-excludes (including a bound in the site's spring-forward hour), an edit in the same second as the last mark, a removal mid-pass on a store that hides `X-WP-Total`, a trashed product, or a stock change written without a modified-time bump. `reconcile.catalogue` is the daily safety net for all of them. Run it with `@tallyui/database`'s `startCatalogueReconcile`, beside the product replication, on the same collection.
- It reads `wcpos/v2/status` once per pass, then lists every published product (`status=publish`, `_fields=id,uuid,date_modified_gmt,stock_quantity,stock_status`, 100 per page) with no date filter. A failed status read only means no capability is known; a rejected token (401, 403) or a till that needs updating (426) stops the pass.
- A product whose `(date_modified_gmt, stock_quantity, stock_status)` differs from the till's copy, or that the till lacks, is refetched by id through the product pull (`replication.products` combines the product feed with a reconcile feed). Nothing is written locally.
- A product the till holds but the listing omits is removed only when a by-id re-read (`include=`, `status=any`) finds it gone, trashed or unpublished, and within the runner's mass-delete brake.
- A product hidden from the POS after it synced (WCPOS "online only" visibility, with POS-only products turned on) is removed from the till by the pass; hiding many at once is held by the mass-delete brake.
- An existing install keeps its pull checkpoint: the combined pull reads it under `legacyKey: 'products'`.
- When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1` with `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100; a store that refuses it (a 400) is listed page by page in the same pass.
- Both listings key on the numeric product id, never the till-local uuid; the adapter's `matchKey` is how the runner finds the till's copy.

## Errors

- `ConnectorUnauthorizedError`, from `@tallyui/core` and re-exported here: the store refused the request (401: the token is missing, expired or revoked; 403: signed in but not allowed), or `WooMissingTokenError` (a subclass) was thrown for a missing token. `error.status` is `401` (`code: 'unauthorized'`, sign in again) or `403` (`code: 'forbidden'`, signed in but not allowed: the pull retries on the store schedule; don't sign out).
- `WooPluginUpdateRequiredError` (`code: 'unsupported_store'`, `fixedBy: 'store'`, `software: 'WCPOS'`, `minVersion: '1.10.8'`, and the store's own `storeCode`): the store answered a `jwt_auth_*` 403, which WCPOS before 1.10.8 sends for a valid token (wcpos#1863). The store owner must update WCPOS to 1.10.8; the pull retries on the store schedule and the till stays signed in.
- `WooDateFilterError` (`code: 'unsupported_store'`): the store returned a product outside the requested date window, so it does not honour `modified_after` (WooCommerce before 5.8, or a proxy that drops the parameter). An app should show its own words for the `code`; the message, `This store needs WooCommerce 5.8 or later to sync products.`, is a plain fallback. The diagnostics are in `productId`, `bound` (the `modified_after` sent) and `received`. Today the pull retries a failed request every 5 s (RxDB's `retryTime`), one mark request each time. Stopping on errors that cannot recover is shared replication work.
- `WooTillUpdateRequiredError` (`code: 'till_update_required'`, `fixedBy: 'till'`): the store answered 426, normally WCPOS's protocol gate (`serverCode: 'wcpos_update_required'`), so this till must be updated; the pull pauses until `resume()`.
- `WooMissingUuidError`: a product came back without a `uuid`, so the store is not running the WCPOS Free plugin 1.10.0 or later, or the connector is not reaching it through `wcpos/v2`.
