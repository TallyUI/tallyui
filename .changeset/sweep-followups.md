---
"@tallyui/pos": patch
---

The orphan-stamp sweep (`sweepOrphanStamps`, ADR-032) is now bounded by a `swept_closure_ids` set on the register document: a closure it has already checked costs no `pos_orders` query, and the set needs no schema bump. It now takes `register` and `storeKey`, as `writeClosure` does. A closure joins the set only once it is older than the new `SWEEP_GRACE_MS`, so an insert racing a close still gets caught; `useRegisterSession` runs a `full` sweep (ignoring the set) once on start to repair anything a save that outlasts the grace missed. `closeSession` already awaited its own sweep before returning; that is now covered by a test. `voidMovement`'s closure lookup is now a primary-key storage read, for consistency with `readSession`.
