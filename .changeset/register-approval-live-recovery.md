---
"@tallyui/pos": minor
"@tallyui/components": minor
---

`useRegisterSession` now returns `liveAtStore`, `approvalNeeded` and `closureApprovalStatus`, and `actions.reapproveClosure` sends a closure the store refused for its approval again with a new proof; at register contract 3 a close over the threshold on a session live at the store needs the store's proof, not `approvedBy` alone. The closure sheet shows "Approval not yet verified by the store" beside the approver until the store applies the closure with its proof.
