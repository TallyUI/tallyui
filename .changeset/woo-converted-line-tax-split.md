---
'@tallyui/pos': patch
---

Fix: a WooCommerce-rounded sale with a line priced in the other tax mode recorded a per-rate tax split
(`taxByRate`, sent to the store, and the Z report's per-rate figures) that differed from its printed receipt. The
receipt, the recorded split, Reports and the Z report now share one rule.
