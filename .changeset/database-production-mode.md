---
'@tallyui/database': patch
---

`createTallyDatabase` now works in production builds. It passed `ignoreDuplicate: true` unconditionally, which RxDB rejects with error DB9 whenever dev mode is off, so no production app could open its database. The option is now only set in dev mode, where hot reload still re-creates a database with the same name.
