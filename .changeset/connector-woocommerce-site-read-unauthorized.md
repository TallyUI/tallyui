---
'@tallyui/connector-woocommerce': patch
---

A `/site` read answered 401, or 403 `rest_forbidden`, now returns `unauthorized`, as the register transport does, so a till that restarts with an expired token asks for sign-in instead of retrying forever.
