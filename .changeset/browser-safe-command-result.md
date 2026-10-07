---
"@tallyui/core": patch
"@tallyui/pos": patch
---

`@tallyui/pos` no longer imports from `@tallyui/core/server`, whose barrel reaches `node:crypto`. Browser bundlers such as Expo Snack could not build `@tallyui/pos`, and so `@tallyui/components`, because of it. `parseCommandResult` and `CommandResultError` are now exported from `@tallyui/core` as well as from `@tallyui/core/server`, and pos imports them from there. CI now checks that no browser-facing package's dist reaches `@tallyui/core/server` or a Node built-in.
