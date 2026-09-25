---
"@tallyui/connector-vendure": patch
---

Vendure pull robustness (backlog 29, 30, 31). The high-water mark and both skew probes now select only `id updatedAt`, not the full product query. A mid-pass checkpoint in the shape saved before #45's pass-state fields (`skip` and `updatedAt` alone) is recognised and normalised into a clean restart of the pass from offset 0, instead of resuming at an offset that no longer lines up with this pull's fixed-window paging. The skew guard's probe re-reads the high-water mark once before throwing, so a product deleted between the mark read and the probe settles into a clean pass instead of an error RxDB then has to retry.
