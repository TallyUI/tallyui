# Decisions log

Architecture decision records for TallyUI, newest decisions appended at the
end. Each entry says what was decided, why, what it costs, and where the
evidence lives. This log is how Paul stays in the loop without running the
programme day to day (see [BRIEF.md](BRIEF.md)).

**How to add an entry.** Append `ADR-NNN` with the next number. Fill in date,
status, source, context, decision and consequences. Back the decision with
numbers where there are any: test counts, benchmarks, measured behaviour. A
decision that needs Paul is marked **Needs Paul** until he answers, and his
answer is quoted with its date. To change a decision, add a new entry that
supersedes the old one, and mark the old one *Superseded by ADR-NNN*. Never
rewrite history.

**Statuses:** Accepted · Accepted, partly implemented · Under review (a later
finding questions it; see the linked plan) · Superseded · Needs Paul.

Entries ADR-001 to ADR-018 record decisions that were already in the repo
when this log began on 2026-09-23. They are reconstructed from commits, PR
bodies and design docs, and the source is given for each.

---

## ADR-001 RxDB is the local, offline database

- **Date:** 2026-02-24 · **Status:** Accepted · **Source:** be4d433,
  `apps/web` architecture docs
- **Context:** A POS has to keep selling when the network drops, and WCPOS
  already runs on RxDB. Reusing its model shortens the port.
- **Decision:** Every TallyUI app stores its data in RxDB, and the
  collections are built from connector schemas. RxDB is pinned exactly
  (16.21.1).
- **Consequences:** Queries are reactive and RxDB's replication protocol is
  available. No premium plugins are used, and schema migrations are not yet
  addressed (every schema is version 0).

## ADR-002 Connectors own raw schemas; UI reads through traits

- **Date:** 2026-02-24 · **Status:** Accepted · **Source:** be4d433,
  `packages/core/src/types/connector.ts`
- **Context:** A universal product schema loses platform data. Raw platform
  data in components forces `if (connector === …)` branches.
- **Decision:** Each connector stores documents in its platform's own shape
  and ships a trait (accessor) set. Components never read documents directly;
  they call `useProductTraits()` and friends.
- **Consequences:** Components are neutral by construction. Every new
  capability needs a trait in every connector, so the trait set must stay
  small and neutral. Today it covers products only (customers are optional
  and unimplemented).

## ADR-003 ReplicationAdapter over RxDB `replicateRxCollection`; server wins

- **Date:** 2026-02-25 · **Status:** Partly superseded by ADR-024 (see
  [programme plan](plans/2026-09-programme.md) §Sync) · **Source:** PR #1,
  PR #2, `docs/plans/2026-02-25-rxdb-replication-design.md`, 49b0338
- **Context:** The first `CollectionSync` interface (fetch all ids, fetch
  modified after, push) needed a custom engine. RxDB already ships a
  checkpointed pull/push protocol.
- **Decision:** Each connector provides a `ReplicationAdapter` per collection
  (pull handler + checkpoint, optional `stream$`, push handler), run by
  `startReplication()` over `replicateRxCollection`. Conflicts resolve server
  wins. Polling is used until a live stream exists. `CollectionSync` is
  deprecated.
- **Consequences:** All four connectors have product adapters. Server wins is
  only implicit, because no `conflictHandler` is set anywhere. The deprecated
  `sync` is still a required connector field. Nothing in the repo calls
  `startReplication` yet.
- **Why superseded in part:** WCPOS 1.10 deliberately did *not* use
  `replicateRxCollection`. It needed partial, demand-driven replicas for
  large catalogues, request budgets per lane, and dead-letter handling for
  failed writes. ADR-024 keeps RxDB replication for *reads* only (pull-only)
  and moves writes to a command outbox. Demand-driven replicas wait on the
  M2 benchmark.

## ADR-004 Platform storage: IndexedDB on web, own expo-sqlite storage on native

- **Date:** 2026-02-25 · **Status:** Superseded by ADR-031 · **Source:** PR #1,
  b15ed8b
- **Context:** RxDB's SQLite and OPFS storages are premium (paid). The
  product is open source.
- **Decision:** Dexie/IndexedDB on web; a hand-written RxStorage over
  expo-sqlite (`@tallyui/storage-sqlite`) on native; memory for SSR and
  tests.
- **Consequences:** There is no licence cost, but we own a storage engine. As
  of 2026-09-23 it is not atomic (one `runSync` per row, no transaction), is
  synchronous only, and has only ever run against a regex mock of SQLite.
  WCPOS is retiring its premium OPFS/filesystem engine after durability
  problems and moving to SQLite (premium storages), which supports SQLite
  as the substrate. The open-source-versus-premium question is re-opened in
  the programme plan (a decision for Paul).

## ADR-005 Mock API as the single fixture source

- **Date:** 2026-02-25 · **Status:** Accepted, partly implemented ·
  **Source:** PR #3
- **Decision:** A Hono app on Cloudflare Workers (`apps/mock-api`, live at
  mock.tallyui.com) serves a neutral catalogue through per-platform transforms
  for WooCommerce, Medusa, Shopify and Vendure.
- **Consequences:** Trait round-trip tests use its data. Its HTTP routes are
  not exercised by any connector test, and its Vendure and WooCommerce shapes
  no longer match the connectors (Vendure: `/shop-api` vs `/admin-api`;
  WooCommerce: no `uuid`).

## ADR-006 Uniwind + Tailwind 4 styling with a shared theme

- **Date:** 2026-02-25, tokens expanded 2026-02-26 · **Status:** Accepted ·
  **Source:** 04664f9, PR #6
- **Decision:** Components style with `className` via Uniwind; semantic
  tokens (shadcn-style) live in `@tallyui/theme`. Apps are Expo 54, React 19,
  React Native 0.81, react-native-web.
- **Consequences:** One styling language across web and native. The PR #6
  token rename left 23 stale class uses in components (for example
  `bg-surface`, `*-danger`).

## ADR-007 Own headless primitives, forked from rn-primitives

- **Date:** 2026-02-25 · **Status:** Accepted, partly implemented ·
  **Source:** PR #5, `docs/plans/2026-02-25-primitives-library-design.md`
- **Decision:** `@tallyui/primitives` holds headless, accessible building
  blocks (compound components, `asChild`, controllable state, `.web.tsx`
  splits). `@tallyui/components` is the styled layer on top.
- **Consequences:** 7.7k lines with 32 test files. Popover and menu
  positioning on web is a stub. The package is `private`, yet components
  import it at runtime, so the published components cannot install cleanly.

## ADR-008 tsup builds, changesets releases, GitHub CI

- **Date:** 2026-02-25 · **Status:** Accepted, partly implemented ·
  **Source:** b9497bb, PR #4
- **Decision:** ESM + d.ts builds with tsup; changesets for versioning and
  npm publishing; CI runs install, build, typecheck, test, the docs build and
  Playwright e2e.
- **Consequences:** npm holds the 2026-02-25 releases only. The Release
  workflow has been disabled since a failed run on 2026-02-26, and nine
  changesets are pending. Package versions are inconsistent (1.0.0 / 0.2.0 /
  0.1.0).

## ADR-009 Stateless, layered components with uncontrolled defaults

- **Date:** 2026-02-25/26 · **Status:** Accepted · **Source:** PR #4, PR #8
- **Decision:** Three tiers: primitive, composite, layout. Composites use
  layout plus slots and hold no internal state. Prefer sibling composites to
  mode props.
- **Consequences:** The components are clean and presentational, but they
  are not yet bound to `@tallyui/pos` state (the cart has its own model).

## ADR-010 Framework-free POS business logic in `@tallyui/pos`

- **Date:** 2026-02-26 · **Status:** Accepted, partly implemented ·
  **Source:** PR #9
- **Decision:** Tax, currency, order builder and manager, discounts, split
  payments, receipt data, scoped logging and RxDB repositories live in one
  reactive package with no UI dependency. Orders can be parked locally and
  resumed.
- **Consequences:** The package predates neutral Money (ADR-012). It still
  prices in floating-point major units through the deprecated `getPrice`,
  applies the order discount after tax, and has no finalise, push or refund
  step.

## ADR-011 pnpm 11 with supply-chain hardening

- **Date:** 2026-05-13, merged 2026-09-23 · **Status:** Accepted ·
  **Source:** PR #10, 51e06f9
- **Decision:** pnpm 11.1.1; `minimumReleaseAge` 1440 minutes;
  `blockExoticSubdeps`; an explicit `allowBuilds` list in
  `pnpm-workspace.yaml`.
- **Consequences:** New dependency versions must be at least 24 hours old.
  Unlisted build scripts fail the install.

## ADR-012 Neutral money, stock and sellability traits

- **Date:** 2026-09-22, merged 2026-09-23 · **Status:** Accepted, partly
  implemented · **Source:** PR #11, f90e59d, bc0a224
- **Context:** A Medusa POS slice against a real Medusa 2.21 store (2,005
  products) showed that WooCommerce's price strings, regular/sale trio and
  `instock` enum had leaked into core.
- **Decision:** `getPrices()` returns integer minor-unit `Money`, with
  `resolvePrice` and `formatMoney` alongside it. `getStock()` returns a
  neutral level, and `isSellable` and `getVariantCount` are added. The trait
  context carries the currency. The old accessors are deprecated.
- **Consequences:** Product display components are neutral. The deprecated
  accessors are still *required* by `ProductTraits`, and pos and the cart
  still use them. Removing them is programme work.

## ADR-013 React 19 dev pin in packages; AJV validation in dev mode

- **Date:** 2026-09-22 · **Status:** Accepted · **Source:** 184901f
- **Context:** Duplicate React copies crashed apps, and RxDB dev mode refuses
  storage without a validator (DVM1).
- **Consequences:** Apps can run the packages from source. Separately,
  `createTallyDatabase` sets `ignoreDuplicate: true`, which RxDB rejects
  outside dev mode (error DB9), so the database cannot be created in a
  production build (`packages/database/src/create-db.ts:58`). This is fixed
  in the programme's first job.

## ADR-014 Platform POS apps and their fixtures live in their own repositories

- **Date:** 2026-09-23 · **Status:** Accepted (Paul) · **Source:**
  4851d8d, PR #11
- **Context:** Each platform's POS will differ enough to need its own
  repository. TallyUI must stay clean and platform-agnostic.
- **Decision:** TallyUI holds platform-neutral pieces: core, components,
  POS logic, database, sync kit and connectors. A platform's POS app, server
  plugin and dev fixtures (such as the seeded Medusa store) live in that
  platform's repository and consume TallyUI as a dependency. The Medusa app
  and dev store moved to `medusapos/app` (last TallyUI version fe44431).
  Creating a new repository or organisation needs Paul's go-ahead.
- **Consequences:** No app inside TallyUI exercises `@tallyui/pos` or
  replication end to end. That coverage has to come from contract tests here
  and from the platform repositories.

## ADR-015 Medusa connector conventions

- **Date:** 2026-09-22 · **Status:** Accepted · **Source:** PR #11
- **Decision:** A Medusa secret key is sent as the Basic auth username.
  Medusa amounts are major units and are converted to minor. Stock comes from
  inventory location levels. Pulls page by `id` inside a fixed `updated_at`
  window (`pass_max`), and documents are projected onto the schema.
- **Consequences:** This is the reference pattern for the other connectors,
  whose checkpoints are currently unsound (ties are dropped or pages skipped).

## ADR-016 SVG icon system with react-native-svg as a peer

- **Date:** 2026-09-23 · **Status:** Accepted · **Source:** PR #12
- **Decision:** `createSvgIcon` builds 24×24 stroke icons that use
  `currentColor`, with react-native-svg ≥15 as a peer dependency.
- **Consequences:** Apps must install react-native-svg, and the demo app does
  not yet.

## ADR-017 End-to-end testing with Playwright (web) and Maestro (native)

- **Date:** 2026-02-25 · **Status:** Accepted, partly implemented ·
  **Source:** 930de4b
- **Consequences:** Only four primitive flows are covered on each platform.

## ADR-018 Codex implements from Claude-written specs; Claude reviews

- **Date:** 2026-09-22 · **Status:** Accepted (Paul, machine-wide) ·
  **Source:** PRs #11 and #12, `~/.claude/CLAUDE.md`
- **Decision:** A Claude session writes a small, bounded spec with runnable
  acceptance commands. Codex implements it, and the Claude session reviews
  the full diff and reruns the acceptance commands before committing.
- **Consequences:** Every programme job must be sized to one spec: named
  files, a line budget and a stop rule.

---

