# Standalone POS: plan

*Written 2026-09-28 for [ADR-066](../../DECISIONS.md). It answers Paul's
direction of the same day and follows [BRIEF.md](../../BRIEF.md) and the
[programme plan](../../plans/2026-09-programme.md): MVP first, testers
quickly, every step measured.*

> "There should be a version of a POS app that uses TallyUI without any
> backend at all, ie: it should just be a standalone desktop/ios/android
> app." (Paul, 2026-09-28)

## What it is

- **`apps/standalone`** in this monorepo: a point of sale with no server,
  no sign-in and no network. The device holds the only copy of the store's
  data.
- It is TallyUI's **reference app**. It has no platform of its own, so it
  lives here rather than in a platform repository (ADR-066 amends ADR-014
  for this one app).
- It is the **strongest test that `@tallyui/pos` is separable from any
  backend.** Anything the app cannot do without a server is a place where
  the pos layer assumes one.
- In the driver model of WCPOS `next` ADR 0029 (one driver per platform,
  the engine above it backend-agnostic), standalone is the **local-only
  driver**. ADR 0029 counts a seam as real only when it has two adapters;
  a driver with no server is the most different second adapter there is.
- **Storage:** RxDB Premium SQLite, one live instance per database
  (ADR-031, ADR-061). SQLite-wasm on opfs-sahpool on the web and in
  Electron's renderer; premium SQLite on native.
- **Platforms:** desktop through Electron, as `medusapos/apps/desktop` does
  (a single `main.js` around the web build); iOS and Android through Expo, as
  `medusapos/apps/expo` and this repo's `apps/demo` do. The web build is
  the first test target, because the others wrap it or share its code.

## Milestones: what a tester can do

Each milestone ships to testers when its acceptance passes. Figures marked
"target" are budgets to measure against, not measurements yet.

### M0: boot with a local catalogue seeded from a CSV

A tester can:
- install the app (web URL first, then a desktop build, then an Android
  build) and start it with the network off;
- run a first-start setup with no sign-in: store name, currency, whether
  prices include tax, and one or more tax rates;
- import a products CSV (name, SKU, barcode, price, tax rate, stock, and
  optional variant columns), or load the bundled sample catalogue;
- browse, search and scan (a keyboard-wedge scanner typing into search)
  exactly as in the platform apps;
- restart the app and find the catalogue still there, with no re-import.

