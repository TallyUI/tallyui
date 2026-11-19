---
'@tallyui/components': minor
---

`Cart`'s `lineCommit="close"` now gives the price popover WCPOS v2's write-on-close keypad too: Done, Escape discards, and any other close writes the typed price through the same price path and `onPriceChange`. A price refused on such a close shows under its line until that line's next price write. `LinePopover` takes `onCloseRefused`, called with the refusal when a `commit="close"` write on a close other than Done is refused.
