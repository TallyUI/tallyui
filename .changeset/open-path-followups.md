---
"@tallyui/pos": patch
---

`addPosOrderCollection(db)` follow-ups from the #131 review: a close no longer waits forever on a
stuck migration (it gives up after `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`, 10s, leaving the worst
case an `ERROR` status the next open safely resets and retries); it refuses a `multiInstance`
database up front, before any reset, since the reset can race a second tab's migration
(TallyUI is single-instance, ADR-061); and repeated DM4 retries on the same database no longer
add another `db.onClose` handler each time, only ever one.
