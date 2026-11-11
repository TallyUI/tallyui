---
'@tallyui/core': minor
'@tallyui/connector-woocommerce': minor
---

`SyncContext` takes an optional `fetch`, resolved per request and defaulting to `globalThis.fetch`, so a host can pass a wrapper such as `meteredFetch` to count requests.
The WooCommerce connector sends every pull, reconcile, settings, payment-methods, receipt-templates and customers request through `context.fetch` when it is set.
