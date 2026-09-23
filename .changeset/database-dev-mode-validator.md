---
"@tallyui/database": patch
---

`createTallyDatabase` now wraps its storage in the AJV schema validator in development. RxDB dev-mode refuses to create a database without one (error DVM1), so every app using the default options failed at startup.
