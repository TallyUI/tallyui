# Products screen: v2's read columns (R9a)

TallyUI demo `/pos/products-screen` (apps/demo: `ProductTable` with `columns={useProductsScreenColumns()}` under a
`ConnectorProvider` with `medusaConnector`, five Medusa products in EUR), Playwright Chromium, 1280x800, JPEG quality
70, light and dark (`colorScheme`).

- `tallyui-light.jpg`, `tallyui-dark.jpg`: the table with all five products. Columns left to right: image (no head),
  Product, Stock, Stock Status, Categories, Price. Wool Beanie is tracked with 52 (Manage on), Cashmere Scarf is
  tracked and out of stock at 0, Gift Card is not tracked (— and Manage off), Enamel Mug is on sale (€9.00 was
  €12.00), Organic Tee has five variants ("5 variations"). The Manage switches are disabled: the columns are
  read-only.

No page errors in the run.

## v2

`docs/v2-parity/screens/v2/products.jpg` is v2's Products screen and the reference for these columns. v2's quantity
is an editable field and its switch toggles; here both are read-only. v2's Regular Price and Sale Price columns are
left out: the one Price column shows a sale price with the price it replaces.
