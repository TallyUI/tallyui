---
'@tallyui/pos': patch
---

Adding, voiding or removing a tender now clears a stale sale error, such as an underpaid refusal, once the payment is corrected. A refused call leaves the error as it was, and a dropped terminal reference still shows its own message.
