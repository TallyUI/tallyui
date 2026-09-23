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