## ADR-019 Programme brief adopted

- **Date:** 2026-09-23 · **Status:** Accepted (Paul) · **Source:**
  [BRIEF.md](BRIEF.md)
- **Decision:** TallyUI is the shared base for open-source POS plugins for
  Medusa, then Vendure, then Shopify if viable, porting the best of WCPOS.
  Each platform gets a WCPOS-grade offline sync engine. medusapos.com and
  vendurepos.com carry each product's site and web demo. WCPOS `main` is the
  current release and the WCPOS `next` branches plus the roadmap are the
  target (Paul via Front desk, 2026-09-23).
- **Consequences:** The programme plan in
  [plans/2026-09-programme.md](plans/2026-09-programme.md) sets the
  milestones. Its open decisions (D1–D7) are listed there with
  recommendations.

## ADR-020 Platform order: Medusa, then Vendure; Shopify parked

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead); Shopify part
  paused by Paul, see ADR-030 · **Source:** plan §1.4
- **Context:** Medusa has the most sync-ready API (`with_deleted=true` on
  every list route, no maximum page size, barcode filters), MIT licensing,
  a live domain and a seeded dev store. Vendure has no POS today and a clean
  plugin model (MIT allowed under its GPL plugin exception). Shopify bars a
  third-party POS without written authorisation. From the Shopify API Terms
  (https://www.shopify.com/legal/api-terms, last updated 2026-02-27,
  retrieved 2026-09-23):
  - §2.3.18: "not, except with Shopify's express written authorization,
    (i) use an alternative to Shopify Checkout for checkout or payment
    processing for Shopify Merchants, or register any transactions through
    the Shopify API in connection with such activity, or (ii) use Shopify
    Checkout in any manner other than a Pop-up Implementation"
  - §2.3.10: "not, except as authorized by Shopify in writing, use Shopify
    Confidential Information or access to the Shopify API to substantially
    replicate products or services offered by Shopify or any Shopify Related
    Entity"

  And from the App Store requirements
  (https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements,
  retrieved 2026-09-23):
  - 1.1.8: "Build apps for Shopify POS only, not third-party systems.
    Shopify is not currently accepting apps that connect to a POS system
    outside of Shopify."
- **Decision:** Build Medusa first. Vendure starts once the sync
  conformance suite is green on Medusa. No Shopify POS work until Paul
  decides.

## ADR-021 TallyUI owns a neutral transactional model

- **Date:** 2026-09-23 · **Status:** Accepted · **Source:** plan §2.1
- **Context:** WCPOS keeps its client document model WooCommerce-shaped on
  purpose (WCPOS ADR 0029 §5), and no WCPOS roadmap item plans to change
  that.
- **Decision:** Orders, line items, payments, register sessions and
  closures are TallyUI-defined documents with opaque string ids. They are
  templated on WCPOS `next`'s payments contract (method descriptor and
  payment ledger) and register-session design. Connectors map them out to
  the platform. The catalogue stays connector-native behind traits
  (ADR-002).
- **Consequences:** The reverse of WCPOS's choice. A future WooCommerce
  connector maps into the neutral model like any other backend.

## ADR-022 Money is integer minor units everywhere

- **Date:** 2026-09-23 · **Status:** Accepted · **Source:** plan §2.1
- **Decision:** All money in core, pos and components uses core `Money`
  (integer minor units plus currency). Floats, `parseFloat` and
  `toFixed(2)` are removed outside display formatting.

## ADR-023 The TallyUI Sync Protocol, with a conformance suite

- **Date:** 2026-09-23 · **Status:** Accepted · **Source:** plan §1.3,
  §1.5, §2.1
- **Context:** RxDB's server package is SSPL. replication-graphql would need
  subscriptions Vendure lacks. ElectricSQL, PowerSync and Zero read the
  platform's Postgres directly, bypass price, channel and tax logic, and
  (Zero) reject offline writes. WCPOS proved a checkpointed feed with
  tombstones plus idempotent writes.
- **Decision:** TSP v1 over HTTP + SSE: `manifest`, `pull/:collection` with
  an opaque checkpoint and tombstones, `commands`, `stream`,
  `ids/:collection`. `@tallyui/sync-protocol` carries the types and a
  black-box conformance suite that tests guarantees (no missed or
  resurrected rows under out-of-order commits, ties and deletes;
  idempotent replay). `@tallyui/sync-server` is the shared,
  framework-agnostic Node core. Platform plugins are thin and live in their
  platform's repository (ADR-014).
- **Consequences:** The cost of a new backend is measurable (plugin line
  count, days to a green suite). A checkpoint can start as a
  high-water-mark keyset and become a journal without client change.

## ADR-024 Reads by pull-only RxDB replication; writes by a command outbox

- **Date:** 2026-09-23 · **Status:** Accepted; supersedes the server-wins
  part of ADR-003 · **Source:** plan §2.1
- **Decision:** Server-owned collections (catalogue, prices, stock levels,
  tax, config) replicate pull-only. POS facts are commands in a durable,
  leader-elected outbox, keyed by UUIDv7 as the idempotency key:
  `order.create` with as-sold prices, `stock.adjust` as deltas, and
  `customer.create` / `customer.patch` merged field by field against a base
  value. Explicit refusals go to a visible "needs attention" queue.
  Transport errors are retried and never become conflicts. A pull never
  overwrites a record with pending commands. Full replicas are scoped to the
  POS channel and location, with at most 11 collections (open-source RxDB 17
  caps a realm at 13), and `multiInstance` with leader election.
  **Amended by ADR-061:** databases are single-instance, and
  `multiInstance` with leader election is unsupported.
- **Consequences:** Product push handlers are removed from every connector.
  Demand-driven partial replicas (the WCPOS approach) are adopted only if
  the M2 benchmark misses its budget.

## ADR-025 No RxDB premium or SSPL code in TallyUI library packages

- **Date:** 2026-09-23 · **Status:** Superseded by ADR-031 ·
  **Source:** plan §1.5, D2
- **Decision:** Library packages depend only on Apache-2.0 RxDB. A lint rule
  bans `rxdb-premium` and `rxdb-server` imports there. Storage stays
  injectable, so an app may choose premium storage.

## ADR-026 TallyUI is MIT-licensed

- **Date:** 2026-09-23 · **Status:** Accepted · **Source:** package
  manifests
- **Context:** Every package manifest already declares MIT, but the public
  repository has no LICENSE file.
- **Decision:** Add an MIT LICENSE file at the root.

## ADR-027 medusapos.com demo runs in the browser first (plan D5)

- **Date:** 2026-09-23 · **Status:** Accepted (Front desk, 2026-09-23, as
  recommended in the plan) · **Source:** plan D5, PR #13 review
- **Decision:** The M4 demo at demo.medusapos.com is an in-browser demo:
  seeded RxDB with a simulated backend, no server, no API key in the
  bundle, no running cost. A public Medusa instance (about US$20–40 a month)
  comes only once the Medusa plugin is stable.

## ADR-028 Vendure repositories are created when M6 starts (plan D6)

- **Date:** 2026-09-23 · **Status:** Accepted (Front desk, 2026-09-23, as
  recommended in the plan) · **Source:** plan D6, PR #13 review
- **Decision:** The `vendurepos` GitHub organisation and repository are
  created when M6 (Vendure) starts, not before. Paul points vendurepos.com's
  DNS at Vercel then. The worker confirms the org creation with Paul at that
  point, under the standing rule that a new repository or organisation needs
  his go-ahead (ADR-014).

## ADR-029 medusapos/app PR #3 becomes the baseline once CI is green (plan D7)

- **Date:** 2026-09-23 · **Status:** Accepted (Front desk, 2026-09-23, as
  recommended in the plan) · **Source:** plan D7, PR #13 review
- **Decision:** Add CI (typecheck and unit tests) to medusapos/app. Merge
  draft PR #3 (the Medusa dev store and first app) as the baseline once that
  CI is green. The app is then rebuilt on the M1–M3 packages rather than
  grown from the sample register on `main`.

## ADR-030 Shopify is paused, not dropped (plan D1)

- **Date:** 2026-09-23 · **Status:** Accepted (Paul, via the Front desk) ·
  **Source:** plan D1
- **Decision:** No Shopify POS work. The Shopify connector stays as a
  read-only catalogue example. The legal finding (API Terms §2.3.18 and
  §2.3.10, App Store requirement 1.1.8, quoted in ADR-020) is kept, in case
  Paul later asks Shopify for written authorisation. The focus is Medusa,
  then Vendure.

## ADR-031 RxDB Premium with SQLite storage, as in WCPOS (plan D2)

- **Date:** 2026-09-23 · **Status:** Accepted (Paul, via the Front desk);
  supersedes ADR-004 and ADR-025 · **Source:** plan D2
- **Context:** I had recommended open-source storage by default, with
  premium as an option. Paul overruled that: "Open source is not the
  priority; good apps are." If premium ever has to go, we write our own
  adapters, but not now.
- **Decision:**
  - TallyUI and its apps target the RxDB premium SQLite storages on web and
    native, following WCPOS `next` (SQLite-wasm on the web after the OPFS
    engine's retirement).
  - `rxdb` and `rxdb-premium` are pinned together at the version WCPOS pins
    (17.4.0 on 2026-09-23), so fixes and patches are shared.
  - Library packages may import premium. The lint ban from ADR-025 is
    withdrawn.
  - `@tallyui/storage-sqlite` is retired once premium SQLite lands.
- **Install:**
  - Local: `RXDB_PREMIUM=<token>` in a git-ignored `.env` at the project
    root; rxdb-premium's installer searches parent directories.
  - CI: WCPOS's pattern, which writes the `RXDB_LICENSE_KEY` secret into
    `package.json` `accessTokens["rxdb-premium"]` before `pnpm install`.
- **Consequences:**
  - Installing needs a licence key, in CI and on every developer machine.
  - The 13-collection cap of open-source RxDB no longer binds.
  - The MVP may ship on Dexie if the key has not arrived. Storage is
    injected, so switching is one change.

## ADR-032 How WCPOS code reaches TallyUI (plan D3)

- **Date:** 2026-09-23 · **Status:** Accepted (Front desk, on the MVP
  criterion) · **Source:** plan D3
- **Decision:**
  - Port the neutral payments, tender and register logic from WCPOS `next`
    into `@tallyui/pos`, carrying the WCPOS tests over.
  - Copy the stable neutral packages (printer, scanner, receipt schema and
    renderer) only when a milestone needs them.
  - Nothing changes in the WCPOS repositories without Paul.

## ADR-033 Business model deferred; hardware drivers kept splittable (plan D4)

- **Date:** 2026-09-23 · **Status:** Accepted as an interim rule (Paul, via
  the Front desk); the model itself is deferred · **Source:** plan D4
- **Context:** The model will probably mirror WCPOS: a free core, and a paid
  Pro tier that keeps the terminal and hardware machinery private.
- **Decision (until Paul decides):**
  - Terminal and hardware drivers are not published as MIT in public
    repositories.
  - The neutral interfaces (the `PaymentDriver` contract, the receipt
    schema, the scanner events) and a simulated driver live in TallyUI.
  - Real drivers live in a separately packaged module that can become a
    paid tier.
  - The core library and the Medusa MVP stay open.

## ADR-034 MVP first: the shortest path to a testable Medusa POS

- **Date:** 2026-09-23 · **Status:** Accepted (Paul's overriding priority,
  via the Front desk) · **Source:** plan §2.2
- **Decision:** Before anything else, ship a minimal Medusa POS that real
  people can test. A tester sells offline in a hosted web app, reconnects,
  and sees every order land in Medusa exactly once.
- **In scope:**
  - A command outbox and one idempotent `order.create` endpoint in a small
    Medusa plugin (the TSP `commands` shape).
  - `pos` and the cart on integer `Money`.
  - Login as a Medusa admin user, and cash or recorded-external payments.
  - Web only.
- **Deferred until after the MVP:** the conformance suite, the pull, stream
  and ids side of TSP, registers, split tender, hardware, native builds, the
  RxDB upgrade and the in-browser demo.
- **Target:** testable by 2026-10-02, committed by 2026-10-06.

## ADR-035 Replication baseline; Medusa product pages stay at 100

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead) · **Source:**
  PR #16 (benchmark harness)
- **Measurement:** local Medusa 2.21 dev store, 2,005 products with
  variants, prices and inventory levels, pulled through
  `medusaProductReplication` into memory-storage RxDB 16.21.1 on the Mac
  mini. Three runs per batch size:
  - batch 100: median **12.52 s** (range 12.47–12.63), 160 docs/s,
    21 requests, 58.2 MB peak heap;
  - batch 500: median 16.76 s (range 16.64–16.85), 120 docs/s, 5 requests,
    48.2 MB.
