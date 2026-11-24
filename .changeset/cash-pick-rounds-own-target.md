---
'@tallyui/pos': patch
'@tallyui/components': patch
---

On a store with cash rounding, a cash payment for picked items now rounds its own amount to the cash step and records its own rounding entry, so the change given matches the cash actually taken (for example, items of 3.33 paid with 5.00 take 3.35 and give 1.65 change).
A later cash payment for the rest rounds only the rest. A card payment for picked items is never rounded, and picked items that round to nothing in cash are refused, with a message.

New pure helpers: `roundedPickTarget` and `remainderEntriesMinor`.
