---
'@tallyui/components': minor
---

`TenderPane`, `Tender` and Cart's `tenderLedger` take an opt-in `confirmVoid`. With it, Cancel payment on a ledger leg first asks WCPOS v2's "Cancel this payment?", with the leg's amount ("Return {amount} cash to the customer" for cash, else "Void {amount} on {title}"), and `sale.voidTender` runs only on confirm; Cancel writes nothing. Default `false`: Cancel payment voids at once, as before.
