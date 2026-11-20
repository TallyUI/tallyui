---
'@tallyui/pos': minor
'@tallyui/components': patch
---

A tender plan records the payment ids on the order when it was set (`TenderPlan.before`, optional), and its legs are the captured legs not in that list. Voiding a payment taken before a split, or a pending one capturing later, no longer shifts the split's count or its shares. `TenderPlan.from` is deprecated and read only for a plan without `before` (#1133).
