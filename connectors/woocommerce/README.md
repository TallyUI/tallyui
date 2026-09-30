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

## Errors

- `ConnectorUnauthorizedError` (`code: 'unauthorized'`), from `@tallyui/core` and re-exported here: the store rejected the token (401 or 403), or `WooMissingTokenError` (a subclass) was thrown for a missing token. The app should sign in again.
- `WooDateFilterError` (`code: 'unsupported_store'`): the store returned a product outside the requested date window, so it does not honour `modified_after` (WooCommerce before 5.8, or a proxy that drops the parameter). An app should show its own words for the `code`; the message, `This store needs WooCommerce 5.8 or later to sync products.`, is a plain fallback. The diagnostics are in `productId`, `bound` (the `modified_after` sent) and `received`. Today the pull retries a failed request every 5 s (RxDB's `retryTime`), one mark request each time. Stopping on errors that cannot recover is shared replication work.
- `WooTillUpdateRequiredError` (`code: 'till_update_required'`, `fixedBy: 'till'`): the store answered 426, normally WCPOS's protocol gate (`serverCode: 'wcpos_update_required'`), so this till must be updated; the pull pauses until `resume()`.
- `WooMissingUuidError`: a product came back without a `uuid`, so the store is not running the WCPOS Free plugin 1.10.0 or later, or the connector is not reaching it through `wcpos/v2`.
