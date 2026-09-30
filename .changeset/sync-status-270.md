---
'@tallyui/components': patch
---

`SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), and with only till updates waiting shows the register outbox's sending and retrying text and countdown. It shows no raw reason code: retrying reads ` · retrying in {n}s`, the stuck text drops its `(reason)`, and sending or retrying now comes after the stuck text. The status line and each pull-notice line are polite live regions (`aria-live="polite"` on web, `accessibilityLiveRegion` on Android) and on iOS are announced once each time their text changes. The countdown is a separate text after the status line's live region, so a retry is announced once, when it starts. `OrdersList` shows no reason code either: a stuck order reads "Not syncing: the online store keeps refusing this since {time}", or "Not syncing: no answer from the store since {time}" on a timeout.
