# TallyUI WooCommerce connector

## Requirements

- **WooCommerce 5.8 or later.** The product pull filters by modification date with `modified_after`, added in WooCommerce 5.8, and compares it in GMT with `dates_are_gmt`, added in 5.4.
- **The WCPOS Free plugin, 1.10.0 or later.** The connector reads through its `wcpos/v2` routes, which add each product's `uuid`. Set `SyncContext.baseUrl` to `<site>/wp-json/wcpos/v2`.

## Authentication

`auth.getHeaders({ token })` sends the WCPOS access token as `Authorization: Bearer <token>`, together with the POS marker `X-WCPOS: 1`. Without a token it throws `WooMissingTokenError`. WooCommerce consumer keys are not supported.

It also sends `X-WCPOS-Protocol: 3`, which WCPOS 2.0.4 requires of POS requests (a lower value gets HTTP 426 `wcpos_update_required`), and `X-WCPOS-Client: tallyui/<connector version>` (lowercase `[a-z0-9._-]`, at most 32 characters), which WCPOS uses only for consent-gated telemetry.

## Product pull

On WCPOS 1.10.x, the product uuid comes from the `_woocommerce_pos_uuid` meta and the barcode from `global_unique_id`. Non-empty top-level `uuid` / `barcode` fields (WCPOS 2.0) win when present.

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

## Capabilities

`readWooCapabilities` (the connector's `capabilities`) runs when the till signs in or restores a session. The app keeps the result with the session.
- **`GET wcpos/v2/stores`** gives the tax rounding (`tax_round_at_subtotal`). A failed or malformed read returns `undefined`: nothing new is known, and the stored capabilities stay.
- **`GET wcpos/v2/status`.** The strings in its `capabilities` decide three fields:
  - `order_create_v5` makes `orderCreate` 8 when the coupons gate passes, else 5; with a `capabilities` list that lacks it, `orderCreate` is 3. Only the TallyUI fork of the plugin advertises it. When `/status` answers with no `capabilities` list at all (stock WCPOS 1.10.x), the `/site` version decides instead: a plain `1.10.N` with N ≥ 20 gives 7 (never 8: no tax address), anything else gives 3. A plain `2.0.N` with N ≥ 4 whose `capabilities` list lacks `order_create_v5` (or that has no list) gets 6 (never 7 or 8: no note or tax address proven). A failed `/status` read gives 3.
  - `order_payments_list` sets `multiplePayments`.
  - `order_create_v5` also sets `cashRounding` (ADR-094): only the fork was shown to take a tax-none signed `Rounding` fee line, with tax off and on, exclusive and inclusive. Stock stores and a failed `/status` leave the key out.
- **`GET wcpos/v2/site`.** Its `wcpos_version` decides `coupons` (ADR-077, ruling R3). It is true only for woocommerce-pos 1.9.0 or later; a 1.9.0 pre-release does not count. Any failed or unclear read gives false, and the till then refuses to apply a coupon. On a store with no `capabilities` list it also decides `orderCreate` (above).
- **`lineTax`** is always `{ none: true, classes: true }`.
- **Unauthorised reads.** A 401 or 403 from `/stores` or `/status` throws `ConnectorUnauthorizedError`. A 401 or 403 from `/site` only closes the coupon gate.
- **`products_id_fast_path`** is read by the reconcile pass, not here (see Reconciliation).

## Order push on WCPOS 2.0

On a 2.0.x store (`ledgerPayments`, or `/site` `wcpos_version` 2 or later, read once per transport) the sale is pushed `pending` with no money keys, then paid with one `POST orders/<id>/payments` per payment (`pos_cash` with `tendered`, or `pos_card`), each sent with the revision the last answer gave; a free sale is closed with `POST orders/<id>/close`. The sale counts as applied only after the last of those calls succeeds. A retry replays the push by its mutation id and each payment by its id. A money call the store refuses is rejected with a message naming the order it created, since that order now exists unpaid. On 1.10.x and the fork, the push body is unchanged.

## Cash rounding

Each `cashRoundings` entry on a sale is sent as a fee line `{ name: 'Rounding', total: <signed amount>, tax_status: 'none', tax_class: '' }`, after the sale's own fees. The app must pass `acceptsCashRounding` to `createWooCommandTransport` from `ServerCapabilities.cashRounding`. Without it, or on a WCPOS 2.0 store, a sale carrying `cashRoundings` is refused as `invalid_payload` with `cash_rounding_unsupported`, and no request is made: the field is never dropped.

## Customers

On WCPOS 1.10.x, `searchCustomers` uses `GET wcpos/v2/customers` with `role=customer`.
`getCustomer` uses the same route with `include=<id>&per_page=1&role=all`; there is no per-id route.
`createCustomer` uses `POST wcpos/v2/push/customers`. Create is idempotent per call through the WCPOS mutation id;
a repeat call after a lost answer uses new ids and gives `invalid` (email exists). There is no automatic retry.
`emailReceipt` uses `POST wcpos/v2/orders/<id>/email`, optionally saving the email to billing.
It is not idempotent: each call sends a mail, so don't auto-retry. The cashier needs `access_woocommerce_pos`.

## Errors

- `ConnectorUnauthorizedError`, from `@tallyui/core` and re-exported here: the store refused the request (401: the token is missing, expired or revoked; 403: signed in but not allowed), or `WooMissingTokenError` (a subclass) was thrown for a missing token. `error.status` is `401` (`code: 'unauthorized'`, sign in again) or `403` (`code: 'forbidden'`, signed in but not allowed: the pull retries on the store schedule; don't sign out).
- `WooTokenRefusedError` (`code: 'store_misconfigured'`, `fixedBy: 'store'`, `fix`, and the store's own `storeCode`): the store answered a `jwt_auth_*` 403, the JWT Authentication plugin refusing the till's token. WCPOS 1.10.0–1.10.7 sent it for a valid token (wcpos#1863), and later versions can still send it when the token resolves to another user, so the error names no version. The store owner checks the JWT Authentication plugin's settings, or the till is paired again; the pull retries on the store schedule and the till stays signed in.
- `WooDateFilterError` (`code: 'unsupported_store'`): the store returned a product outside the requested date window, so it does not honour `modified_after` (WooCommerce before 5.8, or a proxy that drops the parameter). An app should show its own words for the `code`; the message, `This store needs WooCommerce 5.8 or later to sync products.`, is a plain fallback. The diagnostics are in `productId`, `bound` (the `modified_after` sent) and `received`. Today the pull retries a failed request every 5 s (RxDB's `retryTime`), one mark request each time. Stopping on errors that cannot recover is shared replication work.
- `WooTillUpdateRequiredError` (`code: 'till_update_required'`, `fixedBy: 'till'`): the store answered 426, normally WCPOS's protocol gate (`serverCode: 'wcpos_update_required'`), so this till must be updated; the pull holds until `resume()`.
- `WooMissingUuidError`: a product came back without a `uuid`, so the store is not running the WCPOS Free plugin 1.10.0 or later, or the connector is not reaching it through `wcpos/v2`.
