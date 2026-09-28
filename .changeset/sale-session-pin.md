---
"@tallyui/pos": patch
---

`useSale` now stamps the session in force when the tender started (`startTender`), pinned for that tender, instead of reading its `session` option at `complete()` time. A session closed between `startTender` and `complete()` (so the app's `saleSession` went undefined) previously skipped the stamp entirely: the order got neither `sessionId` nor `lateSessionId` and no `late-sale` fact. It now becomes a late sale on the pinned session. A tender started with no session stays unstamped, even if a session appears before `complete()`. The pin is dropped by `cancelTender()` and `newSale()`.
