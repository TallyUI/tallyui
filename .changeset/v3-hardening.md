---
"@tallyui/pos": patch
---

order.create v3 omits a malformed session ID (empty or longer than 36 characters) instead of sending it, so the plugin never refuses the sale for it. At capability 3, `finalizeOrder` refuses a sale whose display lines don't join the order's lines by id and count, or whose display tax mode differs from the order's.
