---
'@tallyui/pos': patch
'@tallyui/components': patch
---

Review follow-ups with no behaviour change (#356, #358):
- `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
- `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.
