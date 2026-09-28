---
"@tallyui/pos": minor
"@tallyui/components": patch
---

The register approval gate is enforced in `useRegisterSession`'s `closeSession`, not only in `RegisterCount`: over `varianceThreshold`, a close without `approvedBy` throws the new `RegisterApprovalRequiredError` before any write, blind mode included. `closeSession` takes `approvedBy` and `approvedByName`, and they reach the Z (`breakdowns.approved_by`, `approved_by_name`); the store's `closeSession` takes `approvedBy`. `useRegisterSession`'s `register` option accepts `null` while its host opens. `closeNeedsApproval` is the shared "over threshold" rule. `RegisterCount` passes `approve()`'s `approvedBy` and `approvedByName` to `closeSession`, and shows the hook's refusal with the same copy.
