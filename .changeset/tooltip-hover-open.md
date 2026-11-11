---
'@tallyui/primitives': minor
---

`Tooltip.Trigger` now opens the way the docs describe (#749): hovering opens it after `Tooltip.Root`'s `delayDuration` (default `0`, now read), leaving closes it, keyboard focus opens it and blur closes it; the focus a mouse press causes does not open it. A press no longer opens a tooltip, so a tooltip-wrapped button such as `CameraScanButton` stops showing its tooltip on press; a press still closes an open tooltip and then calls the trigger's `onPress`. The new `openOnPress` prop (default `false`) brings back press-to-toggle for a trigger that does nothing else; on touch, where there is no hover, the tooltip opens only with `openOnPress`. The trigger's own `onHoverIn`, `onHoverOut`, `onFocus` and `onBlur` are still called and `onLongPress` passes through untouched, a pending hover delay is cancelled by leaving, by a press and by unmounting, and a disabled trigger opens on none of these.
