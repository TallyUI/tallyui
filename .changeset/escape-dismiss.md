---
'@tallyui/primitives': minor
---

On web, Escape now closes an open Select, DropdownMenu (an open sub menu first) and Combobox list through the same layer stack as Popover and Dialog, so one Escape closes only the topmost layer. Select and DropdownMenu `Content` now honour their `onEscapeKeyDown` prop, and Combobox `Content` gains it; call `event.preventDefault()` there to keep the list open. Native is unchanged.
