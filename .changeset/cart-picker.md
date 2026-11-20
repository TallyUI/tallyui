---
'@tallyui/components': minor
---

`Cart` takes an optional `picker` for WCPOS v2's split-by-item bill: the cart turns read-only and each unpaid line shows this payment's `− n of unpaid +` stepper with what the picked units add. `CartColumnHeads` and `CartLine` take an optional `picking`, which heads the quantity column "This payment" and widens it for the stepper; `Cart` sets it while `picker` is on.
