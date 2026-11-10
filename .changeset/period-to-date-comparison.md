---
'@tallyui/pos': patch
---

`comparisonRange` now compares period to date, as WCPOS v2 does: this week so far against the same weekdays of the week before, and this month so far against the same days of the month before (1–10 Nov against 1–10 Oct). Pass the selected preset as the new optional third argument so a short running month is still treated as a month.
