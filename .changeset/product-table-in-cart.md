---
'@tallyui/components': minor
---

`ProductTable` takes `cartQuantity(doc)`, and draws WCPOS v2's in-cart count in the add column: once the cart
holds the product, the primary count badge takes the `+`'s place, labelled "In cart: N", and pressing it adds
another as the `+` does. A product with variants keeps its `>`. `Catalogue`'s table view passes the counts it
already reads from `cartLines`, as its grid tiles show them.
