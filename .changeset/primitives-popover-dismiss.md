---
'@tallyui/primitives': minor
---

On web, an open `Popover.Content` closes on Escape and on a pointerdown outside its content and trigger, and calls `onEscapeKeyDown` and `onPointerDownOutside` first (`preventDefault()` keeps it open). Only the topmost open popover or dialog reacts. With a `Popover.Overlay` mounted, an outside press is still the Overlay's to handle.