- **Decision:** keep Medusa product pulls at 100 per page. The Admin API is
  the bottleneck, at about 600 ms per 100-product page, and its per-page cost
  grows faster than linearly with the nested fields. So larger pages are
  slower. The real gain is a plugin-side pull route after the MVP. This
  12.52 s median is the "before" number for Job 4 (the RxDB upgrade).
- **Note on the M2 target:** M2's p50 ≤ 30 s initial-sync target is
  measured end to end in the browser. It includes browser storage writes
  on top of this 12.5 s of network and server time, which leaves about
  17 s for storage.

## ADR-036 Medusa `order.create` recipe, verified on medusa-dev (MVP spike)

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead) · **Source:**
  spike against the local Medusa 2.21 dev store, order `display_id` 301
- **Question:** Can an offline POS sale land in Medusa at the *as-sold*
  price, with Medusa's tax, paid, and with stock decremented?
- **Answer: yes, in six Admin API calls.** The test sale was SHIRT-S-WHITE
  sold at €8.50 × 2 (list price €10) plus the fixture mug at list €12 × 1,
  with a temporary DE 19% default tax rate:
  1. `POST /admin/draft-orders` with `region_id`, `sales_channel_id`,
     `email`, a shipping and billing address (its country drives tax),
     `items[{variant_id, quantity, unit_price, metadata}]` and `metadata`.
     A line without `unit_price` gets the list price. The override is kept:
     €8.50 per unit, line tax €3.23, draft total €34.51.
  2. `POST /admin/draft-orders/{id}/convert-to-order`. Prices and tax
     survive: subtotal €29.00, tax €5.51, total €34.51. Stock is only
     *reserved* here (reserved 0 → 2). **No payment collection is
     created.**
  3. `POST /admin/payment-collections {order_id, amount}`.
  4. `POST /admin/payment-collections/{id}/mark-as-paid {order_id}`. The
     collection becomes `completed`, and the order's `payment_status`
     becomes `captured` with €34.51 paid.
  5. `POST /admin/orders/{id}/fulfillments {items, location_id,
     no_notification}`, once per group. Medusa refuses to fulfil items that
     need shipping together with items that don't. No shipping method is
     needed. Stock is decremented: stocked 1,000,000 → 999,998, reserved
     2 → 0.
  6. `POST /admin/orders/{id}/complete`. Final state: `completed`,
     `captured`, `fulfilled`.

  Order and line `metadata` (the client UUIDs and `tally_created_at`)
  round-trip unchanged. The temporary tax rate was deleted afterwards.
- **Consequences for the plugin and the POS:**
  - These six calls are not atomic, so the plugin runs them as **one
    Medusa workflow with compensation**, behind the idempotency ledger. The
    POS sends one `order.create` command.
  - `created_at` is server time. The sale time lives in
    `metadata.tally_created_at`, and POS reports use it.
  - Medusa computes tax from the address. The plugin uses the **stock
    location's address** for walk-in sales. The POS's local tax must match
    Medusa's per-line rounding. The MVP e2e test ("totals match to the
    cent") guards this.
  - The dev store seed has **no tax rates** (tax is 0). Its seed gains a
    rate, so the e2e test exercises tax.
  - Still open: whether `email` can be omitted for walk-in sales (the spike
    passed one), and whether price-list prices interact with the override.
    The override is expected to win; this is checked in the plugin's tests.

## ADR-037 Tax is computed exactly and rounded once, at the order total

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead) · **Source:**
  follow-up spike on medusa-dev (a throwaway draft and a cancelled order)
- **Evidence:**
  - Medusa does **not round line tax**. At 19%, €1.50 × 1 gives tax
    €0.285; €0.35 × 3 gives €0.1995; €0.05 × 1 gives €0.0095 (stored at
    precision 20).
  - The order total was **€3.094**. Paying the rounded €3.09 gave
    `payment_status: captured` with a pending difference of 0, so Medusa
    rounds only at the payment boundary.
- **Decision:**
  - Every amount that changes hands (unit prices, line subtotals, order
    totals, tenders, change) is integer minor units (`Money`).
  - Tax rates are integer parts per million (19% = 190000; 7.25% = 72500).
  - Line tax is kept **exactly**, as an integer in micro-minor-units
    (`amountMinor × ratePpm`, divided by 10⁶ only at the end). It is summed
    across lines and rounded **once, half away from zero**, when the order
    total is formed.
  - Tax-inclusive prices extract tax the same way: exactly, rounded once.
  - No floating-point arithmetic touches money.
- **Consequences:**
  - `@tallyui/pos` gets the exact tax API (job T1).
  - The POS's total equals Medusa's total rounded to the cent. **Medusa's own
    stored totals keep sub-cent fractions**, for example €3.094 where the
    customer paid €3.09. So a merchant's Medusa reports will disagree with
    the POS by up to half a cent per order.
  - **The authoritative number for the merchant is the amount actually
    tendered, which is the POS total** (integer minor units). The plugin
    sets the payment collection amount to exactly that.
- **MVP guard (job A10):** for every order, |Medusa order total − POS
  total| ≤ 1 minor unit, and the payment collection amount equals the POS
  total exactly.
- **Post-MVP fix, to investigate:** Medusa 2.21 exposes no rounding setting
  that I know of, and its tax provider interface returns *rates*, not
  amounts, so a provider cannot post rounded line tax. Two candidates, both
  unverified: posting explicit rounded tax lines when the plugin creates the
  order, or a plugin-side totals adjustment. Either must be proven on
  medusa-dev before we rely on it.

## ADR-038 The `order.create` command contract (T6/T8 ↔ A3/A4)

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead); the
  interface between the TallyUI and medusapos tracks · **Source:** plan §2.2,
  ADR-036, ADR-037
- **Transport:** `POST /tally/v1/commands`, header `X-Tally-Protocol: 1`.
  - Body: `{ commands: CommandEnvelope[] }`, at most 50, processed in
    order.
  - A `200` response is `{ results: CommandResult[] }`, in the same order.
  - Retryable (the client keeps the command and backs off): network errors,
    `5xx`, `429`, and `409 {code: 'in_progress'}` (the same id is being
    applied concurrently).
  - Authentication is the platform's own admin auth (for Medusa, an admin
    user's JWT bearer token).
- **Types** (in `@tallyui/core`, job T6):

```ts
interface CommandEnvelope<P = unknown> {
  id: string;            // UUIDv7, the idempotency key; never reused
  type: 'order.create';  // more types later
  version: 1;
  payload: P;
  createdAt: string;     // ISO 8601, client clock (sale time)
  deviceId: string;
  attempt: number;       // 1-based, informational
}

interface CommandResult {
  id: string;
  status: 'applied' | 'duplicate' | 'rejected';
  serverRefs?: { orderId: string; displayId?: string; totalMinor: number };
  warnings?: Array<{ code: 'total_mismatch'; expectedMinor: number; serverMinor: number }>;
  error?: { code: string; message: string }; // only when rejected
}

interface OrderCreatePayload {
  clientOrderId: string;          // PosOrder id (UUIDv7)
  createdAt: string;              // sale time, ISO 8601
  currency: string;               // ISO 4217, upper case
  pricesIncludeTax: boolean;
  lines: Array<{
    clientLineId: string;         // UUIDv7
    variantId: string;            // platform variant id (opaque)
    title?: string;
    quantity: number;             // positive integer
    unitPriceMinor: number;       // as sold, integer minor units
  }>;
  subtotalMinor: number;          // POS-computed
  taxMinor: number;               // POS-computed, rounded once (ADR-037)
  totalMinor: number;             // POS-computed
  payments: Array<{
    clientPaymentId: string;      // UUIDv7
    method: 'cash' | 'external';  // 'external' = card on a standalone terminal
    amountMinor: number;          // amount applied to the order
    tenderedMinor?: number;       // cash handed over
    changeMinor?: number;
    reference?: string;
  }>;
  customer?: { email?: string } | null; // null = walk-in
  registerId?: string;
  cashierRef?: string;
  locationId?: string;            // stock location; server default if absent
}
```

- **Server semantics (Medusa plugin, jobs A3/A4):**
  - A command's `id` is claimed in a ledger. A replay of an applied id
    returns `duplicate` with the original `serverRefs`. The same id with a
    different payload fingerprint is `rejected` with code
    `idempotency_mismatch`.
  - `order.create` runs ADR-036's six steps as one workflow with
    compensation. Unit prices are converted from minor to major units. The
    walk-in address comes from the stock location.
    `metadata.tally_client_id`, `metadata.tally_created_at` and per-line
    `metadata.tally_line_uuid` are set.
  - The payment collection amount is the sum of `payments[].amountMinor`.
  - If Medusa's total, rounded to the cent, differs from `totalMinor`, the
    order is still applied (the ledger records facts). The result carries a
    `total_mismatch` warning, which the POS surfaces.
  - A permanent refusal (unknown variant, invalid quantity, payments less
    than the rounded total) is `rejected` with a stable `error.code`.
- **Change rule:** changing any of these shapes needs a new ADR and a
  `version` bump, agreed by both tracks.
- **Amendment (2026-09-24):** a new rejection code `invalid_payload` is
  returned as `status: 'rejected'` when a command's payload fails shape
  validation. This check runs before the ledger claim; it is deterministic,
  so a replay of the same command returns the same rejection. It is not
  retried. Introduced by medusapos/app ADR 0004.
