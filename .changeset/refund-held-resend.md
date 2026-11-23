---
'@tallyui/pos': patch
---

A refund whose earlier answer was unknown stays pending when a resend is refused or unauthorized. This prevents a new attempt from sending a second refund for it, while resending the same refund still works.
