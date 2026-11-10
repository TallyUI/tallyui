---
'@tallyui/pos': minor
---

Add a device-local app settings store: an `app_settings` collection that is never replicated, a typed `AppSettings` map with defaults (`ui.scale`, `ui.font`), `readAppSettings`/`writeAppSetting`, and a `useAppSettings` hook. Unknown or invalid stored values fall back to their defaults.