- **Amendment 2 (2026-09-24):** `OrderCreateLine` gains an optional
  `taxInclusive?: boolean` — this line's own tax mode, when it differs from
  the order's `pricesIncludeTax` (a price that carries its own flag, D2c).
  Absent means the order's flag, so single-mode orders, which is every
  order today, produce byte-identical payloads, and older clients are
  unaffected. **Server rule:** the plugin uses
  `line.taxInclusive ?? payload.pricesIncludeTax` as that item's tax mode;
  everything else in this ADR and ADR-039 still applies per item — ADR-039's
  paths 1 to 3, ADR-037's ≤ 1 minor-unit guard, and `total_mismatch`. An old
  plugin that receives the field ignores it: it charges in the order's mode
  and returns `total_mismatch`, exactly today's behaviour, which is why
  `finalize` rejects a converted line (the #94 guard) until the plugin
  honours the field. **Rollout order:** T1 (tallyui: the client can send the
  field, guard stays) → M (the Medusa plugin honours it) → T2 (tallyui
  removes the guard). The Vendure plugin honours the field from its first
  `order.create` commit, so there is no older-Vendure-plugin case to gate on.
  **Completed 2026-09-25:** M merged (medusapos/app #56, `3646095`), with a
  live mixed-order contract on Medusa 2.21.0 applied without warnings, and
  T2 removed the #94 guard.

## ADR-039 `order.create` edge cases (addendum to ADR-038)

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead), agreed with
  the medusapos worker before A3 · **Source:** A-track questions
- **Tax-inclusive prices:** spike order #301 used the dev store's
  tax-exclusive price preference. For `pricesIncludeTax: true`, the plugin
  tries these in order:
  1. Set `is_tax_inclusive` on each draft-order item. The spike response
     already shows that field on items.
  2. If the Admin API rejects it, send a tax-exclusive `unit_price` backed
     out at full decimal precision: `unitPriceMinor × 10⁶ / (10⁶ + ratePpm)`
     as a decimal string, never rounded to the cent.
  3. If neither works, reject with `unsupported_tax_mode`.

  A3 proves whichever path it uses with an inclusive-region test. It must
  stay within ADR-037's ≤ 1 minor unit guard.
- **Walk-in customer:** omit `email` if Medusa accepts that. Otherwise use a
  **server-configured** placeholder, defaulting to `walk-in@pos.invalid`
  (the `.invalid` TLD can never receive mail). Always set
  `no_notification`. The client never invents an email.
- **Insufficient stock:** the sale physically happened, so the order is
  recorded.
  - If fulfilment is refused for some items (no stock and no backorder),
    the order is still applied and paid, those items stay unfulfilled, and
    the result carries an `insufficient_stock` warning per affected
    variant.
  - Only if Medusa refuses the order itself is it `rejected` with
    `insufficient_stock`. It then lands in the POS's "needs attention"
    list.
- **Overpayment:** if Σ `payments[].amountMinor` > `totalMinor`, the order
  is applied, with the collection amount = `totalMinor` (ADR-037). Cash
  change is already carried by `tenderedMinor` and `changeMinor`.
- **Contract change (additive, no version bump):** `CommandWarning` becomes
  a union:
  `{ code: 'total_mismatch'; expectedMinor; serverMinor } | { code: 'insufficient_stock'; variantId: string; quantity: number }`.
  Clients must ignore warning codes they don't know. From now on, adding a
  warning code is additive and needs only an ADR. Changing an existing
  shape still needs a `version` bump.
- **Server semantics adopted from the A-track proposal:**
  - A `409 in_progress` stops the batch at that command. The response is
    HTTP 409 `{ code: 'in_progress', id }`. The client retries the whole
    batch, and earlier commands replay as `duplicate`.
  - The fingerprint is sha256 of canonical JSON of
    `{ type, version, payload }`, excluding `attempt`, `deviceId` and the
    envelope's `createdAt`.
  - The region is the one whose currency matches `payload.currency` and
    which contains the stock location's country. If there is none, reject
    with `unsupported_currency`.
  - A transient mid-workflow failure is compensated, the ledger claim is
    released, and the server returns 5xx (retryable).
  - The outbox sends **at most 10 commands per request** (each order is
    about 6 Admin steps), well under `MAX_COMMANDS_PER_BATCH` = 50.

## ADR-040 Several tax rates per line; per-rate receipt breakdown

- **Date:** 2026-09-23 · **Status:** Accepted (programme lead), requested in
  the Front desk's review of PR #17 · **Source:** ADR-037; Medusa line
  items carry an array of `tax_lines`
- **Context:** A Medusa line item can carry several tax lines. A US sale,
  for example, may have state, county and city rates on the same line. VAT
  receipts must show tax per rate. ADR-037 rounds tax once per order, while
  per-rate totals rounded separately need not add up to that figure.
- **Decision:**
  1. **Stacked, not compound.** A POS line carries an array of tax lines
     `{ code?, ratePpm, taxMicros }`. Each is applied to the same net base
     and the results are added. Tax on tax (compound) is not supported;
     Medusa does not compute it either. `LineItem.taxMicros` is the sum of
     the line's tax lines. For the MVP the tax context supplies one rate,
     so the array has one entry, but the data model is ready for many.
  2. **The order tax is rounded once** (ADR-037). It is what the customer
     pays, and Medusa accepts it.
  3. **The receipt's per-rate breakdown always adds up to the charged tax.**
     Group the exact micros by `(code, ratePpm)`, floor each group to minor
     units, and give the leftover units to the largest remainders (ties to
     the higher rate). A naive per-group rounding can be off by up to
     (groups − 1) units against the charged tax. For example, three groups
     at 0.95, 0.35 and 0.25 minor units round naively to [1, 0, 0] = 1,
     against a charged tax of 2. The receipt shows [1, 1, 0].
- **Consequences and open point:** some fiscal regimes prescribe rounding
  VAT *per rate* on the document, rather than once, and some prescribe
  per-line rounding. The fiscal-compliance work that WCPOS is doing (NF525,
  VeriFactu) will decide per jurisdiction. If a regime needs per-rate
  rounding, the order tax becomes Σ of the rounded per-rate amounts. That
  can differ from Medusa's cent-rounded total by up to (rates − 1) units,
  so ADR-037's ≤ 1 unit guard would then allow `rates − 1`. That change
  needs a new ADR.

## ADR-041 Lockstep versions for all published @tallyui packages

- **Date:** 2026-09-23 · **Status:** Accepted (Front desk, 2026-09-23) ·
  **Source:** publish-readiness PR (MVP T9/T10)
- **Context:** Package versions had drifted apart (1.0.0 / 0.2.0 / 0.1.0),
  and the packages depend on each other tightly (components → core,
  primitives, theme; pos → core). Consumers of a young library shouldn't
  have to work out which versions go together.
- **Decision:** changesets `fixed: [["@tallyui/*"]]`. Every published
  package releases at one shared version. The first release after this
  takes every package to 2.0.0 together, because majors are pending in
  components and the connectors. The private apps (demo, web, mock-api) are
  not published.
- **Consequences:** a breaking change in any package bumps the major of all
  of them. The Release workflow stays disabled until Paul supplies npm
  rights; then it is enabled deliberately, after the majors are cut.

## ADR-042 Publish to npm by trusted publishing (OIDC), with no token

- **Date:** 2026-09-23 · **Status:** Accepted (Paul, 2026-09-23) ·
  **Source:** release-trusted-publishing PR
- **Context:** Paul decided that the @tallyui packages publish from GitHub
  Actions through npm trusted publishing. The repo has no `NPM_TOKEN`
  secret and never will. npm needs npm CLI 11.5.1 or later (or a client that
  does the same OIDC exchange), `id-token: write`, a GitHub-hosted runner,
  and a trusted publisher on each package that names the org, repo and
  workflow file. Under OIDC, a public package from a public repo gets
  provenance automatically, and the registry then rejects a publish whose
  `repository.url` is missing or does not match the repo.
- **Options considered:**
  1. Keep `changeset publish` and pnpm's own publish. `changeset publish`
     runs `pnpm publish` per package in a pnpm workspace. pnpm 11 does the
     OIDC exchange and sets provenance itself, the way npm does. pnpm 11.1.1
     (pinned by ADR-011) fails with a 404 when `actions/setup-node` has
     written `_authToken=${NODE_AUTH_TOKEN}` with no token set; 11.1.3 fixed
     that ([pnpm#11513](https://github.com/pnpm/pnpm/issues/11513)).
  2. Have changesets call `npm publish --provenance`. Plain `npm publish`
     ships `workspace:*` ranges verbatim (components, database and pos use
     them), so this needs `pnpm pack` first, then `npm publish <tarball>`
     with npm 11.5.1+ installed. That means a custom publish script which
     also re-does changesets' "already published?" check and git tags.
- **Decision:** option 1, as the simpler route. Changes:
  - `packageManager` moves from pnpm 11.1.1 to 11.27.0 (it installs the
    current lockfile unchanged). The rest of ADR-011 stands. Do not take
    11.27.1: it changed signal handling in `pnpm exec`, which leaves the
    Playwright web server (`pnpm --filter @tallyui/demo exec expo start`)
    orphaned at teardown. `e2e-web` then hangs until it is cancelled.
    Measured 2026-09-23: 11.27.1 hung past 300 s, while 11.27.0 and 11.1.1
    passed 9/9 in about 40 s.
  - `release.yml` loses `NPM_TOKEN` and setup-node's `registry-url` (which
    only exists to write a token `.npmrc`). It keeps `id-token: write`, its
    filename, `changesets/action@v1` (v1 writes no `.npmrc` when there is
    no `NPM_TOKEN`) and `pnpm changeset publish`. It uses no GitHub
    environment. Each package's trusted publisher is: org `TallyUI`,
    repo `tallyui`, workflow `release.yml`, environment blank.
  - Every publishable manifest declares
    `repository: git+https://github.com/TallyUI/tallyui.git` with its
    `directory`.
- **Consequences:** No publish credential exists to leak or rotate. npm
  can only set a trusted publisher on a package that already exists, so a
  package that has never been published needs one bootstrap publish by
  hand (`@tallyui/primitives` on 2026-09-23). Provenance comes from pnpm's
  automatic detection. If detection fails, pnpm only warns and still
  publishes without provenance, so check the first release with
  `npm view @tallyui/core --json` (look for `dist.attestations`). Renaming
  `release.yml` breaks publishing until every package's trusted publisher
  is updated. ADR-041's "npm rights" now means trusted publishers, not a
  token.

## ADR-043 A worker opens the version PR; the Release workflow only publishes

- **Date:** 2026-09-23 · **Status:** Accepted (Front desk, 2026-09-23) ·
  **Source:** release-publish-only PR, [RELEASING.md](RELEASING.md)
- **Context:** GitHub's enterprise policy on the TallyUI org forbids
  GitHub Actions from creating or approving pull requests, and the setting
  cannot be changed through the API. `changesets/action` opens its
  "version packages" PR from Actions whenever changesets are pending, so
  under this policy every push to `main` carrying a changeset would fail.
  The release would then never reach its publish step.
- **Decision:** Versioning moves out of Actions. A worker on the agent
  host runs `pnpm changeset version` on a branch and opens the result as an
  ordinary PR, which is reviewed and merged like any other. The procedure
  is in [RELEASING.md](RELEASING.md). `release.yml` gains a `pending` job
  that counts `.changeset/*.md` files (not `README.md`). The `release`
  job runs only when that count is 0, and then only publishes:
  `changesets/action@v1` with `publish: pnpm changeset publish` pushes tags
  and creates GitHub releases, but it never enters version mode.
  `pull-requests: write` is dropped. The filename `release.yml`,
  `id-token: write` and the absence of a GitHub environment are kept, so
  the npm trusted publishers from ADR-042 stay valid.
- **Options not taken:** `changesets/action/publish@v2`, a publish-only
  sub-action, needs Changesets v3; the repo is on `@changesets/cli` 2.29.
  Calling `changeset publish` directly, without the action, would mean
  writing our own tag pushing and GitHub releases.
- **Consequences:** Releasing takes one extra human-reviewed PR, which
  also puts the changelog in front of a reviewer. If a changeset lands on
  `main` after the version branch is cut and before it merges, the merge
  leaves a pending changeset and publishing is skipped. The worker
  procedure rebases and re-versions to avoid this. `changeset publish` is
  idempotent, so the next version PR would publish anything that was
  missed.

## ADR-044 How RxDB Premium is installed (implements ADR-031)

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24) ·
  **Source:** rxdb-premium install PR, [CONTRIBUTING.md](CONTRIBUTING.md)
- **Context:** ADR-031 chose RxDB Premium. `rxdb-premium` is a public npm
  package whose postinstall downloads an installer from
  `premium.rxdb.info`. That installer decrypts the plugins with a licence
  token, which it looks for in the `RXDB_PREMIUM` environment variable, then
  in `accessTokens` in any parent `package.json`, then in any parent
  `.env`. With no token it throws, so the install fails. It also prints the
  token to stdout.
- **Decision:**
  - `rxdb-premium` is pinned at `16.21.1`, the version `rxdb` is on. It
    goes in the `devDependencies` of `@tallyui/storage-sqlite`, the package
    the storage swap will change. No published package depends on it
    or re-exports it. ADR-031's 17.4.0 (WCPOS's pin) waits for a separate
    rxdb 16 → 17 upgrade.
  - `allowBuilds` runs `rxdb-premium`'s script and denies the scripts it
    drags in: `core-js` (banner only), `eccrypto` and `secp256k1` (native
    builds with pure-JS fallbacks; the installer works on the fallback).
  - The token is supplied only as the `RXDB_PREMIUM` environment variable.
    In CI, every `pnpm install` step gets it from the repository secret
    `RXDB_PREMIUM`. Locally, see CONTRIBUTING.md. This replaces ADR-031's
    CI note about writing `accessTokens` into `package.json`, so the token
    never touches a tracked file.
  - `sideEffectsCache` stays at pnpm's default (Front desk, 2026-09-24).
- **Consequences:**
  - A full workspace install needs the token. Dependabot PRs need it as a
    Dependabot secret. Fork PRs get no secrets, so their CI install fails.
  - Vercel deploys only the docs site, and this machine cannot reach the
    Vercel account to add a token there. So `vercel.json` installs and
    builds only `@tallyui/web` and its workspace dependencies:
    `pnpm install --frozen-lockfile --filter "@tallyui/web..."` and
    `pnpm --filter "@tallyui/web..." build`. `rxdb` and `rxdb-premium` are
    not in that set. Measured 2026-09-24 in a clean clone with no token:
    the install succeeds without `rxdb-premium`, and the build scopes 2 of
    15 projects (theme, web) and writes `apps/web/.next`. If `apps/web`
    ever depends on a package that pulls in premium, Vercel's install
    breaks again.
  - The installer prints the token. GitHub masks secrets in Actions logs,
    and Vercel never runs the installer.
  - pnpm's side-effects cache keeps the decrypted plugin files in the pnpm
    store (checked on the agent host: the store index records them for
    `rxdb-premium@16.21.1`). That is acceptable on the agent host. In CI,
    `actions/setup-node`'s `cache: pnpm` saves that store to the Actions
    cache. Revisit this if the repo starts running untrusted fork
    workflows.

## ADR-045 `@tallyui/storage-sqlite` wraps RxDB Premium SQLite; premium is a peer

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk brief, 2026-09-24);
  amends ADR-031 and ADR-044 · **Source:** storage-sqlite premium PR
