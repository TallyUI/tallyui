---
'@tallyui/connector-woocommerce': minor
'@tallyui/components': patch
---

The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."
