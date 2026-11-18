---
'@tallyui/components': minor
---

`POSLayout` takes `renderCheckout`, WCPOS v2's checkout column: when given, its result takes the products column's place and the browse slot unmounts. In the split layout the cart stays beside it (as the tender ledger); in the stacked layout it is the whole body, with no tabs. It is called with the layout in force, so the pane can draw its own ledger when the cart is not on screen.
