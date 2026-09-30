---
"@tallyui/core": minor
"@tallyui/pos": minor
---

`order.create` version 4 (#286): every `discountMinor`, the order's and each line's, is tax-exclusive, so their sum still holds. Core accepts version 4 with version 3's fields. The till's envelope builder (`toOrderCreateEnvelope`) produces version 4 when capped at 4 or more and the order's `sentVersion` doesn't hold it lower. The till doesn't send version 4 yet: the outbox doesn't pass the server's max, so it still sends version 3 or lower with the same figures, byte-identical.