Built from: the local driver's schemas, traits and `storeSettings` (see
[The local driver](#the-local-driver)); `createTallyDatabase` on premium
SQLite; `searchProducts`, `catalogueEntries` and `findEntryByCode`; a CSV
importer in the app.

Acceptance:
- Every CSV row is imported or reported with its row number and reason;
  0 rows dropped silently (unit tests over malformed, duplicate-SKU and
  duplicate-barcode files).
- Target: a 2,000-row CSV imports in under 10 s on web on the Mac mini, and
  a cold start with 2,000 products reaches a searchable catalogue in under
  3 s. Both measured and recorded in the PR.
- A cold start with the network disabled works (Playwright, offline
  context).

### M1: sell, tender, receipt, Z read, all local

A tester can:
- open a register session with a float, record cash in and cash out;
- build a cart with correct tax and discounts (line and order, pre-tax,
  ADR-062), take cash with change or record an external card payment, and
  split a tender;
- see an on-screen receipt with a short sequential number, and print or
  reprint it through the system print dialog, always with the same number;
- count the drawer, close the session with a Z read (manager approval over
  the variance threshold), and export the Z as CSV;
- see stock fall with every sale, and see past sales;
- save a manual full backup file (every collection, versioned, with a
  checksum) through the save dialog or share sheet;
- quit or crash mid-sale and lose nothing.

Built from: `useSale`, the tender reducer, the order builder,
`buildReceiptData`, `useRegisterSession` and the register screens
(ADR-032's next job 1, which standalone needs as much as medusapos), and
`useOrderOutbox` with the local driver's command transport, under the
[local transaction contract](#local-transaction-contract).

Acceptance:
- Playwright e2e on web, then the same suite on the Electron build: 25
  sales (discounts, split tenders, two movements), then a count and a
  close. The Z's sales total equals the sum of the 25 receipts to the minor
  unit; 0 orders left `pending`; each line's stock falls exactly once.
- **Fault injection at every write boundary** (Vitest, on SQLite and
  memory storage). A storage wrapper stops the sale at each write: the
  receipt-number reservation, the order insert, each stock movement
  insert, the cached-stock write, and the `applied` patch. The test then
  reopens the database, runs the startup repair and flushes. At every
  boundary: exactly one order (or none, if it stopped before the insert),
  each line's movement exactly once, cached stock equal to the figure
  recomputed from movements, and the receipt number unchanged on every
  read and reprint.
- The backup file holds every document of every collection: counts and
  ids match the database, and the checksum verifies.

### M2: local product and customer management

A tester can:
- add, edit and archive products and variants: name, SKU, barcode, price,
  tax rate, stock;
- adjust stock with a reason, and see the adjustments;
- add and edit customers, and attach one to a sale;
- re-import a CSV as an update keyed by SKU.

This is the first catalogue editing in TallyUI. The platform apps never
write the catalogue (it replicates pull-only, ADR-024), so the editing
screens stay in `apps/standalone` until a platform app needs them.

Acceptance:
- A price edited mid-shift applies to the next sale and not to parked or
  completed ones.
- A schema version bump on each local collection keeps 100% of locally
  authored documents (migration tests on SQLite and memory storage, like
  `pos_orders`' version 0 → 1 → 2 tests).

### M3: export, automatic backup and restore

A tester can:
- export sales, Z reads, products and customers as CSV;
- get an automatic daily backup (the M1 file format) to a folder on
  desktop;
- restore a backup on a fresh install or another device. Restore replaces
  the database; it never merges.

Acceptance:
- Backup, wipe, restore round-trips every collection (orders, sessions,
  movements, closures, products, customers, settings, and the register
  document's counters) with identical documents.
- A backup from a newer schema version is refused with a clear message.
- Target, measured on the Mac mini: 10,000 orders back up in under 5 s and
  under 20 MB.

### Later, or never: more than one till

Single instance (ADR-061) means one live database per device. A second
till is a second device with its own database, its own counters and its
own Z reads. Sharing a catalogue or sales between tills needs a server or
peer sync, which is what a connector is. The recommendation is **never
inside standalone**: a store that outgrows one till moves to a platform
(Medusa, Vendure or WooCommerce), and an M3 export that a platform import
can read is the bridge.

## What it reuses from `@tallyui/pos` unchanged

- **Money and tax:** `computeOrderTax`, `taxMicros`, `taxLinesByRate`,
  `TaxProvider`, `CurrencyProvider` (integer minor units, ADR-022; exact
  tax rounded once, ADR-037; several rates per line, ADR-040).
- **Orders:** `createOrderBuilder`, `allocateOrderDiscount`,
  `createOrderManager` (parked orders are already local), `finalizeOrder`,
  `posOrderCollection` / `addPosOrderCollection`, `sameSale`, `uuidv7`,
  `getDeviceId`, and the display totals (ADR-063).
- **Sale and tender:** `useSale`, `addEntryToCart`, `tenderReducer` and its
  helpers (quick amounts, even split).
- **Catalogue reads:** `searchProducts`, `catalogueEntries`,
  `findEntryByCode`, `variantPriceLabel`, `getProductStock` (falls back to
  the document when there is no stock overlay).
- **Receipt:** `buildReceiptData` (one optional field added, see H below).
- **Registers:** the whole of `register/`: `useRegisterSession`, the
  session store, movements, counts, `writeClosure`, the closure and X-report
  documents, `exportCsv`, the register document and its counters. It is
  already local-first ("Nothing is sent to any server", ADR-032 amendment 2).
- **Store settings:** `resolveStoreSettings` and `useStoreSettings`, fed by
  the local driver's `storeSettings`.
- **RxDB helpers:** `readFresh`, `countFresh`, `watchFresh`;
  `createRepository` for the M2 editing screens.
- **Logging:** `createLogger` and its sinks.

## Server assumptions in the pos layer, and what each becomes

Found by reading `packages/pos/src` and `packages/core/src/types/connector.ts`
on `origin/main` at `9408d3e`. "Local driver" means the local-only driver
satisfies the existing interface with a local implementation. "Explicit
optional" means the interface itself changes so the piece can be absent.

| | Where | What it assumes | With no server | Kind |
|---|---|---|---|---|
| A | `TallyConnector.auth` (required), `SignInResult`, `SyncContext.baseUrl` and `headers` (required); the outbox's `authRequired` after three 401s; `createHttpCommandTransport` | Every store has credentials, a base URL and auth headers | `auth: { type: 'none', fields: [], getHeaders: () => ({}) }`, no `signIn`; `SyncContext` with `baseUrl: 'local:'` and empty headers. Later, `auth` becomes optional in core | Local driver now; explicit optional later |
| B | `TallyConnector.sync.products: CollectionSync` (required, deprecated) | Every connector has the legacy fetch-by-ids sync | Returns empty lists. Removing the deprecated field is a cleanup already due | Local driver; removal later |
| C | Capabilities probe: `ServerCapabilities`, `resolveCapabilities`, `connector.capabilities()`; `finalizeOrder` throws on any discount when `capabilities?.orderCreate ?? 1` is below 2; `useSale.applyDiscount` returns `DISCOUNTS_UNSUPPORTED` | A server decides which `order.create` version a sale may use, and "unknown" means version 1 | **Discounts are blocked unless something advertises a version.** The local driver advertises `{ orderCreate: 3 }`: its handler accepts every version it knows. The `undefined` → 1 default stays, because it protects Medusa tills that have never read the value (ADR-062) | Local driver |
| D | Outbox: `useOrderOutbox` requires a `transport`, and it is also the order store (`record`, `isStored`, `recent`, the `orders` collection); `createOrderOutbox` backoff, `refused`, auth pause; `PosOrder.syncStatus` (`pending`/`applied`/`rejected`, indexed); `needsAttention` reads `rejected` and warnings | Saving an order and sending it are one thing, and a sale stays `pending` until a server answers | A local command transport applies each `order.create` in-process (next section) and answers `applied`, so orders leave `pending` in one flush. The target is to split the order store (`record`, `isStored`, `recent`) from the sending layer, so storing a sale never needs an outbox | Local driver now; explicit optional later |
| E | Replication and schemas: `ConnectorSchemas` are "server-owned, pull-replicated"; `createTallyDatabase` creates them through `connectorCollection`, whose **version bump drops every document** and resyncs; ADR-024 pull-only, and "a replicated collection must never take local writes" (#53) | The server holds the real copy of the catalogue, so local documents are disposable | **A drop is data loss**: the device holds the only copy. The local driver's collections are local-authoritative: real migration strategies, never the drop path. That needs an explicit per-collection option in `createTallyDatabase` (as `pos_orders` and `stock_levels` already stay off it) before any local schema reaches version 1. Until then a test pins them at version 0 | Explicit optional (core/database) |
| F | Reconcile and stock overlay: `reconcile.stock`, `ids`, `prices`, `calculatedPrices`; the `stock_levels` collection; `stockOverlay$`, `stockOverlayAsOf$` | Stock and prices drift on a server and are re-read | Absent. They are already optional; `getProductStock` reads the document when there is no overlay. Stock is written locally by the command handler | Already optional |
| G | Store settings: `connector.storeSettings(context, choice)`, read once after sign-in; the region/country/channel choice; `pricingContext` | The server owns currency, tax mode and tax rates | The local driver reads a local settings document written at setup (M0) and edited later. No choices are offered | Local driver |
| H | `PosOrder.serverRefs` (`orderId`, `displayId`, `totalMinor`), `warnings` (`total_mismatch`), `error`; the receipt prints `order.id` as its number | A server gives the order its human number | **One receipt number, minted once.** A `mintSaleNumber(host, storeKey, commandId)` on the register document reserves the next number under the sale's `commandId`, as `mintClosureNumber` reserves under the closure id, so a retried `complete()` (same `commandId`) gets the same number back. It is minted before the insert and stored on the order as an optional `receiptNumber`; the receipt and every reprint read it from the stored order, and the local handler copies it to `serverRefs.displayId`. `nextSaleCounter` (which increments on every call) is not used. The field rides ADR-065's pending `pos_orders` schema bump, so tills migrate once | Local driver, plus one optional `PosOrder` field |
| I | Register egress: sessions carry `pending_status`, `server_status`, `status_at`, `approver_token`, `server_expected`, `server_sales_count`; closures carry `server_closure_id`, and `unsynced_count` / `unsynced_total_minor` count orders whose `syncStatus` is `pending`; job c2 (the Z-posting command with the session stamp, movement retry and refusal, the server approval gate, the closure-rows hook paging the server over 92 days); `movement-input` mirrors the server's decimal grammar; `facts.ts` reserves outbox facts | A server will receive sessions, movements and Z reads and may approve or refuse them | Unused and inert: the register is already local-first. **One trap:** with no outbox at all, every order would count as unsynced on the Z. The local transport marks orders `applied` at once, so the Z shows 0 unsynced. Rule for c2: it is a layer on `useRegisterSession`, never a requirement inside it. Approval is local (`approvedBy`); ADR-032's residual window stays unreachable without c2 | Already optional (keep it so) |
| J | Identity: `storeKey` by convention "the connector id plus the base URL"; `deviceId` on every command envelope | A store is a URL | `storeKey` is `local:<uuid>`, minted at setup; `deviceId` unchanged | Local driver |
| K | Customers: `customer.create` / `customer.patch` commands (ADR-024); `ConnectorTraits.customer` optional | Customers are server records | A local customers collection for M2, local-authoritative like the catalogue | Local driver (M2) |

Not a server assumption: payments. `finalizeOrder` accepts cash and
external, and the terminal drivers are separate (ADR-033). Standalone
starts with cash and "card taken on a separate terminal".

## The local driver

A connector package (proposed `@tallyui/connector-local`, under
`connectors/local`) that implements `TallyConnector` with no network:

- **Schemas and traits** for products (with variants and barcodes),
  customers and settings, shaped for local authoring. The traits give the
  same `ProductTraits` every component already reads.
- **`storeSettings`** from the local settings document; **`capabilities`**
  returns `{ orderCreate: 3 }`; **`auth`** is `none`.
- **A local command transport** (`CommandTransport`) that applies each
  `order.create` envelope in-process under the contract below: it writes
  one stock movement per line, recomputes cached stock, sets `serverRefs`,
  and answers `applied`.
- **No `replication`, no `reconcile`.**

### Local transaction contract

RxDB has no transaction across collections, so the sale is made safe by
ordering and idempotent writes rather than by a transaction.

1. **The `pos_orders` insert is the commit point** (`useOrderOutbox.record`).
   Before it, the sale does not exist; only its receipt-number reservation
   may. After it, the sale exists, is `pending`, and must reach `applied`.
   Nothing else is written for the sale before the insert.
2. **Applying a sale**, in order, each step idempotent:
   1. Read the stored order by id (`readFresh`). If it is already
      `applied`, answer `applied` with its stored `serverRefs`.
   2. Insert one stock movement per line, with id `<commandId>:<lineId>`
      and the line's product, variant and negative quantity. An existing id
      with the same content counts as written.
   3. Recompute each affected product's cached stock as its base stock
      plus the sum of its movements, and write that figure. **Cached stock
      is always recomputed from movements, never incremented.**
   4. Answer `applied` with `serverRefs` `{ orderId: id, displayId:
      receiptNumber, totalMinor }`; the outbox patches the order.
3. **Replay of a partially applied sale.** A stop anywhere between the
   insert and the `applied` patch leaves the order `pending`. The next
   flush runs step 2 again: movements already written collide and are
   skipped, missing ones are written, and step 2.3 recomputes from what is
   there. Each line is counted exactly once, however many times the sale
   replays.
4. **Startup repair.** Before the outbox starts, the app recomputes cached
   stock from movements for every product with movements (2,000 products
   is the figure to measure), so a stop between steps 2.2 and 2.3 never
   leaves a wrong figure on screen. M2's stock adjustments are movements
   too, so the rule covers every stock write.
5. **Errors.** A transient storage error (a failed write, a storage worker
   timeout, a stall reported by ADR-061's watchdog) returns `retry`, and
   the outbox backs off with the order still `pending`. `refused` is only
   for envelope faults that a replay cannot fix: a malformed envelope, an
   unsupported version, or a movement id already holding different
   content. The transport never returns `unauthorized`.

The driver is also a fit for ADR-027's in-browser demo: a seeded local
store is the simulated backend that demo needs.

## Dev and test setup on the Mac mini

- **Worktree and install:** a worktree of `~/Projects/tallyui`; `RXDB_PREMIUM`
  in the git-ignored `.env` at the root (ADR-031, ADR-044); `pnpm install`.
- **Web:** `pnpm --filter @tallyui/standalone web` (Expo web on Metro),
  scaffolded from `apps/demo`'s Expo and Uniwind setup rather than grown
  from that app. `apps/demo` stays the connector showcase against
  `apps/mock-api`.
- **Desktop:** an Electron shell shaped like `medusapos/apps/desktop`
  (Electron 35 and a single `main.js`). The renderer runs the web build, so
  SQLite-wasm on opfs-sahpool runs in Electron's Chromium as on the web.
- **Tests:** Vitest for the local driver and the importer, including
  contract tests that drive `createOrderOutbox` with the local transport;
  migration tests on SQLite and memory storage; Playwright
  (ADR-017) for M0–M3 acceptance on web and Electron. **No dev store is
  needed**, so the whole e2e suite runs in CI with no backend.
- **Native toolchains, checked on 2026-09-28:** only the Command Line Tools
  are installed (no Xcode, no simulators), and there is no Android SDK, no
  `adb` and no Maestro.
  - Android: the SDK command-line tools, an emulator image and Maestro
    install from Homebrew under the machine's own authority.
  - iOS: full Xcode needs an Apple ID sign-in to download, the one step
    that may need Paul. EAS Build in the cloud is the alternative, and it
    needs an Expo account.
  - So the order is web, then Electron, then Android, then iOS.

## Risks

1. **The device is the only copy.** A lost laptop or a cleared browser
   store loses the business's records. Mitigations: the Z CSV export and
   the manual full backup file in M1 (in M2 at the latest), the automatic
   daily backup in M3, and a visible "last backup" date. Web storage can be evicted: request persistent
   storage and say plainly that the web build is for trying the app.
2. **The schema drop path (E).** One version bump through
   `connectorCollection` would wipe a tester's catalogue. The option in
   `createTallyDatabase` and a pinned-version test must land before any
   local schema moves off version 0.
3. **Double stock decrement on replay (D).** Handled by the local
   transaction contract: `<commandId>:<lineId>` movement ids and cached
   stock recomputed, never incremented. M1's fault-injection tests at every
   write boundary are the proof.
4. **Shims hardening into design.** The local driver's `none` auth,
   advertised capabilities and in-process transport make M1 possible with
   no pos changes, but they hide the assumptions they work around. Each
   shim in the table has a follow-up (optional `auth`, the order store split
   from the outbox, removing `sync`), sequenced after M1 and tracked in the
   programme backlog. The follow-ups are additive: each keeps today's
   exports and behaviour (`useOrderOutbox` stays, composed from the new
   order store), ships with a changeset, and leaves medusapos and
   vendurepos working unchanged on the new release.
5. **Scope creep toward a platform.** Catalogue editing, customers and
   backup are real features with no server behind them. The line: standalone
   gets what one till needs; anything multi-till goes to a connector.
6. **Electron storage location.** opfs-sahpool data lives in Electron's
   profile directory; an app update or a changed `userData` path must not
   orphan it. Pin the path, and cover an upgrade in the Electron e2e.
7. **Fiscal and legal.** A standalone till with no server has no second
   record of sales. Z reads and exports are the record. Fiscal rules
   (tamper-evident journals and the like) vary by country and are out of
   scope for the MVP; testers are told so.

## First jobs (one small spec each)

1. `connectors/local`: schemas, traits, `storeSettings`, `capabilities`,
   `none` auth, empty `sync`; unit tests.
2. `createTallyDatabase`: a per-collection local-authoritative option with
   migration strategies, and a test that such a collection is never
   dropped on a version bump.
3. `apps/standalone` scaffold (web), setup screen, CSV import, catalogue
   screen: M0.
4. The local command transport under the local transaction contract,
   the startup repair, and the fault-injection tests at every write
   boundary.
5. `mintSaleNumber` and the optional `receiptNumber` on `PosOrder` (with
   ADR-065's `pos_orders` bump), the receipt reading it from the stored
   order, the sale and register screens wired, and the M1 Playwright
   suite; then the Electron shell.
6. The manual full backup file (M1, M2 at the latest).
