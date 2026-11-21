# @tallyui/components

## 4.1.0

### Minor Changes

- 32852af: `OrdersList` takes `onReopen` and `onResume`. With `onReopen`, a sale the store refused with `coupon_invalid` or `total_mismatch` shows "Reopen" in Needs attention. When the coupons can't be carried exactly, it also offers "Reopen without the coupon: (amount) to collect". It never drops the coupons on its own. A reopened row reads "Reopened as a parked sale." and shows Resume when `onResume` is passed. Without either prop nothing changes.

  Refusals with these two codes now have their own sentences. In the tender ledger and pane, a held leg shows no Cancel payment, Remove payment or terminal reference. A held leg is money taken before the sale was reopened, or money the store or a closed register's closure already holds.

### Patch Changes

- 52dda13: A closing line keypad no longer swallows the click meant for the next one.
- Updated dependencies [26573b4]
  - @tallyui/primitives@4.1.0
  - @tallyui/core@4.1.0
  - @tallyui/pos@4.1.0
  - @tallyui/theme@4.1.0

## 4.0.1

### Patch Changes

- Updated dependencies [af47cbc]
  - @tallyui/pos@4.0.1
  - @tallyui/core@4.0.1
  - @tallyui/primitives@4.0.1
  - @tallyui/theme@4.0.1

## 4.0.0

### Minor Changes

