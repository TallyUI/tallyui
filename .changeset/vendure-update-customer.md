---
"@tallyui/connector-vendure": minor
---

The Vendure connector can now edit a customer (`updateCustomer`), using Vendure's `updateCustomer` mutation for names, email and phone and its customer address book for the billing and shipping addresses. Company and tax ids are not stored, because Vendure customers have neither.