- **Context:** ADR-031 moved TallyUI to RxDB Premium's SQLite storage and
  said `@tallyui/storage-sqlite` would be retired. The package's own engine
  (a mango-to-SQL translator and storage instance, about 1,200 lines) was
  not atomic and had only ever run against a regex mock of SQLite (ADR-004).
  Premium's `getRxStorageSQLite({ sqliteBasics })` needs an `SQLiteBasics`
  adapter for the SQLite library in use.
- **Decision:**
  - The package is kept as a thin adapter instead of retired. Its public API
    is unchanged: `getRxStorageSQLite(database)` still takes a synchronous
    SQLite handle (the expo-sqlite `execSync`/`getAllSync`/`runSync` shape)
    and now returns premium's SQLite storage, driven through an
    `SQLiteBasics` built around that handle. The hand-written engine and
    its mock are deleted.
  - `rxdb-premium` is a **peer dependency** (exact `16.21.1`, because
    premium checks that its version equals `rxdb`'s) and stays a
    devDependency for this repo's tests. It is not a dependency, is not
    re-exported, and is not bundled: tsup marks `rxdb-premium` and its
    subpaths external, so `dist` only contains the import. Why a peer: RxDB
    Premium is licensed per project and its install needs a licence token,
    so the app that uses the storage installs it under its own licence. A
    hard dependency would make every install of the MIT package fail
    without a token. This amends ADR-044's "no published package depends on
    it" to "no published package has it as a dependency".
  - One SQLite handle serves exactly one RxDB database. Premium names its
    tables by collection, not by database, so the adapter rejects a second
    database name on the same handle rather than mixing their tables. The
    app owns the handle: closing the RxDB database does not close it.
  - Tests run on real SQLite: Node's built-in `node:sqlite`, adapted to the
    same synchronous shape. They run whenever `rxdb-premium` is installed,
    which is always in CI because the CI install has the token. Without
    premium they are skipped with a message, except under `CI`, where they
    fail.
- **Consequences:**
  - Apps using `@tallyui/storage-sqlite` must install `rxdb-premium@16.21.1`
    themselves, with an RxDB Premium licence.
  - The adapter uses the synchronous expo-sqlite API, which blocks the JS
    thread for each statement. Premium also ships an async expo adapter
    (`getSQLiteBasicsExpoSQLiteAsync`); moving to it would change the public
    API and is left for when an app measures a need.
  - Web SQLite-wasm and the rxdb 16 → 17 upgrade (ADR-031's 17.4.0 pin)
    are still separate jobs.

## ADR-046 Vendure baseline: 3.7, Admin API only, a seeded Postgres dev store

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24) ·
  **Source:** [vendure/DISCOVERY.md](vendure/DISCOVERY.md) §1–2
- **Context:** Vendure's npm `latest` is 3.7.3 (released 2026-09-01), and
  3.8.0 is due 2026-09-30. Two features the POS relies on arrived in 3.6.0
  (2026-03-31): API keys (PR #3815) and `OrderLevelTaxCalculationStrategy`.
  The Shop API caps lists at 100, hides stock numbers and is built around
  one customer's session. The Admin API allows `take` ≤ 1,000 and is
  permissioned per channel. `@vendure/create`'s sample data has only 54
  products and 88 variants.
- **Decision:**
  - TallyUI targets Vendure **3.7.x**, and the plugin declares
    `compatibility: '^3.6.0'`.
  - The connector and plugin use the **Admin API only**.
  - The dev store (`vendure-dev`) is a `@vendure/create` 3.7.3 project on
    Postgres 17, with its own 2,000-product seed.
  - Where it runs is decided separately, in ADR-058 (V-D6): this Mac
    mini, bound to 127.0.0.1.
  - Its source lives in `vendurepos/app` `dev/vendure-store` (ADR-014).
  - The plugin is MIT, which Vendure's plugin exception allows
    (`license/plugin-exception.txt`: a separately distributed plugin may
    use "terms of your choice").
- **Consequences:**
  - A 3.5 store is not supported.
  - Re-read DISCOVERY §2 when 3.8 ships.
  - The e2e and the demo use Postgres, not SQLite. Search, locking and
    unique-index behaviour differ between the two, and merchants run
    Postgres or MySQL in production.

## ADR-047 Vendure `order.create` recipe: one transaction in a plugin

- **Date:** 2026-09-24 · **Status:** Accepted as the design (Front desk,
  2026-09-24). Spike S1 in [vendure/PLAN.md](vendure/PLAN.md) must prove it
  on vendure-dev before VP3
  · **Source:** DISCOVERY §2.3–2.4, Vendure 3.7.3 source
- **Context:** The Admin API can't carry an offline POS sale as it stands:
  - `AddItemToDraftOrderInput` is `{productVariantId, quantity}`, so there
    is no as-sold price;
  - `addManualPaymentToOrder` takes no amount and always pays
    `totalWithTax − covered` (`order.service.js:1327-1349`);
  - `orderPlacedAt` is hard-set to `new Date()`
    (`default-order-process.js:266-269`);
  - no mutation is idempotent;
  - `ArrangingPayment` requires a customer, a shipping line and saleable
    stock (`default-order-process.js:187-212`). Switching those checks off
    with `configureDefaultOrderProcess` is global and would change the
    merchant's web checkout.

  Medusa needed six Admin calls, compensation, resume logic and an
  advisory lock (ADR-036; the medusapos workflow is about 600 lines). A
  Vendure plugin can call the services directly inside one
  `TransactionalConnection` transaction.
- **Decision:** `POST /tally/v1/commands` (ADR-038, unchanged) is a Nest
  controller in the plugin. Each `order.create` runs in **one transaction**:
  1. Validate the payload (`invalid_payload`, before the claim). Then claim
     the command, with ADR-039's fingerprint:
     - Run `SET LOCAL lock_timeout = '5s'`, then
       `INSERT … ON CONFLICT (id) DO NOTHING RETURNING id`.
     - A plain insert is not enough. On Postgres a unique violation aborts
       the whole transaction, and `lock_timeout` defaults to 0 (wait
       forever). Vendure's transaction wrapper retries only deadlocks
       (`transaction-wrapper.js:104-107`).
     - **A concurrent duplicate waits on the first transaction.**
       - If the first transaction commits, the insert returns no row. The
         stored result is then visible under READ COMMITTED and is
         returned as `duplicate`, or as `idempotency_mismatch` if the
         fingerprint differs.
       - If the first transaction rolls back, the insert wins and this
         command runs.
       - If the 5 s timeout fires, the transaction rolls back and the
         client gets `409 in_progress`.
     - A replay after commit is a plain read.
     - MySQL/MariaDB need the equivalent (`INSERT IGNORE` with
       `innodb_lock_wait_timeout`). The MVP tests Postgres only.
  2. Create the draft order in the request's channel (`vendure-token`).
     Set the Order custom field `tallyClientOrderId` (with `unique: true`,
     which backs up the ledger) and `tallySaleAt` = `payload.createdAt`.
  3. Add each line with the **readonly** OrderLine custom field
     `tallyUnitPrice`. The plugin's `OrderItemPriceCalculationStrategy`
     returns it as `{price, priceIncludesTax: payload.pricesIncludeTax}`,
     and delegates to the previously configured strategy for every other
     order. The field must be readonly, or a Shop API customer could set
     their own price.
  4. Set the customer.
     - With an email, look the customer up. If there is one, attach it
       unchanged. `setCustomerForDraftOrder`'s path would refuse a
       registered customer's email (`EmailAddressConflictError`) or
       overwrite their name.
     - With an email and no existing customer, create a guest with
       `createOrUpdate`. Never use `createCustomer`, which makes a login
       User and publishes a registration event.
     - With no email, use the configured placeholder, `walk-in@pos.invalid`
       by default (ADR-039).
  5. Set the in-store shipping method. It costs zero, and its eligibility
     checker accepts only orders that have a `tallyClientOrderId`, so the
     web shop never offers it.
  6. If saleable stock is short, top up by the shortfall and record an
     `insufficient_stock` warning. Then transition to `ArrangingPayment`.
  7. Add the rounding surcharge, if any (ADR-048). Then add one payment
     through the plugin's `tally-pos` `PaymentMethodHandler`: the amount is
     the POS total, it is created Settled, and the method and reference go
     in its metadata. Vendure moves the order to `PaymentSettled` and
     allocates the stock.
  8. Add a manual fulfilment for every line. That records the SALE
     movement, so on-hand stock drops. Take back any top-up from step 6.
     Store the result in the ledger, then commit.

  A thrown error rolls everything back, including the ledger claim, and
  the controller returns `503`, which the client retries. The plugin never
  changes the order process, the tax strategy or the checks of the
  merchant's other orders.
- **Consequences:**
  - No compensation or resume code, which is the main saving against
    Medusa.
  - The merchant runs one migration for the custom fields and the ledger.
  - The plugin creates a `tally-pos` PaymentMethod and an in-store
    ShippingMethod per channel if they are missing.
  - The same `tally-pos` handler supports split tender later, because it
    takes amounts.
  - EventBus events (`OrderPlacedEvent` and so on) still fire after
    commit, so email and other plugins behave as for any order.
    `no_notification` has no Vendure equivalent: stores whose EmailPlugin
    mails on `OrderPlacedEvent` will email the placeholder address, which
    `.invalid` makes undeliverable.
  - **Unverified until S1:** that `OrderService` accepts a readonly custom
    field from inside the plugin, and that one transaction covers draft,
    payment and fulfilment. PLAN §4 has the fallbacks.

## ADR-048 Tax parity on Vendure: a rounding surcharge, never a config change

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24);
  to be checked in spike S1 · **Source:** DISCOVERY
  §2.4.1; ADR-037, ADR-040
- **Evidence (Vendure 3.7.3 source):**
  - `DefaultMoneyStrategy.round` is `Math.round(value × quantity)`, and
    `taxPayableOn` is an unrounded float.
  - `DefaultOrderTaxCalculationStrategy` sums each line's rounded
    `proratedLinePriceWithTax`, so each line is rounded once.
  - `OrderLevelTaxCalculationStrategy` (added in 3.6.0) rounds
    `taxPayableOn(netBase, rate)` once per `(description, rate)` group.
  - The strategy is a store-wide `taxOptions` setting, so it also governs
    the web shop.
  - `addManualPaymentToOrder` cannot pay less than Vendure's total
    (ADR-047).
- **What differs from the POS:**
  - With the default strategy and tax-exclusive prices, an *n*-line order
    can differ from the POS's round-once total (ADR-037) by up to about
    ⌈*n*/2⌉ minor units.
  - With tax-exclusive prices and `OrderLevelTaxCalculationStrategy`, a
    single-rate order matches exactly: for positive amounts, `Math.round`
    equals half away from zero.
  - With tax-inclusive prices and the default strategy, the order total is
    the sum of integer gross lines, so the totals match. Only the tax split
    can differ.
  - With tax-inclusive prices and `OrderLevelTaxCalculationStrategy`, the
    totals **do not** match. It rounds each line's net price before adding
    tax. At 25%, two lines at gross 998 give 1,995 against a POS total of
    1,996 (order-line.entity.js:193-196). The gap is up to about ⌈*n*/2⌉.
  - So for single-rate orders, each pricing mode has exactly one strategy
    that matches.
- **Decision:**
  - The POS total stays authoritative (ADR-037). If Vendure's
    `totalWithTax` differs from `totalMinor`, the plugin adds **one
    Surcharge** for the difference, which may be negative. Its description
    is "POS rounding", its SKU is `TALLY-ROUNDING`, and it has **no tax
    lines** (the `addSurchargeToOrder` default). The plugin then records
    the payment at exactly `totalMinor`.
  - The result carries the existing `total_mismatch` warning, with
    `expectedMinor` and the pre-surcharge `serverMinor`, so the POS still
    shows it.
  - The plugin **never changes the merchant's tax strategy.** The
    quick-start recommends one, depending on the channel:
    - tax-exclusive channels: `OrderLevelTaxCalculationStrategy`;
    - tax-inclusive channels: the default strategy.
  - **Guard for the e2e (job VA7):** vendure-dev's e2e seed is
    tax-exclusive and runs the order-level strategy, so the surcharge is 0
    on every single-rate order. A unit test covers the other three
    combinations with |surcharge| ≤ the number of lines.
- **Consequences:**
  - The order total in Vendure equals the tendered amount to the minor
    unit. That is stricter than Medusa's ≤ 1 unit (ADR-037).
  - Both strategies skip lines that have no tax lines, so the surcharge
    adds no row to `taxSummary`.
  - The same surcharge mechanism can later carry cash rounding (for
    example 5-cent rounding in Australia or Switzerland) without a new
    contract.
  - A surcharge far above the guard means the POS and Vendure disagree
    about rates. The warning makes that visible, and the order is still
    recorded (ADR-038: the ledger records facts).

## ADR-049 Vendure connector conventions

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24);
  implemented by TV1–TV4 · **Source:** DISCOVERY §2.1,
  §2.5, §3; ADR-015
