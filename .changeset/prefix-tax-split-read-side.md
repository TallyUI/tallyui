---
'@tallyui/pos': patch
---

Reprints and Reports recompute the per-rate tax split of a WooCommerce sale with a converted line instead of
trusting the stored one, which was wrong for sales finalized before the previous fix (ADR-065). Stored orders
are not rewritten.
