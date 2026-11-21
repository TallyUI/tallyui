---
'@tallyui/components': patch
---

Cart: Remove in a fee or shipping row's line strip flies the row off to the left before the charge is removed, as in WCPOS v2. Reduced motion removes at once. A second press is ignored, and a refused removal brings the row back. A removed row keeps its place and state while it tints and collapses.