- 23eb0e4: `AccordionContent`'s `className` now goes to the inner padded view (default `pb-4 pt-0`) instead of the outer collapsible container, as in WCPOS v2. This changes what the prop means: a class that used to style the outer container (a border or `overflow-*`, say) now styles the padded view inside the fold, and a padding class now replaces `pb-4 pt-0`. No in-repo caller passed `className`.
- 3c4b81b: `AccordionTrigger` draws WCPOS v2's 18px down chevron, on the right by default or before the label with `chevronPosition="left"`, and takes `headerClassName` for the outer header (merged after `flex`). The chevron turns 180° and dims to 0.8 opacity over 250ms as the item opens and back over 200ms as it closes; `AccordionContent` folds open and shut over 200ms on v2's ease, and stays mounted until the fold ends. Under reduced motion both are instant, and `forceMount` content does not fold.
- dff924f: AddedToCartToast: v2's one 'added to cart' toast that updates in place and counts a burst of adds.
- cb3f141: AddressEditor edits an order's billing and shipping as WCPOS v2's address rows: an add button until an address is present, then a summary row with Edit and Remove, and shipping Same as billing until the cashier uses a different address.
- 83eebf9: AddressFields edits a CustomerAddress's parts (country and state pickers when the app passes them, Email on request, an emptied part removed), and ShippingAddressFields shows shipping as Same as billing until the cashier uses a different address.
- 8f03c07: BarcodeScanningSettings takes an optional test prop: WCPOS v2's Barcode Scanning Test verdict (scan or typing, Apply suggestions, Shift and trailing Enter notes) for an analysis from analyzeScanTrace.
- b9fece2: New `BarcodeScanningSettings`, a port of the Scanning section of WCPOS v2's Settings › Barcode scanning: the scan threshold, minimum length, prefix and suffix, reported through `onChange` as they change.
- 4319b3c: Cart: fees and shipping are rows in the cart's Qty / Item / Price / Total columns (the entered amount under Price, the display amount under Total), after the lines, as in WCPOS v2.
- e9b3851: Cart: a fee or shipping row's Total opens WCPOS v2's line strip, a solid Edit and Remove under the row. Edit opens the charge form on that charge and applies with `updateFee` / `updateShipping`; Remove removes it. Replaces the Remove button under each charge row.
- 0d649c7: Cart takes `chargeTaxSwitch={false}` to hide the Amount Includes Tax switch on fees and shipping, so a new charge takes the store's tax mode.
- abf76a8: New `CartColumnsForm`, v2's Cart Settings › Columns. It has Show switches, nested Split, SKU and On Sale switches, Move up/down, and an optional Restore Default Settings button. It emits a `CartColumnSettings` value for `Cart`'s `columns`.
- 1c5d2f7: The cart's `columns` setting gains v2's column `order`, the `price.onSale` switch for the struck regular price, a read-only `regularPrice` column, a translated Split link and SKU head, and the newly exported `CartColumnId` type.
- 64d2391: `Cart` takes `orderDiscountChips` (default `true`): pass `false` to leave out the applied order discounts' chips under the lines when the app draws them itself, e.g. as a removable Discount row in `afterSubtotal`.
- dea8966: `Cart` takes an optional `picker` for WCPOS v2's split-by-item bill: the cart turns read-only and each unpaid line shows this payment's `− n of unpaid +` stepper with what the picked units add. `CartColumnHeads` and `CartLine` take an optional `picking`, which heads the quantity column "This payment" and widens it for the stepper; `Cart` sets it while `picker` is on.
- 3b2f99a: `Cart`'s `lineCommit="close"` now gives the price popover WCPOS v2's write-on-close keypad too: Done, Escape discards, and any other close writes the typed price through the same price path and `onPriceChange`. A price refused on such a close shows under its line until that line's next price write. `LinePopover` takes `onCloseRefused`, called with the refusal when a `commit="close"` write on a close other than Done is refused.
- c34fc71: `CartTotal`'s tax rows keep the rate's own label and carry WCPOS v2's tag beside it: "Including tax" when `taxInclusive` is `true`, "Excluding tax" when it is `false`, and no tag when it is absent. The old `incl. ` label prefix is gone. Each tax row has the test id `cart-total-tax-<index>`.
- 24f2f88: `CartTotal` takes `fees` and `shipping` and shows a Fees and a Shipping row between Discount and the tax rows when each is not 0, and `Cart` passes the order's fee and shipping lines, so the cart's totals add up to its total, as in WCPOS v2.
- ae1b243: `CashierSheet` gains v2's drawer door: the opt-in `drawer` prop (`CashierSheetDrawer`) draws "In the drawer" under "Your sales today" with the app's figure, the opener line and the register verbs, and calls `drawer.onOpen` when pressed.
- 530744b: `CashierSheet` gains v2's "Hand the till to" and hold notices: the opt-in `handTo` prop (`CashierSheetHandTo`, `CashierSheetCashier`) lists the other cashiers with their open carts and calls `handTo.onHandTo(id)` when a row is pressed; `paying` shows "Finish the payment first" and holds the rows; `awaitingStore` shows the "Awaiting store" notice.
- bef8aeb: `CashierSheet` gains v2's Store and Register rows: the opt-in `store` and `register` props (`CashierSheetPlace`) draw the name with a "Switch" verb that calls `onSwitch` so the app opens its own picker, and a `heldReason` line under the row that holds Switch.
- cb8d977: New `CashierSheet`: WCPOS v2's cashier sheet on the right edge, with the header (avatar, name and the store · register · "since" line), "Your sales today" and Sign out. It displays what the app passes and calls the app back; Sign out never closes the sheet itself, so the app can ask through `SwitchConfirm` first.
- dedcdd3: Catalogue: optional inStockKeepsBackorder keeps backorder products in the grid while the In Stock pill is on (default off, unchanged).
- 0bdf81c: `Catalogue` takes `rowsSlot` (a `ReactNode`, default none): WCPOS v2's rows between the filter chips and the products (its `ListColumn` `rows`), for notices such as "Price check only until the register is open.". It renders under the header, above the grid, the table or the category tiles, with a 16 px gutter around and between the rows. Without it the catalogue renders as before.
- 7134b8f: `Catalogue` takes `searchAccessory` (a `ReactNode`, default none), rendered at the end of the search row as WCPOS v2 puts the Product settings button beside its search; the Grid/Table `ViewToggle` (`showViewToggle`) moves from the status row into the search row, after the camera scan button, as in v2; an empty accessory (`false`, `null`, `''`) draws no row.
- a4b08be: New `CatalogueSettingsForm`, v2's product settings: Tile Size (an Auto switch, then a 2 to 8 slider) and a Tile Fields switch per tile word, with an optional Restore Default Settings button; it emits `gridColumns` for the catalogue view state and a `TileFields` for `Catalogue`'s `tileFields`.
- de520e5: Catalogue: optional `termPills` shows a searchable single-select term pill per term group (e.g. per Vendure facet) and filters the grid by the picks.
- 704a0d1: `Catalogue` takes optional `tileFields` (v2's Tile Fields), which hides or shows a grid tile's name, price, on-sale strike, SKU, barcode, categories and stock. `ProductPrice` takes optional `showWas`. Without them, tiles and prices render as before.
- 803bbca: Catalogue: `variationsStyle="drill"` swaps the grid for a variable product's variant tiles (option chips, price, stock), with the product's tile first as Back, as v2's "Open in place".
- 7be2853: `ViewToggle` takes `variant: 'icon'`, WCPOS v2's single view-mode button: one press switches to the other view (testID `view-toggle` on the control and `view-toggle-<next view>` on the button, labels "Switch to grid view" / "Switch to table view"). `Catalogue`'s search row now draws that form, and caps the search field at `max-w-160` on wide windows (not phones: width < 768 or height < 480), as in v2's PageBar, with the row's controls at its right end.
- fe3bd2a: With `categoryBrowse="tiles"`, an open category's grid starts with the category itself as a back tile (`CategoryTile` gains `back` and `accessibilityLabel`), and a search typed inside a category leaves it and searches every product, as in WCPOS v2.
- c5fd7f0: `CategoryTile` takes `stacked` and `mark` and falls back to the initial when its photo fails to load, and the `Catalogue` category browse root draws every tile as a stacked v2 poster with its folder or grid mark, hides empty categories, and ends with a "N categories · M products" footer.
- 2c680ad: `ChargeForm` takes `allowPercent` (a currency-or-% unit toggle on fees) and `pricesIncludeTax` (an Amount Includes Tax switch on fees and shipping that starts at the store's tax mode, hidden on a percent fee, which is always of the cart in the store's mode), as WCPOS v2's Add Fee and Add Shipping do; `Cart` passes both and shows a percent fee's Price cell as its percent.
- 1a77108: ChargeForm follows v2's charge rules: a blank name takes the kind's default (Fee, Shipping, Product), and a fee must be above zero, with v2's messages.
- 1b2caa8: ComboboxContent takes WCPOS v2's size: 20rem wide (never narrower than its trigger) and at most 18.75rem tall. The new ComboboxList holds the items and scrolls past that, while an input above it stays in place.
- a1e2b3f: `CartFoot` takes `note?: { text, onPress }` and `Cart` takes `checkout.note`, drawing WCPOS v2's note row above the Checkout button. It is hidden when the note is empty, quiet at rest, and on hover or focus washes and shows an edit glyph (always shown on a coarse pointer). It is 36 px high with a 44 px touch target, and pressing it calls `onPress` so the app opens its note editor.
- 028c0e3: `Catalogue` takes `categoryBrowse: 'chips' | 'tiles'` (default `'chips'`). With `'tiles'` and `showCategoryNav`, the catalogue opens on WCPOS v2's browse root: All products, then each category as a `CategoryTile` poster with its product count and picture. A tile opens its products under a "Categories › name" breadcrumb whose first crumb goes back.
- 8c87fd8: Adds `ConfirmDialog`: a title, an optional description, Cancel and a confirm button (destructive by default). It opens from a `trigger`, or is controlled with `open` and `onOpenChange`. Settings › Customer display's Forget dialog uses it.
- 827e008: ConnectivityToast, WCPOS v2's 'Device went offline' / 'Website is unreachable' / 'Connection restored' toast for a connectivity change that holds 5 s.
- 4341a30: CustomerDropdown pages: `browse(page)` and `search(query, page)` load the next 50 at the end of the list, as v2 (absent support: one page, as before).
- 3f73c6f: CustomerDropdown: optional `browse` lists customers under Guest for an empty query, as v2 does (absent: unchanged).
- d3f8db3: CustomerDropdown: Guest shows the person glyph on the chip, and optional onEditAddress/hasAddress add v2's address pin beside the chip (absent: no pin).
- 924000d: CustomerDropdown: the customer chip opens a search dropdown anchored to it (Guest first, then results), as in WCPOS v2.
- 6b173bb: DialogContent and AlertDialogContent: fade and scale in and out with WCPOS v2's dialog motion (150ms, scrim 150ms in / 200ms out); instant under reduced motion.
- 25f8f86: `ListRow` gains `size="sm"` (the row height token, 44 at Regular) and `selected`, v2's current-row mark: the row is painted `bg-muted` with a primary bar on its left edge, `selected={false}` keeps the bar's room, and the state is announced as selected (checked on a radio or checkbox).
- 8980084: `ListRow`: one flush row of a list as in WCPOS v2: a hairline under it, `leading`, body and `trailing` slots, the press and fine-pointer hover wash, the disabled dim, and a `button` role only when it has an action.
- fae1b1a: `@tallyui/core` adds `MoneyFormatProvider`, `useFormatMoney` and `useCurrencySymbol`. `@tallyui/pos`'s `CurrencyProvider` renders the provider, and every `@tallyui/components` money amount and money-input symbol now reads the store's money format when one is provided. Without a provider, nothing changes. `discountLabel` takes an optional formatter as its third argument.
- 79e5c03: OrderNoteSheet, WCPOS v2's Order details note field; Cart's optional noteSheet opens it from the ⋮ menu and the note row and writes the sale's note (no change without the prop).
- 358fa6a: OrderStatusBadge renders as StatusBadge, as in WCPOS v2: a coloured dot and a foreground `text-sm` word with no tinted pill behind it (the `bg-*/15` wash, rounded corners and padding are gone). `className` still lands on the row, so an app that wants a background can pass one.
- 64f30f9: RegisterBar draws its pill as WCPOS v2's warning dot and word, and its optional `awaitingStore` counts the sales still to send: 'Offline · N sales to send' offline, 'N sales awaiting store' online when no other pill shows.
- 96e5b2c: RegisterCount's cash field is a large figure with the currency symbol in the field, as WCPOS v2's count. ClosureSheet leads with the cash variance as a large signed figure under "Variance · short/over/Exact", over Counted and Expected boxes; `closure-counted-cash`, `closure-expected-cash` and `closure-variance-cash` now hold the figure alone (e.g. "€63.30", "−€36.70"); other tenders are unchanged.
- 502090c: `RegisterPanel` takes an optional `openedBy: { name, avatar? }` for the side sheet: the opener's name ends the header line in place of "Cashier", and WCPOS v2's "opened HH:MM by" line with the opener's avatar (or initials) sits under the drawer figure; without it nothing changes.
- 5f8a7a7: Adds `SalesCardPanel`: the Sales room's Payments, Top products, Categories and Taxes cards open their figure in full in a right-hand panel, with a title, an optional scope line, a table with a total row, the order count and gross (and any missing cost) in the footer, Close, and Export CSV when `onExportCsv` is given. A `SalesCards` head that opens a panel is now 44 pt tall, dims on press and shows a chevron after its figure; without `onOpenCard` the cards are unchanged.
- b050d25: DialogContent side="right": slides in and out with WCPOS v2's panel motion (250ms in, 200ms out, scrim fade); instant under reduced motion.
- a6b7b9a: StatusBadge: a status as a coloured dot and a word, as in WCPOS v2. Variants `default`, `ok`, `warning`, `bad`, `info`, `muted`; `size="caption"` for a row's state line or a log level.
- 0a9e866: `ToneDisc`: the round tone mark a state leads with, as in WCPOS v2: a wash and one glyph per tone (`ok`, `warning`, `bad`, `info`, `muted`), sizes `sm` 44, `default` 56 and `lg` 96, and an `icon` override. Adds the `CheckIcon`, `AlertTriangleIcon`, `AlertCircleIcon` and `InfoCircleIcon` glyphs. Needs `@tallyui/theme` with the tone tokens.
- 10760f4: Nine Tabler nav icons from WCPOS v2's rail: CashRegisterIcon, GiftIcon, ReceiptIcon, DiscountIcon, UsersIcon, ChartLineIcon, ActivityHeartbeatIcon, SettingsIcon and MessageQuestionIcon.
- 13f14a8: CustomerEditor adds or edits a customer: CustomerForm with its AddressEditor, an explicit Save and Cancel, and the store call, with Save online only.
- a95ffbf: CustomerForm can take billing and shipping through AddressEditor, an optional Company field and an email error from the caller, and its field labels are translated.
- 66ba608: `CustomerPicker` takes `showAvatar` to draw v2's initials on each result row, and `withGuest` to draw a Guest row above the results that picks `null`, as v2's customer select does. Both default to `false`.
- db64a8f: New `CustomersList`: WCPOS v2's Customers screen search field and customer rows (avatar, name, email, city and country), with empty, no-results, loading and error states, drawn from props.
- 687c1f0: Dialog: opt-in `showClose`/`closeLabel` on DialogContent and `bordered` on DialogFooter draw v2's corner close and footer divider; defaults unchanged.
- fca7e93: DiscountForm: `layout="dialog"` gains v2's Quick discount / Coupon tabs when `onApplyCoupon` is passed. The Coupon tab picks one of the app's `coupons` (the new `DiscountCoupon` type) from a searchable list and applies it; a refusal shows inline and the dialog stays open. Without `onApplyCoupon` the dialog renders as before.
- f9d9e6b: DiscountForm `layout="dialog"` (v2 Add Discount) and an optional `title`; the default rendering is unchanged.
- 9a7a39f: DiscountForm: the Coupon tab gains v2's "New coupon" (+) button through `onNewCoupon`, disabled with a reason through `newCouponDisabledReason`.
- ad3f7f6: The customer-display settings say when the store no longer recognises this till, instead of asking the cashier to sign in again.
- 2aed43a: The drill (`variationsStyle="drill"`) has a "Products › name" crumb above the variant tiles, and Escape on web goes back to the products.
- 9546b46: With `variationsStyle="drill"`, `Catalogue` draws a variable product's grid tile stacked, as WCPOS v2 does, and each variant tile shows how many of that variant the cart holds, counted from a `cartLines` line's new optional `variantId`.
- 036b664: The order view says which of a sale's tax IDs, custom fields and edited SKUs a downgrade did not send to the store (`extrasNotSent`, ADR-092 condition 1).
- 26377f6: ProductFilterBar: optional `termGroups` adds a searchable single-select term pill per group (e.g. per Vendure facet) after the built-in chips.
- d034d9f: A store can report the lines whose figures it computed differently with the new `line_figures_mismatch` warning, which `parseCommandResult` and `knownWarnings` accept. `moneyDivergence(order)` gives a sale's differing order figures and line ids, and the orders list counts the differing lines.
- 42e1517: `LinePopover` gains `commit="close"`, WCPOS v2's grow keypad: a full-width Done in place of Apply and Cancel, and on a quantity a − / + stepper row that writes at once, with − turning into Remove at a shown quantity of 1 when `onRemove` is given. Escape closes without writing, and any other close writes what was typed. `Cart` opts its quantity popover into it with `lineCommit="close"` (with `lineEditor="popover"`), which drops the popover's Remove action in favour of Remove at 1; the price popover keeps Apply and Cancel. The default draws the popover as before.
- ccb28e1: PriceForm, DiscountForm, RefundForm and CashTendered read typed money in the store's separators from MoneyFormatProvider. `parsePrice` and `parseDiscount` take an optional trailing format. Without a format, parsing is unchanged; extra decimal places are still refused, never rounded (#672).
- b13aefe: product tiles show v2's press veil and the in-cart badge plays v2's count beat, still under reduced motion.
- 5f465fa: Cart: lines, fees and shipping pulse green when added (lines also on a quantity change), and tint red and collapse when removed, as in WCPOS v2; nothing moves under reduced motion.
- ed117af: MovementSheet's confirm button names the amount as v2 does ("Put €5.00 in" / "Take €5.00 out", "Put cash in" / "Take cash out" before a valid amount; no sale keeps "Record"), with v2's `register.*` string keys; RegisterPanel takes `movementReasons` to replace the reason chips per movement type.
- d5bfbaa: MovementSheet: v2's reason chips fill the reason field; `reasons` replaces the defaults.
- 52b67b4: Shell: NavRail and NavDrawer sit on WCPOS v2's sidebar wash, and the active item lifts to a white square (a tint in dark) with the selected ink. New theme tokens: sidebar, sidebar-foreground, sidebar-border, rail-accent, rail-selected, rail-selected-foreground. Apps with their own theme variants add these six to each variant.
- d2e8b04: New `Notice` band (bad, warning, info) for form errors and attention lines, ported from WCPOS v2.
- b084d5a: `OpenSaleTabs` shows how long a parked sale has waited, in hours and in the warning colour, once it has waited an hour; `OpenSale` gains `parkedAt`.
- 563e970: `OpenSaleTabs` takes a `className`, merged onto the bar's root, so an app that places the tabs at the top of the cart can restyle it.
- 2163425: OrderDetail: optional `onReopen`, `onSync`, `onReceipt` and `reopenDisabled` draw v2's pinned order footer; nothing changes when they are omitted.
- 538a2cd: OrderDetail takes optional onRefund and onDelete: WCPOS v2's Delete and Refund buttons, drawn on the left of the actions row; Delete asks for confirmation first.
- 14b1dd7: OrderStatusBadge follows WCPOS v2 on four points: `'refunded'` now uses the muted tone shared with `'cancelled'`; the muted tone's dot is `bg-muted-foreground` and its word stays in the foreground colour, so the Cancelled dot is visible; `'trash'` (Trash) and `'checkout-draft'` (Draft) join `OrderStatus`; and a status the badge does not know shows its raw string in the default (primary) tone instead of "Pending".
- f82e8cc: OrderStatusBadge: adds WCPOS v2's `'on-hold'` (On hold), `'failed'` (Failed), `'pos-open'` (POS open) and `'pos-partial'` (POS partial) statuses with v2's tones. OrderDetail's money rows centre their amounts vertically.
- c05ed6f: `OrderSyncNotices` is exported: the per-sale sync notices `OrdersList` shows (refusal, stuck since, late session, local warnings, note not sent, the store's warnings), with `children` at Retry's place, for an app's own order screen. `OrdersList` renders it and looks the same.
- 0910c36: OrderDetail: optional discount (with coupon codes), shipping (with method), fees and per-rate tax rows, and a meta line under the header, in WCPOS v2's order view order. The hairline now sits above Total.
- 61846d3: The tender pane offers every manual-capture payment method the host passes, records each as its wire method plus its own `methodId`, and labels ledger, takings and report rows with the method's title; takings and report rows key by kind and id (`legMethodId`), so two methods never merge. `takingsByMethod` returns an object with no prototype; read it with `Object.hasOwn`, not `hasOwnProperty`.
- f6e680d: POSLayout: `tabBar="bottom"` draws v2's phone tab bar (Products / Cart with a count) and keeps both panes mounted.
- 46d6dce: `POSLayout` takes `renderCheckout`, WCPOS v2's checkout column: when given, its result takes the products column's place and the browse slot unmounts. In the split layout the cart stays beside it (as the tender ledger); in the stacked layout it is the whole body, with no tabs. It is called with the layout in force, so the pane can draw its own ledger when the cart is not on screen.
- e711ff6: POSLayout takes an optional columnKey: a new key fades the split checkout column in, as WCPOS v2 keys its column (e.g. tender to receipt).
- d7435c8: Receipts and the orders list show what the store owes back on a reopened sale as Refund due (`ReceiptData.refundDueMinor`, `refundDueOf`); the receipt's change no longer includes it.
- 999bccc: New PrinterForm: the add/edit printer form for PrintingSettings's onAdd and onEdit (network and Print Dialog printers), props only; the app saves the draft.
- cd10735: `PrintingSettings` routes each receipt, report and closure template to a printer: new optional `templates`, `routing` and `onRoutingChange` props, with an Auto choice that shows the printer `resolvePrinter` picks. Without `templates` it renders as before.
- 5085261: PrintingSettings takes optional onCopySetupReport and onOpenHelp: each printer's menu gets a "Copy setup report" item that calls the app's handler, and a "Having trouble?" link under the printer list calls onOpenHelp, as in WCPOS v2.
- 257aafa: New `PrintingSettings`, a props-only port of the Printers section of WCPOS v2's Settings › Printing: the printer list with Test Print, Edit, Set Default and a confirmed Delete, the empty state, and Add Printer.
- 1c368cf: ProductFilterBar: optional `terms` turns Category, Tag and Brand into v2's searchable picker pills; `onTermPress` still works.
- 48b07c7: ProductTable takes optional isExpanded, onToggleExpand and renderExpanded: a variable product's thumbnail toggles a block under its row, as WCPOS v2's table. Catalogue opts in with tableRow.expand, drawing each variant as a row with its option chips, price, stock and a + that adds it as the list chooser does.
- 13b6de6: `ProductTable` takes `cartQuantity(doc)`, and draws WCPOS v2's in-cart count in the add column: once the cart
  holds the product, the primary count badge takes the `+`'s place, labelled "In cart: N", and pressing it adds
  another as the `+` does. A product with variants keeps its `>`. `Catalogue`'s table view passes the counts it
  already reads from `cartLines`, as its grid tiles show them.
- 4b605c3: `ProductTable` takes `showThumbnail` and `showAddButton`, and `Catalogue` takes `tableRow: { thumbnail, addButton }` for its table view, drawing WCPOS v2's product table row: the product's thumbnail leads the row (40 px, 56 px under a coarse pointer, an initial tile when there is no image) and a `+` labelled "Add to cart" ends it, or a `>` labelled "Variations" for a product with more than one variant. The button calls `onSelect` exactly as a row press does, once. Both default off. `PlusIcon` and `ChevronRightIcon` are new exports.
- 9f3e83e: New `productsScreenColumns` and `useProductsScreenColumns` give `ProductTable` the read columns of WCPOS v2's Products screen: image, product with its variation count, stock with a Manage switch, stock status, categories and price.
- 2964ecd: `Receipt` takes `actions`: a node that replaces Print receipt and New sale (never printed), or `false` for no buttons; `newSale` is then optional.
- a51d4b2: `ReceiptSheet` takes an optional `email` prop (`ReceiptSheetEmail`) that draws WCPOS v2's receipt email form inside the sheet: "Email Receipt" opens an "Email Address" field prefilled from `defaultAddress`, an optional "Save email to the customer" switch, v2's offline notice with "Send when online", and an inline error. Send checks the address and calls `onSend`, which sends or queues in the app and returns a refusal to show or `null` to close the form. With `email` given, `onEmail` is not called; without it the sheet is unchanged.
- deb2d16: ReceiptSheet: after `email.onSend` gives null, the sheet says 'Email sent', or 'Receipt email queued' when offline (v2's copy, through the components catalogue).
- ac15b7a: `Receipt` takes an optional `printed` prop: its Print button then reads 'Print again', as `ReceiptSheet` does.
- 6d922f9: `ReceiptSheet` takes optional `printers`, `printerId`, `autoPrinterName` and `onPrinterChange`, v2's printer switcher, with Auto first. Without `printers` the Printer row shows `printerLabel` as before.
- 6b1eec0: ReceiptSheet draws v2's header close icon, footer top border and print icon; new `PrinterIcon`.
- 462cd31: ReceiptSheet takes optional onDownloadPdf and downloadingPdf: WCPOS v2's Download PDF button, drawn between Email Receipt and Print only when onDownloadPdf is given.
- 70ac42f: New `ReceiptSheet`, a props-only right-edge sheet that ports the layout of WCPOS v2's receipt print sheet: template choice, printer, the app's preview, and Close, Email Receipt and Print.
- 30c0cbf: The refund due on a reopened sale now reaches the receipt templates, ESC/POS, the WCPOS template data and the customer display, never as change (ADR-090 gate 36).
- 1234170: RegisterCount is keypad-first and folds the notes and coins tiles under "Count by notes and coins", closed by default.
  A new `onPrint` prop makes Close read "Close & print" and prints the Z report after the close lands.
- bd6fa29: `RegisterCount` folds the non-cash tender inputs under an "Other tenders" toggle, closed by default and shown only when the session expects a non-cash tender, as in WCPOS v2.
- 54c7d97: Reports: the period sales report counts a reopened sale's till money only, leaving out what the store already held, as takings do, and the Z report's breakdowns flag `tax_includes_store_paid` when its tax rates include tax on amounts paid earlier in the store (`TAX_STORE_PAID_NOTE`).
  The closure sheet shows that note when the flag is set.
- 42ca292: `SalesCards` takes `hide` (and `SalesRoom` takes `hideCards`) to leave out cards a backend's report cannot fill; without it all six show as before.
- 21ecf2b: The Sales room's Orders card shows Median and Largest, as v2 does.
- 6e191c9: New exports the platform apps copied before: `deriveSessionFigures` and `deriveVariance` on `@tallyui/core`'s browser-safe main entry; `tenderLabel` and a new `syncStatusQuiet` predicate (true when `SyncStatus` would show only "Sales are up to date.") on `@tallyui/components`.
- 26f09ed: `AppShell` takes `navFooter`, drawn at the foot of the nav rail and the phone drawer (`NavRail` and `NavDrawer` take it as `footer`), for a line such as the app version; without it nothing changes.
- d29c19c: `Skeleton` and `skeletonCount` (with `SKELETON_MAX_ROWS`), ported from WCPOS v2: a still, muted placeholder in the shape of what is loading, with `row`, `tile` and `chip` heights from the scale. `Catalogue` now draws skeleton tiles in the product tile's frame (grid view) or the table's header over skeleton rows (table view) while its first pull runs, instead of the "Loading products…" text; the text stays as the loading container's accessible label. `ProductTable` gains a `loading` prop: with no items, it draws its real header and one line placeholder per column cell instead of `emptyState`.
- cf276f5: `Tender` and `TenderPane` take `back={false}` to hide the Back button, for a host that leaves the tender stage itself (WCPOS v2's phone checkout); the default still draws Back.
- 8fbf880: The tender pane leads with the change due once the cash entered covers more than the total, with the tendered amount under it, as WCPOS v2 does.
- 40cdd3b: `TenderPane` draws WCPOS v2's Full balance chip (`tender-quick-balance`) for a picked method that gives no change, such as Card terminal. It reads "Full balance" when the entry already equals the amount due, "Full balance {amount}" otherwise, and "Exact {amount}" while a split plan is active; pressing it only sets the entry. Cash keeps its Exact and quick-cash chips unchanged. New catalogue keys: `pos_checkout.full_balance` and `pos_checkout.full_balance_label`.
- 9432192: Cart's `tenderLedger` shows the payments ledger (legs, Total, Paid, Remaining) under the cart totals during tender, as WCPOS v2's checkout cart; `Tender` and `TenderPane` take `ledger={false}` to leave it out of the pane.
- 1219ecf: The tender pane draws its payment methods as WCPOS v2's tiles: an icon above the title, equal-width in rows of five, the picked one bordered.
- 8a4e608: The tender pane has WCPOS v2's Split chip on its headline: Split the rest offers 2 to 6 equal ways, each payment is pre-typed with its share, and a method tile keeps the share that is due instead of the whole balance.
- cf82d26: The tender pane leads like WCPOS v2's: a To pay (or Remaining) caption beside Split, the amount being entered as the large figure above the method tiles, and centred quick-cash chips.
- d44f0d4: `TenderPane`, `Tender` and Cart's `tenderLedger` take an opt-in `confirmVoid`. With it, Cancel payment on a ledger leg first asks WCPOS v2's "Cancel this payment?", with the leg's amount ("Return {amount} cash to the customer" for cash, else "Void {amount} on {title}"), and `sale.voidTender` runs only on confirm; Cancel writes nothing. Default `false`: Cancel payment voids at once, as before.
- e37578d: `useTender`: Cart's unit picker and Tender share one reducer; a part pick is refused at any other amount.
- bcaef94: `Catalogue`'s `tileFields` now also drives the drill's variant tiles (name and chips, price, SKU, barcode, stock) and the loading skeleton's tile height. Without `tileFields` they render as before.
- ab8a86d: Add Shipping and Edit shipping offer No tax on a store that taxes shipping itself when `shippingNoTax` is set; the cart sets it at order.create 6 or later (#1115).

### Patch Changes

- 9975ed8: POSLayout, CheckoutLayout, SettingsLayout, LiveTabScreen and StoreSettingsChoiceScreen now draw the theme's background (bg-background); they used bg-bg, a class with no token, so they drew none.
- 7082387: Cart: Remove in a fee or shipping row's line strip flies the row off to the left before the charge is removed, as in WCPOS v2. Reduced motion removes at once. A second press is ignored, and a refused removal brings the row back. A removed row keeps its place and state while it tints and collapses.
- d0a064f: The cart's Qty head fits at phone width in every scale, and the cart heads read `pos_cart.col_*` from the components' catalogue.
- 16e40a3: Show tendered cash and change for picked units on the customer display, count only the applied money as paid, and refuse picks above the balance less payments in motion.
- 5119d20: Catalogue's category breadcrumb now splits the parent and the category with a chevron icon at wide widths, collapses to one "‹ Categories" control on a phone, wraps a long category name instead of cutting it off, and takes focus when a category is opened from its tile, with Escape going back to the tiles on web.
- 6af01ae: ChargeForm's submit button reads "Add to Cart" when adding a charge and "Save" when editing one (was "Apply"), as WCPOS v2.
- 69f335d: ChargeForm: visible, translatable Name and Amount labels; the amount shows the sale currency's symbol as an affix instead of a currency-code placeholder.
- fac09c0: POSLayout fades the products/checkout column in over 200 ms in the split layout (WCPOS v2 CROSSFADE).
- 03998b5: `CustomerDropdown` clears a next page's error once a retry of that page loads.
- 091d09a: Internal: one reduced-motion hook in components; InCartBadge behaviour is unchanged.
- e5a6a60: OrdersList explains a sale recorded after its register closed.
- 76f0747: Rename the filter's PaymentMethodKind to core's PaymentKind and the selector's PaymentMethod to PaymentSelectorMethod, keeping the old names as deprecated aliases.
- 0c678ba: Receipt shows a line row that has no matching cart discount under its own label.
- bfb1ad0: Show the unsendable-update message and Retry for pending reopened sales. Tell cashiers to reopen again after a reopen-required or revision-conflict rejection, and offer Retry only when the outbox can requeue the order.
  The unsendable-update message now tells the cashier what to do.
- 2c76884: Under a coarse pointer the category chips, tabs, Grid/Table toggle, register bar menu button and camera scan button get a hit area of at least 44 px (v2's MinTargetBand), with each control drawn at its size as before.
- 612a181: `CustomerPicker` selects nothing when a customer create resolves after the picker has unmounted (the host closed it mid-create).
- adbd169: `DialogContent side="left"` now draws a sheet on the left edge that slides in from the left, as v2's order sheet does; it was drawn as a centred dialog, which also fixes `OrderNoteSheet`.
- b6e936c: **Breaking for DisplaySignalling implementers**

  - The nine till methods take `TillDevice { deviceId, deviceKey }` in place of `deviceId`, and `registerDevice` and the `device_refused` refusal are new.
  - `createTillPairing` and `createTillDisplayService` take `device` (from `createTillDevice`) in place of `deviceId`.
  - Migration: a plugin adds the register route and checks the key on every till route; an app stores the key next to the device id (never replicated); an existing till registers on first use and keeps its paired displays.

  A till now proves itself to the store with a key the store issued, so knowing a till's device id is no longer enough to act as that till on its customer displays.

- 64e8323: `@tallyui/pos` now exports `tillLegsTheStoreRefuses`, the ids of the till legs a reopened sale may not keep once the store's own locked legs cover its total, the same rule `finalizeOrder` refuses at completion (ADR-090 gate 36c).

  The tender pane disables Complete on a reopened sale whose store payments already cover it while till money sits on the sale, says "The store already holds this sale's payment. Remove the {amount} taken here to finish.", and offers a Remove payment control on each such leg. Its refund-due line now reads from its own `pos_checkout.refund_due` key.

- e19664f: Keep force-mounted popovers at their last position while closed and stop their dismissal listeners.
  Fade the cart line keypad in and out over 200 ms, stopping keyboard input as soon as it closes.
- 1376e2d: MovementSheet disables Put/Take for an amount with more decimal places than the currency has, or too large to record, with a hint, instead of failing after the tap.
- de8c530: OpenSaleTabs: ← and → step between the open-sale tabs on the web (v2 cart/tabs.tsx).
- 1bddd27: OrderStatusBadge: accepts Medusa's `'canceled'` as well as `'cancelled'`, and shows both as "Cancelled", the spelling WCPOS v2 shows.
- f833598: ProductGrid takes an optional `footerSlot`, rendered after the last tile inside the list.
- 95d84b4: ProductTable's loading skeleton rows are now drawn at the height they are counted at (48 px, or the thumbnail plus 13 px), so they fill the table body.
- cb10230: ReceiptSheet draws its close X and footer divider with Dialog's `showClose` and `bordered`; the close X now sits in the sheet's top-right corner.
- 50fac41: RegisterCount takes an optional `failureText`, shown when closing the register or going back to selling fails.
- 7b30c77: RegisterCount takes a note with the close, and ClosureSheet shows it, as v2 does.
- a25f4f5: MovementSheet, OpenRegisterCard and RegisterCount read amounts in the store's money format. Their prefills and the count keypad write the store's decimal separator.
- 2431d40: RegisterPanel's side presentation keeps the register-panel-sales-count, -amount and -movements testIDs.
- ac96645: ChargeForm reads amounts in the store's money format. ChargeForm and CashTendered prefill with the store's decimal separator, so an edited prefill is never read as a thousands group.
- 839a1ef: SettingsGroup draws no empty card when it has no children (Printers while loading).
- dec6d41: `SwitchConfirm`: when signing out with the register still open, "Close register" is the primary button and "Sign out anyway" the outline one, as in WCPOS v2.
- 940d899: `Switch` lays its thumb out in a row, so the thumb starts at the track's left edge and slides to its right edge, as in WCPOS v2.
- 0a10a50: A tender plan records the payment ids on the order when it was set (`TenderPlan.before`, optional), and its legs are the captured legs not in that list. Voiding a payment taken before a split, or a pending one capturing later, no longer shifts the split's count or its shares. `TenderPlan.from` is deprecated and read only for a plan without `before` (#1133).
- 17ef951: The tender pane shows a reopened order's refund due (its locked legs beyond the new total) as "Refund due", never as till change, and `@tallyui/pos` now exports `lockedRefundDueMinor` (ADR-090 gate 36).
- cc7dbb2: set-split-units refuses a pick above 0 while a plan is set; close-split, set-plan, clear-plan, arm-custom and request-cancel clear the picked units; tender-started takes an optional units (the recorded leg's own) and freezes those, not the raw picks; TenderPane's Take attaches only the picks that stand on the order and passes them to tender-started. A host that owns tenderReducer can no longer record stale picks on a leg or in unitAllocations.
- 72730f5: Taking a leg records the units picked for it, so a void frees them.
- bba11e1: A payment leg records the units it paid for (`Payment.units`), and the tender pane rebuilds its unit allocations from the order's legs when it mounts again (#1133). `addTender` refuses units on a line that is not on the order, or more units than the line has unpaid.
- 3456730: Internal tidy: the cart tabs use `@tallyui/pos`'s `isPartlyPaid` instead of a copy, and the catalogue, stock badge and variations popover share one stock-status label table. Behaviour unchanged.
- 18b0a2b: ToggleGroupItem shows the pressed style (bg-accent) on the selected item(s), as Toggle does.
- 6d726e1: Warning words use the darker warning-text ink, as v2 does.
- dbcbe24: On web, the disabled New coupon button's reason and each order row's hint now reach assistive technology through `aria-describedby`, since react-native-web drops `accessibilityHint`.
- Updated dependencies [4843172]
- Updated dependencies [c91ae8c]
- Updated dependencies [16e40a3]
- Updated dependencies [f6bf0ac]
- Updated dependencies [5c4c408]
- Updated dependencies [bd5b295]
- Updated dependencies [7b30c77]
- Updated dependencies [0b3edbb]
- Updated dependencies [1455e76]
- Updated dependencies [fae1b1a]
- Updated dependencies [bfb1ad0]
- Updated dependencies [028c0e3]
- Updated dependencies [3942708]
- Updated dependencies [81198d2]
- Updated dependencies [fed2ec4]
- Updated dependencies [1f40158]
- Updated dependencies [bc9a686]
- Updated dependencies [c9403ce]
- Updated dependencies [fd522b2]
- Updated dependencies [e928f11]
- Updated dependencies [ac46fa5]
- Updated dependencies [c83dcda]
- Updated dependencies [b6e936c]
- Updated dependencies [65030d5]
- Updated dependencies [ad3f7f6]
- Updated dependencies [d4cd713]
- Updated dependencies [d0c69d6]
- Updated dependencies [6929703]
- Updated dependencies [1d13ca2]
- Updated dependencies [e4d9851]
- Updated dependencies [036b664]
- Updated dependencies [2efd121]
- Updated dependencies [64e8323]
- Updated dependencies [2558765]
- Updated dependencies [d034d9f]
- Updated dependencies [e19664f]
- Updated dependencies [82ec063]
- Updated dependencies [e48cac6]
- Updated dependencies [ccb28e1]
- Updated dependencies [52b67b4]
- Updated dependencies [250fd29]
- Updated dependencies [b084d5a]
- Updated dependencies [1821a2c]
- Updated dependencies [1821a2c]
- Updated dependencies [74191f9]
- Updated dependencies [0eb7640]
- Updated dependencies [d5f08c7]
- Updated dependencies [f5a739f]
- Updated dependencies [3b25108]
- Updated dependencies [1f3eae7]
- Updated dependencies [b153da4]
- Updated dependencies [61846d3]
- Updated dependencies [383f99c]
- Updated dependencies [e5a6a60]
- Updated dependencies [0f04e08]
- Updated dependencies [86533d4]
- Updated dependencies [048fbcf]
- Updated dependencies [bc9a686]
- Updated dependencies [fed2ec4]
- Updated dependencies [602a062]
- Updated dependencies [1f40158]
- Updated dependencies [d7435c8]
- Updated dependencies [dff26e6]
- Updated dependencies [d641cdf]
- Updated dependencies [4e9fd98]
- Updated dependencies [58602f6]
- Updated dependencies [e020d0e]
- Updated dependencies [e3afcfa]
- Updated dependencies [98a0b9a]
- Updated dependencies [bbe2e73]
- Updated dependencies [e826ec0]
- Updated dependencies [17a248e]
- Updated dependencies [8d6fa8b]
- Updated dependencies [5b1ac68]
- Updated dependencies [23af8bf]
- Updated dependencies [2b00532]
- Updated dependencies [ce450d7]
- Updated dependencies [3dea768]
- Updated dependencies [290cf51]
- Updated dependencies [f1748d1]
- Updated dependencies [9169717]
- Updated dependencies [7a6075b]
- Updated dependencies [2cb63cb]
- Updated dependencies [30c0cbf]
- Updated dependencies [6247788]
- Updated dependencies [47b5f78]
- Updated dependencies [1f298cf]
- Updated dependencies [28fbf39]
- Updated dependencies [54c7d97]
- Updated dependencies [ccb6a1e]
- Updated dependencies [3b8de1b]
- Updated dependencies [b11a976]
- Updated dependencies [25c2133]
- Updated dependencies [f1c118f]
- Updated dependencies [43b5e78]
- Updated dependencies [49af156]
- Updated dependencies [a4568f8]
- Updated dependencies [90d4b5f]
- Updated dependencies [fa7ba60]
- Updated dependencies [28351ff]
- Updated dependencies [b06d09c]
- Updated dependencies [21ecf2b]
- Updated dependencies [968782d]
- Updated dependencies [499bd46]
- Updated dependencies [6e191c9]
- Updated dependencies [c4075a9]
- Updated dependencies [3a9d3ec]
- Updated dependencies [2bdae98]
- Updated dependencies [f51a692]
- Updated dependencies [28ba50e]
- Updated dependencies [6b68595]
- Updated dependencies [0a10a50]
- Updated dependencies [594a53b]
- Updated dependencies [17ef951]
- Updated dependencies [cc7dbb2]
- Updated dependencies [a258b43]
- Updated dependencies [bba11e1]
- Updated dependencies [73a01d3]
- Updated dependencies [3cec48d]
- Updated dependencies [622196b]
- Updated dependencies [c9201a2]
- Updated dependencies [1a544e7]
- Updated dependencies [9e8f104]
- Updated dependencies [3ff125d]
- Updated dependencies [c83bb01]
- Updated dependencies [6a7f41b]
- Updated dependencies [a1363ea]
- Updated dependencies [c900357]
- Updated dependencies [a9111fc]
- Updated dependencies [a171cf5]
- Updated dependencies [5c4711c]
- Updated dependencies [1d0e548]
- Updated dependencies [cc6f6cf]
- Updated dependencies [099c8bc]
- Updated dependencies [70ead22]
- Updated dependencies [23a6813]
  - @tallyui/pos@4.0.0
  - @tallyui/primitives@4.0.0
  - @tallyui/core@4.0.0
  - @tallyui/theme@4.0.0

## 3.20.1

### Patch Changes

- @tallyui/pos@3.20.1
- @tallyui/core@3.20.1
- @tallyui/primitives@3.20.1
- @tallyui/theme@3.20.1

## 3.20.0

### Minor Changes

- e4fb919: `CartFoot`'s Checkout is at least 56 px tall (`min-h-14`) and its ⋮ is 44 × 44 px (`h-11 w-11`), WCPOS v2's sizes (#766).
- 8010117: `Cart` draws its totals and foot at WCPOS v2's inset (8 px in, 8 px apart), and `CartPanel` takes a `footerClassName` for its footer's wrapper (#765).
- 845b12f: `CartTotal` and `Cart` take `showTotal` (default `true`) so a v2-style cart can leave out the Total row, and the Total row is `font-semibold` instead of `font-bold`, as WCPOS v2 (#781).
- 378dcc6: `ProductTable` columns take `align` and `hideHeader`, heads are one line and 36 px tall, cells are padded `px-3 py-1.5`, and the default Price column is right-aligned, matching WCPOS v2's table (#768).
- 0b34330: Dialog, AlertDialog and NavDrawer backdrops paint the new per-theme `scrim` token (light 28%, dark 50% of a near-black, as WCPOS v2) instead of `bg-black/80` and `bg-black/50` (#779).
- 4244a8d: `SearchInput` is 44 px tall (`h-11`), WCPOS v2's search height, instead of sizing itself by padding (#767).
- 7896999: Switch's off track paints `bg-border` and Slider's track `bg-muted` with a `bg-card` thumb, WCPOS v2's tones, instead of `bg-input`, `bg-secondary` and `bg-background` (#780).

### Patch Changes

- Updated dependencies [6b16ac6]
- Updated dependencies [749894f]
- Updated dependencies [0b34330]
- Updated dependencies [2879bfd]
- Updated dependencies [5f3475b]
  - @tallyui/pos@3.20.0
  - @tallyui/core@3.20.0
  - @tallyui/theme@3.20.0
  - @tallyui/primitives@3.20.0

## 3.19.0

### Minor Changes

- d6c93e9: A camera barcode scanner (#720, v2's scan button and inline camera panel). `Catalogue` takes `cameraScan` (default false) and `cameraScanner`; with both it puts a `CameraScanButton` beside the search box that opens a `CameraScannerPanel`. The panel calls no pos hook: the app owns `useCameraScan` (inside its `ScanHubProvider`) and passes `{ onDetected: camera.offer, onOpen: camera.reset, scanCount: camera.scanCount }`, so accepted decodes go to the scan hub as `{ source: { kind: 'camera' } }` and the app's `useBarcodeScanner` receives them like device scans. The panel shows v2's status copy, a permission card for native apps, a flash on each `scanCount` change, and a resize handle with increment and decrement actions and a web pointer drag, reporting the height through `onHeightChange`. On the web, `ScannerViewfinder` streams `getUserMedia` into a `<video>` and decodes with the `BarcodeDetector` global when present, or with an injected `decoder` of the same `detect` shape; native apps pass their own `viewfinder`. `@tallyui/pos` adds `useCameraScan` (returning `CameraScan`: `offer`, `reset`, `scanCount`), the pure `startDecodeLoop`, `nativeBarcodeDetector`, `cameraErrorStatus`, `detectorFormatToSymbology` and their constants, and `createScanSession` takes `continuous`, under which a refused repeat restarts its cooldown, so an item resting in view is scanned once.
- 44e9e5f: `Cart` takes `columns`, v2's Cart Settings › Columns (#695): each of Qty, Image, Item, SKU, Price and Total has a `show` switch, `quantity.split` adds a Split link under a quantity above 1, and `name.sku` puts the SKU under the name. The defaults keep today's cart (Qty, Item, Price folding as before, Total). `CartColumnHeads` and `CartLine` take the same `columns`, and `CartLine` takes `sku`, `imageUrl` and `onSplit`; `cartColumnIds` gives the visible columns. `OrderBuilder.splitLine` and `useSale().splitLine` turn a line of quantity N into N lines of 1, refusing a line with a fixed discount (`SPLIT_FIXED_DISCOUNT`). `cartColumnIds` and `CartColumnSettings` are exported from the `@tallyui/components` root.
- 44faba9: An empty `Cart` now shows v2's empty state: a centred cart icon over one line, and no column heads, totals, Cash and Card terminal row or Checkout foot. A sale error on an empty cart shows under the line. The default line changed from "Scan or tap a product to start a sale." to v2's "Tap a product to start a sale"; `emptyText` and `emptyIcon` (`null` for none) replace them. A cart with only a fee or shipping row keeps its heads and foot and shows no empty line. Adds `ShoppingCartIcon`.
- 259398e: In `lineEditor="popover"` mode the cart line is one row with Discount, Price and Remove in its popovers, and the price popover shows the regular price struck through; `LinePopover` takes `actions` and `regularValue`.
- d6d37ba: ChargeForm takes `kind` to open on one kind without the kind row, for apps that host WCPOS v2's cart "+" menu.
- f256a99: Add `Calendar` (single and range modes, `min`/`max`, a week start; a plain month grid with no new dependency) and the pure month helpers it uses, and `DateRangeMenu`, the Reports period menu with the date presets beside the calendar (WCPOS v2's date button). The Sales room's period control is now that menu, so a custom range can be picked; `SalesFiltersBar` takes an optional `earliestDay`. `SalesFilters.preset` widens from `DatePreset` to `DatePreset | 'custom'`, so code that reads it must handle `'custom'`. The separate `sales-filter-dates` text is gone: the menu's trigger shows the dates.
- 062e6a2: The second-device customer display's two screens (ADR-085 U5, #684). `CustomerDisplaySettings` is the till's Settings › Customer display: it takes `useTillPairing(pairing)` and `useTillDisplays(service)` and lists the paired displays with their state (Connected, Connecting…, Waiting for the display, Offline), forgets one after an `AlertDialog` confirm, mints a code with its expiry, and shows each "wants to pair" claim with its check code and Confirm and Decline (#705). Every pairing and forget refusal, and the offline and paused statuses, show a line. `CustomerDisplayPairing` is the display device's screen: it takes `useDisplayClient(client)`, enters the code and the display's name, shows the check code while the cashier confirms, then shows the sale through `CustomerDisplayScreen` with a small Offline notice when the store can't be reached. A forgotten display goes back to enter-code with its message.
- 61c02b9: Add `OrderFilterBar`, WCPOS v2's row of order filter pills (Status, Payment Method, Customer, Cashier, Store / Created via, Register, Date range) with Clear all. It is presentational: the app passes the value, the connector's `orderFilters` and every option list, and a pill shows only when its field is supported. pos adds `OrderFilterValue` and `orderFiltersQuery(value, timezone)`, which turns the bar's value into `ListOrdersQuery` filter fields, with the store-day range as UTC instants (`before` exclusive).
- e2be8d1: `RegisterPanel` takes `presentation="side"`, WCPOS v2's right-hand register sheet (#716): a header with the store, "open since", the session's age and the opener; the cash expected in large type "in the drawer"; Session sales with the sales count; the Paid in, Paid out and No sale tiles; the drawer ledger (Float, Cash sales, Cash refunds, Paid in, Paid out and No sale, each with its count, then Expected in the drawer); Other tenders; and a footer with Print X-report and Close register. Blind counting hides every figure. The new `storeName`, `onPrintXReport` and `now` props serve the side sheet; the default `presentation="dialog"` is unchanged. `DialogContent` takes `side="right"`. `deriveDrawerTerms` gives `deriveExpected`'s figures term by term with row counts and session sales, and `useRegisterSession` returns them as `terms`.
- 1c44032: `SelectTrigger` now draws a down chevron at its right by default, the v2 way (#717). An app that passes its own chevron as a child must either remove it or pass `chevron={false}`, or it will show two. `Avatar` takes `tone` (`'muted'`, the default and today's look, or `'primary'`, v2's light initials on a solid primary circle) (#718). `CustomerSelect` takes `showAvatar` (off by default) to draw an initials avatar before each row and the selected summary, and `avatarTone` (default `'primary'`) (#714). Adds `ChevronDownIcon` and `avatarInitials`.
- aea612a: `Switch` takes `size="sm"`, a 20 px track (`h-5 w-9`) with a 16 px thumb for dense settings rows (#758); the default size renders exactly as before.
- 23ee429: The sale shows how its tax was worked out. `@tallyui/pos` adds `taxDerivation(settings, location)`, a pure function that explains the sale's tax rates: the "tax based on" setting, the address it used (and any fallback, such as shipping to billing), and each tax class with its effective rate (compound rates included) and the rates that matched, with the reason for each match (postcode, city, state, country or anywhere). When nothing matches, it says why: the order has no address, or the store has no rate for this country or address. `SaleTaxLocation` types the sale's `taxLocation`.

  `@tallyui/components` adds `TaxBasedOn`, the "Tax based on" trigger and popover that shows that derivation in three steps (setting, address, rates), with optional "Change in Settings › Tax" and "View all tax rates" links. It also adds `TaxCalculationSettings`, the Settings › Tax "Calculation" group with a "Calculate tax based on" select and read-only rows for prices entered with tax, the shipping tax class and rounding at subtotal, which are set in WooCommerce.

- 4fef712: `Catalogue` takes `variationsStyle`, v2's Product settings › Variations (#719). The default `'list'` keeps the variant list chooser; `'popover'` opens a grid tile's popover for a product with option groups, where the cashier picks one value per group (values no variant allows are dimmed), sees the matched variant's stock, and presses "Add to Cart: {price}". A full match never adds on its own, and the popover closes after Add. A product without option groups, and the table view, keep the list chooser. Adds `VariationPicker` to `@tallyui/components`, and `variantFits`, `matchVariant`, `disabledOptions` and `OptionPicks` to `@tallyui/pos`.

### Patch Changes

- 9dda986: `CartNoteInput` now calls the sale note "Customer note", since WooCommerce sends it as `customer_note` and it prints on the customer's emails and receipts. The default link reads "Add customer note" (was "Add note") and the default placeholder is "Customer note" (was "Order note..."). A new `label` prop names the note for the link, the placeholder and the input's accessibility label. Apps passing their own `placeholder` keep it. Orders now labels the note "Customer note: …" (was "Note: …"), and the line under a note the store could not take reads "The customer note couldn't be sent to the store." on the receipt and in Orders.
- ceec37c: `DialogTitle` keeps its `leading-none` when a caller passes a text size such as `text-base`, and hands the merged class to `Text` children; a caller's own `leading-*` still wins.
- 9f8d06f: Lighter control borders and a card fill, matching WCPOS v2 (#756). In the light theme `--color-input` is now `#d1d5db` (was `#848a94`), so inputs, selects, toggles and outline buttons get a light grey border that still stands out more than `--color-border`; the dark theme's value is unchanged. The outline variant of `Button` and `IconButton`, and `SelectTrigger`, now fill with `bg-card` instead of `bg-background`, so they read as white controls on a white card in the light theme and as card-coloured controls in the dark theme. `Input`, `Textarea` and the `Combobox` trigger fill with `bg-card` too, so every bordered control matches.
- Updated dependencies [d6c93e9]
- Updated dependencies [44e9e5f]
- Updated dependencies [a3387fc]
- Updated dependencies [fab0922]
- Updated dependencies [1af7329]
- Updated dependencies [b05db01]
- Updated dependencies [6a4529b]
- Updated dependencies [9f8d06f]
- Updated dependencies [434c143]
- Updated dependencies [61c02b9]
- Updated dependencies [a15835f]
- Updated dependencies [94040f9]
- Updated dependencies [f819768]
- Updated dependencies [e2be8d1]
- Updated dependencies [edeadc3]
- Updated dependencies [8352f75]
- Updated dependencies [5afa4d2]
- Updated dependencies [d3495c4]
- Updated dependencies [5cd2720]
- Updated dependencies [1ce3343]
- Updated dependencies [fa69171]
- Updated dependencies [2e691f2]
- Updated dependencies [73caa25]
- Updated dependencies [3a6eb07]
- Updated dependencies [23ee429]
- Updated dependencies [41aa864]
- Updated dependencies [b3924e8]
- Updated dependencies [b0901ea]
- Updated dependencies [e857cf2]
- Updated dependencies [4fef712]
- Updated dependencies [375a8ce]
- Updated dependencies [152277c]
  - @tallyui/pos@3.19.0
  - @tallyui/core@3.19.0
  - @tallyui/theme@3.19.0
  - @tallyui/primitives@3.19.0

## 3.18.0

### Patch Changes

- Updated dependencies [6067d23]
- Updated dependencies [4e0fbb3]
- Updated dependencies [455c39f]
  - @tallyui/pos@3.18.0
  - @tallyui/core@3.18.0
  - @tallyui/primitives@3.18.0
  - @tallyui/theme@3.18.0

## 3.17.0

### Patch Changes

- Updated dependencies [4a867a9]
- Updated dependencies [4677f1f]
- Updated dependencies [1297f1c]
  - @tallyui/pos@3.17.0
  - @tallyui/core@3.17.0
  - @tallyui/primitives@3.17.0
  - @tallyui/theme@3.17.0

## 3.16.0

### Minor Changes

- 8d0baa4: Components can now be translated: `I18nProvider` takes the store's locale (or uses the device's) and the app's catalogues for other languages, falling back from `fr_CA` to `fr` to the bundled English, and `useT` reads a string by key. The tender pane is the first area to read its strings this way; without a provider it still shows English.

### Patch Changes

- Updated dependencies [325a540]
- Updated dependencies [89973e5]
  - @tallyui/pos@3.16.0
  - @tallyui/core@3.16.0
  - @tallyui/primitives@3.16.0
  - @tallyui/theme@3.16.0

## 3.15.0

### Minor Changes

- 233cf61: Adds `CartFoot`, WCPOS v2's cart foot: a "Checkout {total}" button beside a ⋮ menu of actions the app passes as `{ label, onPress, destructive? }` items. `Cart` gains an optional `checkout` prop that shows this foot in place of its Cash and Card terminal buttons; without it, Cart is unchanged.
- 77f3612: Cart can now open WCPOS v2's keypad from a line's quantity or price with `lineEditor="popover"`, and the price keypad carries the quick-discount keys. The keypad is a new shared `Keypad` component, also used by the tender pane, and `LinePopover` is exported for apps that build their own lines.

### Patch Changes

- Updated dependencies [c2319ab]
  - @tallyui/core@3.15.0
  - @tallyui/pos@3.15.0
  - @tallyui/primitives@3.15.0
  - @tallyui/theme@3.15.0

## 3.14.0

### Minor Changes

- d28e6ea: Adds the app shell from WCPOS v2: `AppShell` puts a `NavRail` beside the page on windows at least 768 wide and 480 tall, and a `NavDrawer` on phones, with `aria-current` on the active item and a focus-trapped drawer that closes on Escape or a backdrop press. `RegisterBar` gains optional `storeName`, `cashier`, `syncStatus` and `onOpenMenu` props, and shows the menu button on its own inside a phone shell.
- 01580b8: `Cart` gains an optional `orderActions` prop, `true` by default. Pass `false` when the app hosts the Order discount and Add charge controls in its own menu, as WCPOS v2's cart "+" menu does; applied order discounts, fees and shipping still show with their Remove controls.
- d544736: Add a customer display that runs in a second window on the same device: a BroadcastChannel transport, a till-side display link that answers the display's hello and returns it to idle after a payment, a `useCustomerDisplay` hook, and the `CustomerDisplayScreen` component.
- 90463af: Adds what an app needs to confirm a cashier switch, a register switch or a sign-out: `switchWarnings()` lists what the switch leaves behind (unsent sales and till updates, parked sales, a partly paid sale, an open register), and `handoverSlip()` builds the hand-over slip with a printable X-report envelope. In `@tallyui/components`, `SwitchConfirm` asks with WCPOS v2's wording and names each warning, and `HandoverSlip` shows the slip.
- 1a5af04: The cart line's Price form can show WCPOS v2's quick-discount keys (`quickDiscounts` on `PriceForm` and `Cart`): a key takes its percentage off the line's current price and Apply writes it. The pos app settings gain `cart.quickDiscounts`, defaulting to v2's `[5, 10, 15]` and keeping only percentages above 0 and up to 100.
- 30cfc94: `RegisterCount`'s `approve` now receives the count and may return the store's `approval` and the `approvedVariance`, which go to `closeSession`, so a store-verified manager approval works through the shared component; a count edited during approval asks again, and zero-argument `approve` callers keep working. `RegisterPanel` shows an "Approval needed" card for a closure the store refused, and its new `reapprove` prop sends a new approval through `reapproveClosure`.
- f68c1d9: `Tender` is redrawn as WCPOS v2's tender pane, with a balance headline that counts captured payments only, each payment leg with its status and Cancel payment where the method can void it, a keypad, and quick-cash chips for the exact amount and the next 5, 10 and 50; `TenderPane` is the same pane for a host that owns the tender reducer. `SplitTender` is now the same component as `Tender`, and `CashTendered`'s default quick amounts round up to 5, 10 and 50.
- cdac1c6: The cart now has WCPOS v2's column heads (Qty, Item, Price, Total) through the new `CartColumnHeads`, and hides the Price column on a narrow cart or a phone. `CartLine` shows a variation's attributes under its name and, with the new `regularUnitPrice` prop, the regular price struck through when the line costs less.
- d96bfc2: Add WCPOS v2's catalogue tile details: `InCartBadge` shows how many of a product the cart holds (summed by the new `cartQuantities` from `@tallyui/pos`), `CategoryTile` shows a category's photo full-bleed with an initial fallback, and `ProductFilterBar` brings v2's filter chips with In Stock on by default. `Catalogue` takes `cartLines` and `showFilterBar` to use them.

### Patch Changes

- 0648b18: The register, parked-sales and refund screens now show a thrown error by its message alone, so a cashier reads "Finish or cancel the sale in progress first." rather than "RegisterTenderInProgressError: Finish or cancel…". An error with no message shows "Something went wrong".
- Updated dependencies [c2319ab]
- Updated dependencies [d544736]
- Updated dependencies [5f535c8]
- Updated dependencies [90463af]
- Updated dependencies [1a5af04]
- Updated dependencies [5a33bd9]
- Updated dependencies [dddbf6a]
- Updated dependencies [d96bfc2]
  - @tallyui/core@3.14.0
  - @tallyui/pos@3.14.0
  - @tallyui/primitives@3.14.0
  - @tallyui/theme@3.14.0

## 3.13.0

### Minor Changes

- 2b4e31d: Adds `RefundForm` and `RefundModal`. The cashier picks quantities up to what is still refundable, with restock, shipping, a signed adjustment, a destination and a required reason, and the form hands back the `order.refund` payload parts, priced by `priceRefund`, for the caller to send.
- 31a244c: App settings gain a device-local `ui.theme` (`system`, `light` or `dark`, default `system`). The new `DisplaySettings` component lets the user choose the theme, the UI scale and the font set, and saves each choice through `useAppSettings`.
- 9beba13: Adds open sales as cart tabs: `useSale` gains `switchSale` (it parks the current sale and opens a parked one, or a new one) and `closeSale`, and `openSales` lists the open sales for `OpenSaleTabs`, which shows each sale's customer or contents, its total and a Partly paid chip. A partly paid sale cannot be switched away from or closed until it is paid or its paid legs are voided.
- 5cb82ce: `useRegisterSession` now returns `liveAtStore`, `approvalNeeded` and `closureApprovalStatus`, and `actions.reapproveClosure` sends a closure the store refused for its approval again with a new proof; at register contract 3 a close over the threshold on a session live at the store needs the store's proof, not `approvedBy` alone. The closure sheet shows "Approval not yet verified by the store" beside the approver until the store applies the closure with its proof.
- f52d025: Adds the Reports Sales room (`SalesRoom`, with its hero chart, figure cards and filters bar) to components, and the store-time date presets it uses (`presetRange`, `DATE_PRESETS`) to pos.
- e4299f5: A reopened refused sale now keeps only the cashier's own note, so the "Refused by the store" text never goes out with `order.create` 7; a sale parked by 3.12.0 that still carries that first line has it dropped when the command is built. New `noteDelivery(order)` tells whether a stored sale's note was sent, and `Receipt` and `OrdersList` show the note and say when it couldn't be sent to the store.
- ff03391: Add font choices for the `ui.font` setting: the font-family tokens, face list and type sets (system, instrument, grotesk, fraunces, manrope) in `@tallyui/theme`, and a `FontProvider` in `@tallyui/components` that loads the chosen set through an app-supplied loader so `Text` draws its body or numbers face. No font files ship in the packages; each app bundles the OFL files and passes `loadFonts`.
- 6296a06: Add the UI scale: nine size tokens for each of the compact, regular and spacious steps with Auto picking by window size, pointer floors for controls and rows, an opt-in `@tallyui/theme/scale.css`, and a `ScaleProvider` that applies the stored `ui.scale` setting on native and mirrors it onto the web document root so portals scale too. `Text` now caps the OS text multiplier at `MAX_FONT_SCALE` (1.3) unless a caller overrides it.

### Patch Changes

- Updated dependencies [41fa7bf]
- Updated dependencies [73387ab]
- Updated dependencies [0bf0072]
- Updated dependencies [135eda4]
- Updated dependencies [31a244c]
- Updated dependencies [9beba13]
- Updated dependencies [dfda46e]
- Updated dependencies [e2d3a2b]
- Updated dependencies [13f8a3b]
- Updated dependencies [7e12633]
- Updated dependencies [c9ca7a2]
- Updated dependencies [3b32e4c]
- Updated dependencies [6995e84]
- Updated dependencies [d4ae385]
- Updated dependencies [9e0a750]
- Updated dependencies [53c6dc8]
- Updated dependencies [5fedc5d]
- Updated dependencies [d0dc455]
- Updated dependencies [9b6d07c]
- Updated dependencies [c31eef8]
- Updated dependencies [5cb82ce]
- Updated dependencies [d1c587e]
- Updated dependencies [9f04b1b]
- Updated dependencies [4a9f14c]
- Updated dependencies [f52d025]
- Updated dependencies [e4299f5]
- Updated dependencies [80c7a6b]
- Updated dependencies [09d7140]
- Updated dependencies [ff03391]
- Updated dependencies [6296a06]
  - @tallyui/pos@3.13.0
  - @tallyui/core@3.13.0
  - @tallyui/theme@3.13.0
  - @tallyui/primitives@3.13.0

## 3.12.0

### Minor Changes

- 6a6e925: `Catalogue` takes `pickAnyOptions`. When it is set, choosing a variant with local "Any" option groups first asks for a value for each group, then passes them to `onSelect` as the entry's `picks` (#495).
- 2076f68: `Cart` takes `couponDiscountMinor`, the coupon amount the app itemises under the Subtotal (`afterSubtotal`). When it is set, the totals' Discount row shows the other discounts only and is hidden when they come to 0, so a coupon is no longer counted twice. Without it, the Discount row is unchanged.
- e32dda1: Order history and reprint (G7, ADR-081). `TallyConnector` gains optional `listOrders` and `getOrders`, which read the store's orders online as `StoreOrder`s, with the store's line ids and prior refunds; a connector without them is unchanged. The WooCommerce connector implements both over WCPOS `wcpos/v2/orders`. `@tallyui/pos` adds `buildReceiptDataFromPosOrder` and `buildReceiptDataFromStoreOrder`, which build a receipt marked as a reprint (`fiscal.is_reprint`, `reprint_count`) from a stored order, and `Receipt` takes a prebuilt `receipt` and a `doneLabel`.
- f52dfcd: `OrdersList` takes `onOpen`. When it is set, each order row, from the till or the store's history, gets an Open button that passes that row to `onOpen`, so an app can open the order and reprint its receipt. A till row's press still expands its lines, and without `onOpen` the list is unchanged.

### Patch Changes

- 5df00c0: An invalid Any pick is reported as a cart error instead of being thrown. The Any picker closes when its product leaves the catalogue (#495).
- Updated dependencies [b1397a3]
- Updated dependencies [5df00c0]
- Updated dependencies [b1397a3]
- Updated dependencies [e32dda1]
  - @tallyui/core@3.12.0
  - @tallyui/pos@3.12.0
  - @tallyui/primitives@3.12.0
  - @tallyui/theme@3.12.0

## 3.11.0

### Minor Changes

- a6b1a7a: `CartTotal` and `Cart` take `afterSubtotal`, rows rendered directly under Subtotal (e.g. a platform's coupon chips).
- fc6e0d8: `CartLine` takes `attributes` and shows a "Name: Value" row for each. `Cart` and `Receipt` pass a line's attributes through (#495).

### Patch Changes

- Updated dependencies [916055f]
- Updated dependencies [6e058ac]
- Updated dependencies [1cebe19]
- Updated dependencies [9f84f24]
- Updated dependencies [fc6e0d8]
  - @tallyui/core@3.11.0
  - @tallyui/pos@3.11.0
  - @tallyui/primitives@3.11.0
  - @tallyui/theme@3.11.0

## 3.10.0

> **Storage, one way: `pos_orders` moves from schema version 8 to 9.** Every stored order is kept byte for byte, but a till that goes back to a build on version 8 shows no orders and sends none of its pending ones until it is upgraded again. Nothing is deleted.

### Patch Changes

- 3fd1ed4: Needs attention offers no Retry for a `coupon_invalid` or `total_mismatch` refusal, which the outbox does not resend (#501, ADR-077 Q-d4b-4).
- 811b1f2: `CustomerPicker`'s search field now has the testID `customer-picker-search`. A new optional `testID` prop overrides it. The accessibility label "Search customers" is unchanged.
- Updated dependencies [f50fca2]
- Updated dependencies [8c35723]
- Updated dependencies [74a58a4]
- Updated dependencies [c2efd7d]
- Updated dependencies [38d3032]
- Updated dependencies [3fd1ed4]
- Updated dependencies [f50fca2]
- Updated dependencies [10a3813]
  - @tallyui/core@3.10.0
  - @tallyui/pos@3.10.0
  - @tallyui/primitives@3.10.0
  - @tallyui/theme@3.10.0

## 3.9.2

### Patch Changes

- Updated dependencies [fc37285]
  - @tallyui/core@3.9.2
  - @tallyui/pos@3.9.2
  - @tallyui/primitives@3.9.2
  - @tallyui/theme@3.9.2

## 3.9.1

### Patch Changes

- d0df307: `OrdersList` shows the store's order history next to the till's own sales (ADR-052 amendment 1). It takes an optional `history` of platform-neutral rows (`OrderHistoryRow`: `id`, `clientOrderId?`, `reference`, `placedAt`, `totalMinor`, `currency`, `itemCount`, `stateLabel`), which the app maps from its own store.

  - A history row whose `clientOrderId` matches an outbox order is hidden while that order is in `orders`.
  - Recent merges the two lists, newest first.
  - A history row is read-only: it has no detail, no Retry, and never appears under Needs attention.

  Without `history`, `OrdersList` renders exactly as before.

  - @tallyui/core@3.9.1
  - @tallyui/pos@3.9.1
  - @tallyui/primitives@3.9.1
  - @tallyui/theme@3.9.1

## 3.9.0

### Patch Changes

- c1bf800: Every exports entry gains a `default` condition so CommonJS and `require`-condition resolvers (Node `require`, webpack, Snack's bundler) resolve the packages; `smoke:pack` checks `require.resolve` for every entry.
- Updated dependencies [39a4583]
- Updated dependencies [c1bf800]
- Updated dependencies [3e2245a]
- Updated dependencies [a3dc028]
- Updated dependencies [2a79339]
- Updated dependencies [a51d0bb]
- Updated dependencies [006cfb2]
- Updated dependencies [19093c2]
  - @tallyui/core@3.9.0
  - @tallyui/pos@3.9.0
  - @tallyui/primitives@3.9.0
  - @tallyui/theme@3.9.0

## 3.8.0

### Patch Changes

- Updated dependencies [c69c6e2]
- Updated dependencies [6158b2a]
  - @tallyui/pos@3.8.0
  - @tallyui/core@3.8.0
  - @tallyui/primitives@3.8.0
  - @tallyui/theme@3.8.0

## 3.7.1

### Patch Changes

- 9b084a1: The Slider now moves. Pressing or dragging on it sets the value from the pointer, snapped to `step` and clamped to `min`..`max`. With the thumb focused, Arrow keys move one step, Page Up/Down move ten steps, and Home/End go to `min`/`max`. The Range's width and the Thumb's position follow the value: the primitive gives `Range` a default `width` and `Thumb` a default `position: absolute; left`, and a caller's own style still wins. The slider context gains `percent`. `disabled` ignores the pointer and the keys, and the styled `Slider` dims when disabled. (#491)
- Updated dependencies [9b084a1]
  - @tallyui/primitives@3.7.1
  - @tallyui/core@3.7.1
  - @tallyui/pos@3.7.1
  - @tallyui/theme@3.7.1

## 3.7.0

### Patch Changes

- Updated dependencies [f18cc1e]
- Updated dependencies [0a90e64]
  - @tallyui/pos@3.7.0
  - @tallyui/core@3.7.0
  - @tallyui/primitives@3.7.0
  - @tallyui/theme@3.7.0

## 3.6.0

### Minor Changes

- 6c94486: Add an optional Receipt footerSlot for app content that prints after Change and above the on-screen buttons.
- 3033b49: `buildReceiptData` returns the WCPOS receipt schema 1.4 version (`RECEIPT_SCHEMA_VERSION`) and its `software`, `register` and `fiscal` blocks with 1.4 defaults; `ReceiptConfig` takes `registerName`, `software` and `fiscal`. `Receipt` takes `registerName` and prints `Register: <name>` when given (#474).

### Patch Changes

- d9a6080: An order the store applied with `register_session_unknown` is neither listed under Needs attention nor given a warning line, because the store counts it once its session arrives.
- Updated dependencies [3033b49]
- Updated dependencies [843a08c]
- Updated dependencies [d9a6080]
- Updated dependencies [2894a59]
- Updated dependencies [2faa6c1]
  - @tallyui/pos@3.6.0
  - @tallyui/core@3.6.0
  - @tallyui/primitives@3.6.0
  - @tallyui/theme@3.6.0

## 3.5.3

### Patch Changes

- @tallyui/pos@3.5.3
- @tallyui/core@3.5.3
- @tallyui/primitives@3.5.3
- @tallyui/theme@3.5.3

## 3.5.2

### Patch Changes

- 1bb2aae: The Receipt prints fee and shipping rows after Subtotal and the discount rows, before tax and Total (they printed above Subtotal). Apps whose receipts carry fees or shipping print them in this new place; receipts without charges are unchanged.
- 653b4ed: The Orders list shows an `insufficient_stock` warning as "{quantity} sold without stock: {name}" (was "Stock short by {quantity} for {name}"). From medusapos plugin 0.2.0, `quantity` is the units of this sale that stock did not cover.
  - @tallyui/core@3.5.2
  - @tallyui/pos@3.5.2
  - @tallyui/primitives@3.5.2
  - @tallyui/theme@3.5.2

## 3.5.1

### Patch Changes

- @tallyui/pos@3.5.1
- @tallyui/core@3.5.1
- @tallyui/primitives@3.5.1
- @tallyui/theme@3.5.1

## 3.5.0

### Minor Changes

- f93720a: `Catalogue` gains an opt-in category nav (`showCategoryNav`, optional `categories`). "All products" comes first, then the categories of the listed products. The choice is kept in the view state as `categoryId` (new in `CatalogueViewState`, with the `setCategory` action). Visual change: `CategoryNav` chips are now rectangular (`rounded-md`) instead of pill-shaped (`rounded-full`), in every app that renders it.
  `CategoryNav` chips are also exposed as radios (`role="radio"`, `aria-checked`) in a radiogroup labelled "Categories".
- 4579599: `Catalogue` can switch between grid and table (`showViewToggle`), take a grid column count, and keep a view state the app controls or persists (`viewState`, `defaultViewState`, `loadViewState`, `saveViewState`, `onStateChange`, `items`, `onQueryChange`); new `ViewToggle` primitive and pure `catalogueViewReducer` / `normalizeCatalogueViewState` / `resolveGridColumns`. Without the new props the Catalogue is unchanged.
- 6b2277c: Add `ProductTable` (a virtualised product table with default trait columns and header sort) and the pure `sortProducts` / `productSortValue` helpers.

### Patch Changes

- Updated dependencies [f93720a]
- Updated dependencies [4579599]
- Updated dependencies [a5b432e]
- Updated dependencies [6b2277c]
  - @tallyui/pos@3.5.0
  - @tallyui/core@3.5.0
  - @tallyui/primitives@3.5.0
  - @tallyui/theme@3.5.0

## 3.4.0

### Minor Changes

- 4ddcc43: The Cart adds, shows and removes fees, shipping and custom lines when the store accepts order.create 5 (`ChargeForm`, gated on the store's `lineTax` for tax status and class), and the receipt prints fees and shipping.

### Patch Changes

- Updated dependencies [c3acce9]
  - @tallyui/pos@3.4.0
  - @tallyui/core@3.4.0
  - @tallyui/primitives@3.4.0
  - @tallyui/theme@3.4.0

## 3.3.0

### Patch Changes

- Updated dependencies [db9d97a]
- Updated dependencies [820b8c2]
- Updated dependencies [fcace3b]
- Updated dependencies [f604f87]
- Updated dependencies [cec1088]
- Updated dependencies [9f7cffe]
- Updated dependencies [c7aa412]
- Updated dependencies [611ce1c]
- Updated dependencies [585af9b]
- Updated dependencies [71be352]
  - @tallyui/pos@3.3.0
  - @tallyui/core@3.3.0
  - @tallyui/primitives@3.3.0
  - @tallyui/theme@3.3.0

## 3.2.1

### Patch Changes

- 50ae7de: New `SplitTender` view: take several payments for one sale (cash and card), with remaining due and change, over `useSale().addTender`/`removeTender`; `Tender` is unchanged.
- Updated dependencies [a187b61]
  - @tallyui/pos@3.2.1
  - @tallyui/core@3.2.1
  - @tallyui/primitives@3.2.1
  - @tallyui/theme@3.2.1

## 3.2.0

### Minor Changes

- 2a3a3f0: `useSale` takes an optional `currentPrice(variantId)` and `resume()` then re-prices a parked sale's lines to today's prices (with a non-blocking 'Prices changed' message; `resume(id, { keepParkedPrices: true })` keeps them); `ParkedSales` takes optional `onPark`/`onResume`, so an app can drive it from its own parked store.

### Patch Changes

- d870060: Price and fixed-discount entry accept up to the currency's own decimal places, so 3-decimal currencies (KWD, BHD, OMR) can be entered to the minor unit; percentages stay at 2.
- Updated dependencies [2a3a3f0]
  - @tallyui/pos@3.2.0
  - @tallyui/core@3.2.0
  - @tallyui/primitives@3.2.0
  - @tallyui/theme@3.2.0

## 3.1.1

### Patch Changes

- Updated dependencies [63a7431]
  - @tallyui/core@3.1.1
  - @tallyui/pos@3.1.1
  - @tallyui/primitives@3.1.1
  - @tallyui/theme@3.1.1

## 3.1.0

### Patch Changes

- 7986abe: Cart can show a Price action on each line (`canEditPrice`) over `useSale().setUnitPrice`, with an optional reason passed to `onPriceChange`; new `PriceForm` and `parsePrice`.
- 4a93ef6: `CustomerSelect` renders its search input (it took `onSearch` and `placeholder` but showed no input), so apps no longer compose their own.
- ae38ef8: New `ParkedSales` sheet (components) and `useParkedSales(drafts)` hook (pos): park the current cart, and resume or discard (with confirmation) parked carts, newest first.
- Updated dependencies [ae38ef8]
- Updated dependencies [8471546]
- Updated dependencies [56b24d2]
- Updated dependencies [423bf42]
  - @tallyui/pos@3.1.0
  - @tallyui/core@3.1.0
  - @tallyui/primitives@3.1.0
  - @tallyui/theme@3.1.0

## 3.0.4

### Patch Changes

- 4946325: Catalogue takes an optional `pullError`; while it is set, a catalogue that has never synced shows 'No products yet.' instead of 'Loading products…' (a failed first pull no longer reads as loading).
- 5a2e037: RegisterPanel lists only cash under 'Expected in the drawer' and other tenders under 'Other tenders'; the `external` tender reads 'Card' in the panel, the count and the closure sheet.
  - @tallyui/pos@3.0.4
  - @tallyui/core@3.0.4
  - @tallyui/primitives@3.0.4
  - @tallyui/theme@3.0.4

## 3.0.3

### Patch Changes

- 2215eae: `orderReference` is exported from the package root, so an app's own receipt can print the same order reference as `OrdersList` and `Receipt`.
- 1d8cbc0: catalogueEntries accepts a trait context and no longer requires getVariants (a product without it sells as one variant from its own traits); Catalogue passes its currency; connector-woocommerce adds getVariants for non-variable products (variable products need their variations synced, a later release).
- Updated dependencies [e7b980a]
- Updated dependencies [c05e216]
- Updated dependencies [1d8cbc0]
  - @tallyui/pos@3.0.3
  - @tallyui/core@3.0.3
  - @tallyui/primitives@3.0.3
  - @tallyui/theme@3.0.3

## 3.0.2

### Patch Changes

- ccdaaf8: The empty cart's line is padded like the cart rows instead of sitting against the panel edge.
- 16b5627: Catalogue shows 'Loading products…' on an empty grid until the first sync completes (new optional `loading` prop, defaulting to `lastSyncedAt === null`).
- f6c511d: The receipt prints the finalized order's reference (its id's last 8 characters, plus the store's #number once synced) and time when given `posOrder`, and Orders shows the same reference, so a receipt matches its row. A receipt rendered without `posOrder` is marked '(draft)'. Apps pass useSale's receipt-stage `posOrder` to `<Receipt>`.
- a862823: OrdersList rows expand on tap to show the sale's items and payments, and an empty list says 'No sales yet. Completed sales appear here.'
- 7a0db5e: The receipt shows each discount once: the order discount appears only in the totals, and line discounts are summed once as 'Line discounts' instead of a combined 'Discount' row.
  - @tallyui/core@3.0.2
  - @tallyui/pos@3.0.2
  - @tallyui/primitives@3.0.2
  - @tallyui/theme@3.0.2

## 3.0.1

### Patch Changes

- 2416b21: A Dialog now closes on an overlay press and, on web, on Escape (the topmost dialog only; `closeOnPress={false}` or `onEscapeKeyDown` + `preventDefault()` keep it open), and RegisterPanel has a close button, so the register panel can be dismissed on web.
- Updated dependencies [2416b21]
  - @tallyui/primitives@3.0.1
  - @tallyui/pos@3.0.1
  - @tallyui/core@3.0.1
  - @tallyui/theme@3.0.1

## 3.0.0

### Minor Changes

- 04905ef: `Catalogue` now applies the provider's reconciled stock overlay itself (tiles, search and the variant chooser agree), and `useStockOverlaid` and `useStockOverlayAsOf` are new.
- 78d324e: Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- 130d28e: A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
  Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.
- 9e1032f: One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line. An offline failure pauses every clock, and the store's next answer of any kind resumes them all; a flagged order stays flagged through an offline spell, since a paused clock keeps its answered time. The HTTP transport now reports a request that got no answer in time as `timeout`, which counts like a 503 and never pauses a clock, and keeps `network` for a store it could not reach.
- a9cdfc0: Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.
- c92e96e: ProductGrid renders a virtualized FlatList, with its props unchanged.
- ce4f796: Replication pull errors are handled according to who can fix them, instead of every error being retried every 5 s forever. A till repeating a rejected token is the traffic a store's security plugin blocks.

  - `@tallyui/core`:
    - An error class declares `fixedBy: 'till' | 'store'` with a string `code`; `errorKind(error)` returns `'till'`, `'store'` or `'transient'`.
    - `SyncNotice` (`{ code, since, fixedBy, software?, minVersion?, fix? }`) describes a stopped pull.
    - `ConnectorUnauthorizedError` is fixed by the till.
  - `@tallyui/database` `startReplication` handles the three kinds and returns RxDB's state plus `notice$` and `resume()`:
    - **till:** one request, one notice, then the pull stays stopped until the app calls `resume()`, after sign-in. The pull stays stopped even when RxDB restarts the loop on page visibility.
    - **store:** one notice, then one attempt every 5 minutes (or the error's `retryAfterMs`, up to 1 hour). The notice clears itself on the first success, so a till recovers within 5 minutes of the owner's fix.
    - **transient:** a doubling delay from `retryTime` to 5 minutes. It waits at least a valid `retryAfterMs` (a finite number of zero or more), capped at 1 hour.
  - `@tallyui/components`: `SyncStatus` takes an optional `pullNotice` and tells the cashier in plain words that they can keep selling and who needs to act. It never shows a code, a backend name or a version the notice doesn't carry.
  - `@tallyui/connector-woocommerce`:
    - `WooDateFilterError` is fixed by the store, and carries `software` and `minVersion`.
    - `WooMissingUuidError` gains `code: 'missing_plugin'` and is fixed by the store.
  - `@tallyui/connector-vendure`: a new `VendureTimezoneConfigError` (`store_misconfigured`, with a plain `fix`) replaces the plain error when the `updatedAt` probe shows a server that isn't in UTC.

- a94b255: `OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the stuck and backend-missing sentences and the sending or retrying line. What else waits stays in the count: "1 sale needs attention, 5 waiting to sync · …" with other sales pending, "…, 2 till updates waiting to sync · …" with till updates, and "…, 5 sales and 2 till updates waiting to sync · …" with both. Below it, "Refused sales stay on this till under Needs attention, each with what to do next.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes. When the store refused a whole batch (`refused` set, no sale carrying a code), the status line is the waiting count followed by " · The online store refused the last send. This till will try again with the next sale, or when the app is reopened." in place of the stuck or backend-missing sentence, and the sending or retrying line (which read "Retrying in 0 s.") is hidden; refused sales still outrank it. With only till updates waiting and the register outbox refused, it ends "…try again with the next till update." instead; with a sale waiting, the sales line wins.
- df80ead: `SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.
- 8cf3ea4: A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

### Patch Changes

- ba63f04: `CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.
- 24b74fd: `CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.
- d6a5073: **The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):

  - line names, discount labels and payment references are cut to 255 characters, but ids never are;
  - a customer email or id that `order.create` would refuse is left out;
  - the frozen form is written back, so the receipt and the store see the same bytes.

  So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

  **New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.

- 27d736e: `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.
- fd882bc: The stuck line says "no answer from the store" for a timeout.
- eb203b4: Review follow-ups with no behaviour change (#356, #358):
  - `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
  - `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.
- af623c9: The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.
- ef2f64e: The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.
- d225c58: Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.
- 6bbd1ba: Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy (a `custom` sale counts as the default it applied); `ClosureSheet` then says so, and `buildClosureDocument` carries the same line ready to print as `closure.tax_rounding_note` (`TAX_ROUNDING_MIXED_NOTE`), for the apps' closure templates. `PosOrder.taxRounding` is now required in the type.

  `pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.

- 5c90aed: `parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.
- c00e1ea: `OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).
- 6673faf: RxDB 17.5.0.

  - **`@tallyui/storage-sqlite`:**
    - Its `rxdb-premium` peer is now `17.5.0`. Apps install `rxdb-premium@17.5.0` together with `rxdb@17.5.0`.
    - Its storages set RxDB 17's premium flag at import and when called, so the 13-collection cap never applies.
  - **`@tallyui/pos`:**
    - Its `rxdb` peer is now `~17.5.0`.
    - Opening `pos_orders` rejects with `PosOrderOpenClosedError` when the database closes during a migration: RxDB 17.5.0 cancels the migration on close. The open first waits for any write already in flight, so none reaches a closed store.
    - An open that needs no migration resolves only once RxDB allows writes, so a sale saved straight after it is never refused with COL25.
  - **`@tallyui/database`:**
    - `createTallyDatabase` returns an RxDB 17 database.
    - In development it adds RxDB's dev-mode plugin when a database is created, not at import.
  - **Stored data:** a till's SQLite data written by RxDB 16.21.1 opens unchanged under 17.5.0, and migrates its schema versions.

  **Upgrade notes**

  - **Storage is one-way.** Once a till has opened this version, `pos_orders` is at schema version 4, and an older build
    (such as `@tallyui/pos` 2.0.0 on RxDB 16.21.1) opens it without an error but shows no orders, so it sends none of the
    pending ones until the till is upgraded again. Nothing is deleted: the next upgrade recovers every order, including a
    sale rung during the rollback. Never roll an app back across this version, and never re-ring sales it hides: a
    re-rung sale is a second sale, and the upgrade sends both. See ADR-069 in `docs/DECISIONS.md`.
  - Web apps ship the 17.5.0 storage worker with the 17.5.0 main thread. A cached 16.x worker with a 17.5.0 main
    thread is untested and unsupported.
  - Apps pin `rxdb` and `rxdb-premium` to exactly `17.5.0`.
  - RxDB 17 defaults a replication's `toggleOnDocumentVisible` to true (16.21.1: false). It then resyncs when the tab
    becomes visible, and no longer simulates activity to keep a hidden tab awake, so a browser may throttle a hidden
    tab's pull. RxDB pauses a hidden tab's replication only when that tab isn't the leader; a single-instance database
    is always the leader (read in 17.5.0's `plugins/replication` source, not tested).

- 0e4c9cc: The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".
- d6079b4: `SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), and with only till updates waiting shows the register outbox's sending and retrying text and countdown. It shows no raw reason code: a stuck order now shows the "Sales haven't reached the online store since {time}." sentence (for till updates alone, "Till updates haven't …"), store missing or not. Sending and retrying are a short line of their own below the status line: "Sending…" or "Retrying in {n} s.". The status line and each pull-notice line are polite live regions (`aria-live="polite"` on web, `accessibilityLiveRegion` on Android) and on iOS are announced when their text changes, both in one announcement when they change together. What is announced is only the substance (counts, the sentence, the notice): the sending or retrying line is outside any live region, so it is never announced. `OrdersList` shows no reason code either: a stuck order reads "Hasn't reached the online store since {time}." with the hour numeric, and a rejected order shows the store's message alone (nothing when it has none), never its error code.
- e51f1b7: Times shown to a cashier no longer force a leading zero on the hour (#252): `ProductStockBadge`'s "as of" time and the catalogue's time label now read "2:49 AM", not "02:49 AM", on a 12-hour clock, like `SyncStatus` and the orders list.
- 3cf5452: Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

- 6278d8d: The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.
- cbf26fd: The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

  If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."

- Updated dependencies [4de75c2]
- Updated dependencies [894b6ae]
- Updated dependencies [04905ef]
- Updated dependencies [faa7cda]
- Updated dependencies [9f34416]
- Updated dependencies [fb57e1d]
- Updated dependencies [898e98b]
- Updated dependencies [75c5dce]
- Updated dependencies [ba63f04]
- Updated dependencies [0d04d13]
- Updated dependencies [78d324e]
- Updated dependencies [7fee0c1]
- Updated dependencies [24b74fd]
- Updated dependencies [d6a5073]
- Updated dependencies [eb5a032]
- Updated dependencies [54ee98a]
- Updated dependencies [27d736e]
- Updated dependencies [e59ebec]
- Updated dependencies [2ecaa36]
- Updated dependencies [901fa66]
- Updated dependencies [bf2d805]
- Updated dependencies [130d28e]
- Updated dependencies [9e1032f]
- Updated dependencies [eb203b4]
- Updated dependencies [8cd7860]
- Updated dependencies [ca0beac]
- Updated dependencies [af623c9]
- Updated dependencies [ef2f64e]
- Updated dependencies [d225c58]
- Updated dependencies [d329193]
- Updated dependencies [a9cdfc0]
- Updated dependencies [9ffa7c0]
- Updated dependencies [6bbd1ba]
- Updated dependencies [5c90aed]
- Updated dependencies [668f71f]
- Updated dependencies [457162d]
- Updated dependencies [c00e1ea]
- Updated dependencies [222543b]
- Updated dependencies [8141c1c]
- Updated dependencies [c9798a3]
- Updated dependencies [581472f]
- Updated dependencies [8ae3c53]
- Updated dependencies [ce4f796]
- Updated dependencies [6673faf]
- Updated dependencies [9885075]
- Updated dependencies [c48e1dd]
- Updated dependencies [c26ead6]
- Updated dependencies [1f4d0ab]
- Updated dependencies [0e4c9cc]
- Updated dependencies [a94b255]
- Updated dependencies [df80ead]
- Updated dependencies [5ed6281]
- Updated dependencies [5a204a9]
- Updated dependencies [7d1bc98]
- Updated dependencies [3cf5452]
- Updated dependencies [8cf3ea4]
- Updated dependencies [6278d8d]
- Updated dependencies [37aad35]
- Updated dependencies [4122dc8]
- Updated dependencies [e15f389]
- Updated dependencies [ddd9e85]
  - @tallyui/core@3.0.0
  - @tallyui/pos@3.0.0
  - @tallyui/primitives@3.0.0
  - @tallyui/theme@3.0.0

## 3.0.0-next.2

### Patch Changes

- [#359](https://github.com/TallyUI/tallyui/pull/359) [`eb203b4`](https://github.com/TallyUI/tallyui/commit/eb203b4489c58111f10011e825edeff671627ec3) Thanks [@kilbot](https://github.com/kilbot)! - Review follow-ups with no behaviour change (#356, #358):

  - `SyncStatus` and `OrdersList` build their "since {time}" and "since about {time}" text with one shared helper.
  - `useRegisterOutbox`'s docs now say when `transport()` is called, and that the latest `isEnabled` and `onResult` are used without restarting the outbox.

- [#355](https://github.com/TallyUI/tallyui/pull/355) [`0e4c9cc`](https://github.com/TallyUI/tallyui/commit/0e4c9cc3f9cd329666bf3b565dd24614bafbb590) Thanks [@kilbot](https://github.com/kilbot)! - The "since" a cashier reads is a real time (#253). `OutboxState.stuck` (both outboxes) gains `firstFailedAt`: the wall-clock time the first failure of the current stuck run was answered, so an offline gap no longer moves it. `since` keeps its meaning, the clock's virtual start, and still drives the 15-minute threshold. `firstFailedAt` is kept in memory only. After a restart it is absent, and `SyncStatus` and `OrdersList` show the stored time instead, worded "since about 2:49 AM".

- [#353](https://github.com/TallyUI/tallyui/pull/353) [`e51f1b7`](https://github.com/TallyUI/tallyui/commit/e51f1b70f0631e8f3b3d061ebb5e3aadc759fc77) Thanks [@kilbot](https://github.com/kilbot)! - Times shown to a cashier no longer force a leading zero on the hour (#252): `ProductStockBadge`'s "as of" time and the catalogue's time label now read "2:49 AM", not "02:49 AM", on a 12-hour clock, like `SyncStatus` and the orders list.

- [#349](https://github.com/TallyUI/tallyui/pull/349) [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5) Thanks [@kilbot](https://github.com/kilbot)! - Follow-ups to the 401/403 split (#345):

  - **Vendure:** a signed-in user missing a permission (confirmed by the session probe) is now `ConnectorUnauthorizedError` with `status: 403`, the `forbidden` notice, instead of a plain transient error.
  - **WooCommerce:** a 403 from the JWT-auth plugin (`jwt_auth_*`) reaches the till only with a valid token on WCPOS 1.10.0–1.10.7 (wcpos/woocommerce-pos#1863). It is now `WooPluginUpdateRequiredError` (`unsupported_store`, WCPOS 1.10.8): the store owner updates WCPOS, and the till is never sent into a sign-in loop.
  - **`ConnectorUnauthorizedError`:** only a 403 is `forbidden`. A caller that omits `status` gets `unauthorized`, as before 3.0.
  - **Docs:** the customer picker's `onError`, the replication guide's error classes, and the connector comments now say that only a 401 means sign in again.

- [#357](https://github.com/TallyUI/tallyui/pull/357) [`6278d8d`](https://github.com/TallyUI/tallyui/commit/6278d8d44f36d4c7f8601f1222807e510662a576) Thanks [@kilbot](https://github.com/kilbot)! - The register outbox can start when its store opens, as the order outbox does (#290). The new `useRegisterOutbox({ commands, transport, deviceId, isEnabled?, onResult?, backendNotFound? })` runs `createRegisterOutbox` over an already-open `register_commands` collection, and calls `start()` so that till updates left pending (after a refused batch, for instance) go out when the app reopens. It returns `{ state, flush }`. A new collection or device id restarts the outbox, and `commands: null` leaves it idle. Apps that create the register outbox themselves should switch to this hook. `SyncStatus`'s till-updates refusal line now ends "…with the next till update, or when the app is reopened.", matching the sales line.

- Updated dependencies [[`eb203b4`](https://github.com/TallyUI/tallyui/commit/eb203b4489c58111f10011e825edeff671627ec3), [`c48e1dd`](https://github.com/TallyUI/tallyui/commit/c48e1dd808622191fb97104ecd58cc8cde7dde0d), [`0e4c9cc`](https://github.com/TallyUI/tallyui/commit/0e4c9cc3f9cd329666bf3b565dd24614bafbb590), [`3cf5452`](https://github.com/TallyUI/tallyui/commit/3cf5452ba0f6a2f25e88c230201d0e0e68e2e5b5), [`6278d8d`](https://github.com/TallyUI/tallyui/commit/6278d8d44f36d4c7f8601f1222807e510662a576)]:
  - @tallyui/pos@3.0.0-next.2
  - @tallyui/core@3.0.0-next.2
  - @tallyui/primitives@3.0.0-next.2
  - @tallyui/theme@3.0.0-next.2

## 3.0.0-next.1

### Minor Changes

- [#342](https://github.com/TallyUI/tallyui/pull/342) [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5) Thanks [@kilbot](https://github.com/kilbot)! - A till tells "sign in again" apart from "signed in, but not allowed" (found by the Medusa POS app's adoption).

  - **`ConnectorUnauthorizedError.status`** is now required, typed `401 | 403`, and set by meaning at every connector.
    - `401`: the credentials are not accepted, so sign in again. `code: 'unauthorized'`, fixed by the till.
    - `403`: the till is signed in but not allowed. `code: 'forbidden'`, fixed by the store.
    - Vendure answers a signed-out session with 403 too. Its connector checks who is signed in first, so a confirmed sign-out is always `401`.
  - **A 403 on the pull** gives the `forbidden` notice, never a sign-out. The pull retries on the store schedule and clears by itself once the store owner grants the permission. SyncStatus shows "Products aren't updating: your account isn't allowed to do this on this store." with "You can keep selling. Ask the store owner."
  - **The customer picker** shows "Your account isn't allowed to do this on this store. Ask the store owner." for a 403, instead of asking the cashier to sign in again.

### Patch Changes

- Updated dependencies [[`7fee0c1`](https://github.com/TallyUI/tallyui/commit/7fee0c19d57eb45130549101e5dd32cf593fdeea), [`eb5a032`](https://github.com/TallyUI/tallyui/commit/eb5a0322fe11b55e9158fb3374be14a12ac6b78b), [`8cd7860`](https://github.com/TallyUI/tallyui/commit/8cd78603e7edd7dc237d55ec3bab7f7e950a3518), [`c26ead6`](https://github.com/TallyUI/tallyui/commit/c26ead66fd839d41d211f72f47079d408d7b975d), [`8cf3ea4`](https://github.com/TallyUI/tallyui/commit/8cf3ea4a442a67ff0b229a6498503fd8b65a2ae5), [`e15f389`](https://github.com/TallyUI/tallyui/commit/e15f389e077a535b06a65e00c3989e7a652d7990), [`ddd9e85`](https://github.com/TallyUI/tallyui/commit/ddd9e85008f43e780cc0ee3754463eb7aa819a2a)]:
  - @tallyui/core@3.0.0-next.1
  - @tallyui/pos@3.0.0-next.1
  - @tallyui/primitives@3.0.0-next.1
  - @tallyui/theme@3.0.0-next.1

## 3.0.0-next.0

### Minor Changes

- [#210](https://github.com/TallyUI/tallyui/pull/210) [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue` now applies the provider's reconciled stock overlay itself (tiles, search and the variant chooser agree), and `useStockOverlaid` and `useStockOverlayAsOf` are new.

- [#205](https://github.com/TallyUI/tallyui/pull/205) [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4) Thanks [@kilbot](https://github.com/kilbot)! - Add useSale.setCustomer and ReceiptData.header.customer, customerTraits, CustomerPicker, generic CustomerSelect/CustomerCard with traits overrides, CustomerForm.showAddress, and the receipt's customer line.

  CustomerSelect rows are now pressable, so choosing a result works on the web (it previously did nothing).

- [#245](https://github.com/TallyUI/tallyui/pull/245) [`130d28e`](https://github.com/TallyUI/tallyui/commit/130d28e31c135fd94f2c30fb32897a5b20a56ab0) Thanks [@kilbot](https://github.com/kilbot)! - A store that keeps answering 404 is no longer silent. After 3 consecutive 404 answers the order and register outboxes set `OutboxState.backendMissing: { since }` (when the first of them arrived), and `SyncStatus` tells the cashier in plain words that sales aren't reaching the online store and are saved on the till, with a detail line for the store owner, instead of showing `retrying (status_404)`; the stuck line shows the same words, with no raw code. `SyncStatus` takes an optional `pluginName` (default `'the POS plugin'`) for that detail. The outboxes keep retrying on their normal backoff, and orders stay pending, so a 404 during a deploy blip recovers on its own. The next answer that isn't a 404 clears it; an offline (`network`) retry changes nothing.
  Pass one `createBackendNotFound()` tracker as `backendNotFound` to both `createOrderOutbox` and `createRegisterOutbox` so their 404s count together and the notice shows once, whichever outbox meets it first; without it, each outbox keeps its own.

- [#212](https://github.com/TallyUI/tallyui/pull/212) [`9e1032f`](https://github.com/TallyUI/tallyui/commit/9e1032ff041a723ca320fb6bbcd9dabcd58d5e0b) Thanks [@kilbot](https://github.com/kilbot)! - One order the store keeps failing no longer stops every later sale. After 5 server-answered failures (offline never counts) the order outbox probes the pending queue one order per backoff interval, oldest first; once the store takes one, the orders whose probes failed are isolated and retried alone, and batching resumes. If no probe gets through, the store is down: nothing is isolated. Retries alternate between the batch (or the probe) and one due isolated order, one request per interval, so neither can starve the other, and isolated orders take turns. An order the store has kept failing for 15 minutes of answered time, on its own clock, is flagged as stuck and stays pending: `OutboxState.stuck`, with a per-order entry in `stuck.orders`, `useOrderOutbox`'s `stuckCommandIds`, `needsAttention`'s `stuckCommandIds` option, `OrdersList`'s `stuck` prop (each order with its own time and reason), and `SyncStatus`'s "Not syncing" line. An offline failure pauses every clock, and the store's next answer of any kind resumes them all; a flagged order stays flagged through an offline spell, since a paused clock keeps its answered time. The HTTP transport now reports a request that got no answer in time as `timeout`, which counts like a 503 and never pauses a clock, and keeps `network` for a store it could not reach.

- [#223](https://github.com/TallyUI/tallyui/pull/223) [`a9cdfc0`](https://github.com/TallyUI/tallyui/commit/a9cdfc03369dace3495838608d4ac7ceeae2ae07) Thanks [@kilbot](https://github.com/kilbot)! - Migrate pos_orders to version 4 with optional localWarnings and serverFailures. Record omitted customer details and dropped payment references on the stored order, and show these warnings in the orders list; serverFailures is declared for the next outbox update.

- [#191](https://github.com/TallyUI/tallyui/pull/191) [`c92e96e`](https://github.com/TallyUI/tallyui/commit/c92e96e82030175ca00fe0b5ad17750ae56f6102) Thanks [@kilbot](https://github.com/kilbot)! - ProductGrid renders a virtualized FlatList, with its props unchanged.

- [#259](https://github.com/TallyUI/tallyui/pull/259) [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2) Thanks [@kilbot](https://github.com/kilbot)! - Replication pull errors are handled according to who can fix them, instead of every error being retried every 5 s forever. A till repeating a rejected token is the traffic a store's security plugin blocks.

  - `@tallyui/core`:
    - An error class declares `fixedBy: 'till' | 'store'` with a string `code`; `errorKind(error)` returns `'till'`, `'store'` or `'transient'`.
    - `SyncNotice` (`{ code, since, fixedBy, software?, minVersion?, fix? }`) describes a stopped pull.
    - `ConnectorUnauthorizedError` is fixed by the till.
  - `@tallyui/database` `startReplication` handles the three kinds and returns RxDB's state plus `notice$` and `resume()`:
    - **till:** one request, one notice, then the pull stays stopped until the app calls `resume()`, after sign-in. The pull stays stopped even when RxDB restarts the loop on page visibility.
    - **store:** one notice, then one attempt every 5 minutes (or the error's `retryAfterMs`, up to 1 hour). The notice clears itself on the first success, so a till recovers within 5 minutes of the owner's fix.
    - **transient:** a doubling delay from `retryTime` to 5 minutes. It waits at least a valid `retryAfterMs` (a finite number of zero or more), capped at 1 hour.
  - `@tallyui/components`: `SyncStatus` takes an optional `pullNotice` and tells the cashier in plain words that they can keep selling and who needs to act. It never shows a code, a backend name or a version the notice doesn't carry.
  - `@tallyui/connector-woocommerce`:
    - `WooDateFilterError` is fixed by the store, and carries `software` and `minVersion`.
    - `WooMissingUuidError` gains `code: 'missing_plugin'` and is fixed by the store.
  - `@tallyui/connector-vendure`: a new `VendureTimezoneConfigError` (`store_misconfigured`, with a plain `fix`) replaces the plain error when the `updatedAt` probe shows a server that isn't in UTC.

- [#289](https://github.com/TallyUI/tallyui/pull/289) [`a94b255`](https://github.com/TallyUI/tallyui/commit/a94b255f52b83c94639a6152ac8401b0edb02d98) Thanks [@kilbot](https://github.com/kilbot)! - `OutboxState` gains `rejected?: number`: the order outbox publishes the count of `pos_orders` the store refused (`syncStatus: 'rejected'`) wherever it publishes `pending`, so it rises when a batch result rejects an order and falls when `requeue()` sends one again. The register outbox leaves it unset. While `rejected` is above 0, `SyncStatus` never says "Sales are up to date.": its whole status line (label, polite live region and iOS announcement) is "1 sale needs attention · The online store refused it. Ask the store owner to look at the till's sync log." or "{n} sales need attention · The online store refused them. Ask the store owner to look at the till's sync log.", in place of the stuck and backend-missing sentences and the sending or retrying line. What else waits stays in the count: "1 sale needs attention, 5 waiting to sync · …" with other sales pending, "…, 2 till updates waiting to sync · …" with till updates, and "…, 5 sales and 2 till updates waiting to sync · …" with both. Below it, "Refused sales stay on this till under Needs attention, each with what to do next.", then the backend-missing detail when the store is missing. With `rejected` 0 or unset, nothing changes. When the store refused a whole batch (`refused` set, no sale carrying a code), the status line is the waiting count followed by " · The online store refused the last send. This till will try again with the next sale, or when the app is reopened." in place of the stuck or backend-missing sentence, and the sending or retrying line (which read "Retrying in 0 s.") is hidden; refused sales still outrank it. With only till updates waiting and the register outbox refused, it ends "…try again with the next till update." instead; with a sale waiting, the sales line wins.

- [#263](https://github.com/TallyUI/tallyui/pull/263) [`df80ead`](https://github.com/TallyUI/tallyui/commit/df80ead050072de985582e44c1a01c10d8ea9acd) Thanks [@kilbot](https://github.com/kilbot)! - `SyncStatus` takes an optional `registerState` (the register outbox's state): waiting till updates are counted ("1 till update waiting to sync", or named beside the sales), so it never says the sales are up to date while any wait, and with no sale waiting the backend-missing sentence says till updates aren't reaching the online store, or, once `registerState.stuck` is set, "Till updates haven't reached the online store since {time}. …". The backend-missing detail now reads "This till couldn't find {pluginName} on the online store. …". With nothing waiting, the line is only "Sales are up to date." (it replaces "All sales synced"), with no sending, retrying or problem text after it; if the store is missing, the detail reads "This till couldn't find {pluginName} on the online store the last time it checked. …". The status line's accessibility label is the whole visible line instead of "Sync status". The order and register outboxes let go of a shared `backendNotFound` tracker on `stop()` and take it up again on `start()` or `flush()`.

### Patch Changes

- [#273](https://github.com/TallyUI/tallyui/pull/273) [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `{ code: 'customer_ignored'; customerId: string }` (#266): a sale whose `customerId` doesn't resolve is kept as a guest sale. `knownWarnings` keeps it and `parseCommandResult` accepts it when `customerId` is 1 to 64 characters; the orders list renders it.

- [#281](https://github.com/TallyUI/tallyui/pull/281) [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `{ code: 'figures_mismatch'; fields: Array<{ field: 'subtotalMinor' | 'taxMinor' | 'discountMinor' | (string & {}); tillMinor: number; serverMinor: number }> }` (#257): one warning per sale listing each of the till's figures that differs from the server's own computation. `parseCommandResult` accepts it when `fields` is non-empty, each `field` is one of the three names with none repeated, and each entry's two values are different safe integers. `knownWarnings` applies the same rules but keeps a field name it doesn't know (any non-empty string), since a newer store may send one; the orders list renders it, an unknown field by its raw name.

- [#225](https://github.com/TallyUI/tallyui/pull/225) [`d6a5073`](https://github.com/TallyUI/tallyui/commit/d6a5073ad5792bce70238e2505c8cf766c8037bb) Thanks [@kilbot](https://github.com/kilbot)! - **The outbox freezes an order an older till stored before it first sends it** (`freezeSentForm`, which `finalizeOrder` uses too):

  - line names, discount labels and payment references are cut to 255 characters, but ids never are;
  - a customer email or id that `order.create` would refuse is left out;
  - the frozen form is written back, so the receipt and the store see the same bytes.

  So an order stored before the upgrade and still unsent is never refused as `invalid_payload`.

  **New type:** `SentOrder`, an `Order` whose customer id may be missing. The receipt stage, `buildReceiptData` and `Receipt` take it, and a plain `Order` still fits.

- [#207](https://github.com/TallyUI/tallyui/pull/207) [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1) Thanks [@kilbot](https://github.com/kilbot)! - `CommandWarning` gains `bridgeMinor` on `total_mismatch` and a new `tax_rate_mismatch` code, and the till now ignores warning codes it doesn't know (`knownWarnings`), instead of showing them as a store total.

- [#221](https://github.com/TallyUI/tallyui/pull/221) [`fd882bc`](https://github.com/TallyUI/tallyui/commit/fd882bc58d844063780e46ee454d6759afa3de4f) Thanks [@kilbot](https://github.com/kilbot)! - The stuck line says "no answer from the store" for a timeout.

- [#224](https://github.com/TallyUI/tallyui/pull/224) [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f) Thanks [@kilbot](https://github.com/kilbot)! - The order.create string lengths move from `payloadShapeErrors` to the new `payloadBoundErrors`, which `precheckCommand` calls after the replay lookup, so an applied order resent with a long title replays as `duplicate`; `payloadShapeErrors` keeps the types, the `customerId` and `sessionId` bounds and the NUL check. `useSale` applies a tender before logging a dropped reference, and `add()` refuses a product whose id or v3 tax code finalize would refuse; the tender's reference field caps at 255 characters. `finalizeOrder` now freezes the sent form (names and discount labels cut, an unsendable customer email or id left out) and `toOrderCreateEnvelope` sends the stored order unchanged, so every resend is byte-identical.

- [#222](https://github.com/TallyUI/tallyui/pull/222) [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8) Thanks [@kilbot](https://github.com/kilbot)! - The shared order.create shape check bounds string lengths and refuses NUL, and so does the v3 fiscal-figures check for its display and tax-code strings. The till cuts long names when it stores the order, refuses over-long pass-through references at finalize (and a payment reference as it's entered), refuses a searched or parked customer whose email or id the server would refuse, and validates the customer email at entry. Tills should ship this clamp before plugins adopt the new bounds, so no till sends a sale the server would now refuse.

- [#186](https://github.com/TallyUI/tallyui/pull/186) [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061) Thanks [@kilbot](https://github.com/kilbot)! - Internal `@tallyui/*` peer dependencies are published as a caret range (for example `^2.1.0`) instead of an exact version. The packages still release together at one version.

- [#318](https://github.com/TallyUI/tallyui/pull/318) [`6bbd1ba`](https://github.com/TallyUI/tallyui/commit/6bbd1ba88fe1f01fe20c52728fce81f55813b75f) Thanks [@kilbot](https://github.com/kilbot)! - Each sale records the tax rounding its figures were computed with (#287): `finalizeOrder` writes `taxRounding` on the stored order, the default (`per_order`, `half_away_from_zero`) included, and `custom` as `{ granularity: 'custom' }`. It is the till's own record and is never sent in `order.create`. The Z report splits each sale's tax by rate with the strategy that sale recorded, so its rows are the receipts' rows, and its `breakdowns.tax_rounding_mixed` is `true` when a session's sales used more than one strategy (a `custom` sale counts as the default it applied); `ClosureSheet` then says so, and `buildClosureDocument` carries the same line ready to print as `closure.tax_rounding_note` (`TAX_ROUNDING_MIXED_NOTE`), for the apps' closure templates. `PosOrder.taxRounding` is now required in the type.

  `pos_orders` moves to schema version 6: `taxRounding` is required, and the migration records the default on every older sale, the only rounding any earlier build used. Like version 5, this storage is one-way: an older build opens it but shows no orders, so never roll an app back across it (ADR-069). Before 3.0.0 ships, #242's OPFS upgrade proof is rerun against version 6.

- [#213](https://github.com/TallyUI/tallyui/pull/213) [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61) Thanks [@kilbot](https://github.com/kilbot)! - `parseCommandResult` now accepts a `total_mismatch`'s `bridgeMinor` and the `tax_rate_mismatch` warning code, so a plugin replaying a stored v3 result no longer fails. `knownWarnings` is lenient about a bad optional `bridgeMinor` (dropping just that field, not the whole warning) and about a non-array `warnings` value. `OrdersList`'s rounding line now reads "Store calculated …; a rounding line of … brought it to …". `Catalogue` keeps its input array's identity when the stock overlay changes nothing, and takes the latest of `lastStockCheckAt`, the provider's `stockOverlayAsOf` and `lastSyncedAt` for its "stock as of" time.

- [#314](https://github.com/TallyUI/tallyui/pull/314) [`c00e1ea`](https://github.com/TallyUI/tallyui/commit/c00e1ea553060e70c1ebcc16ab63f7793adab034) Thanks [@kilbot](https://github.com/kilbot)! - `OrdersList` shows a rejected sale's refusal in the cashier's words, one sentence per error code (#269), in both Needs attention and Recent, and never the store's own message. An unknown code, or a rejected sale with no error, shows `platform_error`'s sentence: "The online store refused this sale. Ask the store owner to look at the till's sync log." An `idempotency_mismatch` shows its sentence ("… Don't send it again; ask the store owner to compare the two.") in place of the old "This sale needs checking against the store before it can be sent again." line, and still has no Retry. The order outbox logs every refusal once to the sync log as "Order refused by the store" with the order id, the code and the store's message: a warning, or an error for `unsupported_version` (whose log previously used the message itself as its text).

- [#223](https://github.com/TallyUI/tallyui/pull/223) [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35) Thanks [@kilbot](https://github.com/kilbot)! - RxDB 17.5.0.

  - **`@tallyui/storage-sqlite`:**
    - Its `rxdb-premium` peer is now `17.5.0`. Apps install `rxdb-premium@17.5.0` together with `rxdb@17.5.0`.
    - Its storages set RxDB 17's premium flag at import and when called, so the 13-collection cap never applies.
  - **`@tallyui/pos`:**
    - Its `rxdb` peer is now `~17.5.0`.
    - Opening `pos_orders` rejects with `PosOrderOpenClosedError` when the database closes during a migration: RxDB 17.5.0 cancels the migration on close. The open first waits for any write already in flight, so none reaches a closed store.
    - An open that needs no migration resolves only once RxDB allows writes, so a sale saved straight after it is never refused with COL25.
  - **`@tallyui/database`:**
    - `createTallyDatabase` returns an RxDB 17 database.
    - In development it adds RxDB's dev-mode plugin when a database is created, not at import.
  - **Stored data:** a till's SQLite data written by RxDB 16.21.1 opens unchanged under 17.5.0, and migrates its schema versions.

  **Upgrade notes**

  - **Storage is one-way.** Once a till has opened this version, `pos_orders` is at schema version 4, and an older build
    (such as `@tallyui/pos` 2.0.0 on RxDB 16.21.1) opens it without an error but shows no orders, so it sends none of the
    pending ones until the till is upgraded again. Nothing is deleted: the next upgrade recovers every order, including a
    sale rung during the rollback. Never roll an app back across this version, and never re-ring sales it hides: a
    re-rung sale is a second sale, and the upgrade sends both. See ADR-069 in `docs/DECISIONS.md`.
  - Web apps ship the 17.5.0 storage worker with the 17.5.0 main thread. A cached 16.x worker with a 17.5.0 main
    thread is untested and unsupported.
  - Apps pin `rxdb` and `rxdb-premium` to exactly `17.5.0`.
  - RxDB 17 defaults a replication's `toggleOnDocumentVisible` to true (16.21.1: false). It then resyncs when the tab
    becomes visible, and no longer simulates activity to keep a hidden tab awake, so a browser may throttle a hidden
    tab's pull. RxDB pauses a hidden tab's replication only when that tab isn't the leader; a single-instance database
    is always the leader (read in 17.5.0's `plugins/replication` source, not tested).

- [#271](https://github.com/TallyUI/tallyui/pull/271) [`d6079b4`](https://github.com/TallyUI/tallyui/commit/d6079b47eedfacd6b12324bd426cf29bcd789757) Thanks [@kilbot](https://github.com/kilbot)! - `SyncStatus` inserts the plugin name and times literally (a `$&`, `$1` or `$$` in them is kept as written), and with only till updates waiting shows the register outbox's sending and retrying text and countdown. It shows no raw reason code: a stuck order now shows the "Sales haven't reached the online store since {time}." sentence (for till updates alone, "Till updates haven't …"), store missing or not. Sending and retrying are a short line of their own below the status line: "Sending…" or "Retrying in {n} s.". The status line and each pull-notice line are polite live regions (`aria-live="polite"` on web, `accessibilityLiveRegion` on Android) and on iOS are announced when their text changes, both in one announcement when they change together. What is announced is only the substance (counts, the sentence, the notice): the sending or retrying line is outside any live region, so it is never announced. `OrdersList` shows no reason code either: a stuck order reads "Hasn't reached the online store since {time}." with the hour numeric, and a rejected order shows the store's message alone (nothing when it has none), never its error code.

- [#299](https://github.com/TallyUI/tallyui/pull/299) [`cbf26fd`](https://github.com/TallyUI/tallyui/commit/cbf26fd25ae98e4289548d1ef556fefe272a4124) Thanks [@kilbot](https://github.com/kilbot)! - The WooCommerce connector sends WCPOS's protocol signal, so a WCPOS 2.0 store does not refuse it (#296). Every request carries `X-WCPOS-Protocol: 2` and `X-WCPOS-Client: tallyui/<connector version>`. WCPOS's 2.0 gate refuses POS-marked `wcpos/v2` requests without protocol 2, and protocol 2 is a pure declaration the connector already conforms to. The headers are harmless on WCPOS 1.x.

  If a store still answers 426 (`wcpos_update_required`), the new `WooTillUpdateRequiredError` (`till_update_required`, fixed by the till) stops the product pull after one request. `SyncStatus` then tells the cashier: "Products aren't updating: this till needs updating."

- Updated dependencies [[`4de75c2`](https://github.com/TallyUI/tallyui/commit/4de75c2e844d53fdbccd40c4ad4d4004a0641f57), [`894b6ae`](https://github.com/TallyUI/tallyui/commit/894b6aec27fcc157e65e68fee1f8134ef201712f), [`04905ef`](https://github.com/TallyUI/tallyui/commit/04905efd0c23a77159ce0682ed34df4567896bf0), [`faa7cda`](https://github.com/TallyUI/tallyui/commit/faa7cda925c6ca52e47357bd09d920813051c62b), [`9f34416`](https://github.com/TallyUI/tallyui/commit/9f34416619db35733ef85d98b225be5c046d12d5), [`fb57e1d`](https://github.com/TallyUI/tallyui/commit/fb57e1d8d97c3e03603a3bcc49470ce73bdb3b6d), [`898e98b`](https://github.com/TallyUI/tallyui/commit/898e98ba31387bbece8b79c5c0cc50d27f8cd3af), [`75c5dce`](https://github.com/TallyUI/tallyui/commit/75c5dced41a1c99da03614304fc87adad4bc684c), [`ba63f04`](https://github.com/TallyUI/tallyui/commit/ba63f04ef725774ec762a34a619534abb3bf2339), [`0d04d13`](https://github.com/TallyUI/tallyui/commit/0d04d13eff8a3bf7aed7cf747464e145a74dea35), [`78d324e`](https://github.com/TallyUI/tallyui/commit/78d324edabe07b30953c7c0c4c1947455c544bb4), [`24b74fd`](https://github.com/TallyUI/tallyui/commit/24b74fdfe39198c124cac707c31106affd7cc93b), [`d6a5073`](https://github.com/TallyUI/tallyui/commit/d6a5073ad5792bce70238e2505c8cf766c8037bb), [`54ee98a`](https://github.com/TallyUI/tallyui/commit/54ee98a583d5543538fb0641aa322a87e5f8cfaf), [`27d736e`](https://github.com/TallyUI/tallyui/commit/27d736e4ad8cbba835de31fa8492af28d59deea1), [`e59ebec`](https://github.com/TallyUI/tallyui/commit/e59ebecfc580bc5bca706c8e37fc825281a88cef), [`2ecaa36`](https://github.com/TallyUI/tallyui/commit/2ecaa3661eae0ad8ec5d0ce3a344dc24262f387b), [`901fa66`](https://github.com/TallyUI/tallyui/commit/901fa666f4ab345bf07b2d6b38c6e5dc58596f39), [`bf2d805`](https://github.com/TallyUI/tallyui/commit/bf2d805334c83d4f20f408e185add336331de38e), [`130d28e`](https://github.com/TallyUI/tallyui/commit/130d28e31c135fd94f2c30fb32897a5b20a56ab0), [`9e1032f`](https://github.com/TallyUI/tallyui/commit/9e1032ff041a723ca320fb6bbcd9dabcd58d5e0b), [`ca0beac`](https://github.com/TallyUI/tallyui/commit/ca0beacdafb14f3b5cae7c7593de23ed82b0d2d5), [`af623c9`](https://github.com/TallyUI/tallyui/commit/af623c91f4c4469e9da9740fcea470ec33f6bc5f), [`ef2f64e`](https://github.com/TallyUI/tallyui/commit/ef2f64ec52c1f3048c603de92acab7685bed8fe8), [`d225c58`](https://github.com/TallyUI/tallyui/commit/d225c5819954f7c3e91e0c9180cb634530304061), [`d329193`](https://github.com/TallyUI/tallyui/commit/d3291935ba99dcdea00134157604404790bbecdb), [`a9cdfc0`](https://github.com/TallyUI/tallyui/commit/a9cdfc03369dace3495838608d4ac7ceeae2ae07), [`9ffa7c0`](https://github.com/TallyUI/tallyui/commit/9ffa7c0400664baba9667f0e4354631229cbc464), [`6bbd1ba`](https://github.com/TallyUI/tallyui/commit/6bbd1ba88fe1f01fe20c52728fce81f55813b75f), [`5c90aed`](https://github.com/TallyUI/tallyui/commit/5c90aed083d8245e12a645aafa9c9e6a3e7bbc61), [`668f71f`](https://github.com/TallyUI/tallyui/commit/668f71f6cf06af4a41fe686e98546f25e2e191ee), [`457162d`](https://github.com/TallyUI/tallyui/commit/457162d04dcd3c6f588cdb6ab90efea36081f4df), [`c00e1ea`](https://github.com/TallyUI/tallyui/commit/c00e1ea553060e70c1ebcc16ab63f7793adab034), [`222543b`](https://github.com/TallyUI/tallyui/commit/222543b8c9130d2c79a294603195940143bd611c), [`8141c1c`](https://github.com/TallyUI/tallyui/commit/8141c1cb1591a8b8299ffc00fe4f9a77a7cd8289), [`c9798a3`](https://github.com/TallyUI/tallyui/commit/c9798a334557a75495211f85edfdfaca68966667), [`581472f`](https://github.com/TallyUI/tallyui/commit/581472f659593568b98e50d91ad7c150478567b6), [`8ae3c53`](https://github.com/TallyUI/tallyui/commit/8ae3c53e0af89cf38ad8208362d75b08ae007093), [`ce4f796`](https://github.com/TallyUI/tallyui/commit/ce4f796aff7c739cb555b61f9a167cc803d8b5c2), [`6673faf`](https://github.com/TallyUI/tallyui/commit/6673fafcc682e825c94cfc66932da07cabd24e35), [`9885075`](https://github.com/TallyUI/tallyui/commit/98850759e9531a13b004a6be7be1115392f46a1d), [`1f4d0ab`](https://github.com/TallyUI/tallyui/commit/1f4d0ab8006f41586740195831aaa0c9adc17f15), [`a94b255`](https://github.com/TallyUI/tallyui/commit/a94b255f52b83c94639a6152ac8401b0edb02d98), [`df80ead`](https://github.com/TallyUI/tallyui/commit/df80ead050072de985582e44c1a01c10d8ea9acd), [`5ed6281`](https://github.com/TallyUI/tallyui/commit/5ed62816fe28a3ef3b001600b9d6a08de22d4a7e), [`5a204a9`](https://github.com/TallyUI/tallyui/commit/5a204a949e33f53d6087845d59e4bab1fe4a1474), [`7d1bc98`](https://github.com/TallyUI/tallyui/commit/7d1bc98b842258d67f6d5d380bc925e16e649ca2), [`37aad35`](https://github.com/TallyUI/tallyui/commit/37aad3527391b99b50515386bc76a569ee13460a), [`4122dc8`](https://github.com/TallyUI/tallyui/commit/4122dc8e1bbe97a62af35c93fed9d72a1067705f)]:
  - @tallyui/core@3.0.0-next.0
  - @tallyui/pos@3.0.0-next.0
  - @tallyui/primitives@3.0.0-next.0
  - @tallyui/theme@3.0.0-next.0

## 2.0.0

### Major Changes

- [#23](https://github.com/TallyUI/tallyui/pull/23) [`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b) Thanks [@kilbot](https://github.com/kilbot)! - **Breaking:** the cart and checkout components are presentational and take `Money`. `CartLine` takes `name`, `quantity`, `unitPrice` and `lineTotal`. `CartTotal` takes `subtotal`, `taxLines`, `discount` and `total`. `CashTendered` and `ChangeDisplay` take `Money` amounts. All of them format with `formatMoney`, so there is no `getPrice`, float arithmetic or hard-coded `'$'`. `CartPanel` is generic, and `CartLineItem` is removed. Totals come from `@tallyui/pos`; the components no longer compute tax. The cash input keeps the text as typed and emits integer minor units.

  `@tallyui/core` adds `moneyFromDecimalString`, which parses typed decimal text into `Money` using integer arithmetic.

### Minor Changes

- [#136](https://github.com/TallyUI/tallyui/pull/136) [`0b1237f`](https://github.com/TallyUI/tallyui/commit/0b1237fc6e84505bd8403f8d0ffe7c5a0e9600fc) Thanks [@kilbot](https://github.com/kilbot)! - `CartPanel`'s footer (totals, pay button) now stays pinned to the bottom of the panel at every height, on web and native, instead of being pushed off screen by a tall list of lines. `CartPanel` also gains an `afterItems` slot, rendered inside the scrolling region after the last line, for content like discount chips.

- [#148](https://github.com/TallyUI/tallyui/pull/148) [`a80e053`](https://github.com/TallyUI/tallyui/commit/a80e053f498c034296a5d0e721daace205aeb158) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue` takes an optional `minCodeLength` prop (a till's barcode-scanner setting). When set, Enter on a search query shorter than `minCodeLength` (after trimming) no longer does a barcode/SKU lookup — it leaves the typed text as a plain search instead of selecting an entry. Unset, behaviour is unchanged. A scanner's timing threshold stays the app's own concern, in its unfocused wedge listener.

- [#175](https://github.com/TallyUI/tallyui/pull/175) [`a9b77fe`](https://github.com/TallyUI/tallyui/commit/a9b77fe4b512cf7820ccbd07898408e1e8a59cc6) Thanks [@kilbot](https://github.com/kilbot)! - One close in flight per register. `useRegisterSession`'s `closeSession` joins a close already running for the same register, in any hook instance, and returns its closure (the joining call's `counted`, `approvedBy` and `approvedByName` are ignored), so a tap during a close no longer starts a second, overlapping one. The hook returns a new `closing` flag, true while that close is in flight. `RegisterColumn` keeps the count slot up while closing instead of flashing the Finish-closing card, whose button now has `nativeID="register-column-finish-close-button"`. `describeRegisterBarPill` takes `closing` and returns the new `'Close not finished'` pill for a closed session that isn't closing, right after 'Choose a register' and ahead of 'Offline'; `RegisterBar` passes `register.closing`.

- [#174](https://github.com/TallyUI/tallyui/pull/174) [`160252c`](https://github.com/TallyUI/tallyui/commit/160252c0b2415b60ac73fcb06ac5920db0df098e) Thanks [@kilbot](https://github.com/kilbot)! - `ClosureSheet` shows who approved the close (`Approved by {name}`, falling back to the approver id without a name) under the figures, blind or not — it's provenance, not a counted figure. `RegisterColumn` offers "Finish closing" when `useRegisterSession`'s session is closed but its closure row was never written (an interrupted close), resuming the close (the store keeps the count persisted on the session) instead of falling through to the cart, where `openSession` would otherwise refuse with `RegisterCloseIncompleteError`. `buildClosureDocument`'s return type now carries `closure.unsynced_count: number` and each movement's `id`/`reason` as `string`, without a cast; no runtime output changed.

- [#107](https://github.com/TallyUI/tallyui/pull/107) [`f132a68`](https://github.com/TallyUI/tallyui/commit/f132a68fa1cc4dd1c221706991c4059a0dc3c53c) Thanks [@kilbot](https://github.com/kilbot)! - `ConnectorStatus` gains `unsoldCount`, `unsoldStale` and `formatUnsold` props, showing how many products the sales channel doesn't sell (the calculated-price runner's `unreported`) below `lastSync`, using the `warning` token when current and `muted-foreground` when stale.

- [#149](https://github.com/TallyUI/tallyui/pull/149) [`1e2ee56`](https://github.com/TallyUI/tallyui/commit/1e2ee56248d1aee2287fa9af48845e35cafdacac) Thanks [@kilbot](https://github.com/kilbot)! - A failed save can now end in Continue once its order is confirmed stored. `useOrderOutbox` gains `isStored(order)`, and `record` now treats an order stored with the same `id` and money-bearing content (`sameSale`, new) as stored whatever its `commandId`, so a Retry after a requeue no longer fails forever; other content throws the new `OrderContentMismatchError`. `useSale` takes an optional `isStored` and exposes `canContinue` and `continueSale()`; `Tender` renders Continue when `canContinue` is true. `newSale()` is now refused while a failed or running save's order isn't confirmed stored; a refusal during a running save asks `isStored` again, so a hung save whose order is stored can still Continue. A confirmed order is never handed to `onSaleCompleted` again (#147's background re-hand is gone). `saleLogger` and `outboxLogger` are now exported.

- [#132](https://github.com/TallyUI/tallyui/pull/132) [`7c69fce`](https://github.com/TallyUI/tallyui/commit/7c69fce5ed409b4e6ee0b8693ef49382658574c5) Thanks [@kilbot](https://github.com/kilbot)! - `order.display` gains `lines` and `orderDiscountMinor` (ADR-063). Each line shows its amount before any discount, with its own discounts as sub-rows, all in the display mode. The order discounts appear as one row, not allocated to the lines. Every discount row is its own-mode amount converted on its own, so it's exact. `display.subtotalMinor` is now derived from the total and the discount rows, so `Σ lines === subtotalMinor` and `Σ sub-rows + orderDiscountMinor === discountMinor` hold exactly. Single-mode carts show the same figures as before; mixed-mode carts can shift by about a cent, carried by the last converted line's amount.

  `ReceiptLineItem` gains `displayAmountMinor` and `displayDiscounts`, and `ReceiptData` gains `orderDiscountMinor`. Print these above the subtotal. `lineTotalMinor` is unchanged: it's after every discount and is kept for existing readers.

  `CartTotal` now orders its rows Subtotal / Discount / Tax / Total, matching the receipt, and takes an optional `taxInclusive`, which labels the tax rows "incl." instead of adding them.

- [#65](https://github.com/TallyUI/tallyui/pull/65) [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e) Thanks [@kilbot](https://github.com/kilbot)! - `@tallyui/core` adds `resolvePriceRange(variants, currency?)`, the lowest and
  highest current price across a product's variants. `ProductPrice` uses it to
  show `from <lowest price>` when a product's variants are priced differently,
  instead of just the default variant's price. New `showFromPrice` (default
  `true`) and `fromLabel` (default `'from'`) props control and opt out of this.

- [#141](https://github.com/TallyUI/tallyui/pull/141) [`6a4e80d`](https://github.com/TallyUI/tallyui/commit/6a4e80d050ccb9b10278dacc0973921c18e6f441) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's product catalogue, receipt, print-style hook and sync status into `@tallyui/components` (`Catalogue`, `Receipt`, `injectPrintStyle`, `SyncStatus`), so every platform POS gets the same screens (ADR-052, TV6b). `Catalogue` takes an optional `hour12?: boolean` (undefined keeps the locale default) instead of reading `expo-localization`. `Receipt` takes `store: { name: string; address?: string }` instead of a Medusa-shaped settings type, an optional `topInset?: number` (default 0) instead of an app-local strip-height context, an optional `formatDate?: (iso: string) => string` defaulting to an `Intl.DateTimeFormat` formatter, and an optional `taxLabel?: (ratePpm: number) => string` with the same default as `Cart`'s (TV6a), keeping the `incl. ` prefix rule. `searchProducts`, `catalogueEntries`, `findEntryByCode` and `variantPriceLabel` join `buildReceiptData` on the pure-function allow-list components may import from `@tallyui/pos` (ADR-064).

- [#142](https://github.com/TallyUI/tallyui/pull/142) [`60a2218`](https://github.com/TallyUI/tallyui/commit/60a2218b26953397eeb46abb4c38a3a37c9ae1b2) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's neutral outbox core so every platform POS records and sends sales the same way (ADR-052, TV7). `@tallyui/pos` gains `getDeviceId(storage, key)`, which keeps a UUIDv7 device id in web storage under the given key and falls back to one id per process; `needsAttention(orders)`, which picks rejected and applied-with-warnings orders, newest first; and `useOrderOutbox({ storeKey, open, transport, deviceId, onBusy?, onOpenError? })`, which opens the order store for `storeKey`, runs its outbox and returns `{ orders, state, recent, record, flush, requeue }`. `@tallyui/components` gains `OrdersList`, the "Needs attention" and "Recent" orders with a Retry button, taking `orders`, `onRetry`, an optional `formatDate` (default `Intl.DateTimeFormat`) and an optional `footer`. `needsAttention` joins the pure-function allow-list components may import from `@tallyui/pos` (ADR-064).

- [#139](https://github.com/TallyUI/tallyui/pull/139) [`3dd11f6`](https://github.com/TallyUI/tallyui/commit/3dd11f6e0fc33c8261b59a04c25b8f94a20c54e0) Thanks [@kilbot](https://github.com/kilbot)! - Lifted medusapos's cart, phone cart bar, discount form and tender screen into `@tallyui/components` (`Cart`, `CartBar`, `Tender`, `DiscountForm`, `DiscountChips`, `parseDiscount`, `discountLabel`), so every platform POS gets the same sale-column UI (ADR-052, TV6a). `Cart` takes an optional `taxLabel?: (ratePpm: number) => string` (default `` `Tax ${ratePpm / 10000}%` ``), since VAT isn't universal. `@tallyui/components` gains a runtime dependency on `@tallyui/pos`, for types and the pure `buildReceiptData` only — components still render from props alone.

- [#69](https://github.com/TallyUI/tallyui/pull/69) [`0ef1c7e`](https://github.com/TallyUI/tallyui/commit/0ef1c7e166ddcc9dc7d67570cd0fcafbc5302b38) Thanks [@kilbot](https://github.com/kilbot)! - ADR-061: `startLiveTab` (`@tallyui/database`) coordinates exactly one live tab per store over a Web Lock and a `BroadcastChannel`. A new tab asks the live tab to hand over; the live tab may delay while busy, then parks and releases the lock; a tab that gets no acknowledgement is blocked and must be closed. `LiveTabScreen` (`@tallyui/components`) renders the parked and blocked screens, with translatable label props. On platforms without Web Locks (React Native, Node), a tab is simply live at once.

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a) Thanks [@kilbot](https://github.com/kilbot)! - Build the product components on the neutral traits. `ProductPrice` resolves the price list and formats it with Intl in the price's own currency (new `currency` and `locale` props; `currencySymbol` is now only the fallback for an unknown currency). `ProductStockBadge` reads `getStock`. `ProductImage` gains `showPlaceholder`, an initial tile for products without images. Core adds `formatMoney`, a `traitContext` prop on `ConnectorProvider` for store-level facts like the store currency, and `useTraitContext`. `@tallyui/pos` adds `searchProducts`, name/SKU/barcode search through traits that works the same on every backend.

- [#144](https://github.com/TallyUI/tallyui/pull/144) [`e692c40`](https://github.com/TallyUI/tallyui/commit/e692c40ec78afbf2cd2ede633568206366dab1bc) Thanks [@kilbot](https://github.com/kilbot)! - `pos_orders` goes to schema version 2 (ADR-032, ADR-065). It adds three optional fields: `lateSessionId`, and ADR-065's `display` and `taxByRate`, which nothing writes yet. Apps must adopt this release's `addPosOrderCollection`, which migrates `pos_orders` to version 2 from version 0 or 1 without dropping an order.

  A sale whose session refuses the stamp in `useSale().complete()` (the session closed or went missing) is no longer stopped, because the money has been taken. It goes on to `onSaleCompleted` and the receipt with `lateSessionId` set and no `sessionId`, so no closure counts it, and a `late-sale` register fact is recorded. `needsAttention` now also selects any order with `lateSessionId`, and `OrdersList` explains it: "Taken after the register closed. It is not in that register's closure."

- [#76](https://github.com/TallyUI/tallyui/pull/76) [`e225222`](https://github.com/TallyUI/tallyui/commit/e22522233a75845682525181d35ec3f0e2e72824) Thanks [@kilbot](https://github.com/kilbot)! - `ProductPrice` gains a `formatFrom` prop, `(price: string) => string`, for languages whose word order puts the "from" label after the price (`formatFrom={(p) => \`${p} ab\`}`renders`€10.00 ab`); `fromLabel`stays as a deprecated alias. Visible change: every price — the regular price, the "from" range and the sale price — now uses the theme's`text-price`(or`text-sale`) token instead of `text-foreground`. Apps with screenshot tests covering `ProductPrice` will need to re-shoot them.

- [#167](https://github.com/TallyUI/tallyui/pull/167) [`62eef0f`](https://github.com/TallyUI/tallyui/commit/62eef0f21a5213740dce8884f6cf00f60c7b8fd7) Thanks [@kilbot](https://github.com/kilbot)! - Register-selection screen nits (ADR-032 amendment 1, medusapos adopting `451a0ca`): `RegisterPicker`'s rows now size to their content, with a minimum height, instead of clipping the "Not opened" second line at a fixed `h-11`; `RegisterPicker` and `OpenRegisterCard` no longer hard-code `flex-1`, taking their existing `className` from the caller instead (TallyUI's own `RegisterColumn` still passes `flex-1` where it mounts them); `RegisterPanel`'s sales count now pluralises correctly ("1 sale this session", not "1 sales"); and `OpenRegisterCard`'s amount label names the currency, matching `MovementSheet`'s "Amount (€)" ("Cash in the drawer to start (€)").

  Two new optional props for apps that need to put register controls elsewhere on the screen: `RegisterBar` takes an `onPressPill?: () => void` that turns its status pill into a button (opening the gate/picker or the panel), and `Catalogue` takes a `statusAccessory?: ReactNode` rendered at the end of its status line, alongside the status text, so a register control can sit there at phone width.

- [#164](https://github.com/TallyUI/tallyui/pull/164) [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588) Thanks [@kilbot](https://github.com/kilbot)! - Register screens (WCPOS `next` port, ADR-032), driven by `useRegisterSession`: `RegisterPicker`, `OpenRegisterCard`, `RegisterBar` (one status pill; "Register ›"), `MovementSheet` (labelled "Amount" and "Reason"; a reason for every movement; same-tick taps coalesced), `RegisterPanel` (expected in the drawer; Undo by reversal; blind mode hides amounts) and `RegisterColumn`. `@tallyui/core` adds `currencySymbol(currency, locale?)`.

- [#166](https://github.com/TallyUI/tallyui/pull/166) [`c65da52`](https://github.com/TallyUI/tallyui/commit/c65da52cf2207519cb19e0c1842751aeaf92b9fc) Thanks [@kilbot](https://github.com/kilbot)! - `RegisterCount` and `ClosureSheet` (WCPOS `next` port, ADR-032 amendment 1): denomination tiles counted in minor units (tap adds one, a 400ms hold adds ten), typing a cash amount clears the tiles, a live variance line hidden while blind, and Close gated by an optional `approve` prop above `varianceThreshold` (refused with an exact message without one). `ClosureSheet` shows the local closure number and, unless blind, the counted figures and variance per tender.

- [#55](https://github.com/TallyUI/tallyui/pull/55) [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5) Thanks [@kilbot](https://github.com/kilbot)! - Stock reads use the reconciled overlay (ADR-060) and show how fresh it is. `@tallyui/core` now holds `withStockOverlay` and `getProductStock` (`@tallyui/pos` re-exports them), adds `STOCK_LEVELS_LAST_PASS`, `stockOverlay` and `stockOverlayAsOf` props on `ConnectorProvider`, and a `useProductStock(doc)` hook that returns overlay stock plus `asOf`, or `getStock(doc)` when no overlay is given. `@tallyui/database`: `startStockReconcile` also returns `state$` (`running`, `truncated`, `lastError`, `lastCompletedAt`), `reconcileStock()` resolves with `completedAt`, and each successful pass stores `{ completedAt }` in the `last-pass` local document of `stock_levels`, which `createTallyDatabase` now creates with local documents (apps that create the collection themselves use the new `stockLevelsCollection` config; without local documents a pass rejects with a clear error); a restarted runner seeds `lastCompletedAt` from it. `@tallyui/pos` adds `stockOverlayAsOf$`. `ProductStockBadge` reads stock through `useProductStock` and appends " · as of <time>" when an overlay is given (`showAsOf={false}` hides it).

- [#96](https://github.com/TallyUI/tallyui/pull/96) [`93658cd`](https://github.com/TallyUI/tallyui/commit/93658cd0c0d12bdb519d5ac76c0e2cfa20184dbb) Thanks [@kilbot](https://github.com/kilbot)! - `StoreSettingsChoiceScreen`: the picker the app shows when `storeSettings` rejects with `choice_required` (TV4), for a store with several regions, countries or sales channels — medusa-dev's one region with 7 countries always hits this. Renders a radio-row section per choice offered, pre-selects a single-option section or a matching `initial` value, and calls `onSubmit` with the picked fields once every shown section has a selection.

- [#12](https://github.com/TallyUI/tallyui/pull/12) [`fe65b33`](https://github.com/TallyUI/tallyui/commit/fe65b33cf20f357296a96ffb45622447cc37f412) Thanks [@kilbot](https://github.com/kilbot)! - Add createSvgIcon and SearchIcon, and replace the SearchInput text glyph with an SVG magnifier. react-native-svg >=15 is now a peer dependency.

- [#104](https://github.com/TallyUI/tallyui/pull/104) [`bc46d99`](https://github.com/TallyUI/tallyui/commit/bc46d9903af3641836ae32c906542789e510496d) Thanks [@kilbot](https://github.com/kilbot)! - `ProductGrid` hides products this channel doesn't sell (`traits.isSellable`
  false, for example a Medusa product outside the sales channel) unless
  `showUnsellable` is set, and `ProductCard` shows such a product in a muted
  "Not sold here" state instead of its price. `OrderBuilder.addProduct` now
  refuses an unsellable product before looking up its price, instead of
  throwing the unrelated "No price in …" error.

### Patch Changes

- [#168](https://github.com/TallyUI/tallyui/pull/168) [`670d3b8`](https://github.com/TallyUI/tallyui/commit/670d3b89c4f139276d3c902705e1eb04bdc959c6) Thanks [@kilbot](https://github.com/kilbot)! - The register approval gate is enforced in `useRegisterSession`'s `closeSession`, not only in `RegisterCount`: over `varianceThreshold`, a close without `approvedBy` throws the new `RegisterApprovalRequiredError` before any write, blind mode included. `closeSession` takes `approvedBy` and `approvedByName`, and they reach the Z (`breakdowns.approved_by`, `approved_by_name`); the store's `closeSession` takes `approvedBy`. `useRegisterSession`'s `register` option accepts `null` while its host opens. `closeNeedsApproval` is the shared "over threshold" rule. `RegisterCount` passes `approve()`'s `approvedBy` and `approvedByName` to `closeSession`, and shows the hook's refusal with the same copy.

- [#137](https://github.com/TallyUI/tallyui/pull/137) [`314d1fc`](https://github.com/TallyUI/tallyui/commit/314d1fc30a02091489b1ccec2909508d979b2969) Thanks [@kilbot](https://github.com/kilbot)! - `CartPanel` rows now default to keying by the item's `id` (string or number), falling back to index only for items without one, instead of always keying by index — so removing a line above another with an open inline form (e.g. a per-line discount editor) no longer remounts and loses that form's state. Pass `keyExtractor` to override.

- [#169](https://github.com/TallyUI/tallyui/pull/169) [`6c9a176`](https://github.com/TallyUI/tallyui/commit/6c9a176988cea949b3d213af48baba5aacc2e392) Thanks [@kilbot](https://github.com/kilbot)! - `Catalogue`'s status text now truncates to a single line (with an ellipsis) when `statusAccessory` is set, instead of wrapping to three lines at phone width and pushing the accessory (e.g. a register pill) out of place. Without `statusAccessory`, the status text still wraps as before.

- [#43](https://github.com/TallyUI/tallyui/pull/43) [`f1e2a02`](https://github.com/TallyUI/tallyui/commit/f1e2a0273d25e5492336394ffb9cc5505ebcfdfc) Thanks [@kilbot](https://github.com/kilbot)! - Status badges use foreground text on their tint (the dot carries the colour), since coloured text on a 15% tint of itself fails WCAG AA; the refunded order badge uses the destructive token instead of the undefined `danger`. Search, cart-note and customer inputs take their placeholder colour from the `muted-foreground` token.

- [#37](https://github.com/TallyUI/tallyui/pull/37) [`12b7723`](https://github.com/TallyUI/tallyui/commit/12b7723041f2297c86525e2ddbab3f39d8bdfa1f) Thanks [@kilbot](https://github.com/kilbot)! - Order cards, receipt preview, register summary, settings groups, connector status, variant picker, cash-tendered input, cart note and customer form used the undefined `bg-surface` class and rendered transparent; they now use `bg-card`.

- [#88](https://github.com/TallyUI/tallyui/pull/88) [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89) Thanks [@kilbot](https://github.com/kilbot)! - no longer publishes test files

- [#11](https://github.com/TallyUI/tallyui/pull/11) [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d) Thanks [@kilbot](https://github.com/kilbot)! - Report product-level stock across all variants, showing the total quantity only when every variant has tracked, known stock.
  Draw the search magnifier with an attached, rounded handle and a larger ring.

- [#36](https://github.com/TallyUI/tallyui/pull/36) [`d1bc892`](https://github.com/TallyUI/tallyui/commit/d1bc8920968d6545bc14567fa2a8b47e6706514a) Thanks [@kilbot](https://github.com/kilbot)! - Light theme contrast: primary darkened to #5b5ef0 (white text 4.88:1), muted-foreground to #656c79 and input to #848a94 (control borders ≥ 3:1). Product cards and quick-tender buttons get borders, and components no longer use the undefined `bg-surface-alt` or `text-muted` text classes, so labels such as "Change Due" are legible.

- Updated dependencies [[`670d3b8`](https://github.com/TallyUI/tallyui/commit/670d3b89c4f139276d3c902705e1eb04bdc959c6), [`a9b77fe`](https://github.com/TallyUI/tallyui/commit/a9b77fe4b512cf7820ccbd07898408e1e8a59cc6), [`96bf8f7`](https://github.com/TallyUI/tallyui/commit/96bf8f79a47cd29b8b115ec46d070ce889750caa), [`160252c`](https://github.com/TallyUI/tallyui/commit/160252c0b2415b60ac73fcb06ac5920db0df098e), [`cbda7e0`](https://github.com/TallyUI/tallyui/commit/cbda7e00348b0d353fc53c13f1696455ad8d94eb), [`e103c71`](https://github.com/TallyUI/tallyui/commit/e103c71116a636c2cfd01903155b1e6da86a2d23), [`53af670`](https://github.com/TallyUI/tallyui/commit/53af670cfbc598d5fed275a7ecc5927752716a4b), [`50317c8`](https://github.com/TallyUI/tallyui/commit/50317c8520ebc04f2f6cdd47b9b9c6a0ed3efdd6), [`3e09957`](https://github.com/TallyUI/tallyui/commit/3e099573c771f130ffb6a5a3736527e908899257), [`1e2ee56`](https://github.com/TallyUI/tallyui/commit/1e2ee56248d1aee2287fa9af48845e35cafdacac), [`a219ae0`](https://github.com/TallyUI/tallyui/commit/a219ae03588234d6e1a685a9924b52e115dcb7d1), [`4df9be4`](https://github.com/TallyUI/tallyui/commit/4df9be400debddb67859482c17f9e68dadbf46d1), [`7c69fce`](https://github.com/TallyUI/tallyui/commit/7c69fce5ed409b4e6ee0b8693ef49382658574c5), [`2a0ca7f`](https://github.com/TallyUI/tallyui/commit/2a0ca7fe2d56d618d2a33b46704ffa2811a761bc), [`9649259`](https://github.com/TallyUI/tallyui/commit/96492599bdb93fa573f588ae84585dc027289da8), [`609ebd8`](https://github.com/TallyUI/tallyui/commit/609ebd82c27cabb9c6875f090736693e22331a09), [`f8b0dac`](https://github.com/TallyUI/tallyui/commit/f8b0dacda6140d9c1e1d8445fd6ebd01e7577005), [`a0b7981`](https://github.com/TallyUI/tallyui/commit/a0b7981ca645ea9f64ae17eccbdf13a9599f332e), [`714b4bd`](https://github.com/TallyUI/tallyui/commit/714b4bd3f478fc89c7bbf5c455a88d307c53ef2d), [`f4a4d74`](https://github.com/TallyUI/tallyui/commit/f4a4d74d153f28bd2fdf46bb70984885e0b24166), [`540044c`](https://github.com/TallyUI/tallyui/commit/540044c6768f54bd1c33cc6ff0d4ccc2094244a8), [`60a2218`](https://github.com/TallyUI/tallyui/commit/60a2218b26953397eeb46abb4c38a3a37c9ae1b2), [`f09dbbc`](https://github.com/TallyUI/tallyui/commit/f09dbbcbb111d93b30b3cf7bc49b558b521845cf), [`350dd72`](https://github.com/TallyUI/tallyui/commit/350dd72708cc652bf6200010995379ae5816e93f), [`c664d4b`](https://github.com/TallyUI/tallyui/commit/c664d4b9145dc3b84f46e1026d0235a1e36aea39), [`945bb83`](https://github.com/TallyUI/tallyui/commit/945bb83ab34c64ec28a88980b59539b2fc679a17), [`f90e59d`](https://github.com/TallyUI/tallyui/commit/f90e59d6ecf29dd23e16028c5e7f0d5ed1841f99), [`2a05ecb`](https://github.com/TallyUI/tallyui/commit/2a05ecbe89ce4b1ba1d8537546fdc181e5f2d55a), [`7e489e0`](https://github.com/TallyUI/tallyui/commit/7e489e0488b75cd6e926bda5adf99230f770b8e7), [`f67535d`](https://github.com/TallyUI/tallyui/commit/f67535d358e337456505a4655a0d8977fab034fc), [`d921415`](https://github.com/TallyUI/tallyui/commit/d921415ed99a9ed20fa26cd5b79d6116240a2539), [`e0062ce`](https://github.com/TallyUI/tallyui/commit/e0062cecd0510d3330218b555f556e19bc90e764), [`f1af98c`](https://github.com/TallyUI/tallyui/commit/f1af98ce0161ded267e873ead952e8d7deafe471), [`a7fdde8`](https://github.com/TallyUI/tallyui/commit/a7fdde8cf2d0c042365a50103084b6eeb3609ff6), [`5e5ba11`](https://github.com/TallyUI/tallyui/commit/5e5ba11b1c975b216d4c3ffc0eaceb7f26132ce1), [`5053527`](https://github.com/TallyUI/tallyui/commit/5053527066d9f9f49efff37ccf18ce2910518b89), [`47b9b4e`](https://github.com/TallyUI/tallyui/commit/47b9b4ed8da17be7f3494e82abcf00c590728769), [`64cb5e0`](https://github.com/TallyUI/tallyui/commit/64cb5e0f7a8ff263dffa4a685d326040826415c9), [`98ea990`](https://github.com/TallyUI/tallyui/commit/98ea99035693bd9a7b502ec79e64610c6ea7b765), [`55d52fa`](https://github.com/TallyUI/tallyui/commit/55d52fa73ce283a119d850a1d8858e066a7758ac), [`fbcaf59`](https://github.com/TallyUI/tallyui/commit/fbcaf59e067d7a66c81cdcbc900b6ef740063254), [`e692c40`](https://github.com/TallyUI/tallyui/commit/e692c40ec78afbf2cd2ede633568206366dab1bc), [`f2f386c`](https://github.com/TallyUI/tallyui/commit/f2f386cd14344536c0cef054ce93642f7bd43fe0), [`e7b2fa5`](https://github.com/TallyUI/tallyui/commit/e7b2fa5e08d4df3a7a8103d536771c1f4341dbb1), [`373e438`](https://github.com/TallyUI/tallyui/commit/373e438372d59d7a1664bb871fe0a4df21ef17be), [`6444868`](https://github.com/TallyUI/tallyui/commit/644486864f66d829877898afade7e6726b1889fe), [`7502d61`](https://github.com/TallyUI/tallyui/commit/7502d61cc05441972a70dc6e493b50a993aaa00c), [`6ef7eb5`](https://github.com/TallyUI/tallyui/commit/6ef7eb50cc7bd4c87a4440b06fe5ffb3073a7443), [`b1b6e30`](https://github.com/TallyUI/tallyui/commit/b1b6e300b3c10fbe45559da7f48c9719f1965f9d), [`516850f`](https://github.com/TallyUI/tallyui/commit/516850fc9674f6f8fdcee262a5fb3862b444e78a), [`125c85a`](https://github.com/TallyUI/tallyui/commit/125c85a2c517df2e31f86f041afdc990360c9766), [`0988fc3`](https://github.com/TallyUI/tallyui/commit/0988fc3c0ea9ffd6cff2f981110982db8004fe2d), [`1d13699`](https://github.com/TallyUI/tallyui/commit/1d13699cb42f7b77a74af73971a0dad602b26896), [`9441c26`](https://github.com/TallyUI/tallyui/commit/9441c26d079974451796a92ce3c4852dc17576a5), [`24b0563`](https://github.com/TallyUI/tallyui/commit/24b056353b5dbce1ecd21ac237a635195e66e588), [`45e0b12`](https://github.com/TallyUI/tallyui/commit/45e0b128ad2930d57bffc2bd8f432a334c760fab), [`a58fcca`](https://github.com/TallyUI/tallyui/commit/a58fccaecdbbeb84d44d9347b2cda9817450b1cb), [`6281345`](https://github.com/TallyUI/tallyui/commit/6281345c5393ede25781f98625c19a8ee70b2159), [`0121559`](https://github.com/TallyUI/tallyui/commit/01215594f7fd15414c91b1d9333b0b9c6ba53309), [`b32d1b4`](https://github.com/TallyUI/tallyui/commit/b32d1b476a1d9592d8441b097877c875a4ba1e7c), [`93ed2cc`](https://github.com/TallyUI/tallyui/commit/93ed2cc93704dbeb9d9842fade18c77a5e2ed820), [`bc0a224`](https://github.com/TallyUI/tallyui/commit/bc0a224dac666df2e62b0e1b38eaf0e15a7ad0f4), [`244bb46`](https://github.com/TallyUI/tallyui/commit/244bb46e51b4a85b0947049762bf8260893c4293), [`55ae68f`](https://github.com/TallyUI/tallyui/commit/55ae68fdc986aa655c09091eea93981904653ad9), [`402ec36`](https://github.com/TallyUI/tallyui/commit/402ec3608a1cbbdf75c3abd007105753cc54b2f9), [`a9a4525`](https://github.com/TallyUI/tallyui/commit/a9a452501b29ddaf86f270bbdda6949e35356506), [`350967d`](https://github.com/TallyUI/tallyui/commit/350967db9352b3e581522d63a62c5a7643fe7ac5), [`e3b8686`](https://github.com/TallyUI/tallyui/commit/e3b86868f5db11fbdba5302b40a6bbd9ce0f91f6), [`e7d3033`](https://github.com/TallyUI/tallyui/commit/e7d303348a24f9d7c042445f65b7f072dcd07f9d), [`ac2a24a`](https://github.com/TallyUI/tallyui/commit/ac2a24a147d1a759e7c5e28e73d0be90caa5e29b), [`787cada`](https://github.com/TallyUI/tallyui/commit/787cada220fa4f9d176a9052861a602dfaa61148), [`3e63452`](https://github.com/TallyUI/tallyui/commit/3e63452083b8c95212fe93555efe0d1f69e58f40), [`5bcabfb`](https://github.com/TallyUI/tallyui/commit/5bcabfbf55a823762a7ff58067437df412564bd8), [`d1bc892`](https://github.com/TallyUI/tallyui/commit/d1bc8920968d6545bc14567fa2a8b47e6706514a), [`12b7723`](https://github.com/TallyUI/tallyui/commit/12b7723041f2297c86525e2ddbab3f39d8bdfa1f), [`78cada7`](https://github.com/TallyUI/tallyui/commit/78cada7843c4a97bc5035e82d93ad91f8b90bd78), [`bc46d99`](https://github.com/TallyUI/tallyui/commit/bc46d9903af3641836ae32c906542789e510496d), [`fb6c2e3`](https://github.com/TallyUI/tallyui/commit/fb6c2e357448e24fad51020dccfca1b086ef47be), [`07e0198`](https://github.com/TallyUI/tallyui/commit/07e01985fec62060f984e9cfd58e78c6015141ce), [`8df0569`](https://github.com/TallyUI/tallyui/commit/8df0569d849f6099ec260eeb06e5c230172e12b5), [`38df38a`](https://github.com/TallyUI/tallyui/commit/38df38a0ac1325aa1089ae398d32362561aeeed8)]:
  - @tallyui/pos@2.0.0
  - @tallyui/core@2.0.0
  - @tallyui/primitives@2.0.0
  - @tallyui/theme@2.0.0

## 1.0.0

### Minor Changes

- [#4](https://github.com/TallyUI/tallyui/pull/4) [`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90) Thanks [@kilbot](https://github.com/kilbot)! - Initial npm release with build tooling

### Patch Changes

- Updated dependencies [[`4389cb4`](https://github.com/TallyUI/tallyui/commit/4389cb408d81c7857ede11f735b0666d69323c90)]:
  - @tallyui/core@0.2.0
  - @tallyui/theme@0.2.0
