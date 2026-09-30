---
'@tallyui/database': patch
---

A catalogue pass that yields no pages at all no longer counts (#368). It is not complete, it moves neither `lastCompleteAt` nor the schedule's last completed time, and the gate runs it again at the next check. A page with no entries still counts: that is an adapter reporting an empty catalogue. Before this, a restarted fingerprint reconcile could show a zero-page pass's time as its last complete one.
