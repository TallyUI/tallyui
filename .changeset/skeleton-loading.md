---
'@tallyui/components': minor
---

`Skeleton` and `skeletonCount` (with `SKELETON_MAX_ROWS`), ported from WCPOS v2: a still, muted placeholder in the shape of what is loading, with `row`, `tile` and `chip` heights from the scale. `Catalogue` now draws skeleton tiles in the product tile's frame (grid view) or the table's header over skeleton rows (table view) while its first pull runs, instead of the "Loading products…" text; the text stays as the loading container's accessible label. `ProductTable` gains a `loading` prop: with no items, it draws its real header and one line placeholder per column cell instead of `emptyState`.
