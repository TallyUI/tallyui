---
"@tallyui/pos": minor
---

Adds the register closure's pure report maths (ADR-032, registers job b1), ported from WCPOS `next` at `3b5331b5c`: settled figures after corrections (`deriveSettled`, `Correction`, `RecordedFigures`), a CSV export of the shown closures (`exportCsv`), the offline document label keys (`labelKeys`), and the closures list's scope clamp and row selector (`clampClosureScope`, `selectClosureRows`, `ClosureScope`). Money is a2's integer minor units throughout, and `clampClosureScope`'s history window is a `historyDays` parameter (default 92, WCPOS's `HISTORY_DAYS`) instead of a `@wcpos/sync-core` import.
