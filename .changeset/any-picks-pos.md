---
"@tallyui/pos": minor
---

**Storage, one way: `pos_orders` moves from schema version 9 to 10.** It adds a line's `anyAttributes`, and the migration keeps every order byte for byte. `CatalogueEntry` takes `picks` for a variant's local "Any" option groups. `addEntryToCart` validates them, stores them on the line, and keeps lines with different picks apart. A sale with picks goes at order.create version 6, and every other sale's envelope is unchanged (#495).
