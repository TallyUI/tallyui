---
"@tallyui/components": patch
---

`Catalogue`'s status text now truncates to a single line (with an ellipsis) when `statusAccessory` is set, instead of wrapping to three lines at phone width and pushing the accessory (e.g. a register pill) out of place. Without `statusAccessory`, the status text still wraps as before.
