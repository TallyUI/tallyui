---
'@tallyui/components': minor
---

`Tender` is redrawn as WCPOS v2's tender pane, with a balance headline that counts captured payments only, each payment leg with its status and Cancel payment where the method can void it, a keypad, and quick-cash chips for the exact amount and the next 5, 10 and 50; `TenderPane` is the same pane for a host that owns the tender reducer. `SplitTender` is now the same component as `Tender`, and `CashTendered`'s default quick amounts round up to 5, 10 and 50.
