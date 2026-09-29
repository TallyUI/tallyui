---
'@tallyui/connector-woocommerce': minor
---

The connector now authenticates with a WCPOS bearer token and the `X-WCPOS: 1` header against `<site>/wp-json/wcpos/v2` (WCPOS Free 1.10.0 or later); the consumer key and secret fields are removed; a pulled product without a uuid throws `WooMissingUuidError`.
