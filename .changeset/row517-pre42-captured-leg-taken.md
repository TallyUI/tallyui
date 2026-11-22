---
"@tallyui/pos": patch
---

A resumed draft's captured payment with no takenAt (parked before 4.2) counts as taken: Back, removeTender and newSale keep it, and complete() stores it without inventing a takenAt.
