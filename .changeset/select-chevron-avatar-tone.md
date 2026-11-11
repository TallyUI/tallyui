---
'@tallyui/components': minor
---

`SelectTrigger` now draws a down chevron at its right by default, the v2 way (#717). An app that passes its own chevron as a child must either remove it or pass `chevron={false}`, or it will show two. `Avatar` takes `tone` (`'muted'`, the default and today's look, or `'primary'`, v2's light initials on a solid primary circle) (#718). `CustomerSelect` takes `showAvatar` (off by default) to draw an initials avatar before each row and the selected summary, and `avatarTone` (default `'primary'`) (#714). Adds `ChevronDownIcon` and `avatarInitials`.
