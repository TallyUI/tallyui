---
'@tallyui/pos': minor
---

`toCustomerInput` and `toCustomerPatch` turn customer form values into what `createCustomer` and `updateCustomer` take, with WCPOS v2's rules: billing's name and email follow the customer's, a linked shipping is billing's copy, and an address is sent whole.
