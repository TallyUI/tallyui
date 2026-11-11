---
'@tallyui/pos': patch
---

A till with fresh storage now numbers its next closure after the store's, instead of starting again at 1. The register's closure number and perpetual totals rise to the store's counters, each one on its own, and never go down.
