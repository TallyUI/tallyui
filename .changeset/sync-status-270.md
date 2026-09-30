---
'@tallyui/components': patch
---

`SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), makes the status line a polite live region (`aria-live="polite"` on web), and with only till updates waiting shows the register outbox's sending and retrying text and countdown.
