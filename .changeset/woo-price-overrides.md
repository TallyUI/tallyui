---
"@tallyui/connector-woocommerce": patch
---

WooCommerce orders carry a discounted line as a price override, as WCPOS does: its `subtotal` equals its discounted `total`, so WooCommerce's discount total shows coupons only (ADR-077). A discounted tax-inclusive line is no longer refused: it pushes its stored 6dp net.
