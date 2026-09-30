---
'@tallyui/connector-woocommerce': patch
---

When the catalogue check's fast path fails, or answers with something that is not a list, the page-by-page fallback now starts with an empty page (#331). Its first request then takes its own request-budget slot, as the status read does, instead of sharing the failed fast-path request's slot. A pass that falls back reports one more page.
