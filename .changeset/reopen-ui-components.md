---
'@tallyui/components': minor
---

`OrdersList` takes `onReopen` and `onResume`. With `onReopen`, a sale the store refused with `coupon_invalid` or `total_mismatch` shows "Reopen" in Needs attention. When the coupons can't be carried exactly, it also offers "Reopen without the coupon: (amount) to collect". It never drops the coupons on its own. A reopened row reads "Reopened as a parked sale." and shows Resume when `onResume` is passed. Without either prop nothing changes.

Refusals with these two codes now have their own sentences. In the tender ledger and pane, a held leg shows no Cancel payment, Remove payment or terminal reference. A held leg is money taken before the sale was reopened, or money the store or a closed register's closure already holds.
