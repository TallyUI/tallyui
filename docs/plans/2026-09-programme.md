# TallyUI programme plan: September 2026

*Written 2026-09-23 by the TallyUI programme lead. It answers
[BRIEF.md](../BRIEF.md) and feeds [DECISIONS.md](../DECISIONS.md). Part 1
is the discovery, Part 2 the plan, Part 3 the decisions that need Paul.*

**Read this first (the short version)**

1. **Medusa first, Vendure second, Shopify not as a POS.** Shopify's API
   Terms (§2.3.18, updated 2026-02-27) forbid an alternative checkout, or
   registering its transactions through the API, without Shopify's written
   permission. Medusa has the best sync-ready API (for example,
   `with_deleted=true` on every list route) and a live domain. Vendure has no
   POS at all today.
2. **TallyUI's core is sound, but it isn't ready to carry a POS yet.** Build,
   typecheck and 951 of 951 tests pass. But connectors cover products only.
   The database cannot be created in a production build (RxDB error DB9).
   Push errors silently revert local edits. The transactional path (cart,
   order, tax) still runs on WooCommerce-shaped float prices.
3. **The sync engine is a protocol plus a conformance suite, not a port.**
   We take WCPOS's proven *pattern*: a checkpointed change feed with
   tombstones, client UUIDs, a durable outbox of idempotent commands, and
   "politeness" budgets. TallyUI defines it once as the TallyUI Sync
   Protocol, on RxDB's free replication protocol over HTTP + SSE. Each
   backend passes the same conformance suite through a thin server plugin,
   which shares about two-thirds of its code in `@tallyui/sync-server`.
   WCPOS's *engine code* stays where it is. It is WooCommerce-shaped by
   design (WCPOS ADR 0029) and uses the paid RxDB premium storage. RxDB's
   own server package is SSPL, and ElectricSQL, PowerSync and Zero bypass
   the platforms' business logic.
4. **Every milestone has numbers.** Examples: initial sync time, zero lost or
   duplicated orders across 1,000 fault-injected replays, and the line count
   of a new backend.
5. **Decisions (Part 3), all ruled on 2026-09-23:**
   - D1: Shopify is paused.
   - D2: RxDB Premium with SQLite storage, like WCPOS.
   - D3: port the neutral payments, tender and register logic; copy the
     printer, scanner and receipt packages only when needed.
   - D4: the business model is deferred. For now, hardware drivers stay out
     of public MIT repos.
   - D5–D7: as recommended.
6. **MVP first** (§2.2): the shortest path to a Medusa POS that real people
   can test by selling offline and seeing the order land. **Testable by
   Friday 2026-10-02; committed by Tuesday 2026-10-06.**

---

# Part 1: Discovery

Evidence was gathered 2026-09-23 by read-only research agents, and I checked
the load-bearing claims myself (marked ✔).

## 1.1 TallyUI today (origin/main 5212a8d)

**Health.**
- `pnpm install --frozen-lockfile` passes (16 s).
- `pnpm build` passes (13/13 tasks, 1 m 42 s).
- `pnpm typecheck --force` passes (13/13, 52 s).
- `pnpm test --maxWorkers=2` passes: **111 files, 951 tests, 0 failures**,
  2 m 11 s. 109 s of that is jsdom environment setup.
- CI is green on main.
- Two `*.test-d.ts` type tests never run, because vitest is not given
  `--typecheck`.
