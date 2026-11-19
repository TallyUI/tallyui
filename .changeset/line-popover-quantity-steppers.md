---
'@tallyui/components': minor
---

`LinePopover` gains `commit="close"`, WCPOS v2's grow keypad: a full-width Done in place of Apply and Cancel, and on a quantity a − / + stepper row that writes at once, with − turning into Remove at a shown quantity of 1 when `onRemove` is given. Escape closes without writing, and any other close writes what was typed. `Cart` opts its quantity popover into it with `lineCommit="close"` (with `lineEditor="popover"`), which drops the popover's Remove action in favour of Remove at 1; the price popover keeps Apply and Cancel. The default draws the popover as before.
