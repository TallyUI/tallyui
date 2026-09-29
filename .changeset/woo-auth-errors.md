---
'@tallyui/connector-woocommerce': minor
---

The WooCommerce connector names its auth failures, so the app can tell "sign in again" apart from "store broken": a 401 or 403 from the product pull rejects with `ConnectorUnauthorizedError` (re-exported from the connector, as Medusa does), and `auth.getHeaders` without a WCPOS token throws `WooMissingTokenError`, a subclass of `ConnectorUnauthorizedError`, instead of sending `Bearer undefined`. Other HTTP errors keep their message and class.
