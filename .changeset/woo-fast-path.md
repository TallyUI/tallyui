---
'@tallyui/core': minor
'@tallyui/database': minor
'@tallyui/connector-woocommerce': minor
---

The WooCommerce catalogue reconcile uses the WCPOS products fast path (#313). When `wcpos/v2/status` lists `products_id_fast_path` in `capabilities`, the whole catalogue is listed in one request (`per_page=-1`, `_fields=id,date_modified_gmt,stock_quantity,stock_status`) instead of pages of 100. A store that refuses it, or answers with something that is not a list, is listed page by page in the same pass.

- **Keyed on the remote id:** both WooCommerce listings key on the numeric product id, never the till-local uuid.
- **`CatalogueReconcileAdapter.matchKey`** (core, optional): an adapter whose listing carries no primary key declares how to match a local document. The catalogue runner indexes the local documents by it for each pass. Deletion is unchanged: `confirmGone`, then the mass-delete brake, by primary key.
- **`remote` on the keyed reconcile feed** (core, optional): a listed product the till does not hold yet is matched back by its remote id, so it is delivered rather than dropped.
