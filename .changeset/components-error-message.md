---
'@tallyui/components': patch
---

The register, parked-sales and refund screens now show a thrown error by its message alone, so a cashier reads "Finish or cancel the sale in progress first." rather than "RegisterTenderInProgressError: Finish or cancel…". An error with no message shows "Something went wrong".
