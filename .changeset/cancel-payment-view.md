---
"@tallyui/components": minor
"@tallyui/pos": patch
---

Back opens a v2-style cancel-payment view when money was taken. It lists the cash to return (each cash payment's own amount after its change), what is voided and what is refunded. A payment on a store-covered reopened sale that cannot be voided shows a refund line, and the sale can only be parked.

A correction to #1214's note: only a cash `addTender` by amount with nothing due is refused with `NOTHING_DUE`. A `setTender` or old-draft cash payment still records the amount handed over until finalize nets it.
