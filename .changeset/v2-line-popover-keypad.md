---
'@tallyui/components': minor
---

Cart can now open WCPOS v2's keypad from a line's quantity or price with `lineEditor="popover"`, and the price keypad carries the quick-discount keys. The keypad is a new shared `Keypad` component, also used by the tender pane, and `LinePopover` is exported for apps that build their own lines.
