---
'@tallyui/core': minor
'@tallyui/pos': patch
'@tallyui/components': patch
---

The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.
