---
"@tallyui/connector-woocommerce": patch
"@tallyui/pos": patch
---

The WooCommerce transport pushes tax-inclusive lines with the till's 6dp ex-tax net, as WooCommerce rebuilds a line's tax from it (ADR-076); a discounted tax-inclusive line is still refused. `CommandTransport.send` takes an optional, local-only `OrderTransportContext`.
