# Skeleton loading: the products grid and table while the first pull runs (R8)

TallyUI demo `/pos/catalogue-search-row?loading=1` (apps/demo: an empty catalogue, `loading`), Playwright Chromium,
1280x800, JPEG quality 70, light and dark (`colorScheme`), the table shots after pressing the view toggle.

- `tallyui-grid-light.jpg`, `tallyui-grid-dark.jpg`: grid view, 5 columns, 3 rows of muted tiles (15
  `catalogue-loading-tile`s) in the product tile's frame, each 189 px tall: the 80 px image square and the 83 px band
  under it. A real tile of the same demo with no image measured 101 px (75 px band + padding and border), so a tile
  with an image is the same 189 px. The container is labelled "Loading products…" and `aria-busy`.
- `tallyui-table-light.jpg`, `tallyui-table-dark.jpg`: table view, the table's real header (Name, SKU, Barcode, Price,
  Stock, Category) over 11 skeleton rows, one line placeholder per column cell in the column's own flex, the Price
  placeholder aligned right as its cells are.

No page errors in the run.

## v2

`docs/v2-parity/screens/v2/` has no shot of v2's loading state, and v2's live demo was not fetched for this job. The
v2 source the port follows is WCPOS monorepo `packages/components/src/skeleton/index.tsx`,
`packages/core/src/screens/main/pos/products/index.tsx:388-401` (grid) and
`packages/core/src/screens/main/components/data-table/skeleton.tsx` (table).
