---
'@tallyui/connector-woocommerce': patch
---

`readWooCapabilities` reports `orderCreate: 5` only when the store's `/status` capabilities list `order_create_v5`, which only the TallyUI fork of the plugin advertises. A store that does not list it, whatever its WCPOS version or payment list support, gets `orderCreate: 3`, so the till does not offer fees, shipping or custom lines there and never sends them. The connector no longer requests `/site`.
