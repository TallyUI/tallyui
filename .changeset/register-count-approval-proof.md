---
'@tallyui/components': minor
---

`RegisterCount`'s `approve` now receives the count and may return the store's `approval` and the `approvedVariance`, which go to `closeSession`, so a store-verified manager approval works through the shared component; a count edited during approval asks again, and zero-argument `approve` callers keep working. `RegisterPanel` shows an "Approval needed" card for a closure the store refused, and its new `reapprove` prop sends a new approval through `reapproveClosure`.