- **Context:** The current connector has four defects: no `sort`; offset
  paging under a moving `updatedAt.after` bound; a bare `customFields`
  selection that fails once a variant custom field exists
  (`graphql-custom-fields.js:85` vs `:92`); and a mock on `/shop-api`.
  Vendure's `IDOperators` have no `gt`, so a `(updatedAt, id)` keyset is
  impossible through the API. `stockOnHand` is deprecated in favour of
  `stockLevels`.
- **Decision:**
  - **Checkpoint:** Medusa's pattern (ADR-015).
    - Each pass reads `filter: {updatedAt: {after: since − 1 ms}}` (an
      inclusive bound, because `after` is strict), with `sort: {id: ASC}`,
      offset pages of 100, and a `pass_max`.
    - Default `AutoIncrementIdStrategy` ids sort by creation, so a row
      created mid-pass lands at the end.
    - Out-of-order commits and a UUID id strategy remain MVP limits,
      removed by the TSP pull (ADR-050).
  - **Barcode:** a connector option names the `ProductVariant` custom
    field, `barcode` by default. The query selects
    `customFields { <that field> }`, never `customFields` bare.
  - **Stock:** `stockLevels` for the configured stock location, falling
    back to the sum over all locations.
  - **Auth:** credential kinds `bearer` (from the `login` mutation, read
    from the `vendure-auth-token` response header) and `api-key` (the
    `vendure-api-key` header). An optional channel token is sent as
    `vendure-token`.
  - **Documents:** products with nested variants, as today. A document
    carries only fields the schema declares, as in Medusa's `toDocument`.
- **Consequences:** The mock API needs an `/admin-api` handler. A
  cookie-only store must add `bearer` to `tokenMethod`. The quick-start
  says so, and the plugin warns at start-up.
- **Amendment (2026-09-24, #45 and #48 reviews):** the checkpoint in both
  connectors is now pass-based and proven inside RxDB's real
  `replicateRxCollection` loop:
  - a pass ends on the list total;
  - the next pass's lower bound is a high-water mark read at the pass
    start;
  - an unchanged mark returns an empty page and ends the loop;
  - an empty page, or a shrinking total mid-pass, restarts the pass from
    zero;
  - pass state is cleared at completion, because RxDB merges checkpoints
    (`stackCheckpoints`).

  **Known gap, not fixed:** if a row that was already read is deleted and
  a new row enters the window in the same pass, the total is unchanged. The
  shrink check then misses it, and one row can be skipped until the next
  change to it or the reconcile pass (ADR-060). This is rare and recorded
  here deliberately.

- **Store settings (TV4a, 2026-09-24).** `storeSettings` reads the
  channel's currency and `pricesIncludeTax`, and the default tax
  zone's enabled, non-customer-group rates, keyed by tax category
  id, in integer ppm, rounded once.
  - The `default` rate is the `isDefault` category's, or, when none
    is flagged, the first category `taxCategories` lists. That is
    Vendure's own choice for a new variant
    (`product-variant.service.js:875`, 3.7.3).
  - When that category has no rate in the zone, the default is 0, as
    Vendure charges.
  - vendure-dev flags no default, so it gets Standard, 25%.

- **Sale prices come from Vendure's order, not the catalogue
  (2026-09-25, Front desk).** Core Vendure has no catalogue sale price:
  a promotion applies to an order, through its conditions and actions,
  at checkout.
  - **The catalogue shows Vendure's list price:** `priceWithTax` or
    `price`, per the channel's `pricesIncludeTax` (TV4a).
  - **Promotions are applied where Vendure applies them, in the order.**
    The POS prices a sale through Vendure's active-order calculation at
    checkout. **It never reimplements promotions client-side**, because
    their conditions (customer groups, minimum amounts, coupon codes,
    date windows) would drift from the store's.
  - **Catalogue "sale" badges are out of scope for Vendure** until a
    plugin exposes promotion previews. So `getPrices` returns only a
    `base` price, and `getSalePrice` and `isOnSale` stay empty.
  - **Unlike Medusa**, whose store API resolves sale price lists into a
    per-variant `calculated_price` (ADR-060 amendment 8, D2b), Vendure
    has no catalogue-level equivalent. That's why the two connectors
    differ here.
  - **Multi-channel choice** (which channel's token a till uses) waits
    for the Vendure POS app. Today the channel is the `channel_token`
    credential.

## ADR-050 The Vendure change feed is a journal written in the transaction

- **Date:** 2026-09-24 · **Status:** Accepted as the post-MVP design for
  M6 proper (Front desk, 2026-09-24) · **Source:** DISCOVERY §2.6, §4, §5;
  ADR-023
- **Context:**
  - Vendure soft-deletes products, variants and customers, and every list
    hides them. `deletedAt` is not in the schema.
  - Removing a product from a channel leaves no trace in the API.
  - There are no core webhooks and no GraphQL subscriptions (#2369 is open
    but backlogged).
  - The EventBus publishes after commit, in-process, with no replay. A
    crash between commit and a handler loses the event, and the worker
    process never sees the server's events.
- **Decision:** The Vendure plugin's TSP `pull` reads a journal table that
  a **TypeORM entity subscriber** writes in the same transaction as the
  change. It covers Product, ProductVariant, ProductVariantPrice,
  StockLevel, Customer and channel membership.
  - Each row is a pointer, `{seq, type, id, channelId, deleted}`, as in
    WCPOS.
  - It is read below a high-water mark by `@tallyui/sync-server`.
  - Removal from a channel is a tombstone in that channel's scope.
  - EventBus events are used only as SSE wake-up hints.
- **Consequences:**
  - The conformance suite's guarantees (no missed or resurrected rows
    under out-of-order commits, ties and deletes) hold on Vendure for the
    same reason they hold on the reference server.
  - Raw SQL imports bypass subscribers; nightly `ids` reconciliation
    catches those.
  - Separate `prices` and `stock` collections follow directly from the
    journal types.

## ADR-051 The "small backend" KPI is reported in lines and bytes

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24) ·
  **Source:** DISCOVERY §6
- **Evidence:**
  - Medusa plugin: 988 non-test lines (medusapos/app `e06f477`,
    `packages/medusa-plugin`, excluding `jest.config.js`).
  - Medusa connector: 667. Together they are 1,655, so M6's "≤ 50%" is
    about **828 lines**.
  - The Vendure connector is 578 lines today, including 154 of deprecated
    `sync`.
  - My estimate for Vendure plugin + connector at the MVP is 1,050–1,350
    lines, roughly 65–80% of Medusa's. The plugin adds checkout
    configuration Medusa did not need: a price strategy, a payment
    handler, a shipping checker and custom fields.
  - medusapos code averages 55–60 characters per line, so line counts
    reward dense code.
- **Decision:**
  - The target stays at 50%.
  - It is judged like-for-like at the end of M6 proper, when both
    backends carry sign-in, store settings and the TSP pull.
  - It is measured on non-test source, in both lines and bytes, at the end
    of each Vendure milestone, and recorded in DECISIONS.md.
  - A miss is reported, not squeezed: specs never ask Codex to compress
    code to meet it.
- **Consequences:** If the MVP lands above 50%, the report says which part
  (for example checkout configuration) is Vendure-specific, and whether
  the excess belongs in `@tallyui/sync-server`.

## ADR-052 Neutral POS app pieces move from medusapos/app into TallyUI

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24);
  implemented by TV5–TV7 · **Source:** medusapos/app
  origin/main `e06f477`, `apps/expo`; ADR-014
- **Evidence:** `apps/expo` has 1,165 lines of `.ts`/`.tsx` source outside
  tests and type stubs.
  - **About 560 are platform-neutral and move:** `use-sale` (79),
    `catalogue` (71), `receipt` (41), `cart` (35), `tender` (29),
    `sync-status` (20), `print-style` (14), `order-store` (54),
    `use-outbox` (61), `outbox-context` (20), `product-cache` (46),
    `register` (18), `orders` (32), `lib/cart` (22) and `lib/catalogue`
    (21).
  - **About 350 are Medusa-specific:** `session` (111), `store-settings`
    (108), `session-context` (63) and `login` (64).
  - `use-replicated-products` (106) is mixed. It contains the bearer
    workaround from medusapos #16.
  - The `index` screen (121), `_layout` and `config` (29) are app wiring
    and stay in each app.
- **Decision:**
  - Before the Vendure app is built, the neutral pieces move into
    `@tallyui/pos` (sale state, order store, outbox wiring, device id) and
    `@tallyui/components` (catalogue, cart, tender, receipt, sync status,
    orders / needs attention).
  - Sign-in and store settings become optional connector capabilities in
    core (TV3, TV4), each implemented per connector.
  - The Vendure app consumes all of these. medusapos/app switches to them
    in its own job, when convenient.
  - If the move slips, the fallback is copying the files into
    `vendurepos/app` and recording the duplication.
- **Consequences:**
  - The second app costs about half the first.
  - A third backend (WooCommerce, or Shopify if it is unparked) gets the
    same screens.
  - TallyUI takes on UI that was app-local, so it must stay neutral: no
    `'$'`, no Medusa field names, currency only from the trait context.

## ADR-053 The Vendure MVP starts before the conformance gate (plan V-D1)

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24);
  amends ADR-020's sequencing for the MVP only · **Source:**
  [vendure/PLAN.md](vendure/PLAN.md) §5 V-D1
