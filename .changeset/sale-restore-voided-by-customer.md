---
'@tallyui/pos': minor
---

useSale: a removal taken for Undo is now voided by any customer change (setCustomer, setAddresses, setTaxIds) or a re-tax, instead of re-taxing the restored item; restore() returns RESTORE_STALE for it. Park, resume, a new sale and the receipt still void it.
