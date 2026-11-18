---
'@tallyui/components': minor
---

`CartTotal`'s tax rows keep the rate's own label and carry WCPOS v2's tag beside it: "Including tax" when `taxInclusive` is `true`, "Excluding tax" when it is `false`, and no tag when it is absent. The old `incl. ` label prefix is gone. Each tax row has the test id `cart-total-tax-<index>`.
