---
"@tallyui/database": minor
"@tallyui/components": minor
---

ADR-061: `startLiveTab` (`@tallyui/database`) coordinates exactly one live tab per store over a Web Lock and a `BroadcastChannel`. A new tab asks the live tab to hand over; the live tab may delay while busy, then parks and releases the lock; a tab that gets no acknowledgement is blocked and must be closed. `LiveTabScreen` (`@tallyui/components`) renders the parked and blocked screens, with translatable label props. On platforms without Web Locks (React Native, Node), a tab is simply live at once.
