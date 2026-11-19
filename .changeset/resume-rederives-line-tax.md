---
'@tallyui/pos': minor
---

A resumed or re-taxed sale re-derives each class-taxed line's tax rates from the current tax context (`LineItem.taxFromClass`); lines added with given rates, drafts parked before this change and paid drafts keep theirs (`restoreOrderDraft` option `keepTaxRates`).
