---
'@tallyui/pos': patch
---

- `reopenRefusedOrder` refuses a row carrying a store order (`store_order`).
- Locked store payments (`storePaymentId`) no longer count in register takings, drawer, method totals or the unsynced total.
