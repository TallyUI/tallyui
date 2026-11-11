---
'@tallyui/pos': minor
---

`useSale` takes an optional `defaultCustomer`, put on every new sale it starts (the first, and each one after complete, discard, park or `newSale()`), never on a resumed sale, as WCPOS v2 pre-selects its default customer on every new cart. The app decides which customer; without the option nothing changes (#668).
