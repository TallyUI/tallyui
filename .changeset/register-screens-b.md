---
"@tallyui/components": minor
---

`RegisterCount` and `ClosureSheet` (WCPOS `next` port, ADR-032 amendment 1): denomination tiles counted in minor units (tap adds one, a 400ms hold adds ten), typing a cash amount clears the tiles, a live variance line hidden while blind, and Close gated by an optional `approve` prop above `varianceThreshold` (refused with an exact message without one). `ClosureSheet` shows the local closure number and, unless blind, the counted figures and variance per tender.
