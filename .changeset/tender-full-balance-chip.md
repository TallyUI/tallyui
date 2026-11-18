---
'@tallyui/components': minor
---

`TenderPane` draws WCPOS v2's Full balance chip (`tender-quick-balance`) for a picked method that gives no change, such as Card terminal. It reads "Full balance" when the entry already equals the amount due, "Full balance {amount}" otherwise, and "Exact {amount}" while a split plan is active; pressing it only sets the entry. Cash keeps its Exact and quick-cash chips unchanged. New catalogue keys: `pos_checkout.full_balance` and `pos_checkout.full_balance_label`.
