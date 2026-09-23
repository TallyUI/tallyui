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
5. **Seven decisions need Paul** (Part 3). The biggest: RxDB premium or fully
   open-source storage; open source only or an open core with a paid tier;
   port WCPOS packages into TallyUI or publish them from WCPOS; and the
   Shopify call.

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
   - At most 11 collections, because of the open-source cap of 13.
   - `multiInstance: true` with leader election, so only one tab syncs.
6. **Transport errors are retried, never turned into conflicts.** A command
   is only *rejected* on an explicit server refusal, and it then goes to a
   visible "needs attention" queue, as in WCPOS's dead letters. Product push
   is removed: the POS never writes catalogue documents.
7. **TallyUI is MIT.** A LICENSE file is added to match the package
   manifests.

## 2.2 Milestones (in order, each with measurable acceptance)

**Sequence.** M0 → M1 → M2 → M3 → M4. M5 (hardware) runs alongside M3
once D3 is answered. M6 (Vendure) starts only after M2's conformance suite is
green on Medusa. M7 is a decision gate.

### M0: Foundation fixes (TallyUI)
**Goal:** the library can ship a production app.
- Fix DB9: the database is created with dev mode off.
- Remove product push (decision 6 above).
- Upgrade RxDB 16.21.1 → 17.5 (including storage-sqlite), with
  `multiInstance` and leader election. Fix the design doc, which names the
  premium IndexedDB storage.
- Add a lint rule banning `rxdb-premium` and `rxdb-server` imports in
  library packages.
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
- The storage-sqlite tests pass on RxDB 17.
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
- A synthetic 20k-product seed: provisional ≤ 3 min, heap ≤ 300 MB. If this
  misses, it triggers the D2 revisit (premium storage or SQLite-wasm) or a
  lazy catalogue. It does not quietly move the target.
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

### M5: Hardware kit (TallyUI)
**Goal:** printers, scanners and one card terminal through neutral
interfaces.
- Per D3: receipt schema and renderer, ESC/POS printer transports, scanner
  (keyboard wedge and camera), the `PaymentDriver` harness, a simulated
  driver, and a Stripe Terminal driver.

**Acceptance:**
- Receipt golden-file tests.
- A wedge-scan burst decoder at 100% on a recorded corpus.
- A simulated-driver checkout e2e.
- One real print and one real Stripe Terminal test payment, recorded as
  evidence. This needs hardware on the Mac mini or with Paul.

### M6: Vendure
**Goal:** prove the connector contract with a second backend.
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

## 2.3 The first three Codex-sized jobs

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

---

# Part 3: Decisions that need Paul

Each has my recommendation. Everything else I decide and log.

**D1: Shopify.** Its API Terms §2.3.18 and §2.3.10 and App Store rule 1.1.8
bar a third-party POS without Shopify's written authorisation.
- **Recommend:** drop Shopify as a POS target. Keep the connector as a
  read-only catalogue example. Revisit only if Paul wants to ask Shopify for
  authorisation, or wants a POS UI extension pack for Shopify's own POS.

**D2: RxDB premium or fully open-source storage.**
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

**D4: Licence and business model for Medusa POS and Vendure POS.**
- WCPOS keeps terminal machinery private as "the value of Pro".
- **Recommend:** everything we ship is MIT (TallyUI, the platform plugins
  and apps), including one reference terminal driver (Stripe Terminal).
  Revenue, if any, comes from hosting and support. Say so before M5, because
  it decides whether terminal drivers go in public repos.

**D5: Hosted demo backend.**
- **Recommend:** an in-browser demo with a simulated backend (seeded RxDB, no
  server, no key exposure, no running cost) for M4.
- A public Medusa instance (about US$20–40 a month for hosting plus
  Postgres) only once the plugin is stable.

**D6: Vendure repos and domain.**
- M6 needs a `vendurepos` GitHub org and repo, which doesn't exist yet;
  creating one needs Paul's go-ahead (ADR-014).
- vendurepos.com's DNS is at Squarespace / Google Cloud DNS.
- **Recommend:** create the `vendurepos` org when M6 starts. Paul points
  vendurepos.com's DNS at Vercel then (a five-minute registrar change only
  he can make).

**D7: medusapos/app PR #3.**
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
