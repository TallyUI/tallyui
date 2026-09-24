---
"@tallyui/database": patch
---

The id reconcile's mass-delete brake now also trips when every local product would be tombstoned, whatever the count, unless `allowMassDelete` is set. Previously the brake applied only above `MASS_DELETE_MINIMUM` (10) would-be tombstones, so a wrong channel token that made a shop of 10 or fewer products look empty could tombstone its whole catalogue.
