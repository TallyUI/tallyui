---
"@tallyui/pos": minor
---

At register contract 3 (ADR-082), the closure command is sent as version 3 and carries the store's opaque `approval` proof, which `closeSession` keeps on the session and never puts on the Z, a fact or a log. The store's approval threshold now wins over the app's `varianceThreshold`, and the new `closureVariance` helper and hook action give the variance an approval is bound to; a close whose `approvedVariance` no longer matches is refused.
