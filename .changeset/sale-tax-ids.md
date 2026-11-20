---
'@tallyui/pos': minor
---

`useSale().setTaxIds(taxIds)` sets the sale's tax ids in the cart (a guest sale and a sale past the cart refuse them); they park and resume with the draft, are stored on the order, and go to the store at order.create 12 when the server lists it. A tax id list the store could not take is refused when it is set (by `setTaxIds` or `setCustomer`) and before any tender, the country is upper-cased, and a reopened order keeps its tax ids.
