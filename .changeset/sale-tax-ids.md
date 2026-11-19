---
'@tallyui/pos': minor
---

`useSale().setTaxIds(taxIds)` sets the sale's tax ids in the cart (a guest sale and a sale past the cart refuse them); they park and resume with the draft, are stored on the order, and go to the store at order.create 12 when the server lists it.
