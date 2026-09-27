---
"@tallyui/pos": minor
---

New export `watchFresh(collection, query)`: a live list on `readFresh` instead of a cached
`find().$`, so a write during a query's storage read (RxDB 16.21.1 bug 4) still shows up once its
change event arrives. `useRegisterSession` and `useOrderOutbox`'s recent list now use it.
