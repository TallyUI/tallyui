---
'@tallyui/connector-shopify': minor
---

Add `createShopifyConnector()`, a factory like the other connectors' that builds a fresh connector per call. The static `shopifyConnector` is built by it and is deprecated; it is not removed.
