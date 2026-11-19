---
'@tallyui/pos': minor
---

`useSale().setAddresses(billing, shipping)` changes the picked customer's addresses on the open sale, re-taxing it like `setCustomer`, in the cart only (`ADDRESS_CHANGE_REFUSED` otherwise). A reopened refused order keeps the addresses it was stored with.
