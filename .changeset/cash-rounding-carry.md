---
'@tallyui/pos': patch
'@tallyui/components': patch
---

Cash rounding (ADR-094): a closed cash sale's rounding now stays under one increment. A cash part pick rounds against the sale's earlier rounding, so two cash picks of 3.33 at a 0.05 increment take 3.35 and then 3.30, closing at 6.65 rather than 6.70; a pick that reaches the rounded due settles the sale. The zero-remainder write-off goes on the last cash leg, falling back to the last leg only when no cash leg counts.

`roundedPickTarget` takes the sale's live entries as a new optional third argument; a call without it rounds the pick on its own, as in 5.0.0.