- Tests grew from 238 (PR #1) to 951 (today).

| Workspace | src lines | test files | State |
|---|---|---|---|
| core | 544 | 3 | Connector contract, traits, Money. Products only; no order, cart, tax or payment types |
| database | 160 | 2 | `createTallyDatabase`, `getStorage`, `startReplication`. **Throws DB9 in production** ✔ (`create-db.ts:58`) |
| storage-sqlite | 1,208 | 3 | Own RxStorage over expo-sqlite. Not atomic, synchronous only, never run on real SQLite |
| primitives | 7,699 | 32 | Headless UI. Web popover positioning is a stub. **`private`, yet components import it** |
| theme | 8 + 113 CSS | 0 | Tokens. 23 stale class uses in components |
| components | 4,720 | 44 | About 80 components. Product display is neutral; cart, checkout and register are not |
| pos | 1,072 | 13 | Order builder, tax, receipt data. Float money, discount after tax, no finalise or push |
| connector-medusa | 692 | 3 | Most mature: sound `pass_max` checkpoint, proven on 2,005 real products |
| connector-woocommerce | 472 | 2 | Primary key `uuid` missing from real WooCommerce; ties dropped at the checkpoint |
| connector-vendure | 615 | 2 | Calls `/admin-api` but the mock serves `/shop-api`; push input invalid; paging skips |
| connector-shopify | 495 | 2 | REST 2024-01 (out of support); checkpoint unsound |
| mock-api | 3,344 | 7 | Live at mock.tallyui.com. Its HTTP routes are not exercised by any test |
| demo / web | ~7.5k / ~3k + 110 MDX | 0 | Expo showcase / Fumadocs docs site on Vercel |

**Sync today.**
- A `ReplicationAdapter` per connector runs over RxDB `replicateRxCollection`.
  None has a live stream, and nothing calls `startReplication`.
- **No conflict handler exists anywhere.** On any HTTP or network error, all
  four push handlers return `assumedMasterState` as a fake conflict ✔
  (`connectors/woocommerce/src/replication/products.ts:78-87`). A transient
  outage therefore silently reverts the cashier's edit, and a failed create
  is dropped.
- Pulls never report deletes.

**Neutrality leaks**, measured against the yardstick "would a Woo, Medusa or
Vendure POS use it unchanged?":
- `ProductTraits` still *requires* the deprecated WooCommerce trio
  (`getPrice` string, regular/sale, `instock` enum) at
  `core/src/types/traits/product.ts:45-70`.
- `pos` prices orders with `parseFloat(getPrice())`
  (`order-builder.ts:159-160`) and keeps money in floats.
- Components hard-code `'$'`, `toFixed(2)`, US cash denominations and
  WooCommerce order statuses.

**Distribution.**
- npm holds only the 2026-02-25 releases. The Release workflow has been
  disabled since 2026-02-26, and nine changesets are pending.
- `@tallyui/primitives` is not published (it returns 404), so
  `@tallyui/components` cannot install cleanly. The Expo Snack demos in the
  docs therefore show February code.
- The repo is public but has **no LICENSE file** ✔, although every package
  manifest declares MIT.

## 1.2 medusapos, medusa-dev and the two domains

- **`medusapos/app`** (`~/Projects/medusapos`):
  - A pnpm/turbo monorepo: an Expo 54 app, plus an Electron shell whose build
    is a TODO.
  - `main` holds nine commits of a sample-data register that, per PR #3,
    never compiled.
  - Draft **PR #3** (+24,953/−874, 80 files, no CI, no tests) carries the
    Medusa dev store and a product-lookup app that replicates the store into
    RxDB. The code moved there from TallyUI under ADR-014.
  - It consumes TallyUI through `file:../tallyui` overrides, because the npm
    packages are stale and primitives is unpublished.
- **`medusapos/web`**: Next 16 + Fumadocs, deployed to Vercel on 2026-02-26
  with placeholder docs.
- **`~/Projects/medusa-dev`**: a deployed copy (not a git repo) of the store.
  - Medusa 2.21.0, Postgres 17, Redis. Healthy right now on 127.0.0.1:9000.
  - Seed: 2,005 products, 5,655 variants, 2,083 customers, 300 orders,
    1 region, 1 sales channel, 1 stock location.
  - Its CORS allows only localhost:8000 and 8081.
- **medusapos.com**:
  - Vercel, HTTP 200. The page says "Open source, modular point of sale for
    MedusaJS" with a Beta badge.
  - Its **"Live Demo" button points at demo.medusapos.com, which has no DNS
    record, so the demo link is dead.**
  - The page has no `<title>` and no meta description.
  - Registrar is Squarespace; the domain expires 2027-07-01.
- **vendurepos.com**:
  - The Squarespace "Coming soon" parking page, set to noindex.
  - Expires 2027-02-25.
  - There is no `vendurepos` GitHub org, no repo and no dev store.
- **tallyui.com**: the docs site on Vercel, deployed from main today.

## 1.3 WCPOS sync engine (main = 1.10.x release; `next` = 2.0 target)

**What it is.**
- A hand-built RxDB engine (`@wcpos/sync-core`, `@wcpos/sync-engine`,
  private workspace packages in the MIT monorepo).
- It does not use `replicateRxCollection`.
- It runs one database per `{site, store, cashier}`.
- Storage in the 1.10 release is rxdb-premium 17.4.0's OPFS/filesystem
  engine. **That engine is being retired** after repeated durability and
  corruption problems (monorepo#2137): web moves to SQLite-wasm
  (`opfs-sahpool`, WAL mode, one live tab), and native and Electron are
  choosing between SQLite-based candidates. Six of the seven local premium
  patches go with it.

**Pull: pointers, not payloads.**
- The WooCommerce plugin keeps an append-only journal
  `{sequence, type, id, deleted, revision}`, fed by about 30 hooks.
- Clients poll `changes/tick`, which returns 304 when nothing changed, then
  drain `changes/sequence-log` and re-fetch the changed ids with `include=`.
- The checkpoint is `{since, head, epoch, horizon}`. If a register falls more
  than 5,000 rows behind, it re-baselines instead of replaying.

**Partial, demand-driven replicas.**
- Nothing is fully synced by default. Screens declare what they need (the
  "require plane"). Catalogues grow in 100-row browse windows, and idle
  "trickle" lanes fill the rest.
- Measured budgets: an audit of 10k local rows takes 68 ms; a bulk apply of
  10k products takes 9 ms.

**Deletes and drift.**
- Journal tombstones, a missing id in an `include=` response, and explicit
  absence digests.
- Per-object 64-bit digests, compared bucket by bucket, catch writes that
  bypassed the hooks.

**Push.**
- A durable mutation queue: coalesced, leased for 60 s, retried with backoff
  from 1 s up to 60 s, never dropped.
- Each push carries `Idempotency-Key: mutationId` and `If-Match: baseRevision`.
  The revision is a sha256 of canonical JSON. A mismatch gets 409 with the
  server's copy, and the row parks as *conflicted*.
- Orders auto-rebase once.
- A pull never overwrites a record that still has pending local writes.

**Identity.**
- The client mints a UUID primary key and never re-keys it. The server id is
  kept as an opaque `remoteId`.
- UUIDs sit on orders *and* line items, which prevents line duplication on
  full-document pushes.

**Offline.**
- Browse, cart, scan and receipts work offline.
- On `next`, cash and recorded tenders complete offline inside a payment
  ledger. The server holds stock on a paid create, and refuses overpayment
  with `order_already_paid`.

**Hard-won lessons**, from the WCPOS politeness ADR of 2026-08-11:
- One incident was a 577-request burst; another sent 41 requests totalling
  1.2 MB at every store open.
- The rules that followed: cost scales with change, not with catalogue
  size; there is a request cap per lane per tick; maintenance runs after the
  first screen; and the engine backs off under server pressure.

**Stable across main and `next`:**
- The protocol, change feed, mutation queue, idempotency, compare-and-swap,
  UUID identity and politeness rules.
- Hardware: `@wcpos/printer` (ESC/POS, 10+ transports), `@wcpos/scanner`,
  and the receipt schema and renderer.

**In flux:**
- Storage. The direction is settled: SQLite everywhere, replacing the OPFS
  filesystem engine. Web is decided: SQLite-wasm; it passed the conformance
  tests (#2138), survived 10 of 10 crash kills (#2144) and met the speed gate
  (#2143). Native (#2091) and Electron (#2149) have not yet picked an
  implementation. All the SQLite candidates are still premium RxDB storage.
- The orders feed shape (protocol 3), cart ownership (ADR 0030), and the
  component library (UI overhaul, roadmap#282).

**New on `next` and worth porting:**
- Payments contract v1.1: a method descriptor and an N-row payment ledger.
- The payment-driver harness: `PaymentDriver` with discover, connect,
  collect, cancel and `status$`.
- The pure tender reducer, with split plans, keypad and change.
- Register sessions, cash movements and X/Z closures, all in integer minor
  units.
- Fiscal sale-time provenance, the WebRTC customer display, and the slot
  registry.

**Not portable:**
- `order-math`: WooCommerce tax and coupon parity by design.
- The WooCommerce sync lanes, and the GPL-3 PHP server code (we re-implement
  from the wiki contracts).
- Pro's private terminal handlers, and anything rxdb-premium.
- WCPOS explicitly keeps its document model WooCommerce-shaped (ADR 0029
  §5), and no WCPOS roadmap item plans a backend abstraction or package
  extraction. **TallyUI must own the neutral model; it cannot wait for
  WCPOS to converge.**

**Backend capability contract** distilled from WCPOS. Every backend must
provide these:

| # | Capability | Required? |
|---|---|---|
| C1 | Monotonic change feed with tombstones and `{head, epoch, horizon}` | Required |
| C2 | Batch fetch by id that reveals absence | Required |
| C3 | Sorted, filtered, paged listing with a total | Required |
| C4 | Client UUID stored on the record *and* its line items, with lookup by UUID | Required |
| C5 | Deterministic revision, with compare-and-swap on update and delete | Required |
| C6 | Idempotent mutation endpoint keyed by mutation id, deduplicating creates by UUID | Required |
| C7 | Server search by SKU, barcode and text, including flat variant search | Required |
| C8 | Auth with refresh and revocation | Required |
| C9 | Accepts offline orders: client `created_at`, stock hold, refuses overpayment | Required |
| C10 | Store or channel scope on every call | Required |
| C11 | Cheap no-change poll (ETag/304) | Advised |
| C12 | Integrity digests as a backstop | Advised |
| C13 | Load signal and `Retry-After` | Advised |

## 1.4 Platform APIs for a POS (Medusa v2.21.1, Vendure v3.7.3, Shopify Admin 2026-07)

| Need | Medusa | Vendure | Shopify |
|---|---|---|---|
| SKU / barcode lookup | Good: variant filters `sku`, `barcode`, `ean`, `upc`, plus `q` | Workable: `sku`; barcode needs a custom field | Good: `query:` |
| Paging / max page | Offset / **no max** | Offset / 1,000 (admin) | Cursor / 250, cost-limited |
| Change filter | `updated_at[$gt]` | `updatedAt.after` | `updated_at:>` |
| **See deletions** | **`with_deleted=true` on every list** | None: needs a plugin | `deletionEvents` |
| Push / events | Subscribers (no webhooks) | EventBus (no webhooks) | Webhooks |
| Create a POS order | Draft order → convert → mark-as-paid | Draft order → `addManualPaymentToOrder` | `orderCreate` |
| Client id / back-dating | Metadata only | `OrderCodeStrategy`, custom fields | `sourceIdentifier`, `processedAt` |
| Order idempotency | None (per cart only): plugin | None: plugin | None on `orderCreate` |
| Stock update | Absolute: delta needs a plugin | Absolute: delta needs a plugin | Delta + compare-and-swap + `@idempotent` |
| Cash / split payments | `pp_system` provider, many sessions | Many payments per order | **Policy blocker** |
| Card-present terminal | Custom provider | Custom handler | Shopify POS only |
| Machine auth | Secret key (Basic only) | API keys (v3.6+), channel-scoped | Offline token |
| Staff roles | **RBAC is Enterprise-licensed**: we build cashier permissions ourselves | Channel roles + custom permissions | Gated |
| Our plugin licence | MIT fine | MIT fine (GPL plugin exception) | API Terms apply |
| Existing POS | Agilo starter (online only, last push Jan 2026) | **None** | Shopify POS + licensed integrators |
| **Verdict** | **Viable, first** | **Viable, second** | **Blocked as a POS** |

**Shopify** ✔ (clauses checked against shopify.com/legal/api-terms, last
updated 2026-02-27):
- §2.3.18 forbids "an alternative to Shopify Checkout for checkout or payment
  processing for Shopify Merchants, or register any transactions through the
  Shopify API in connection with such activity" without express written
  authorisation.
- §2.3.10 forbids using the API to "substantially replicate products or
  services offered by Shopify".
- App Store requirement 1.1.8 rejects apps that connect to an outside POS.
- The only sanctioned route is POS UI extensions, which run inside Shopify's
  own POS.

**Server plugin work per platform** (all of it, not only sync):

| Platform | Server plugin work |
|---|---|
| Medusa | Change journal and feed; idempotent POS order route (draft → convert → paid); stock delta route; cashier actor and permissions; Stripe Terminal provider |
| Vendure | Tombstone feed; keyset checkpoint query; barcode custom field; idempotent order import; stock delta; cashier permissions and Dashboard extension |

Both are Node/TypeScript. The journal, idempotency store and revision hashing
can be one shared, framework-agnostic library.

## 1.5 RxDB replication and conflict-resolution options

**Licences** (checked in the npm tarballs; RxDB 17.5.0 is the latest, and
TallyUI pins 16.21.1):

| Piece | Licence / status | Usable in an OSS library? |
|---|---|---|
| RxDB core, replication protocol, replication-graphql and -websocket, CRDT plugin, leader election, Dexie / memory storage | Apache-2.0 | Yes |
| SQLite storage in the core package | Trial only: 500 documents, no indexes | No |
| rxdb-premium (IndexedDB, OPFS, SQLite, worker, sharding, encryption) | Paid, from US$99 a month. Code decrypted at postinstall with a key | No (only as an app-level option) |
| rxdb-server ("RxServer") | **SSPL** | No |

**Hard limit.** Open-source RxDB 17 caps open collections at **13**,
counted across all databases in the realm (16 in v16). TallyUI must stay at
11 or fewer.

**Server-side options, compared:**

| Option | Verdict | Why |
|---|---|---|
| RxServer inside a Medusa or Vendure plugin | **No** | Its source of truth must be a server-side RxDB collection, so we would mirror the platform's data and bypass its workflows. It is also SSPL, and had several security fixes in 17.2–17.5 |
| replication-graphql (for Vendure) | **No** | Vendure has no native GraphQL subscriptions (issue #2369, milestone 3.8, pre-release only). It would also split the client transport between the two platforms |
| replication-websocket | **No** | Same "server must be RxDB" problem |
| ElectricSQL, PowerSync, Zero, Debezium/CDC reading the platform's Postgres | **No** as the core | They need `wal_level=logical` and a replication role, which managed hosts often refuse. They bypass channel, price-list, tax and visibility logic, couple us to private tables, and do nothing for Shopify. Zero 1.0 also *rejects writes while offline*. PowerSync's service is FSL and replaces RxDB |
| Replicache, Triplit, cr-sqlite, Prisma Pulse | **No** | Maintenance mode, AGPL and stalled, dormant, and discontinued respectively |
| **RxDB replication protocol with our own HTTP + SSE endpoints** (RxDB's documented "replication-http" pattern) | **Yes** | Apache-2.0, small and well specified. The server plugin reads and writes through the platform's own services |

**Why `updated_at > checkpoint` alone loses rows:**
- Transactions commit out of order, so a row stamped earlier can land after
  later rows were pulled.
- Several rows can share one timestamp.
- Postgres keeps microseconds but JavaScript truncates to milliseconds.
- Several app servers stamp from their own clocks.

The current connectors show these failures: Vendure's pull skips rows
(paging and a moving bound together); ties drop at the WooCommerce and
Vendure checkpoints; and Medusa's offset paging skips a row when something
is soft-deleted mid-pass.

Two sound designs exist:
- **The WCPOS journal:** a monotonic sequence plus epoch and horizon.
- **A keyset `(updated_at, id)` capped by a Postgres high-water mark:**
  `min(now() − 2 s, oldest open xact_start − 1 s)`, with timestamps sent as
  microsecond text. A trigger-fed change table read below
  `pg_snapshot_xmin` is the stronger variant.

**Two more RxDB behaviours that shape the design:**
- **A short page ends a pull.** RxDB stops pulling when a page comes back
  short, so a server must never return a short page mid-stream (for
  example, by filtering after `LIMIT`).
- **Events are only hints.** Medusa's event bus publishes only after the
  workflow finishes, and has no pricing events. Vendure's EventBus
  publishes after commit, in process, with no replay. Shopify's webhooks
  are unordered and not guaranteed. So events are wake-up hints and never
  the change log.

**Local measurement.** RxDB 16.21.1 on Dexie in headless Chromium 145 on
this Mac mini, with 1.3 KB product documents:
- Pull replication of 10k documents took **15 s** at batch size 100 (665
  documents per second). The same case measured 82 s on another run, so the
  environment is noisy.
- `bulkInsert` slows as the store grows: 10k in 32 s, 25k in 94 s, 50k in
  313 s.
- An indexed `findOne` takes about 3 ms at any size. An unindexed sorted
  list query takes 4.1 s at 50k.
- Controls: raw Dexie is 3–20× faster than RxDB on Dexie, and RxDB on memory
  storage does 44k documents per second. So storage is the bottleneck, not
  RxDB core.
- RxDB's own published Dexie figures are about 10× better than these.

**Conclusion:** measure on real POS hardware before fixing page sizes, and
plan for "minutes, not seconds" at 100k products on free web storage. That
number is what decides D2.

**Browser quotas.** Chromium allows about 80% of free disk, Firefox about
2 GB, and Safari/iOS about 1 GB with eager eviction. Call
`navigator.storage.persist()`.

---

# Part 2: The plan

## 2.1 Architecture decisions taken here (logged as ADR-020 to ADR-026)

These are within the programme lead's remit. Each is logged in
DECISIONS.md, and Paul can overturn any of them.

1. **Platform order: Medusa, then Vendure; Shopify parked** until Paul
   decides (D1).
2. **TallyUI owns a neutral transactional model.** Orders, line items,
   payments, register sessions and closures are TallyUI documents, templated
   on WCPOS `next`'s payments contract with opaque string ids and integer
   minor-unit money. Connectors map *out* to the platform on push. This is
   the reverse of WCPOS ADR 0029, and it is deliberate. The catalogue
   (products, variants, customers) stays connector-native and is read
   through traits (ADR-002).
3. **Money is integer minor units everywhere** (`core` `Money`). Floats are
   removed from `pos` and components.
4. **The sync contract is the TallyUI Sync Protocol (TSP): HTTP + SSE,
   specified once and tested by a conformance suite.**
   - Endpoints: `manifest`, `pull/:collection` (opaque checkpoint,
     tombstones included), `commands` (a batch of idempotent commands),
     `stream` (SSE hints plus `resync`), and `ids/:collection` (for
     reconciliation).
   - The checkpoint is **opaque**, and the suite tests the *guarantee*, not
     the mechanism: no missed rows under out-of-order commits,
     same-timestamp ties or deletes. A plugin can start with the
     high-water-mark keyset and move to a WCPOS-style journal without any
     client change.
   - `@tallyui/sync-protocol` holds the zod types and the conformance suite.
     `@tallyui/sync-server` is a framework-agnostic Node library: checkpoint
     codec, keyset and high-water-mark SQL behind a `SqlExecutor`,
     idempotency ledger, SSE hub and command router. It is about 60–70% of
     the server code.
   - Each platform's thin plugin (in that platform's repo, per ADR-014)
     wires these into Medusa or Vendure and writes only through the
     platform's own workflows and services.
   - "How small is a new backend?" becomes a number: plugin lines of code
     plus days to a green conformance run.
5. **Reads go through RxDB pull-only replication. Writes go through a
   durable command outbox.** This is the WCPOS pattern on RxDB's free
   protocol.
   - Catalogue, prices, stock levels, tax and config are server-owned and
     pull-only.
   - POS facts go through the outbox, which is leader-elected and keyed by
     UUIDv7 as the idempotency key. The commands are `order.create` (with
     as-sold prices, tax lines, payments, cashier and register),
     `stock.adjust` (deltas only, never absolute values), and
     `customer.create` / `customer.patch` (a field-level merge against a
     base value).
   - The server assigns ids; the client UUID is echoed back.
   - Displayed stock is the server level minus unacknowledged local deltas.
   - A pull never overwrites a record with pending commands.
   - We start with full replicas scoped to the POS channel and location.
     WCPOS-style demand-driven partial replicas come only if the M2
     benchmark misses its budget.
   - Storage is RxDB premium SQLite (D2, Paul). Premium lifts open-source
     RxDB's cap of 13 collections, but we still keep collections few.
   - `multiInstance: true` with leader election, so only one tab syncs.
6. **Transport errors are retried, never turned into conflicts.** A command
   is only *rejected* on an explicit server refusal, and it then goes to a
   visible "needs attention" queue, as in WCPOS's dead letters. Product push
   is removed: the POS never writes catalogue documents.
7. **TallyUI is MIT.** A LICENSE file is added to match the package
   manifests.

## 2.2 MVP first (re-sequenced 2026-09-23)

**Overriding priority** (Paul, 2026-09-23): the shortest path to a minimal
viable Medusa POS that real people can test. Everything in §2.3 that a
tester doesn't need is deferred until after this.

**The MVP, defined by what a tester can do:**
1. Open the hosted POS web app, enter their Medusa backend URL, and log in
   as a Medusa admin user (native email/password auth, so no secret key
   sits in the browser).
2. The catalogue syncs. Search, or scan a barcode with a keyboard-wedge
   scanner, which types into the search box and needs no driver.
3. Build a cart with correct totals: integer money, and the region's tax.
4. Take cash (or record an external card payment), and see the change and
   an on-screen receipt that prints through the browser.
5. Do all of this with the network off; orders queue.
6. Reconnect, and every queued order lands in Medusa Admin **exactly
   once**: at the POS prices, marked paid, with stock decremented.

**MVP acceptance:**
- Playwright e2e on web against medusa-dev: 25 sales, 20 of them made
  offline, produce 25 orders in Medusa with 0 duplicates. Totals match to
  the cent, and stock drops by the quantities sold.
- Outbox fault test: 200 randomised replays (dropped, duplicated and
  timed-out requests, and a reload mid-send) end with 0 lost and 0
  duplicated orders.
- Initial sync time for the 2,005-product catalogue is measured and
  reported. It is not a gate.
- One tester outside this machine completes a sale against their own Medusa
  2.21 store, following only the quick-start doc.

**MVP scope** (about 20 Codex jobs and one spike):

*TallyUI:*

| Work | Jobs |
|---|---|
| Job 1 (DB9, PR #14), Job 2 (pull-only products), Job 3 (benchmark) | In flight |
| `pos` on `Money`: order builder, tax, receipt data | 1–2 |
| Cart and checkout components on `Money`, with the currency from the trait context | 1 |
| Minimal neutral `PosOrder` document and schema (ADR-021): lines, tax lines, cash and external payments, client UUIDv7, `created_at`, register id | 1 |
| Command outbox: an RxDB collection plus a processor with backoff and a "needs attention" state. `order.create` uses the TSP `commands` envelope, so it is not throwaway | 2 |
| Medusa connector: map `PosOrder` to the `order.create` payload | 1 |
| Publishing: make primitives publishable, re-enable Release, align versions, add LICENSE. The hosted app needs TallyUI from npm | 1–2 |

*medusapos/app:*

| Work | Jobs |
|---|---|
| Add CI, then merge PR #3 (ADR-029) | 1 |
| **Spike first:** on medusa-dev, confirm that a draft order keeps as-sold `unit_price` and how tax is applied on convert | Spike |
| Medusa plugin: a ledger table plus migration, and `POST /tally/v1/commands` handling `order.create` idempotently (ledger → draft order at as-sold prices → mark paid → convert) | 2–3 |
| POS screen: product grid and search, cart, cash tender, receipt, a pending-orders indicator, and the login screen | 3–4 |
| Offline e2e test | 1 |
| Hosting: an Expo web static export on Vercel (a `*.vercel.app` URL first, then app.medusapos.com), plus a quick-start doc (plugin install, CORS, login) | 1 |

**Cut from the MVP (deferred, not dropped):**
- **From M0:** the RxDB upgrade (Job 4, now aligned with WCPOS under D2);
  removing the deprecated traits; the discount-before-tax fix (the MVP has
  no discounts); theme-token drift; the `test-d` type tests; all
  `storage-sqlite` work (superseded by D2).
- **From M1:** the conformance suite, the `@tallyui/sync-server` package,
  the TSP pull, stream and ids endpoints, the high-water-mark checkpoint,
  SSE, and the 1,000-replay harness (the MVP keeps a 200-replay outbox
  test).
- **From M2:** plugin pull routes; separate prices and stock collections;
  tombstones; a cashier actor with permissions (MVP testers log in as a
  Medusa admin user); `stock.adjust`; customers (guest sales only); the
  20k-product gate. Pulls stay on the existing Medusa Admin API adapter.
  *Known MVP limitation:* a product deleted in Medusa lingers on the POS
  until the app is reset.
- **From M3:** split tender, register open and close with X/Z closures,
  the tender-reducer port, and customers.
- **Outbox follow-ups** (from the PR #22 review):
  - leader election with `multiInstance: true`, so exactly one tab sends;
  - a monotonic within-millisecond counter in `uuidv7`, for strict ordering;
  - surfacing permanent 400/401 transport failures to the cashier;
  - an abrupt-kill reload case (process killed mid-patch) and ADR-039's
    batch-stopping 409 semantics in the fault test.
- **Discounts:** the ADR-038 `order.create` payload has no discount field,
  so `finalizeOrder` refuses discounted sales until a discount contract ADR
  is written. That ADR will carry line and order discounts to the backend,
  and fix the after-tax order-discount basis at the same time.
- **From M4:** the in-browser demo (ADR-027) comes after the MVP. The MVP
  ships the real app, for testers who have their own store.
- **From M5:** everything except keyboard-wedge scanning and browser print.
- **Platforms:** native (iOS and Android) and Electron builds. The MVP is
  web only.
- **Storage:** RxDB premium SQLite (D2) is the target. The MVP runs on
  whatever storage is installed when it ships: Dexie on web if the premium
  key hasn't arrived. Switching is a storage-injection change, so the key is
  off the critical path.

**Date estimate.**
- **Testable MVP by Friday 2026-10-02. Committed no later than Tuesday
  2026-10-06.**
- The basis is about 20 jobs at today's measured pace: roughly one hour per
  job for spec, Codex run, review and PR, with one test suite at a time.
  That is about 4 working days of job time, plus integration, e2e debugging
  and hosting.
- The estimate assumes three things:
  - The Medusa draft-order price override works as documented. The spike on
    day 1 checks this; if it fails, a custom order workflow adds about a
    day.
  - Vercel and npm access for medusapos exist or arrive within 3 days.
  - PRs are merged within a day of going green.

**Access needed.** None of this blocks the next three days of work:
- npm publish rights for `@tallyui` (the Release workflow's token), and a
  package name for the Medusa plugin (for example `@medusapos/plugin`).
- A Vercel project for the POS web app under the medusapos team.
- A DNS CNAME for app.medusapos.com. This is Paul's, at Squarespace.
- The RxDB premium token (see D2). It is not on the MVP's critical path.

## 2.3 After the MVP: completing the platform

The milestones below stay the plan once the MVP is in testers' hands. Each
one carries only what the MVP did not already deliver.

**Sequence.** M0 → M1 → M2 → M3 → M4. M5 (hardware) runs alongside M3.
M6 (Vendure) starts only after M2's conformance suite is green on Medusa.
M7 is a decision gate.

### M0: Foundation fixes (TallyUI)
**Goal:** the library can ship a production app.
- Fix DB9: the database is created with dev mode off.
- Remove product push (decision 6 above).
- The RxDB upgrade is its own job (Job 4 in §2.4), bracketed by Job 3's
  benchmark, so any regression is visible and revertable.
- Make the deprecated traits and `sync` optional in `TallyConnector`.
- Move `pos` and the cart components onto `Money`, `getPrices` and
  `resolvePrice`.
- Fix the order discount so it applies before tax.
- Add the LICENSE file; make primitives publishable; re-enable Release; align
  package versions; fix the 23 stale theme tokens; run the `test-d` type
  tests.

**Acceptance:**
- `NODE_ENV=production` test creates a database and round-trips a document.
- No connector exports a product push handler.
- Job 4's before/after benchmark medians are recorded, and the upgrade
  regresses them by no more than 10%.
- `grep -rn "parseFloat\|toFixed(2)" packages/pos/src packages/components/src/cart`
  finds nothing outside formatting.
- A clean project runs `npm pack` then install for every package and passes
  a smoke import.
- The test count does not drop below 951; all green in CI.
- A changesets release publishes to npm.

### M1: Sync protocol and conformance kit (TallyUI)
**Goal:** one written, testable contract for every backend.
- The TSP v1 spec and `@tallyui/sync-protocol`: zod types, opaque
  checkpoint, tombstones, command envelope and results, SSE events, and a
  protocol-version gate.
- The conformance suite.
- `@tallyui/sync-server`, with an in-memory and a Postgres reference server.
- The client sync kit: pull-only replication per collection, SSE hints
  turned into RxDB `RESYNC`, the outbox, tombstone purging, and nightly id
  reconciliation.
- A fault-injection harness: drop, delay, duplicate or reorder requests, and
  kill the client mid-batch.

**Acceptance:**
- The conformance suite (≥40 cases, one or more per capability) is green
  against the reference server.
- Fault harness: **1,000 randomised offline-order replays → 0 lost, 0
  duplicated orders or lines**.
- Postgres reference server: 10,000 rows written by 8 concurrent
  transactions that commit out of order, with same-microsecond ties and
  deletes, are pulled with **0 missed and 0 resurrected rows**.
- Idle polling costs ≤ 1 request per tick, with a 304 or empty response.

### M2: Medusa sync plugin (medusapos/app, a plugin package)
**Goal:** Medusa passes the contract.
- TSP routes over `@tallyui/sync-server`.
- Collections: products, variants (indexed barcode and SKU), prices and
  stock levels. Prices and stock get their own collections because they
  live in separate Medusa modules; I infer they do not bump
  `product.updated_at`, which is verified first on medusa-dev.
- Customers, and POS orders.
- `order.create` as a workflow: ledger → draft order with as-sold
  `unit_price` → payment → convert.
- `stock.adjust` as inventory deltas; a cashier actor type with
  permissions (Medusa's RBAC is Enterprise-only).

**Acceptance:**
- The conformance suite is green against medusa-dev.
- Initial sync of the 2,005-product / 5,655-variant seed into IndexedDB
  (Chromium, Playwright). **Provisional target: p50 ≤ 30 s**, fixed from
  job 3's baseline.
- A synthetic 20k-product seed on premium SQLite storage: provisional
  ≤ 3 min, heap ≤ 300 MB. If this misses, it triggers WCPOS-style
  demand-driven partial replicas (a lazy catalogue). It does not quietly
  move the target.
- An edit in the Medusa admin reaches the POS in **p95 ≤ poll interval +
  2 s**.
- Plugin size is recorded: the backend-cost KPI.

### M3: Medusa POS MVP (medusapos/app; logic in TallyUI)
**Goal:** a cashier can sell offline.
- Scan or search, cart, cash and split tender, receipt, idempotent order
  push, register open and close with an X/Z closure.
- Port into `@tallyui/pos`: the payment descriptor and ledger, the tender
  reducer, and the register-session and closure logic (per D3).

**Acceptance:**
- Playwright e2e: 25 sales with the network cut for 20 of them, then
  reconnect. All 25 orders land in Medusa, with correct totals, the right
  stock decrements and no duplicates.
- The Z report equals the sum of the sales.
- Tender reducer unit tests are ported from WCPOS with parity.
- The medusapos/app repo gets CI (typecheck, test and e2e) green on every PR.

### M4: medusapos.com demo and site
**Goal:** the "Live Demo" link works.
- Per D5: an in-browser demo (seeded RxDB with a simulated backend) at
  demo.medusapos.com.
- Page title and meta description; a docs quick start.

**Acceptance:**
- demo.medusapos.com returns 200.
- A demo sale completes in a Playwright smoke test on the production URL.
- Lighthouse performance ≥ 80 and accessibility ≥ 90.
- No API key in the bundle, checked by a grep in CI.

### M5: Hardware kit
**Goal:** printers, scanners and one card terminal through neutral
interfaces.
- **Licensing (D4, interim ruling):** until Paul decides the business
  model, terminal and hardware *drivers* are not published as MIT in public
  repositories. The neutral *interfaces* (the `PaymentDriver` contract, the
  receipt schema, the scanner event types) and a simulated driver live in
  TallyUI. Real drivers (ESC/POS transports, Stripe Terminal) go in a
  separately packaged, private-for-now module, so they can become a paid
  tier.
- Per D3, the stable neutral WCPOS packages (printer, scanner, receipts) are
  copied only when this milestone needs them.

**Acceptance:**
- Receipt golden-file tests.
- A wedge-scan burst decoder at 100% on a recorded corpus.
- A simulated-driver checkout e2e.
- One real print and one real Stripe Terminal test payment, recorded as
  evidence. This needs hardware on the Mac mini or with Paul.

### M6: Vendure
**Goal:** prove the connector contract with a second backend.
*The Vendure discovery and an MVP-first plan are in
[vendure/DISCOVERY.md](../vendure/DISCOVERY.md) and
[vendure/PLAN.md](../vendure/PLAN.md) (2026-09-24).*
- A seeded vendure-dev store; the Vendure connector rebuilt on
  `/admin-api` with API keys; a Vendure plugin (tombstone feed, barcode
  custom field, order import, stock delta) that reuses `@tallyui/sync-server`;
  the Vendure POS app; vendurepos.com (per D6).

**Acceptance:**
- The same conformance suite is green against vendure-dev.
- **Plugin plus connector ≤ 50% of the Medusa line count**: the
  "new backend is a small job" test.
- The M3 e2e suite passes unchanged against Vendure.

### M7: Shopify decision gate
- Per D1. No build work before then.

## 2.4 The first Codex-sized jobs

Each gets a spec from `~/.claude/codex/SPEC-TEMPLATE.md`, runs in its own
worktree off `main`, and becomes one PR.

**Job 1: database can be created in production (M0).**
- *In scope:* `packages/database/src/create-db.ts`,
  `packages/database/src/create-db.test.ts` (new).
- *Change:* stop passing `ignoreDuplicate: true` unconditionally. Pass it
  only when `DEV_MODE` is true, which keeps hot reload working in dev.
- *Test:* the new test stubs `process.env.NODE_ENV = 'production'` and
  re-imports the module (`vi.resetModules`). It creates a database with a
  memory storage and a minimal inline test connector (one `products`
  schema), inserts and reads one product, and destroys the database.
- *Budget:* ≤ 15 non-test lines.
- *Acceptance:*
  `./node_modules/.bin/vitest run packages/database/src/create-db.test.ts --maxWorkers=2`
  and `./node_modules/.bin/tsc -p packages/database --noEmit`.

**Job 2: product replication becomes pull-only (M0).**
- *Why:* today every push handler turns an HTTP or network error into a fake
  conflict, which silently reverts the cashier's edit. And the POS should
  never write catalogue documents anyway (decision 6).
- *In scope:*
  `connectors/{medusa,woocommerce,vendure,shopify}/src/replication/products.ts`
  and their `products.test.ts`.
- *Change:* delete the `push` member and its helpers. Delete or replace the
  push tests with one test per connector asserting `push` is undefined.
- *Out of scope:* the `ReplicationAdapter` type, which keeps `push`
  optional for the outbox work in M1.
- *Budget:* deletions only, plus ≤ 20 added lines.
- *Acceptance:* vitest on the four test files, and `tsc` on the four
  connectors.

**Job 3: replication benchmark harness (baseline numbers for M2 and D2).**
- *In scope:* `packages/database/bench/replication-bench.ts` (new) and a
  `bench` script in `packages/database/package.json`.
- *Change:* take a connector's `ReplicationAdapter`, a base URL and a key
  from env vars. Run a one-shot (not live) pull into a fresh database on
  memory storage, which isolates backend, network and RxDB-core cost from
  browser storage cost (browser storage is measured in §1.5 and in M2's
  Playwright run). Print JSON: documents, total ms, docs/s, peak
  `heapUsed`, request count. No new dependencies.
- *Target:* the Medusa connector against medusa-dev (127.0.0.1:9000,
  network on).
- *Budget:* ≤ 150 lines.
- *Acceptance:* the script exits 0 and prints the JSON line. I run it three
  times and record the median in DECISIONS.md.

**Job 4 (after the MVP): RxDB 16.21.1 → the WCPOS-pinned 17.x, as a
standalone upgrade, then premium storage.**
- *Scope:* the RxDB and rxjs pins, set to the version WCPOS `next` pins
  (17.4.0 today), matched by `rxdb-premium`; `createTallyDatabase`
  (`multiInstance: true` plus leader election); and the 2026-02-25
  replication design doc. `@tallyui/storage-sqlite` is not ported. Premium
  SQLite replaces it in a follow-up job (D2).
- *Before and after:* run the Job 3 benchmark three times on 16.21.1 and
  three times on 17.x. Record both medians in the PR.
- *Acceptance:*
  - The full test suite stays green, with no drop from the current count.
  - The benchmark median regresses by no more than 10%. If it regresses by
    more, the PR stays open and the upgrade is reverted, not patched over.
  - CI installs premium from the `RXDB_LICENSE_KEY` secret.

---

## 2.5 Post-MVP backlog (dated 2026-09-23 evening)

This is everything the MVP cut or deferred, each item with a one-line
acceptance test, for the morning review to sequence. The T-track (TallyUI
T1–T11) is complete at `3996453`. The A-track (medusapos) is in progress.

| # | Item | Acceptance (one line) |
|---|---|---|
| 1 | **Enable Release** once Paul supplies npm rights (ADR-041) | The first changesets release publishes all 11 packages at 2.0.0; `npm view` shows each one |
| 2 | **LICENSE in tarballs plus an install smoke test in Release** | Every tarball contains LICENSE; CI installs the tarballs into a clean project and imports each package |
| 3 | **Outbox leader election** (`multiInstance: true`) | Two tabs make 50 sales each; 100 orders applied exactly once, and only the leader tab sends |
| 4 | **Surface permanent 400 and 401 to the cashier** | After three 401s with a failed refresh, the cashier sees a re-login prompt; a 400 lands in needs-attention |
| 5 | **Medusa connector: add a user-JWT (Bearer) credential type alongside secret API keys.** Today `getHeaders` only models HTTP Basic secret keys, so an app that signs in as an admin user and passes the JWT in the api_token slot sends `Basic base64(jwt:)`, gets 401 on /admin/products and signs the cashier out (found by the medusapos A10 e2e harness on 2026-09-24; the app works around it by building Bearer headers itself) | A connector unit test that a Bearer credential produces `Authorization: Bearer <jwt>` on replication requests, and the medusapos workaround can be deleted |
| 6 | **Fault-test extensions:** an abrupt kill mid-patch, and ADR-039's batch-stopping 409 | The 200-replay test with both still ends with 0 lost and 0 duplicated orders |
| 7 | **A monotonic in-millisecond counter for `uuidv7`** | 10,000 ids generated in the same millisecond are strictly increasing |
| 8 | **Tombstones and id reconciliation** (deleted products leave the POS) | A product deleted in Medusa disappears from the POS within one poll; nightly reconciliation removes hard deletes |
| 9 | **Separate price and stock collections, and a plugin pull route** | A price-only change reaches the POS at p95 ≤ poll + 2 s; initial sync beats the 12.52 s Admin API baseline (ADR-035) |
| 10 | **Conformance suite, `@tallyui/sync-server`, and the TSP pull, stream and ids endpoints** (ADR-023) | ≥ 40 cases green against the reference server and medusa-dev; 10k out-of-order-commit rows with 0 missed and 0 resurrected |
| 11 | **Discount contract:** an ADR plus a version bump, fixing the after-tax order-discount basis | A discounted sale lands in Medusa within ≤ 1 minor unit of the POS total |
| 12 | **Registers, sessions and X/Z closures** (a WCPOS port, ADR-032) | The ported WCPOS tests pass; in the e2e run the Z report equals the sum of the sales |
| 13 | **Split tender and the tender-reducer port** | WCPOS tender-reducer test parity; a split cash + external sale lands with correct payment rows |
| 14 | **Customers** (search, attach, create through `customer.create` / `customer.patch` commands) | A sale with a customer lands with that `customer_id`; a field-merge conflict test passes |
| 15 | **Cashier roles:** an actor type plus permissions (Medusa RBAC is Enterprise) | A cashier without admin rights can sell but gets 403 on admin routes |
| 16 | **RxDB 17 + premium SQLite storage** (D2, Job 4) | Benchmark median within 10% of 12.52 s; premium installs in CI from `RXDB_LICENSE_KEY`; web SQLite-wasm and native SQLite both pass the storage tests |
| 17 | **Native apps (Expo iOS and Android), with tokens in SecureStore** | The app runs on a device; the token is in SecureStore; the offline e2e passes on an Android emulator (Maestro) |
| 18 | **Hardware kit** (D4 interim: interfaces public, drivers private) | A `PaymentDriver` checkout with the simulated driver passes e2e; ESC/POS receipts match golden files; one real print and one Stripe Terminal test payment recorded |
| 19 | **In-browser demo at demo.medusapos.com** (ADR-027) | The URL returns 200; a Playwright sale passes on the production URL; Lighthouse ≥ 80 performance and ≥ 90 accessibility; no key in the bundle |
| 20 | **Docs and Snacks for the new component props** | Every component page's example typechecks against current source; Snacks updated at the first publish |
| 21 | **M0 cleanup:** deprecated traits optional, theme-token drift, `test-d` in CI, connector checkpoint bugs (Vendure skip, WooCommerce ties, Shopify REST) | `ProductTraits` has no required deprecated members; `vitest --typecheck` runs in CI; the connector checkpoint tests cover ties |
| 22 | **Vendure (M6)** | The same conformance suite is green against vendure-dev; plugin + connector ≤ 50% of Medusa's line count |
| 23 | **Outbox: a 404 is visible, not silent.** After item 4 (#39), a `404` from `POST /tally/v1/commands` still retries forever, and `lastRetryReason: 'status_404'` is the only signal. The usual causes are a wrong backend URL or a plugin that isn't installed (added 2026-09-24, from the #39 review) | After N consecutive 404s the outbox pauses with a visible state, as it does for `refused`, and the app shows "backend not found or plugin missing"; a 404 during a deploy blip still recovers without the cashier doing anything |
| 24 | **Outbox: isolate a poisoned order in a refused batch.** After item 4, a batch-level refusal pauses the whole queue and changes no order. If one malformed order causes the 400, every sale behind it waits (added 2026-09-24, from the #39 review) | With one poisoned order among 25, the outbox bisects down to batch size 1, and that one order lands in needs-attention while the other 24 are applied; a steady refusal of every batch still only pauses |
| 25 | **Outbox takeover: a stale `authRequired` from the dead leader.** After a takeover, the new leader keeps showing the dead leader's shared `authRequired` until the server answers one of its own requests. If its first sends only get network retries, the stale prompt stays (added 2026-09-24, from the #42 review) | After a takeover, the new leader clears or re-derives the shared pause state before its first send; a test with network retries after a takeover never shows a stale `authRequired` |
| 26 | **Outbox: a flush request during a send is lost.** A follower's flush request that arrives while the leader is mid-send joins that run instead of queuing another. So signing in while the third 401 is still in flight can leave the outbox paused until the next sale (added 2026-09-24, from the #42 review) | A flush request received during a run triggers one more run after it ends; a test that signs in during an in-flight third 401 ends with the orders applied, without a new sale |
| 27 | **Medusa connector: an env-gated live test against medusa-dev.** The Vendure live test (#45) found that RxDB had rejected every batch, because of a field the schema didn't declare. Fake-server tests can't see that class of bug (added 2026-09-24) | With `MEDUSA_DEV_URL` set, the real `replicateRxCollection` replicates every medusa-dev product into a validating collection, and a later edit arrives; skipped without the env |
| 28 | **Vendure stock traits: three gaps** (added 2026-09-24, from the #45 stock review) | Tests show each fixed: (a) a variant with `trackInventory` `FALSE`, or `INHERIT` with the global setting off, is always in stock rather than out of stock; (b) `outOfStockThreshold` (and the global threshold) is subtracted from available stock; (c) `getStockStatus`/`getStockQuantity` aggregate every variant as `getStock` does, rather than reading variant 0 |
| 29 | **Vendure pull: lighter mark and probe reads.** The high-water mark and the two skew probes fetch the full product query; they need only `id` and `updatedAt` (added 2026-09-24, from the #45 review) | A request-body test shows the mark and probe queries select only `id updatedAt` |
| 30 | **Vendure pull: recover from a checkpoint stored mid-pass by the old code.** Such a checkpoint wastes three requests per sync until the next catalogue write (added 2026-09-24, from the #45 review) | A replication test that starts from an old-shape mid-pass checkpoint makes no more than one extra request per sync after the first |
| 31 | **Vendure pull: the guard throws once if the newest product is deleted between the mark read and the probe.** This is harmless, because RxDB retries (added 2026-09-24, from the #45 review) | A test shows a single retried error and then a clean pass; optionally, the probe re-reads the mark once before throwing |
| 32 | **`ProductStockBadge`: the app formats the "as of" time.** The badge formats `asOf` with the locale default (`toLocaleTimeString(undefined, …)`), which ignores the device's 12/24-hour switch and the app's language. The apps already have a formatter that respects the device clock (added 2026-09-24, from the #55 review) | A `formatAsOf?: (iso: string) => string` prop replaces the built-in formatting when given; a test shows it is used; the badge docs page documents it with an example |
| 33 | **Multi-variant prices: "from" the lowest, in a stable order.** A multi-variant product tile shows one variant's price, because `getPrice` reads variant 0. The variant order also isn't stable across seeded runs, so the medusapos e2e sees €10.00 on one run and €11.00 on the next (added 2026-09-24, front desk decision; two small specs after job C2) | (a) `ProductCard` shows "from <lowest price>" when a product's variant prices differ, and the single price when they don't; (b) the Medusa and Vendure connectors return variants sorted by id, and a test with shuffled server order shows the same order locally |
| 34 | **Cancelled 2026-09-24 (ADR-061: databases are single-instance).** ~~**Reconcile runners run on the leader only.**~~ Every tab of a `multiInstance` database starts its own `startStockReconcile` and `startIdReconcile`, so each tab repeats the same backend reads. Today each app has to gate the runners itself; medusapos gates them on `waitForLeadership` in the app for now (added 2026-09-24, front desk decision; after job C2 and item 33) | Both runners take `leaderOnly`, which defaults to `true` when the database is `multiInstance`. A leader-only runner waits for leadership before its first pass and hands over on a leader change. A two-tab test shows only one tab's runner fetches, and the other tab takes over after the leader closes |
| 35 | **`ProductPrice` "from": translatable word order and the price colour.** `fromLabel` fixes the word order as "<label> <price>", so a language that puts the word after the price can't be expressed. The range text also uses `text-foreground`, where prices use `text-price` (added 2026-09-24, from the #65 review) | A `formatFrom?: (price: string) => string` prop (default `(p) => \`from ${p}\``) replaces `fromLabel`, which stays as a deprecated alias; a test renders a price-first label; the range text uses the same price colour token as the single price |
| 36 | **The `storage-sqlite` e2e page builds its worker with the package's own bin.** `e2e/storage-sqlite/page/build-and-serve.mjs` (#72) finds esbuild through the pnpm store path (`node_modules/.pnpm/node_modules/.bin/esbuild`), and aliases `rxdb` to the storage package's copy. Both break easily. The `tallyui-build-sqlite-worker` bin (#71) builds the worker the same way an app does (added 2026-09-24, from the #72 review; accepted for now) | The e2e build calls `tallyui-build-sqlite-worker` for the worker and `sqlite3.wasm`, and uses no pnpm-store path; the `storage-sqlite` Playwright project still passes in CI |
| 37 | **The demo app's WooCommerce sample products seed again.** On `main`, the demo's sample data (`apps/demo/lib/sample-data.ts`, built through `@tallyui/mock-api`'s `toWooProduct`) no longer matches the WooCommerce RxDB schema. It has no `uuid` primary key; it has fields the schema rejects (`weight`, `date_created`, `date_created_gmt`, `date_modified`); and its `categories[].id` values aren't integers. So the demo can't seed WooCommerce products. The #76 screenshots were taken with a temporary, uncommitted patch to the demo's seeding. This item makes them reproducible (added 2026-09-24, from the #76 work) | The demo seeds its WooCommerce and Medusa samples with dev-mode validation on; a test inserts every sample product into a validating collection built from each connector's schema; the #76 screenshots can be re-shot from `main` with no local patch |
| 38 | **A hidden live tab hands over promptly.** Chrome slows timers to about once a minute in a tab that has been hidden for more than 5 minutes. So when a busy live tab gets a hand-over request, its deferral can overshoot by up to about 60 s, even with the wall-clock cap from #78. Meanwhile the new tab shows "blocked" from 13 s (added 2026-09-24, from the #78 review) | A live tab that is hidden (`document.visibilityState === 'hidden'`, tracked with `visibilitychange`) and receives a hand-over request parks at once, unless a payment is in flight; the new tab's blocked copy says it is still waiting for the other tab, and switches to "close the other tab" only once the lock has not come; tests with a hidden-tab fake cover both |

**Recommended order**, driven by what testers will hit first:
1. Items 1–2, so testers install from npm.
2. Items 3–7, the robustness of the tester-facing sync, followed by items
   23–26, which harden the same outbox.
3. Items 8–10, catalogue fidelity and the contract.
4. Items 11–15, feature depth.
5. Item 16, storage.
6. Items 17–19, platforms, hardware and the demo.
7. Items 20–21, cleanup, alongside the rest.
8. Item 22, Vendure. Its MVP starts once items 1–5 and 7 have merged
   (ADR-053). Its M6 proper still waits for item 10 to be green on Medusa.

---

# Part 3: Decisions that needed Paul

Each carries my recommendation, then the ruling. As of 2026-09-23 evening,
every one has a ruling except D4, which is deferred with an interim rule.
Everything else I decide and log.

**D1: Shopify.** Its API Terms and App Store requirements bar a third-party
POS without Shopify's written authorisation. The exact text, retrieved
2026-09-23:

- **Shopify API Terms**, https://www.shopify.com/legal/api-terms ("Last
  Updated: February 27, 2026"):
  - §2.3.18: "not, except with Shopify's express written authorization,
    (i) use an alternative to Shopify Checkout for checkout or payment
    processing for Shopify Merchants, or register any transactions through
    the Shopify API in connection with such activity, or (ii) use Shopify
    Checkout in any manner other than a Pop-up Implementation"
  - §2.3.10: "not, except as authorized by Shopify in writing, use Shopify
    Confidential Information or access to the Shopify API to substantially
    replicate products or services offered by Shopify or any Shopify Related
    Entity"
- **Shopify App Store requirements**,
  https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements:
  - 1.1.8: "Build apps for Shopify POS only, not third-party systems.
    Shopify is not currently accepting apps that connect to a POS system
    outside of Shopify." The page adds: "This applies to all apps that
    connect to a POS system outside of Shopify."

Both clauses of the API Terms allow Shopify's written authorisation as an
exception, so asking Shopify is a real option.
- **Recommend:** drop Shopify as a POS target. Keep the connector as a
  read-only catalogue example. Revisit only if Paul wants to ask Shopify for
  authorisation, or wants a POS UI extension pack for Shopify's own POS.
- ***Decided (Paul, 2026-09-23; ADR-030):*** Shopify is **paused, not
  dropped**. There is no POS work. The connector stays a read-only
  catalogue example, and this legal finding is kept for later. The focus is
  Medusa, then Vendure.

**D2: RxDB premium or fully open-source storage.**
- ***Decided (Paul, 2026-09-23; ADR-031):*** TallyUI uses **RxDB Premium
  with SQLite storage**, the same as WCPOS. In Paul's words, open source is
  not the priority; good apps are. If premium ever has to go, we write our
  own adapters, but not now. My recommendation below was overruled.
  - We target the premium SQLite storages on web and native, as WCPOS
    `next` does.
  - RxDB and rxdb-premium are pinned to the version WCPOS pins (17.4.0
    today), so fixes and patches are shared.
  - The ban on premium imports (ADR-025) is withdrawn.
  - `@tallyui/storage-sqlite` is retired once premium SQLite lands.
  - The premium install follows WCPOS: CI writes the key into
    `package.json` `accessTokens["rxdb-premium"]` from the
    `RXDB_LICENSE_KEY` secret. Locally, rxdb-premium's installer reads
    `RXDB_PREMIUM=<token>` from a git-ignored `.env` in the project root or
    any parent directory.

*My original recommendation, overruled:*
- WCPOS is moving off the premium OPFS/filesystem engine to SQLite, which
  confirms SQLite as the right substrate. But its SQLite targets are premium
  RxDB storages, and installing them needs a licence key.
- TallyUI's own SQLite storage (over expo-sqlite) points the same way, but it
  is immature: not atomic, and never run on real SQLite.
- **Recommend:** open-source by default (Dexie/IndexedDB on web; our SQLite
  storage on native, finished and run through RxDB's own storage test
  suite), with premium as an optional drop-in for merchants who hold a
  licence. An open-source POS whose install needs a paid key is not open
  source in practice.

**D3: How WCPOS code reaches TallyUI.**
- Printer, scanner, receipt renderer, payments contract, tender reducer and
  register logic are MIT and portable. WCPOS is under heavy development, so
  copies will drift.
- **Recommend:** move the stable, backend-neutral packages (printer, scanner,
  receipt schema and renderer) into TallyUI as `@tallyui/*`, with WCPOS
  consuming them later at a time Paul picks. Port the payments, tender and
  register *logic* into `@tallyui/pos` as a neutral re-implementation, with
  the WCPOS tests carried over. Nothing is changed in the WCPOS repos
  without Paul.
- ***Decided (Front desk, 2026-09-23, on the MVP criterion; ADR-032):***
  - Port the neutral payments, tender and register logic into
    `@tallyui/pos`, with the WCPOS tests carried over.
  - Copy the stable neutral packages (printer, scanner, receipts) only when
    a milestone needs them.
  - Nothing changes in the WCPOS repos without Paul.

**D4: Licence and business model for Medusa POS and Vendure POS.**
- WCPOS keeps terminal machinery private as "the value of Pro".
- **Recommend:** everything we ship is MIT (TallyUI, the platform plugins
  and apps), including one reference terminal driver (Stripe Terminal).
  Revenue, if any, comes from hosting and support. Say so before M5, because
  it decides whether terminal drivers go in public repos.
- ***Deferred (Paul, 2026-09-23; ADR-033):*** The business model will
  probably mirror WCPOS: a free core, and a paid Pro tier that keeps the
  terminal and hardware machinery private. Until Paul decides:
  - Terminal and hardware drivers are not published as MIT in public
    repositories.
  - That work is structured so it can split into a paid tier.
  - The core library and the MVP stay open.

**D5: Hosted demo backend.** *Decided 2026-09-23 by the Front desk, as recommended (ADR-027).*
- **Recommend:** an in-browser demo with a simulated backend (seeded RxDB, no
  server, no key exposure, no running cost) for M4.
- A public Medusa instance (about US$20–40 a month for hosting plus
  Postgres) only once the plugin is stable.

**D6: Vendure repos and domain.** *Decided 2026-09-23 by the Front desk, as recommended (ADR-028).*
- M6 needs a `vendurepos` GitHub org and repo, which doesn't exist yet;
  creating one needs Paul's go-ahead (ADR-014).
- vendurepos.com's DNS is at Squarespace / Google Cloud DNS.
- **Recommend:** create the `vendurepos` org when M6 starts. Paul points
  vendurepos.com's DNS at Vercel then (a five-minute registrar change only
  he can make).

**D7: medusapos/app PR #3.** *Decided 2026-09-23 by the Front desk, as recommended (ADR-029).*
- The 25k-line draft carries the dev store and first app, with no CI.
- **Recommend:** merge it as the baseline once CI (typecheck and unit) is
  added. Rebuild the app on the M1–M3 packages rather than grow the sample
  register on `main`. This needs Paul's merge.

---

## Appendix: sources

- TallyUI: command logs from the 2026-09-23 audit (install, build,
  typecheck, test); PRs #1–#12; `docs/plans/2026-02-25-*`.
- WCPOS: `~/Projects/monorepo` (main 1.10.23, `next` cee551000, 585 commits
  ahead); `~/Projects/woocommerce-pos` (`next` c65a89f1);
  `~/Projects/woocommerce-pos-pro` (`next` 7c0692c); `~/Projects/roadmap`
  (issues #97, #120, #195, #202, #225, #226, #282, #363); the wiki pages
  `architecture/client.md`, `architecture/plugin-free.md`, the ADR
  `2026-08-17-backend-direction-driver-identity-envelope` (ADR 0029) and the
  sync-engine politeness ADR of 2026-08-11.
- Medusa: v2.21.1 source (`packages/medusa/src/api`, `core-flows`),
  docs.medusajs.com, `ENTERPRISE-LICENSE.md`.
- Vendure: docs.vendure.io (v3.7.3), `license/plugin-exception.txt`.
- Shopify: shopify.com/legal/api-terms (2026-02-27),
  shopify.dev App Store requirements, Admin GraphQL 2026-07.
