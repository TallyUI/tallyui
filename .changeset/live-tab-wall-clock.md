---
"@tallyui/database": patch
---

The live tab's busy-defer now caps by wall-clock time elapsed since the hand-over ack, not by counting `sleep(100)` calls. The live tab is in the background exactly when a new tab asks it to hand over, and browsers throttle background timers to about 1 s or more, so a sleep count could stretch the intended `maxDeferMs` (10 s by default) far beyond that, leaving the new tab stuck in `acquiring`.
