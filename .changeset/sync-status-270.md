---
'@tallyui/components': patch
---

`SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), and with only till updates waiting shows the register outbox's sending and retrying text and countdown. It shows no raw reason code: retrying reads ` · retrying in {n}s`, and the stuck text drops its `(reason)`. The status line and each pull-notice line are polite live regions (`aria-live="polite"` on web, `accessibilityLiveRegion` on Android) and on iOS are announced once each time their text changes. The status line's accessibility label and announcement leave out the countdown, so a retry is announced once, when it starts.
