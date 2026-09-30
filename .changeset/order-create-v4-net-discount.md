---
"@tallyui/core": minor
"@tallyui/pos": minor
---

`order.create` version 4 (#286): every `discountMinor`, the order's and each line's, is tax-exclusive, so their sum still holds. Core accepts version 4 with version 3's fields. The till sends version 4 only when `maxVersion` is at least 4 and the order's `sentVersion` doesn't cap it; otherwise version 3 and earlier go out with today's figures, byte-identical.
