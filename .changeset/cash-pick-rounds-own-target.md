---
'@tallyui/pos': patch
'@tallyui/components': patch
---

On a store with cash rounding, a cash payment for picked items now rounds its own amount to the cash step and records its own rounding entry, so the change given matches the cash actually taken (for example, items of 3.33 paid with 5.00 take 3.35 and give 1.65 change).
A later cash payment for the rest rounds only the rest. A card payment for picked items is never rounded, and picked items that round to nothing in cash are refused, with a message.

While another payment is in progress, a cash payment for picked items must be a whole number of cash steps (`CASH_WAITS_FOR_PAYMENT`). A sale takes at most 15 rounded cash payments for picked items, so that the order the store receives stays within its 16 rounding entries (`CASH_PICK_LIMIT`, `CASH_PICK_ENTRIES_MAX`). Once the sale has 16 entries, a cash payment that would add another is refused, and the rest is taken by another method (`CASH_SETTLE_LIMIT`).

New pure helpers: `roundedPickTarget` and `remainderEntriesMinor`.