- **Decision:**
  - The Vendure MVP starts once post-MVP backlog items 1–5 and 7
    ([programme plan §2.5](plans/2026-09-programme.md)) have merged:
    - 1: npm release;
    - 2: LICENSE in the tarballs, with an install smoke test;
    - 3: outbox leader election;
    - 4: surfacing 400 and 401 errors;
    - 5: the Medusa Bearer credential (merged in #35);
    - 7: the `uuidv7` in-millisecond counter.
  - ADR-020's gate, "the conformance suite is green on Medusa", stays in
    force for *M6 proper*.
- **Consequences:** The Vendure app inherits the shared outbox and
  publishing fixes, but not the TSP pull. Its MVP limits (no tombstones,
  stale prices until the next pass) match the Medusa MVP's.

## ADR-054 The vendurepos organisation, repository and npm scope (plan V-D2)

- **Date:** 2026-09-24 · **Status:** Proposed; **Needs Paul** (the Front
  desk is asking him). It would amend ADR-028's timing · **Source:**
  PLAN §5 V-D2
- **Proposal:** Create the `vendurepos` GitHub organisation, the
  `vendurepos/app` repository and the `@vendurepos` npm scope now, rather
  than when M6 starts. The repository mirrors medusapos/app and is public
  and MIT. The plugin is published as `@vendurepos/plugin` by trusted
  publishing (ADR-042's pattern).
- **Consequences if accepted:** Plan V0 can start. Until then, V0 and the
  plugin and app tracks are blocked. The TallyUI track (TV1–TV8) is not
  blocked.

## ADR-055 Demo backends run on the Coolify VPS under the demo rules (plan V-D3)

- **Date:** 2026-09-24 · **Status:** Accepted (Paul, 2026-09-24, via the
  Front desk). This replaces the plan's first V-D3 options, which proposed
  a separate VM and "never the Coolify VPS" · **Source:** Paul's
  no-new-server ruling; `~/agent/plans/medusapos-demo-backend.md`
- **Decision:**
  - **No separate server.** The Vendure MVP keeps option (a): testers
    bring their own Vendure, and the marketing demo is in-browser
    (ADR-027's pattern).
  - A Coolify-hosted demo backend is a planned follow-up, mirroring
    Medusa's under the same rules:
    - resources prefixed `vpdemo-`;
    - never the production image tags. `postgres:17-alpine`, `redis:7.2`,
      `mongo:7` and `mariadb:11` are excluded because a host cron attaches
      the production network aliases by image, so Vendure's database uses
      `postgres:16-alpine`;
    - no existing `coolify`-network alias and no WCPOS resource names;
    - memory and CPU limits;
    - a prebuilt image from GitHub Actions (GHCR), with no build on the
      VPS;
    - a nightly reset from a golden database.
  - **The Front desk executes every Coolify write,** one at a time, with
    the rollback in hand. Workers do not touch that server (see
    `~/Projects/CLAUDE.md`).
- **Consequences:**
  - The follow-up needs a Vendure `Dockerfile` and a GHCR workflow in
    `vendurepos/app`, both worker jobs. Coolify provisioning is the Front
    desk's job.
  - The host was already at a load of about 11 on 12 cores when the Medusa
    demo was planned, and Vendure runs two processes (server and worker).
    Check the load before adding it.

## ADR-056 Vercel project and domain for the Vendure POS (plan V-D4)

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24) ·
  **Source:** PLAN §5 V-D4; read-only checks on this machine, 2026-09-24
- **Decision:** A Vercel project `vendurepos` on the WCPOS (Pro) team,
  deployed through the Git integration. `app.vendurepos.com` points at it
  by CNAME.
- **What this machine can do itself** (checked read-only; nothing was
  created):
  - `vercel whoami` returns `kilbot`, and `vercel teams ls` shows the
    `wcpos` team (Pro) next to the personal Hobby scope.
  - `vercel project ls --scope wcpos` lists `medusapos`
    (https://app.medusapos.com), which a worker created through this CLI
    login. So creating `vendurepos` in the same scope with the CLI is
    within reach.
  - Linking it to GitHub needs `vendurepos/app` to exist first (ADR-054),
    and the Vercel GitHub app must have access to that organisation.
  - Squarespace DNS has no API. The medusapos CNAME was added by Codex
    computer use with the keychain item `squarespace-domains`. The ledger
    records that it needed Paul's Google step-up sign-in, so expect one
    prompt to Paul.
  - `RXDB_PREMIUM` can be set in the project's environment with
    `vercel env add`, once ADR-057 allows Premium in that build.
- **Consequences:** Paul's part shrinks to the Google step-up during the
  DNS change and to ADR-054.

## ADR-057 RxDB Premium licence coverage for vendurepos (plan V-D5)

- **Date:** 2026-09-24 · **Status:** Proposed; **Needs Paul** (the Front
  desk is asking him) · **Source:** PLAN §5 V-D5; ADR-045
- **Question:** RxDB Premium is licensed per project. Does the licence
  cover medusapos and vendurepos as well as TallyUI?
- **Proposal:** Until Paul confirms, the Vendure web app runs on Dexie.
  Storage is injected, so switching is one change (ADR-031), and this does
  not block the MVP.

## ADR-058 Vendure dev and e2e stores on the Mac mini (plan V-D6)

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24) ·
  **Source:** PLAN §5 V-D6; `~/Projects/CLAUDE.md` (test stores are
  placed by the Front desk with Paul)
- **Decision:**
  - vendure-dev (127.0.0.1:3000) and the e2e store (:3100, with its own
    database) run on this Mac mini, bound to 127.0.0.1, on Postgres 17
    from brew, like medusa-dev. Neither is exposed publicly.
  - Only one test suite runs at a time.
  - CI e2e runs on GitHub Actions with a Postgres service.
- **Consequences:** Plan job VA1 can start as soon as ADR-054 is accepted.

## ADR-059 The Vendure barcode custom field is opt-in (amends ADR-049)

- **Date:** 2026-09-24 · **Status:** Accepted (implemented in TV1, #45) ·
  **Source:** Vendure 3.7.3 `graphql-custom-fields.js:85` vs `:92`;
  DISCOVERY §2.1
- **Context:** ADR-049 said the barcode custom field would default to
  `barcode`. But the query can only name a field that exists:
  - on a store with no `ProductVariant` custom fields, `customFields` is a
    `JSON` scalar, and selecting `customFields { barcode }` fails GraphQL
    validation;
  - on a store with custom fields, selecting `customFields` bare fails.

  So no default works for every store.
- **Decision:**
  - `createVendureConnector({ barcodeField })` names the field. Without it,
    no custom fields are queried and `getBarcode` returns `undefined`.
  - The Vendure plugin (job VP1) adds the barcode custom field, and the
    Vendure app passes `barcodeField: 'barcode'`.
  - The rest of ADR-049 stands.
- **Consequences:** A store that keeps its barcode in a differently named
  field just passes that name. A store with no barcode field still syncs;
  scanning then matches on SKU only.

## ADR-060 Catalogue freshness: variant-level incremental pulls plus reconcile passes (Vendure and Medusa)

- **Date:** 2026-09-24 · **Status:** Accepted (Front desk, 2026-09-24), with
  eight amendments, which are folded into the decision below · **Source:**
  probes and measurements on the local
  Vendure 3.7.3 dev store (`~/Projects/vendure-dev`, UTC, 2,000 products and
  3,334 variants); Medusa 2.21 source and schema (read-only)
- **Context.** Both connectors pull products incrementally by the product's
  own `updated_at`. That misses most of what a POS needs to stay fresh:
  - **Vendure, probed:**
    - A price edit and a stock edit on a variant bump
      `ProductVariant.updatedAt` but not `Product.updatedAt`. The product
      stayed at `06:23:37.108Z` while the variant moved to `06:57:39` and
      then `06:57:41`.
    - An order allocation at `PaymentSettled` moved `stockAllocated` from
      0 to 1, and **neither timestamp changed**.
  - **Medusa, from source:** `updateInventoryLevelsWorkflow` writes only
    inventory levels. Price sets live in the pricing module. Neither
    touches the product module's `updated_at`.
  - So after the first pass, price and stock changes never arrive through
    the product feed. Stock changes from orders are invisible even to a
    variant-level feed on Vendure, and prices and stock are invisible on
    Medusa.
- **Other findings behind this ADR:**
  - **Vendure filter skew.** Vendure's `updatedAt` columns are `timestamp
    without time zone` in server-local time, but its list filters compare
    them against ISO UTC strings.
    - At UTC+2, `after(<newest updatedAt>)` returned all 2,000 rows.
    - West of UTC, it would silently miss the latest changes.
    - A consistent store needs both the Node process (`TZ=UTC`) and the
      database session (`TimeZone=UTC`) in UTC. With the process alone,
      `now()` defaults are stored in local wall time and read back as UTC,
      2 hours ahead.
    - Medusa's columns are `timestamptz` (checked in medusa-dev's schema),
      so it is immune.
    - #45 guards against the skew: it throws on a negative offset, warns
      on a positive one, and offers `updatedAtSkewMs`. An upstream issue is
      drafted in `docs/vendure/upstream-issue-updatedat-timezone.md` for
      Paul.
  - **Microsecond timestamps.** Postgres stores microseconds, and the API
    returns milliseconds, so `after(mark)` returns the mark's own row.
    Probes and bounds must allow ±1 ms.
  - **Why live tests exist.** The live test against the dev store found
    that RxDB had rejected **every** Vendure batch
    (`createdAt: must NOT have additional properties`), so the connector had
    never stored a product. Fake-server tests hid it. Every connector gets
    an env-gated live test against its dev store (Vendure in #45; Medusa is
    backlog item 27).
- **Measurements** (Vendure dev store; median of 3 runs; local machine
  shared with other workers):

  | Request | Median | Requests | Transfer |
  |---|---|---|---|
  | Full product pass, 100 per page (products with variants, stock, barcode) | 8.2–10.1 s | 20 | 1.7 MB |
  | Full product pass, 1,000 per page | 10.8–11.0 s | 2 | 1.7 MB |
  | High-water check (1 product, `updatedAt DESC`) | 8 ms in a quiet run; one 2.3 s outlier under load | 1 | < 1 KB |
  | Variant incremental, idle | 4 ms | 1 | < 1 KB |
  | Variant incremental, 10 variants changed | 23 ms | 1 | 2 KB |
  | Stock reconcile pass (all variants: `id` + `stockLevels`) | 3.7–3.8 s | 4 | 292 KB |
  | Id reconcile pass (all products: `id`) | 0.9 s | 2 | 26 KB |

  The live test replicated all 2,000 products in about 10.5 s. Medusa's
  equivalents still need measuring on medusa-dev, by a worker with its
  admin credentials.
- **Decision:**
  1. **The target is the plugin journal (ADR-050).** When it lands, it
     replaces the incremental feeds. The reconcile passes below **stay after
     it lands, as the backstop**. Everything else here is TallyUI-side and
     is the interim design until then.
  2. **A stock reconcile pass for both connectors:**
     - It reads only ids and stock: Vendure `productVariants { id
       stockLevels }` at 1,000 per page; Medusa inventory levels.
     - It patches a local document only when its stock differs.
     - **Cadence is a connector option, defaulting to 5 minutes**, run
       after first paint, one pass at a time, with a request cap per tick
       (the WCPOS politeness rules). At 3,334 variants that is 4 requests
       and 292 KB every 5 minutes.
     - **There is also an on-demand trigger, `reconcileStock()`** (amendment
       1). The app calls it on foreground and resume, and after a sale is
       refused for stock.
  3. **A Vendure variant feed.** A second incremental pull over
     `productVariants`, with the same pass and high-water design (sort by
     id, filter `updatedAt`, a total, and the unchanged-mark early return).
     For each changed variant, its parent product is re-fetched, batched by
     id, so documents keep today's product-with-variants shape. This covers
     price and variant edits for 4–23 ms per poll. The product feed stays
     for product-level fields.
     - **It runs inside the product replication, not beside it**
       (amendment 5, from the #58 review). Two pull replications on one
       collection interfere in two ways:
       - **Skipped pulls.** Each sees the other's writes as local writes,
         and skips a pulled version until its own no-op upstream catches
         up. Measured: 0 lost in 60 single-document probes, 0 lost in
         5,000 bulk documents, and one loss on CI.
       - **Stale re-puts.** Both write whole product documents with no
         ordering. A variant-feed fetch made before a product-feed rename
         can land after it and put the old name back, and neither
         checkpoint ever revisits it. The reviewer reproduced this with a
         gated test.
       - **The fix.** `combinePullAdapters` (`@tallyui/core`) runs the
         product pass and then the variant pass, **strictly in sequence
         within one handler call**, and keeps the latest fetch per id. The
         collection has one replication. This is the rule for every
         connector: **one replication per collection, with every feed
         going through the combiner.**
     - **A carrier document keeps the cursor moving.** Suppose a call's
       variant pages map to no live parents. It would return an empty page,
       and RxDB discards an empty page's checkpoint, so the cursor would
       stick mid-pass. Instead, such a call re-delivers one live product so
       the checkpoint persists.
     - **The first sync costs roughly double, once.** With no checkpoint,
       the variant pass re-delivers every product that has variants. The
       reviewer measured 12.2 s + 13.5 s at 2,000 products. This is
       accepted, because it heals changes missed before the feed existed.
       On upgrade, there is no re-download through the product feed: its
       old checkpoint carries over (`legacyKey`) and it resumes with one
       mark read. Only the variant pass runs in full.
  4. **An id reconcile pass** at app start and nightly: ids only (0.9 s at
     2,000 products). It also covers the same-millisecond high-water gap
     and ADR-049's known gap.
     - **It tombstones local documents only after a complete, successful
       pass** (amendment 2). A pass that fails or is cut short deletes
       nothing.
     - **It covers variant ids too, on both platforms** (amendment 6).
       Deleting a variant never touches its parent's timestamp:
       - on Vendure, the variant just disappears from `productVariants`;
       - on Medusa, `deleteProductVariantsWorkflow` soft-deletes the
         variant and its inventory items and leaves the product's
         `updated_at` alone. This was confirmed by an executed probe on
         medusapos's disposable e2e store.

       So a deleted variant stays sellable locally. On Medusa it gets
       worse: the stock reconcile removes the item's overlay row, so the
       overlay falls back to the replicated product's old stock.
     - **Corrections reach the collection only through the pull.**
       - After a complete pass, the id reconcile queues every local product
         that is missing on the server, or that lists a vanished variant.
       - A reconcile feed, the **last** key in the combined adapter,
         re-fetches the queued products fresh:
         - a product that still exists arrives as it is now, with its
           deleted variants gone;
         - a product that no longer exists arrives as a tombstone built
           from the local document, which keeps required fields valid.
       - Because the reconcile feed runs last, its fetch is the freshest in
         the call and wins duplicates. Nothing ever writes locally into
         the replicated collection.
       - It runs once shortly after start (a device that was off overnight
         needs a pass on wake), then nightly.
     - **Medusa's incremental filter was being ignored** (amendment 7, from
       the medusapos probe; reproduced read-only on medusa-dev). Medusa
       2.21 honours only the operator form `updated_at[$gte]`. With a 2099
       mark, `updated_at[gte]` returned all 2,005 products, and
       `updated_at[$gte]` returned 0.
       - So every Medusa pass that ran at all was a full catalogue read.
         That also hid the deleted-variant bug, which appears as soon as
         the filter works.
       - Job C2 fixes the filter and adds the id reconcile together. Every
         incremental filter is proven live with a future-dated mark,
         because fake servers honour whatever they are sent.
  5. **Medusa prices:** price-set changes need a price reconcile pass at a
     slower default cadence, or a variant-price feed if Medusa's
     variant-price routes support an `updated_at` filter. This is decided
     after measuring on medusa-dev.
     - **Measured** (amendment 8, read-only on medusa-dev, 2026-09-24):
       - `GET /admin/product-variants` lists all 5,655 variants with their
         prices.
       - A full price pass takes **6 requests** at 1,000 per page and
         **2.7 MB**, or about 1.9 MB when only `id`, `prices.amount` and
         `prices.currency_code` are selected. It took about 3–10 s on a
         loaded machine.
       - Sale prices live in price lists: 1,386 prices, one request,
         57 KB.
       - `updated_at[$gte]` on the variant route is honoured (a
         future-dated mark returns 0).
       - `prices.updated_at[$gte]` is rejected with 400.
     - **Probed** on medusapos's disposable e2e store (Medusa 2.21.0, the
       medusapos script `variant-price-edit.sh`):
       - **a price-only edit bumps the variant's `updated_at` and not the
         product's**, through both the admin dashboard's batch route
         (`POST /admin/products/:id/variants/batch`) and the single-variant
         route (`POST /admin/products/:id/variants/:variant_id`);
       - the variant went from 17:40:25.954 to 28.872, then to 31.272;
       - the product stayed at 17:40:25.802.
     - **Decision (front desk):**
       - **A Medusa variant feed catches price edits incrementally.** It
         works like Vendure's: pass-based on the variant's `updated_at`,
         re-fetching parent products as a sub-adapter of the combined pull,
         with the carrier.
       - A price-list check covers sale prices every 30 minutes.
       - A full variant-price pass with the trimmed fields runs nightly as
         the backstop.
       - All of them deliver through the pull, never as local writes, and
         their cadences are options.
       - **Replicated Medusa documents carry no sale prices today**
         (measured read-only on medusa-dev, 2026-09-24).
         - Scanning 1,161 variants fetched with the replication's fields
           found no price with a `price_list_id` or `price_set_id`, and no
           `calculated_price`. The sale prices exist only under
           `/admin/price-lists`, keyed by `price_set_id`.
         - **Decision (front desk):** the replication will fetch with a
           pricing context from the store settings (TV4), so Medusa itself
           fills in `calculated_price`, and the traits read it. A POS that
           re-implemented price-list rules, dates and customer groups would
           drift from the store.
         - The 30-minute price-list check then re-delivers products whose
           sale prices changed (job D2b, after TV4).
         - The nightly base-price pass (D2a) comes first.
         - D2b: prices come from the store API with the pricing context.
           The enrichment runs on every document build, `null` means not
           sellable, and the 30-minute calculated-price check covers edits
           that bump no timestamp.
           - **Measured** (one full calculated-price pass on medusa-dev,
             read-only, 2026-09-24, from
             `pricing/calculated.live.test.ts`): 20 requests, 2.5 s and
             4.2 MB over 2,005 products.
             - It compared 1,951 products and queued 0.
             - `unreported` was 54, exactly medusa-dev's 54 draft
               products.
             - Priced documents show a sale on 242 products (684
               variants).
             - D2a's nightly base-price pass still finds no drift.
     - **Vendure gets the same nightly base-price backstop
       (`reconcile.prices`).** Its concrete drift is a tax-rate change,
       which moves `priceWithTax` with no `updatedAt` bump.
  6. **Vendure servers run in UTC**, both the process and the database
     session, or set `updatedAtSkewMs`. The Vendure quick-start says so.
- **Job order**, decided by value to the shipping product (amendment 3).
  Each job is one Codex spec, with a real-loop or live test as its proof:
  - **A.** The shared reconcile runner, with the stock reconcile for
    **both** connectors in one job. It includes measuring Medusa inventory
    levels on medusa-dev (127.0.0.1:9000).
  - **B.** The Vendure variant feed.
  - **C.** The id reconcile, covering products and variants. It is split
    into two jobs: **C1**, the neutral contract, the runner and the
    reconcile feed, plus Vendure; and **C2**, Medusa, together with the
    `updated_at[$gte]` filter fix.
  - **D.** The Medusa price reconcile, after measurement.

  TV3 (sign-in) follows these jobs.
- **Until job A lands, neither POS (medusapos or vendurepos) treats
  replicated stock as live.** The connectors' stock is only as fresh as the
  last product-level change.
- **Amendment 9. Connector schema bumps are drop-and-resync, by rule
  (2026-09-25, backlog 44).** A connector schema describes a server-owned,
  pull-replicated collection.
  - A version bump drops its documents: `createTallyDatabase` supplies
    `v => null` strategies.
  - It also resets the checkpoint: `startReplication`'s identifier gains
    `-v<version>` above version 0. With #97's seed, the catalogue then
    downloads once.
  - **Why not an identity transform:**
    - Under a fresh replication identifier, every migrated document
      looks locally changed to the downstream. That is exactly the
      skip-the-next-pull failure the no-local-writes rule exists to
      prevent.
    - It would also keep documents the server deleted in the meantime.
  - **An upgrade arrives over the network** (a web bundle or a store
    update). So the till was online moments before, and it resyncs in
    about 17 s on medusa-dev.
  - **A consumer that wants an offline-safe upgrade must ship the bump
    while online.**
  - Local-only collections (`stock_levels`, `pos_orders`) are never part
    of this rule.

## ADR-061 TallyUI databases are single-instance; web storage is RxDB Premium SQLite-wasm

- **Date:** 2026-09-24 · **Status:** Accepted (Paul's ruling, via the
  Front desk); amends ADR-024 and ADR-031 · **Source:** WCPOS v1.11.0 web
  storage. WCPOS moves browser storage from the retired OPFS engine to
  SQLite-wasm (`opfs-sahpool`, WAL mode, one live tab). Sources:
  - monorepo#2146, the owner ruling closed on 2026-09-21: "web multi-tab
    ends at 2.0, as a consequence of the engine" and "one live tab, one
    dedicated worker, reload as the recovery";
  - its parent, monorepo#2137;
  - the WCPOS roadmap, `docs/research/2026-09-17-filesystem-storage-durability.md`
    §11–18;
  - monorepo PR #2190 on `next`: `adapters/default/README.md`,
    `storage-engines.ts` and `multi-instance-ruling.test.ts`;
  - in this repo, the programme plan §1.3 and `docs/vendure/DISCOVERY.md`
    ("One tab on web").
- **Context:**
  - ADR-024 assumed `multiInstance: true` with leader election, so that
    several tabs of one POS could share a database. #42 built that for the
    outbox: an RxDB-elected leader sends, and followers forward `flush()`
    through a local document.
  - On SQLite-wasm with `opfs-sahpool`, a second tab cannot open the
    storage at all, so WCPOS v1.11.0 runs one tab and has no multi-instance.
    WCPOS's earlier multi-tab write plane (wiki
    `architecture/client/web-write-leader.md`, 2026-09-22) belongs to the
    OPFS engine that v1.11.0 retires.
  - Two multi-instance defects were found on 2026-09-24:
    - RxDB 16.21.1 closes the shared BroadcastChannel before its
      leader-election `die()` posts, so every `db.close()` leaves an
      unhandled rejection;
    - follower `flush()` forwards race on their local document.

    Fixing them, and the leader-only reconcile runners planned as backlog
    item 34, would have been work for a topology WCPOS is leaving.
- **Decision:**
  1. **TallyUI databases are single-instance.** `createTallyDatabase` keeps
     `multiInstance: false` as its default, and `multiInstance: true` is
     **unsupported**: no fixes, tests or features target it.
  2. **Exactly one live tab per store; a second tab never opens storage.**
     This is how WCPOS works, where it is "forced by the engine, not
     chosen": opfs-sahpool takes exclusive OPFS access handles for the
     whole origin. Paul chose single tab over the alternatives:
     - multi-tab by routing, "the most failure-prone machinery";
     - premium IndexedDB, which measured 220–750 ms against SQLite's
       1.2–6.2 ms.

     Recovery from a dead or hung storage worker is a reload.
  3. **Web storage targets RxDB Premium SQLite, like native** (ADR-031):
     - `@sqlite.org/sqlite-wasm` on opfs-sahpool;
     - WAL, with `locking_mode` exclusive;
     - one dedicated worker owned by the live tab, through premium's
       `getRxStorageWorker` in mode `'one'`.

     `multiInstance: false` changes together with the engine, and a test
     pins the pair, as in WCPOS. The switch from today's Dexie web storage
     is a **cold resync under a new database name**, not a data migration.
  4. **Taking over from another tab** follows WCPOS:
     - A new tab asks the live tab, over a BroadcastChannel, to hand over.
     - The live tab closes its storage, stops its worker, releases the
       lock, and parks on a "POS is open in another tab" screen.
     - The live tab may delay the hand-over only while a payment or a
       storage write is in flight, and only up to a limit.
     - With no answer within a few seconds, the new tab tells the user to
       close the other one.
  5. **#42's leader-election code stays, inert, until the engine lands.**
     It lives in `packages/pos/src/outbox/order-outbox.ts`
     (`database.multiInstance` branches, and the `tally-outbox-flush`
     forwarding). With a single-instance database, `isLeader()` is always
     true, so it does nothing. After the SQLite-wasm engine lands, one PR
     removes it, together with the `multiInstance` option.

     Done in this PR.
  6. **Job order, one small spec each:**
     1. Take-over and the parked tab in TallyUI, independent of the engine:
        - a Web Lock per store;
        - the BroadcastChannel hand-over with a timeout;
        - the parked "POS is open in another tab" component;
        - deferral while a sale or a write is in flight;
        - Reload as recovery.

        Apps get this before the engine.
     2. The premium SQLite-wasm opfs-sahpool worker storage as the web
        storage, gated on the licence key (ADR-031), with WCPOS's
        storage-call deadline and worker error handling. Today's Dexie
        stays until this job lands.
     3. Removing #42's multi-instance machinery and the `multiInstance`
        option.
  7. **Cancelled:**
     - backlog item 34 (leader-only runners and follower forwarding of the
       id reconcile);
     - the multi-instance close and follower-flush fixes (their work was
       discarded, never merged);
     - the RxDB upstream issue draft
       (`docs/rxdb/upstream-issue-leader-election-close-order.md`), which is
       kept as a record, marked "not pursued", and will not be posted.
- **Consequences:**
  - The reconcile runners (ADR-060) need no leadership gating: the one tab
    runs them.
  - Every tab-coordination question goes away. For example, "which tab
    sends the outbox" and "which tab replicates" both have the same answer:
    the one tab.
  - The cost: a cashier cannot open the POS in two tabs at once. The guard
    must say so plainly.
- **Amendment 1 (2026-09-24, Front desk): the park order is close, then
  terminate.** Found while switching the Medusa POS to the new engine.
  - **The earlier order was wrong.** `live-tab.mdx` told apps to
    terminate the storage worker and then close the databases.
    - RxDB's remote `close()` sends `close` to the worker and waits for
      the reply, and it frees the database name only when the close
      finishes.
    - So with the worker terminated first, every close hangs and the name
      stays taken. The next open fails with `DB8`.
  - **Decision:**
    1. `onPark` first stops the runners.
    2. It then awaits the close of every database with the worker still
       alive, bounded by a fixed limit: `PARK_CLOSE_LIMIT_MS`, 3 s. That
       fits the new tab's 13 s "blocked" deadline (`maxDeferMs` 10 s plus
       `ackTimeoutMs` 3 s) after the longest deferral.
    3. It then terminates the worker, which releases the opfs-sahpool
       access handles.
       - `storage.terminate()` (storage-sqlite) replaces a raw
         `worker.terminate()`: in mode `'one'`, rxdb's storage-remote caches the channel
         by `workerInput`, so a raw terminate left the next open hanging.
    4. On timeout it terminates anyway, treats storage as stalled, and
       prompts a reload.
  - **One storage for all stores.** An app creates one
    `getRxStorageSQLiteWasm` storage, in mode `'one'` with one worker
    holding the exclusive pool, and opens every store's database on it. A
    second storage would start a second worker, which cannot open the pool.
