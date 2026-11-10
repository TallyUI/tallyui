---
"@tallyui/core": minor
"@tallyui/connector-woocommerce": minor
"@tallyui/connector-medusa": minor
"@tallyui/connector-vendure": minor
---

`CustomerServiceError` now has an optional `status`: the HTTP status the store answered with, or undefined when no response came. The WooCommerce, Medusa and Vendure connectors set it, so a retry can check the status instead of parsing the message.
