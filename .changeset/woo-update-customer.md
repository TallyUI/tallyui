---
"@tallyui/connector-woocommerce": minor
---

The WooCommerce connector now has `updateCustomer`: it edits a customer's name, email, phone, company, billing and shipping addresses and tax ids through WCPOS's own `push/customers` update, the same route `createCustomer` uses.
