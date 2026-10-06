---
'@tallyui/connector-woocommerce': patch
'@tallyui/core': patch
---

The connector now reads the store's tax settings and capabilities (the WooCommerce tax strategy, ADR-076); `parseTaxRounding` accepts the `woocommerce` granularity.
