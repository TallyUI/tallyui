# Spike: the Woo refund-create route (SPEC-1 slice 0)

Recorded 2026-11-23 on a throwaway wp-env store (WordPress 7.1.2, WooCommerce 11.3.0, PHP 8.3) built
from local tag checkouts, as admin (auth redacted). Recordings stay outside the repo; each fact names its file.

**Conclusion: stock Pro 2.0.5 has the route at `POST /wp-json/wcpos/v2/orders/<order_id>/refunds`
(also `/wcpos/v1/...`); free 2.0.4 and the fork alone have none.**

## Builds

| Build | Source | Refund create |
|---|---|---|
| A. Free 2.0.4 alone | `woocommerce-pos` v2.0.4 (18c41490) | none |
| B. Free 2.0.4 + Pro 2.0.5 | `woocommerce-pos-pro` v2.0.5 (a23ceffc), bundling Free v2.0.5 (585fc852) | yes |
| C. Fork alone | `TallyUI/woocommerce-pos` `tally` (c2116e6f, version 1.10.20) | none |
| D. Pro 1.10.20 + fork | Pro v1.10.20 (90755936) bundling the fork `tally` branch, as the till's dev store runs it | yes |

Activating Pro 2.0.5 deactivates the standalone Free 2.0.4: Pro runs its bundled Free, so build B is
Pro 2.0.5 on Free 2.0.5. Pro ran with no licence set; the refund route did not need one.

## 1. Which route creates a refund

- A: none. `POST /wcpos/v2/orders/11/refunds`, `/wcpos/v1/...` and `POST /wcpos/v2/refunds` all answer
  404 `rest_no_route` (`A-free204-v2-refund-create`, `A-free204-v1-refund-create`,
  `A-free204-v2-refunds-collection-post`). The v2 index lists `/wcpos/v2/refunds` as GET only, the
  read-only proxy (`A-free204-v2-index`). It also lists `POST /wcpos/v2/orders/<id>/payments/<uuid>/refund`,
  which only allocates a payments-ledger refund to an existing Woo refund; by source, not recorded, it
  requires `refund_id` and never creates one (`includes/API/V2/Payments_Controller.php:339`).
- B: `POST /wcpos/v2/orders/<order_id>/refunds` (201, `B-pro205-v2-create-k1`) and the same under
  `wcpos/v1` (201, `B-pro205-v1-create-k3`). Source: `includes/API.php:92,110` registers `order_refunds`;
  `includes/API/V2/Order_Refunds_Controller.php` is the v1 class with namespace `wcpos/v2`. The index also
  lists `GET`, `DELETE .../refunds/<id>` and `POST .../refunds/preview` (`B-pro205-v2-index`, `B-pro205-v1-index`).
- C: none, not even the refunds read proxy (`C-fork-v2-index`, `C-fork-v1-index`); both creates 404
  (`C-fork-v2-refund-create`, `C-fork-v1-refund-create`).
- D: the same routes as B, from Pro 1.10.20's own `order_refunds` controllers (`D-pro11020-fork-v2-index`,
  `D-pro11020-fork-v1-index`); create answers 201 (`D-pro11020-fork-v2-create-k1`).

## 2. What `GET /wcpos/v2/status` says

No build lists a refund capability.
- A: `["products_id_fast_path"]` (`A-free204-status`).
- B: `["products_id_fast_path","order_cashier_reassignment"]` (`B-pro205-status`); both come from Free.
- C and D: `["products_id_fast_path","order_payments_list","order_create_v5","customer_display"]` plus
  `wcpos_version: "1.10.20"` (`C-fork-status`, `D-pro11020-fork-status`). Same list with or without Pro.

Next-best signal: the route's presence in `GET /wp-json/wcpos/v2`. The key
`/wcpos/v2/orders/(?P<order_id>[\d]+)/refunds` with `POST` among its endpoint methods is there exactly when
create works (`B-pro205-v2-index`, `D-pro11020-fork-v2-index`) and absent when it 404s (`A-free204-v2-index`,
`C-fork-v2-index`). Do not key on `/wcpos/v2/refunds`: that is Free's GET-only proxy.

## 3. The create response (201)

Woo's own refund object plus Pro's fields (`B-pro205-v2-create-k1`, `D-pro11020-fork-v2-create-k1`):
- `id` (refund id), `refund_id` (same value), `order_id` (parent), `status: "completed"`.
- `amount` (decimal string), `reason`, `date_created`, `date_created_gmt`, `refunded_by` (user id),
  `refunded_payment` (false for cash/manual).
- `line_items[]`: the refund's own item `id` (not the order item id), `product_id`, `variation_id`,
  `quantity` negative, `subtotal`, `total`, `subtotal_tax`, `total_tax` negative strings, `taxes[]` as
  `{id, total, subtotal}` per rate, and meta `_refunded_item_id` naming the order item. Taxed example:
  `B-pro205-v2-create-taxed-k4` (10.00 + 1.00 tax gives `total "-10.00"`, `total_tax "-1.00"`).
- `fee_lines`, `shipping_lines`, `tax_lines`, `meta_data` (`_refund_type: "partial"`).
- Destination: `refund_result: {mode, destination, gateway_id, api_refund}`, for example
  `{"mode":"manual","destination":"cash","gateway_id":"pos_cash","api_refund":false}`, plus `allocations`
  when the payments ledger split the refund. Request field `refund_destination` takes
  `original_method`, `cash` or `manual` (Pro `includes/Payments/Refund_Processor.php:176-230`).

## 4. Idempotency (`X-WCPOS-Idempotency-Key`)

- The header is required: without it, 400 `wcpos_missing_idempotency_key` (`B-pro205-v2-create-no-key`,
  `D-pro11020-fork-v2-create-no-key`).
- Same key, same body: 201 with a JSON body equal to the first (same `id`, same `date_created`),
  and the order still has one refund (`B-pro205-v2-create-k1-repeat`, `B-pro205-order12-after-k1`;
  `D-pro11020-fork-v2-create-k1-repeat`, `D-pro11020-fork-order13-after`).
- Same key, different body: 409 `wcpos_idempotency_conflict`, "Idempotency key was reused with a
  different request." (`B-pro205-v2-create-k1-other-body`, `D-pro11020-fork-v2-create-k1-other-body`).
- A new key with the same body makes a second refund (`B-pro205-v2-create-k2-same-body`,
  `B-pro205-order12-after-all`): dedupe is by key, not by body.
- Source, not recorded: the hash is md5 of the JSON params plus `order_id` (`Refund_Processor.php:684`);
  replays live in a transient for 24 hours (Free `includes/Payments/Idempotency_Repository.php:23`); a
  concurrent duplicate gets 409 `wcpos_idempotency_in_progress` (Pro `Idempotency_Repository.php:136`).
