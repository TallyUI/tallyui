---
'@tallyui/pos': minor
'@tallyui/components': minor
---

Adds open sales as cart tabs: `useSale` gains `switchSale` (it parks the current sale and opens a parked one, or a new one) and `closeSale`, and `openSales` lists the open sales for `OpenSaleTabs`, which shows each sale's customer or contents, its total and a Partly paid chip. A partly paid sale cannot be switched away from or closed until it is paid or its paid legs are voided.
