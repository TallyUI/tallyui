---
'@tallyui/pos': minor
---

`useSale().add()` now says whether the entry went into the cart: it returns `{ lineId }` for the line it went into, or the refusal message that `error` shows (the sale is being saved, no price in the sale's currency, or an id or tax code the order can't send). Callers that ignore the result don't change (#662).
