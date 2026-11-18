---
'@tallyui/components': minor
---

`AccordionTrigger` draws WCPOS v2's 18px down chevron, on the right by default or before the label with `chevronPosition="left"`, and takes `headerClassName` for the outer header (merged after `flex`). The chevron turns 180° and dims to 0.8 opacity over 250ms as the item opens and back over 200ms as it closes; `AccordionContent` folds open and shut over 200ms on v2's ease, and stays mounted until the fold ends. Under reduced motion both are instant, and `forceMount` content does not fold.
