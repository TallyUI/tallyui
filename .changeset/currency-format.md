---
'@tallyui/pos': minor
---

`CurrencyProvider` takes an optional `format` (symbol position, thousand separator, decimal separator, decimals), so `useCurrencyFormatter` can show money the way a store has set it, as WCPOS v2 does. Without `format`, money reads exactly as before (#667).
