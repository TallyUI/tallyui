---
'@tallyui/pos': minor
'@tallyui/components': minor
---

`useSale` takes an optional `currentPrice(variantId)` and `resume()` then re-prices a parked sale's lines to today's prices (with a non-blocking 'Prices changed' message; `resume(id, { keepParkedPrices: true })` keeps them); `ParkedSales` takes optional `onPark`/`onResume`, so an app can drive it from its own parked store.
