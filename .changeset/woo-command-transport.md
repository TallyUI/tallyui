---
'@tallyui/connector-woocommerce': patch
---

createWooCommandTransport sends the order outbox's order.create commands to WCPOS 1.10.x's wcpos/v2/push/orders as paid orders (one cash or card payment, tax-exclusive or untaxed stores; ADR-073).
