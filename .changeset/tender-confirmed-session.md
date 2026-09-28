---
"@tallyui/pos": patch
---

`useSale`'s `startTender` takes the confirmed session (`startTender(method, { session })`) and pins it instead of the rendered `session` option, which can lag a session opened just before the tender. `useRegisterSession` adds `requireSaleSession()`: `requireOpen()`, returning `{ id, sessions }` to pass to `startTender`. A tender that pinned no session, with a session rendered by `complete()`, now stamps that current session and logs a warning, instead of leaving the order unstamped.
