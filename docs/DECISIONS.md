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

- **Date:** 2026-09-23 · **Status:** Superseded as the target protocol
  by ADR-067 · **Source:** plan §1.3, §1.5, §2.1
- **Superseded by ADR-067 (2026-09-28):** TSP v1 is no longer the target
  protocol. TallyUI consumes the WCPOS sync engine, and the target is the
  engine's protocol as each driver maps it onto its platform. The TSP
  plugin and connector stay in service for the Medusa and Vendure testers
  until their drivers exist.
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
  part of ADR-003; amended by ADR-061 and ADR-067 · **Source:** plan §2.1
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
  **Amended by ADR-067:** pull-only reads and the `order.create` outbox
  remain for Medusa and Vendure until their engine drivers exist, then
  retire platform by platform. The WooCommerce app uses the engine's
  demand-driven partial replicas and mutation queue from the start.
- **Consequences:** Product push handlers are removed from every connector.
  Demand-driven partial replicas (the WCPOS approach) are adopted only if
  the M2 benchmark misses its budget.
- **The outbox reads past RxDB's query cache (2026-09-26).** RxDB 16.21.1's
  bug 4 (TallyUI's local repro): a document written while a cached query's
  storage read is in flight never reaches that query, so a raced sale stayed
  unsent until a restart. `createOrderOutbox` reads its pending batch, its
  pending count, the rejected orders to requeue and an order's state before
  patching with `readFresh`/`countFresh` (`@tallyui/pos`), which send RxDB's
  prepared query straight to the storage.
  - Live displays a cashier would act on (`useRegisterSession`, `useOrderOutbox`'s recent list)
    use `watchFresh` (`@tallyui/pos`) instead of a cached `find().$`, for the same reason.
    It re-reads once per bulk write (`collection.eventBulks$`; SQLite: per 199 documents), not per document.
  - The helpers now live in `@tallyui/core/rxdb`, a side-effect-free subpath with `rxdb`/`rxjs` as optional peers (core's main entry stays RxDB-free; `@tallyui/pos` re-exports them and never imports `@tallyui/database` at runtime), and the id and fingerprint reconciles read their local products with `readFresh`.

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
  - **Amendment (2026-09-29, Front desk):** TallyUI runs 17.5.0 ahead of
    WCPOS. On 17.4.0, reopening `pos_orders` after an interrupted
    migration loops forever (upstream bug 3); 17.5.0 fixes it. WCPOS moves
    to 17.5.0 in its own PRs, and the pins meet again there. 17.5.0
    cancels a running migration when the database closes, so
    `openPosOrders` settles with its closed error once the calls already in
    flight have finished.
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
  criterion) · **Source:** plan D3 · **Amended by ADR-068:** registers
  sync to the server as `register.*` commands (c2)
- **Decision:**
  - Port the neutral payments, tender and register logic from WCPOS `next`
    into `@tallyui/pos`, carrying the WCPOS tests over.
  - Copy the stable neutral packages (printer, scanner, receipt schema and
    renderer) only when a milestone needs them.
  - Nothing changes in the WCPOS repositories without Paul.
- **Amendment 1 (2026-09-25): port provenance and a re-sync checklist.**
  - **Port provenance:**
    - The tender reducer (#118): WCPOS `next` `3b5331b5c`, `tender-state.ts`.
    - The register maths (registers job a1):
      `3b5331b5c`, plus the three commits that introduced it on `next` —
      `4311853a1` (roadmap#269, sessions and movements), `e555d6143`
      (roadmap#270, counting and closure) and `21b57723e` (#2131, the
      closures room). Refund attribution (`attributeRefunds`) is deferred
      until TallyUI has a refund model (a decision for Paul).
  - **Re-sync from `next` checklist**, for job a2 or any later port from
    the same WCPOS sources:
    - Diff each source path between the pinned commit above and the new
      `next` head.
    - Port behaviour changes with their tests.
    - Keep the neutral changes: integer minor units (with a required
      `exponent` wherever typed text becomes minor units), no WooCommerce
      meta, no outbox fields.
    - Update the pinned commit in this entry.
    - Run the ported tests.
- **Amendment 2 (2026-09-25, the Front desk): register sessions (registers
  job a2), from the same WCPOS `next` commit.**
  - **Three local-only collections** in `@tallyui/pos`:
    `register_sessions`, `cash_movements` and `closures`. They start at
    version 0, the app creates them, and they are never replicated.
    - WCPOS's outbox fields are removed, and so are the closures' server
      and print fields.
    - The optional fields for a server to acknowledge a session
      (`pending_status`, `server_status`, `status_at`, `approver_token`,
      `server_expected` and `server_sales_count`) are kept, so that job c
      needs no schema bump.
  - **The register's identity and counters** are a local document on
    `register_sessions`, because the Tally database has no database-level
    local documents (#74). Store binding uses one neutral `storeKey`
    string. Adopting the server's counters is job c.
  - **A sale's session:**
    - `PosOrder.sessionId` is set only by `stampSession`, which checks the
      session is live (`finalizeOrder` takes no session).
    - **Amended (the Front desk, 2026-09-28):** it is no longer device-only.
      `order.create` version 3 sends the sale's session, stamped or late, as
      one payload field, `sessionId` (see ADR-065's amendment). Registers c2
      needs it to anchor each session's expected cash on the server, and
      adding it later would have cost a version 4. Below version 3 it is
      never sent.
    - Adding it bumped `posOrderSchema` to version 1, with an identity
      migration.
    - Apps create `pos_orders` with `posOrderCollection()`, which carries
      the migration strategies, so they can't be forgotten.
    - Within one run, RxDB 16.21 keeps an order that fails validation
      during migration: it stops with DM4 and keeps the version-0 storage
      (`migration.test.ts`). **Across runs, RxDB's own open path can lose
      that order.** A failed run can leave its checkpoint past it, and the
      next run then removes the version-0 storage without copying it. This
      was reproduced with 451 orders: RxDB's path ended with 450. That's
      one more reason apps must use `addPosOrderCollection` (next bullet),
      which resets the checkpoint.
    - **Apps open `pos_orders` with `addPosOrderCollection(db)`** (2026-09-25,
      medusapos #64 review). RxDB 16.21 trusts its stored migration status:
      after a DM4, `migratePromise` rejects at once while the migration runs
      on, so on SQLite a close interrupts it on every open; and a `DONE` left
      from before a rollback lets the store open before the version-0 app's
      new sales have moved. A failed run's checkpoint can also be past an
      order it never copied, which the next run then removes. The function
      resets the status and that checkpoint (never an order or its storage),
      awaits the migration itself, holds a close until it settles, and
      resolves only when no version-0 order is left.
      - **A close waits for the whole open (2026-09-27, CI run
        36330600164).** The close-wait handler used to be registered only
        after the open's first awaits. RxDB reads `db.onClose` once, when the
        database is idle, and creating or removing the checkpoint store
        doesn't keep it busy. So a close landing there closed `pos_orders` and
        the internal store under the open, which failed with rxdb-premium's
        raw `ReferenceError: context is not defined`. No order was lost, but a
        write to a closed SQLite instance poisons every later write on that
        handle until restart. Now the handler is registered before the first
        await, and it waits (up to `POS_ORDER_MIGRATION_CLOSE_WAIT_MS`) for
        every open on that database, not only its migration.
      - **The coded error:** if the database's close had already begun when
        the open was called, or the close stopped waiting for it, the open
        stops before any further write. It then rejects with
        `PosOrderOpenClosedError` (`code: 'POS_ORDER_OPEN_CLOSED'`), which
        means "closed during the open, reopen". Any other rejection is a real
        failure.
      - **A close that stops waiting mid-migration (2026-09-27, the #152
        review).** When the wait expires while RxDB's migration is still
        running, the close goes on to close the current version's store and
        the internal store, and the migration used to keep writing into them:
        on SQLite a raw `SQLite.bulkWrite() already closed`, an unhandled
        rejection, and a poisoned handle whose next open failed the same way
        (rxdb-premium bug 6). No order was lost. Now, from the moment the
        close gives up (before it closes any store), the run's reads and
        writes of those two stores stop in `addPosOrderCollection`: one of the
        current version rejects the run's push, so the run ends in `ERROR`,
        and a status write is dropped. SQLite's own close waits for a write
        called before it, so no write reaches a closed instance; the open
        rejects with `PosOrderOpenClosedError`, and the next open on the same
        handle migrates every order.
  - **A closed session is final.** WCPOS's server refuses writes to it;
    until job c the store does: nothing leaves `closed`, movements need an
    `open` or `counting` session, and `writeClosure` a closed one.
  - **Orders the server rejected still count in the drawer**, because the
    cash was taken.
  - **The read-then-insert windows (#123 and #126 reviews, 2026-09-25):**
    the local store checks a session, then writes, and a close can land in
    between. There are two such windows:
    - **A movement:** `recordMovement` checks the session, inserts the
      movement, then re-reads the session. The re-read narrows the window,
      but a close that lands after it can still freeze a closure without
      the movement. The principle is that the local store never deletes a
      cash record it cannot prove is uncounted. So a movement that races a
      close is removed (`RegisterSessionClosedError`) only when the
      session's closure row is already frozen without it. Before that row
      exists, it's kept and flagged stranded (`RegisterMovementStrandedError`),
      never deleted: `writeClosure` freezes its caller's movement list and
      reserves the draft before inserting the row, so the local store can't
      prove whether the movement is counted.
    - **A sale:** `stampSession` checks the session, then the caller
      inserts the order into the outbox. A close that lands in between is
      missed, and the closure freezes without the sale.
    - **Narrowed before c2 (the #156 review, 2026-09-28):** a server close
      can land in either window, and nothing local holds it off.
      - **The orphan-stamp sweep** (`sweepOrphanStamps`) finds each order
        stamped with a closed session whose closure doesn't list it, and
        makes it a late sale: `sessionId` removed, `lateSessionId` set, a
        `late-sale` fact. `useRegisterSession` runs it on start, after each
        `writeClosure` in `closeSession` (a resumed close too), and when a
        closure it hasn't seen appears, such as one c2 writes. It never
        touches the closure, an order the closure lists, an order whose
        session has no closure yet, a late order or another register's
        orders.
      - **Bounded by `swept_closure_ids` (the #158 follow-ups, 2026-09-28):**
        a per-register set on the register document, so a closure it has
        already checked costs the sweep no `pos_orders` query, and the
        set needs no schema bump (the register document is a local
        document). An id joins the set only after that closure's orders are
        patched, so a crash in between just leaves it unswept for the next
        run; the patch is already idempotent. A `sessionId` index on
        `pos_orders` would narrow the query further, but is deferred to the
        ADR-065 v3 envelope job, so tills migrate the schema once.
      - **A grace period, and a full sweep at start (the same follow-ups,
        the hole the bound left open, 2026-09-28).** `writeClosure` can
        freeze a closure before an insert racing its close lands; a sweep
        run right after finds nothing there yet, and marking the closure
        swept at once would then hide that insert forever. So a closure
        joins `swept_closure_ids` only once it is older than
        `SWEEP_GRACE_MS` (10 minutes) by its `closed_at`; until then every
        sweep re-checks it, which costs little, since there are few recent
        closures. Separately, the sweep `useRegisterSession` runs on start
        ignores the set outright and checks every closure of the register,
        which is what repairs a closed session's insert (or a server close)
        that landed while the app was closed; the bounded, fast-path sweep
        still runs after `closeSession`'s own closure and when a closure it
        hasn't seen appears. A save that hangs longer than the grace can
        still land after its closure is marked swept, and is then caught by
        the next start's full sweep instead of the one right after it; this
        is acceptable, because a save hung that long already ends in the
        storage prompt or a restart.
      - **A void re-reads its session** after its writes, as
        `recordMovement` does. On a closed session, a reversal its closure
        doesn't list, or with no closure yet (or no `closures` passed), is
        kept and flagged stranded (`RegisterMovementStrandedError`).

    The server closes both windows in job c, by refusing writes to a
    closed session.
- **Late sale (the Front desk, 2026-09-25).** The one outcome that must be
  impossible is money taken with no recorded order. `useSale.complete()`
  runs after the money is taken, so when `stampSession` refuses there, for
  any reason (the session closed, went missing, or a crash between the
  app's recheck and the stamp):
  - the sale is still finalized and handed to `onSaleCompleted`, so it is
    queued to the outbox;
  - it has no `sessionId`; `lateSessionId` (local only, `pos_orders`
    version 2) holds the id of the session it tried;
  - a `late-sale` register fact records the order, that session and the
    register;
  - the closed Z is never changed;
  - `needsAttention` surfaces the order, and `OrdersList` explains it.

  A refusal in `finalizeOrder`, before any stamp, still stops the sale.
- **Registers c1b done (2026-09-25): `useRegisterSession`**, a neutral port
  of WCPOS `next`'s `use-register-session.ts` at `3b5331b5c`.
  - **The app supplies every input:** the collections (`pos_orders`
    included), the register host, `storeKey`, `registerId`, `enabled`, the
    cashier, the timezone and the labels. There's no context, no WooCommerce
    store document and no engine query, and nothing is sent to a server.
  - **Expected cash and the sales count are derived locally**, from the
    `pos_orders` stamped with the session's id and its movements.
  - **Not ported:** `retryMovement` and `refusedMovements`, anchor
    invalidation, the server figures, `unsyncedCount` and the `sync_status`
    filters (all job c2); refunds and refund parents (no refund model yet).
  - **The checkout gate has two points.** The app calls `requireOpen()`
    when tender starts and again just before a card terminal captures, and
    useSale's `complete()` stamps through `stampSession`.
  - **The tender block:** while `tenderInProgress` is true, `startCounting`
    and `closeSession` throw `RegisterTenderInProgressError` before any
    write, so a till can't close under a payment in progress. The flag is
    read through a latest-value ref, so older `actions` see it too.
  - **A second open is refused** (`RegisterSessionAlreadyOpenError`) while
    the collection has an `open` or `counting` session for the register, or
    while another open for that register is still running in any hook
    instance.
  - **An interrupted close blocks a new open** (`RegisterCloseIncompleteError`,
    PR #143 review). A new session opened then would lock the till: its own
    close fails with `closure_write_incomplete` behind the earlier
    reservation. So `openSession` refuses while the register's closure
    reservation is unapplied, or while a closed session has no closure row.
    The current session is the one an unapplied reservation names, even
    when its closure row exists (the till died before `advancePerpetual`),
    so the next close finishes it.
  - **A resumed close uses the count persisted on the session**, not the one
    typed on the retry. This is a deliberate difference: WCPOS uses the
    retry's.
  - **The close reads its orders and movements straight from the storage.**
    In RxDB 16.21.1 a document written a microtask or so after a query first
    subscribes never reaches that cached query, and its `exec()` returns the
    stale result (bug 4 in the local RxDB repro). A Z froze without a sale.
    The live `expected` and `salesCount`, and the outbox's pending query, are
    exposed to the same bug; they are not fixed here.
  - **The live-session checks read storage by primary key** (the stamp, the
    movement gate and `recordMovement`'s re-read), not a cached `findOne`, so
    a status writer that skips that query (registers c2's server sync) can't
    leave them stale. The 2026-09-28 query-cache audit found them
    (`docs/rxdb/query-cache-reads.md`).
  - **A double-tapped close logs `session-closed` once.**
  - **Known difference, left for later:** `overdue` keeps WCPOS's rule and
    reads the close time on the device's clock, not the store's timezone.
- **The approval gate (the Front desk, 2026-09-28)** is enforced in
  `useRegisterSession`'s `closeSession` as well as `RegisterCount`, by one
  rule (`closeNeedsApproval`): over `varianceThreshold`, a close without
  `approvedBy` throws `RegisterApprovalRequiredError` before any write, blind
  mode included (until registers c2's server gate); a resumed close isn't
  gated again. `approvedBy` is written in the closing write and reaches the Z
  as `breakdowns.approved_by`, and a supplied name as `approved_by_name`.
  The gate reads the stored session and derives expected cash from
  `readFresh` movements and orders, as `writeClosure` does, never from the
  rendered snapshot (the #168 review).
  - **Residual window, a registers c2 item:** a sale stamped after the
    gate's read, whose insert lands before `writeClosure` reads the orders,
    is frozen into the Z without a fresh approval check.
    - `stampSession` accepts a counting session, and the orphan sweep skips
      orders the closure lists.
    - It's unreachable through this hook today: `requireOpen` accepts only
      an open session, and `startCounting` refuses during a tender. It
      becomes reachable with c2's server sync, a direct store call, or an
      app stamping outside the tender flag.
    - **The two ways to close it** (the Front desk, 2026-09-28): re-check
      the variance on `writeClosure`'s own rows and mark the Z
      `approval_required` if it crossed, or refuse stamps once the session
      is counting. Both are decisions about a session already closed, so
      they belong with c2's server gate.
- **What comes next, in order (the Front desk, 2026-09-28):**
  1. **The register screens:** the picker, the open card, the bar, the
     movement sheet, the panel and a column gate, then the count and the
     closure sheet. They are WCPOS `next`'s `pos/cart/register-*` screens,
     neutralised and driven by `useRegisterSession`. They come first because
     they make registers usable by testers, before any migration.
  2. **The ADR-065 `order.create` v3 envelope,** with `pos_orders` schema v3
     and a `sessionId` index, so tills migrate once. It is specced on Opus
     and implemented by Codex once Codex is back.
  3. **Registers c2 (server sync).**

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
  ADR-036, ADR-037 · **Amended by ADR-068:** the five `register.*` command
  types and the `register_*` conflict codes
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
  registerId?: string;            // the till's DEVICE id (amendment 2026-09-29), not the drawer
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
- **Amended by ADR-062:** a discounted order is `version: 2`, with
  `discountMinor` on its lines and payload; a discount-free one stays
  version 1, byte-identical.
- **Amendment (2026-09-24):** a new rejection code `invalid_payload` is
  returned as `status: 'rejected'` when a command's payload fails shape
  validation. This check runs before the ledger claim; it is deterministic,
  so a replay of the same command returns the same rejection. It is not
  retried. Introduced by medusapos/app ADR 0004.
- **Amendment (2026-09-28):** a new rejection code `store_configuration`.
  - It is returned as `status: 'rejected'`, with `error: { code: 'store_configuration', message }`, when the plugin's own pre-workflow checks find the store can't take the sale: a missing sales channel, stock location, address or shipping option, or a shipping-profile mismatch.
  - The `message` is the reason for an admin, for example "Missing shipping option; set plugin option shippingOptionId".
  - The check runs **before any write**, and the command is **not recorded in the ledger**. Once the store is fixed, resending the **same** command id applies it; a new id also works.
  - So unlike `invalid_payload`, it isn't final. The outbox should keep the order `rejected` with its reason, and let Retry resend it after the store is fixed (backlog item 52).
  - The platform's own internal failures stay transient: 503, retried.
  - Introduced by medusapos/app#94.
- **Amendment (2026-09-29, `platform_error`):** a new rejection code
  `platform_error` (Front desk ruling; TallyUI #211).
  - It is returned as `status: 'rejected'`, with `error: { code:
    'platform_error', message: '<platformCode>: <platformMessage>', data: {
    platformCode, platformMessage } }`, for a platform-native error that no
    contract code covers and that the plugin has judged **permanent**: its
    `platformCode` is on the plugin's own explicit list of permanent codes,
    and a replay would fail the same way until the store's data or
    configuration changes. State-dependent errors (a state transition, stock,
    a declined payment) are not on that list. `@tallyui/core/server`'s
    `platformErrorResult()` builds it.
  - It is for `order.create` only, for now. A rejected register command
    halts that register's queue until registers c2c lands, so register
    refusals keep ADR-068's codes. A permanent platform error on a register
    command that no ADR-068 code covers stays transient (503, retried) until
    then.
  - **Only when nothing of the sale remains**, neither in the database nor
    outside it (emitted events and emails, external payment or fulfilment
    calls, queued jobs). That means the sale's writes were rolled back, or
    the plugin compensated them completely. The reason: the till offers
    Retry for it, and requeue resends under a **new** command id, so
    anything left behind would become a second sale.
  - **How a plugin records it without keeping the sale:** it rolls back the
    sale's writes while keeping its ledger claim (for example, the sale's
    steps run inside a savepoint), then stores the rejection on the claim
    and commits. It never commits the rejection together with any of the
    sale's writes.
    - Writing the rejection in a separate transaction after a full rollback
      leaves a window in which a resend of the same id can claim and run.
      The savepoint avoids that.
    - On Vendure, an `ErrorResult` is a returned value, not a thrown error,
      so it counts as this rollback's trigger only once the plugin has
      turned it into that rollback.
    - **The order of the steps** (Front desk, 2026-09-29), for
      `order.create`:
      - **Shape** first, before any database access, in
        `@tallyui/core/server`'s `payloadShapeErrors`: types, the
        existing `customerId` 64 and `sessionId` 36 checks, and U+0000 in
        any string. A NUL in `clientOrderId` would make the lookup itself
        fail (Postgres 22021) before any claim exists.
      - **Then the replay lookup and the collision lookup**, so a resent
        command that was already applied always replays as `duplicate`,
        whatever the later checks say.
      - **Then the value refusals**, still before the claim:
        - amount ranges and the v3 fiscal-figure checks. These are
          `@tallyui/core/server`'s `precheckCommand`, which a plugin calls
          after its replay lookup, never before it;
        - the string lengths, in `payloadBoundErrors`, called by
          `precheckCommand`: `customer.email` at most 254 characters and
          every other string field 255. The v3 `display` and `taxByRate`
          strings get the same 255 bound and NUL check in
          `fiscalFiguresErrors`. A length rule tightened later must never
          turn an applied command's resend into `invalid_payload`;
        - the till freezes the sent form when it stores the order (Front
          desk, 2026-09-29, reversing #222's rule): a line name or
          discount label is cut to 255 characters with NUL stripped, and
          a customer email or id the shape check would refuse is left
          out. The envelope sends the stored values unchanged, so every
          resend is byte-identical, and an order stored by an older till
          is sent exactly as that till sent it. The receipt shows the frozen
          form too (`withSentForm`).
          An order stored by an older till and still unsent at the upgrade
          is frozen the same way by the outbox before its first send from
          the upgraded till (Front desk, 2026-09-29): its line names,
          discount labels and payment references are cut to their bound,
          never its ids, and an unsendable customer email or id is left out.
          The frozen form is written back to the stored order, so the
          receipt and the server see the same bytes. If such an order had
          in fact been sent and applied before the upgrade, its resend
          answers `idempotency_mismatch`, a reconciliation state, never a
          lost sale.
        - on the Vendure plugin, a future bound on `payload.createdAt`
          (Vendure's `tallySaleAt`). It may be at most 24 hours ahead of
          the server's clock. There is no lower bound, because an offline
          till legitimately sends old sales. The Medusa plugin has no such
          bound. On Vendure this needs a replay read before ADR-047's
          `INSERT … ON CONFLICT` claim.
      - **Shape and value refusals answer `invalid_payload`.** It keeps its
        single meaning for `order.create`: decided before the claim, never
        stored. This widens the 2026-09-24 amendment's "fails shape
        validation" to value refusals. A resend gets the same answer while
        the bytes, or for `createdAt` the clock, disagree; the till's Retry
        mints a new id.
        - A byte-only check of a per-sale fact that has its own code
          (`invalid_quantity`, `underpaid`) may instead run after the claim
          and be stored under that code (below). The two answers are
          replay-equivalent. A new plugin should prefer the pre-claim
          `invalid_payload`.
        - `unsupported_version` keeps its own code, before the claim, and
          is recorded nowhere.
        - Register commands keep ADR-068's own rules. For example, the
          closure `registerId` check answers `invalid_payload` after a
          lookup.
      - Then the claim.
      - Then the plugin's deterministic checks, before the first write of
        the sale, on every platform. They split into two classes.
        - **Not stored, claim released:** anything about the store-wide
          setup the plugin needs for any sale. That is `store_configuration`
          (the 2026-09-28 amendment), plus `unsupported_currency` and
          `unsupported_tax_mode`, which this ruling gives the same
          treatment. Once the store is fixed, the **same** command id
          applies.
          - A platform's order limits (Vendure's `orderItemsLimit` and
            `orderLineItemsLimit`, or their equivalents) are store-wide
            setup too. The plugin checks against the configured limits
            before the first write. Exceeding one answers
            `store_configuration`, and raising the limit lets the same
            command id through. If Vendure itself raises the limit error
            after the draft is created, the Vendure rule below applies:
            a full rollback, and a transient answer.
          - `unsupported_tax_mode` may be detected mid-workflow (on Medusa,
            when the Admin API rejects ADR-039's paths 1 and 2). If it is
            found after the first write, the plugin compensates, then answers
            `unsupported_tax_mode`, unstored, with the claim released.
        - **Stored on the claim, with no savepoint:** the sale's own
          per-sale facts: `unknown_variant` (a variant that is missing,
          deleted or disabled, a product that isn't published, a variant in
          the wrong channel), `invalid_quantity` and `underpaid`.

          Nothing of the sale exists yet, so a stored rejection is safe,
          because the till's Retry mints a new command id and re-evaluates.
          A deterministic rejection stored under a stable per-sale code is
          replay-equivalent and harmless: a replay gets the same answer
          either way.
      - Only a permanent condition that appears after those checks (for
        example, a variant deleted concurrently), and `internal_error`, are
        left on the savepoint path. On Vendure, `internal_error` arises only
        before the first write, where nothing needs a savepoint (see below).
      - Races that clear on retry stay transient.
    - **On Vendure, events published inside the savepoint still fire after
      the stored rejection commits.** Events are deferred to the outer
      transaction's commit (`@vendure/core` 3.7.3,
      `dist/event-bus/event-bus.js` lines 241–270), and a savepoint rollback
      doesn't cancel them (`TransactionSubscriber.awaitTransactionEvent`).
      This was verified in the vendurepos S1 and VP2a work.
      - So a savepoint rejection is allowed only for an error raised
        **before the first event is published**. On Vendure that is the
        first write: the draft order is created (ADR-047 step 2), then the
        customer (step 4), and each publishes an event.
      - **On Vendure no error from a recipe step after the first write is
        stored** (Front desk, 2026-09-29). The deterministic checks above
        still run before that write, and are stored as ruled.
        - A permanent platform error after the first write rolls back
          **fully** and stays transient (503). A full rollback drops the
          published events (below), and the till flags the order after 15
          minutes of such answers (TallyUI #212).
        - A plugin bug after a write marks the row as needing an admin.
        - `internal_error` is allowed only for a plugin bug **before** the
          first write, never after it.
      - **Where a rollback can't undo what was published**, a permanent error
        after the first event means part of the sale remains. The plugin
        applies the sale with a warning, or marks the row as needing an
        admin if it can't complete it.
      - Whenever a plugin marks the row, it commits the sale's writes so far
        together with the marked claim, and does not roll back the
        savepoint, so the admin has an order to apply or reject.
      - The plugin's own event subscribers ignore events for an order that no
        longer exists.
    - The savepoint recipe above amends ADR-047's "a thrown error rolls back
      and returns 503" for classified permanent errors only.
    - **A full transaction rollback, by contrast, drops the events published
      inside it.** This was verified by reading the source (the vendurepos
      worker, 2026-09-29, `@vendure/core` 3.7.3 and TypeORM 0.3.31 on
      Postgres; confirmed by an independent review). It is not yet covered
      by a runtime test. It applies to `EventBus.ofType()` and `filter()`
      subscribers such as EmailPlugin and the search index.
      - `event-bus.js` lines 241–270 (`awaitActiveTransactions`) wait on
        `TransactionSubscriber.awaitCommit`. On a
        `TransactionSubscriberError` they return `undefined`, which the
        `filter(notNullOrUndefined)` at lines 95 and 107 drops.
      - TypeORM's `PostgresQueryRunner.js` lines 155–167: a full `ROLLBACK`
        clears `isTransactionActive` and broadcasts
        `AfterTransactionRollback`, which makes `awaitCommit` throw
        (`transaction-subscriber.js` lines 48–66). `ROLLBACK TO SAVEPOINT`
        keeps the transaction active, so the event is released at the
        outer `COMMIT`.
      - So ADR-047's transient path (a thrown error, a full rollback, 503)
        stays safe even after events have been published (from the first
        write, ADR-047 step 2, on),
        for core, EmailPlugin and DefaultSearchPlugin subscribers.
      - **The tally plugin must pass the transactional `RequestContext`**
        (from `withTransaction` or `@Transaction()`) into every service
        call. An event whose context carries no transaction manager with a
        query runner is delivered at once (lines 243–249), whoever publishes
        it, and would escape a rollback.
      - **Merchant code that runs inside the transaction is outside this
        guarantee.** Its external side effects survive a full rollback. For
        example:
        - blocking event handlers (`event-bus.js` lines 83 and 166), which
          run inside `publish()`. Core registers none for order events, and
          EmailPlugin none at all;
        - `OrderProcess`, `PaymentProcess` and `FulfillmentProcess` hooks
          (`onTransitionStart` and `onTransitionEnd`), which the step-6 and
          step-7 transitions run;
        - merchant strategies with side effects, and TypeORM entity
          subscribers;
        - jobs a merchant enqueues directly rather than from an event
          subscriber.
  - **If part of the sale remains and can't be undone**, the plugin finishes
    and applies the sale (with a warning where one fits), and never rejects
    it. After a complete compensation, either `platform_error` (if the error
    is permanent) or transient (ADR-039) is allowed, or, for
    `unsupported_tax_mode`, the unstored answer described in the step
    order. A transient result releases the claim and the till resends the
    **same** id, so it too is safe only once nothing remains.
  - **If compensation itself fails**, the plugin never returns
    `platform_error` and never releases the claim. The claim stays in
    progress, so the till's resends of the same id get `409 in_progress`,
    and the till flags the order after 15 minutes of such answers (TallyUI
    #212). The plugin logs the failure for an admin (Front desk,
    2026-09-29).
    - The ledger row is marked as needing an admin, with a distinct status
      or flag. A marked row still answers resends with `409 in_progress`,
      never `duplicate` or `rejected`. A plugin's stale-in-progress reclaim
      path (medusapos reclaims stale `in_progress` rows after a timeout)
      never re-runs the recipe on a marked row.
    - An admin resolves it by explicitly applying or rejecting the command.
    - **An admin "reject"** (Front desk, 2026-09-29), in this order:
      - It cancels the half-written order.
      - In the same transaction as the cancel, it releases that order's
        unique client order id. On Vendure it moves `tallyClientOrderId` to
        a non-unique `tallyRejectedClientOrderId`. It also flags the order
        as rejected (`metadata.tally_rejected` or equivalent), so it counts
        as never placed (see ADR-068 rule 6).
      - Only after the cancel succeeds does a compare-and-set move the row
        from marked to rejected. On Medusa, which has no single
        transaction, the plugin cancels first and stores the rejection last.
      - A crash between the two leaves the row marked, so a Retry stays
        transient.
      - Running the reject again treats an already-cancelled order as
        cancelled, and completes its flag and its client-id release. On
        Medusa a crash can fall between the cancel and the flag.
      - If the cancel fails, the reject refuses. The row stays marked, and
        the admin applies the command instead.
    - **How the rejection is stored:** as `platform_error` with
      `platformCode: 'TALLY_ADMIN_REJECTED'`, and `platformMessage`
      carrying the admin's reason.
      - The `TALLY_` prefix is reserved for TallyUI and is never a platform
        code. Every plugin uses this code.
      - It is the one `platform_error` stored while an order remains.
      - For the no-durable-change rule above, a cancelled order flagged
        `tally_rejected`, with its client id released, counts as no order.
        Emails already sent can't be recalled, and that is accepted.
      - Such an order arises in only two ways: this admin reject, or a
        compensation that leaves a cancelled order. That compensation must
        also set the flag and release the client id.
      - The admin is told that the till's Retry records the sale again, as a
        new sale.
  - **A backstop against a second sale:** Retry resends the same
    `clientOrderId` under a new command id. Where a plugin has a unique
    client order id (Vendure's `tallyClientOrderId`, ADR-047 step 2), it
    never creates a second **live** order for it. Medusa's
    `metadata.tally_client_id` (ADR-038) is not unique.
  - **A `clientOrderId` collision** (a new command id, the same
    `clientOrderId`, an order that already exists) is never
    `platform_error`, which would hide an order that exists (Front desk,
    2026-09-29).
    - **The found order came from an applied command:** the plugin finds it
      in the same sales channel and answers `applied` with its
      `serverRefs`, carrying the original result's warnings. It claims and
      stores the new command id as applied, so a replay of that id returns
      `duplicate`.
      - "Applied command" means the row that last applied the order,
        following "superseded by" links.
    - **The source row is in progress, but its lease is stale:** the
      original attempt crashed, and the till has moved on to the new command
      id, so it will never resend the old one. The plugin may resume the
      found order forward under the new command's claim (state-driven
      orphan recovery) and store the new id as applied. Without this, a
      crash during the first attempt would leave the sale stuck forever.
      - It first takes over the old row's lease with a compare-and-set
        update. The update matches "in progress, not marked for an admin,
        with the lease as read", so a stale reclaim of the old id can't
        resume the same order at the same time. If the compare-and-set
        loses, the answer is transient.
      - In the same transaction that stores the new id as applied, it marks
        the old row as superseded by the new id, rather than leaving it in
        progress for good.
      - A late replay of the old id then answers `duplicate` with the
        recovered order's `serverRefs`.
      - The stale-reclaim path skips superseded rows, as it skips marked
        ones.
    - **The source row was rejected and its order cancelled** (for example
      by an admin reject): a Retry under a new command id for the same
      `clientOrderId` is processed as a **new** sale, not answered
      transient (Front desk, 2026-09-29).
      - The admin reject released the cancelled order's client id, so on
        Vendure the new sale doesn't hit the unique constraint.
      - On Medusa, the lookup skips cancelled orders flagged
        `tally_rejected`, whether or not a ledger row remains.
      - A rejected row with a live order is unreachable, by the reject's
        ordering above.
    - **Stay transient in every other case:** the plugin can't find the
      order, the source row is in progress with a **fresh** lease, or the
      source row is marked as needing an admin. In that last case the new id
      gets no admin mark of its own. A new command id must never get round a
      live attempt or an admin mark. The till flags the order after 15
      minutes of such answers (TallyUI #212).
  - Unlike `invalid_payload`, `store_configuration`, `unsupported_currency`
    and `unsupported_tax_mode`, it **is** stored in the ledger, and a replay
    returns the recorded rejection.
  - An error the plugin can't classify stays transient (503, retried),
    never `platform_error`, except in the narrow `internal_error` case
    below. This carves one exception out of the previous
    amendment's "the platform's own internal failures stay transient": the
    exception covers only errors judged permanent under the conditions
    above.
  - The till shows the order under "Needs attention" with Retry, like any
    rejection other than `idempotency_mismatch`.
  - The Medusa plugin has no case for it today. Its unclassified errors
    stay transient (apart from `internal_error`), because Medusa's
    `INVALID_DATA` also surfaces for retryable races. A Medusa case needs
    its own ruling, with a concrete error that is never retryable.
  - Every rejection code except `register_approval_required` (which arrives
    with c2c), as a type: `CommandRejectionCode` in `@tallyui/core/server`.
- **Amendment (2026-09-29, `internal_error`):** a new rejection code
  `internal_error` (Front desk ruling; TallyUI #216), the one narrow case in
  which an unclassifiable error is stored.
  - It is returned as `status: 'rejected'`, with `error: { code:
    'internal_error', message: 'Internal error (ref <correlationId>)',
    data: { correlationId } }`. `@tallyui/core/server`'s
    `internalErrorResult()` builds it.
  - It covers only an exception from the plugin's **own code** (a
    programming error), raised after a complete rollback so that nothing of
    the sale remains, in the database or outside it. Errors from the
    database or the network, an unknown SQLSTATE, and anything else the
    plugin can't classify stay transient (503, retried).
  - **"Own code"** means the plugin's own logic: not an error thrown from
    inside the platform SDK, the database client or the HTTP client.
  - **How to record it** follows the `platform_error` recipe. Roll the
    sale's writes back while keeping the ledger claim (a savepoint), or
    compensate them completely, then store the rejection on the claim and
    commit, never together with any of the sale's writes. This amends
    ADR-047's "a thrown error rolls back and returns 503" for this case too.
  - **If compensation fails**, the same rule as for `platform_error`
    applies: never reject, keep the claim, and mark the row as needing an
    admin.
  - **An error before the ledger claim** (in validation) stays transient,
    since there is no claim to store it on. **On a register command** it
    stays transient until c2c lands.
  - **The correlation id** is opaque, for example a UUID. **The
    `store_configuration` amendment's "internal failures"** means the
    platform's failures, not the plugin's own code.
  - It is stored in the ledger and replayed as recorded. It would fail the
    same way on every retry, and a retry loop would hide the bug.
  - The message is generic, so no internal detail reaches the till. The
    correlation id links it to the plugin's log.
  - It is for `order.create` only, like `platform_error`. The till shows it
    under "Needs attention" with Retry. That is safe because nothing
    remains, and Retry only helps once the plugin is fixed.
  - **On Vendure** it is allowed only for a plugin bug **before** the first
    write (the draft order, ADR-047 step 2). After that write, a plugin bug
    marks the row as needing an admin instead (the `platform_error`
    amendment's Vendure rules, Front desk, 2026-09-29).
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
  shape still needs a `version` bump; adding an optional field is not a
  change, provided it doesn't change what the existing fields mean.
  ADR-048's amendment (2026-09-29) adds `total_mismatch.bridgeMinor` and
  `tax_rate_mismatch`. On the till, `knownWarnings()` enforces the
  ignore-unknown part of this rule (TallyUI #207). On the server,
  `@tallyui/core/server`'s `parseCommandResult` accepts both new shapes when
  a plugin reads a stored result back (TallyUI #213). It refuses codes it
  doesn't know, so a plugin emits a new warning code only once its
  `@tallyui/core` parses it; otherwise its own replay of a stored result
  fails.
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
- **Amendment (2026-09-29, RxDB 17 upgrade; amends ADR-044 too):**
  - `rxdb` and `rxdb-premium` are now pinned at 17.5.0 (ADR-031's
    amendment), in the peer and the devDependencies. Apps install
    `rxdb-premium@17.5.0`.
  - RxDB 17 caps a process at 13 open collections unless the premium flag
    is set, and premium's storages don't set it. So `getRxStorageSQLite`,
    `getRxStorageSQLiteWasm` and the web worker (its own JS context) each
    call `setPremiumFlag()` before any collection exists. RxDB caches the
    first check.
  - The root `vitest.config.ts` sets the flag for every test through
    `packages/storage-sqlite/vitest.premium-flag.ts`, a setup file in the
    package whose devDependency already resolves `rxdb-premium`. The root
    `package.json` does not list `rxdb-premium`: a root devDependency pulls
    premium's postinstall into every filtered install, and Vercel's
    `pnpm install --frozen-lockfile --filter "@tallyui/web..."` then fails
    without the token (reproduced 2026-09-29), which ADR-044 forbids.
  - Stored data carries over. A file-backed SQLite database written by rxdb
    and premium 16.21.1 opens under 17.5.0 with all 500 probe documents
    deep-equal, including nested fields. Index and sort queries return the
    right results, and a v0 → v1 schema migration keeps all 501 with no
    duplicate (probe, 2026-09-29). The 17.0 notes need a storage migration
    only for OPFS, filesystem-node and IndexedDB with attachments, none of
    which TallyUI uses.

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
- **Amendment (2026-09-29, spike S1; Front desk ruling):** the Vendure
  plugin's warnings, as spike S1 emits them. Both are additive under
  ADR-039's warning rule (no `version` bump): a new code, and a new
  *optional* field that a till which doesn't know it never reads. Neither
  ever rejects a sale.
  - `total_mismatch` gains an optional `bridgeMinor`. It is present if and
    only if the plugin added the `TALLY-ROUNDING` surcharge, and the warning
    is emitted only then. `bridgeMinor = expectedMinor − serverMinor`,
    signed, in minor units, where `expectedMinor` is the till's
    `totalMinor` and `serverMinor` is Vendure's `totalWithTax` **before**
    the surcharge.
  - A new code, `tax_rate_mismatch`:
    `{ code: 'tax_rate_mismatch'; ratePpm; expectedMinor; serverMinor }`,
    for `order.create` version 3 only. It is emitted **once per rate**
    whose |`expectedMinor` − `serverMinor`| exceeds the tolerance
    T = ⌈(lines + surcharges) / 2⌉ minor units, and never carries several
    rates. `expectedMinor` is the till's `taxByRate[].taxMinor` for that
    rate, and `serverMinor` is that rate's tax in Vendure's `taxSummary`.
  - Across spike S1's 12 tax cases (2 strategies × 2 pricing modes, with
    discounts, mixed rates and a negative tie), the largest per-rate
    difference was 1 and the largest bridge was 1.
  - **The till ignores warning codes it does not know** (TallyUI #207).
    `knownWarnings()` in `@tallyui/core` is the till's single reader of
    stored warnings: it keeps only known codes with well-formed fields, and
    `needsAttention` and the orders list read through it. Stored results
    keep every warning exactly as the server sent it, so a newer till can
    still show a warning an older one skipped. Before #207, the orders
    list rendered any code other than `insufficient_stock` as a store
    total.

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
- **Progress:**
  - TV5 done: `useSale`, `lib/cart` and `lib/catalogue` lifted from
    medusapos/app `a1b981d` into `packages/pos/src/sale/`. Adaptations:
    `useSale` takes an optional `session?: { id, sessions }`; when set,
    `complete()` stamps the finalized order with `stampSession` before
    `onSaleCompleted` (#126). Since registers c1a, a closed or missing
    session no longer sets `error`: the sale goes on to `onSaleCompleted`
    and the receipt with `lateSessionId` (ADR-032, late sale). Without
    `session`, behaviour is unchanged. `DISCOUNTS_UNSUPPORTED` keeps finalize's literal message,
    with a test pinning the two together, since `finalize.ts` doesn't
    export it as a constant. Follow-up: medusapos/app adopts
    `@tallyui/pos`'s `useSale`/`lib/cart`/`lib/catalogue` and deletes its
    own copies, in its own job.
  - TV6a done: `Cart`, `CartBar`, `Tender`, `DiscountForm`, `DiscountChips`,
    `parseDiscount` and `discountLabel` lifted from medusapos/app
    `388495b1cdb9ef36d1af88b0e82d1171a2465ff0` into
    `packages/components/src/sale/`. Adaptations: `Cart` takes an optional
    `taxLabel?: (ratePpm: number) => string` (default
    `` `Tax ${ratePpm / 10000}%` ``), since VAT isn't universal — medusapos
    passes its own `VAT ${rate}%`; `dataSet={{ print: 'hide' }}` stays, as
    the print-style hook TV6b lifts; everything else (English strings,
    layout classes) is unchanged. `@tallyui/components` gains a runtime
    `@tallyui/pos` dependency, for types and `buildReceiptData` only
    (ADR-064). The catalogue, receipt, print style and sync status are
    TV6b.
  - TV6b done: `Catalogue`, `Receipt`, `injectPrintStyle`, `SyncStatus`
    lifted from medusapos/app `563b03c4` into
    `packages/components/src/sale/`; `lib/catalogue`'s test (TV5 lifted
    the source without it) ported into `pos/src/sale/catalogue.test.ts`.
    Adaptations: `Catalogue` takes `hour12?: boolean` (app-supplied)
    instead of reading `expo-localization`; `Receipt` takes `store: {
    name, address? }` instead of Medusa's `StoreSettings`, `topInset?:
    number` (default 0) instead of `StripHeightContext`, `formatDate?`
    (default `Intl.DateTimeFormat`) instead of an app util, and
    `taxLabel?`, defaulting like TV6a's `Cart`, instead of hard-coded
    `VAT` — keeping the `incl. ` prefix rule; `print-style.ts` drops its
    `declare module 'react-native'` block (TV6a's `uniwind-env.d.ts`
    already augments `dataSet`). `searchProducts`, `catalogueEntries`,
    `findEntryByCode`, `variantPriceLabel` join `COMPONENTS_POS_ALLOWLIST`.
  - TV7 done: the neutral outbox core lifted from medusapos/app
    `563b03c4`: `getDeviceId` (from `register`), `needsAttention` (from
    `order-store`) and `useOrderOutbox` (from `use-outbox`) into
    `packages/pos/src/`, and `OrdersList` (from the `orders` screen) into
    `packages/components/src/sale/`. Adaptations: `getDeviceId` takes the
    storage key (medusapos passes `'medusapos.register_id'`);
    `useOrderOutbox` takes `storeKey` (medusapos: the base URL), `open`,
    `transport`, `deviceId`, `onBusy` and `onOpenError` in place of the
    app's session, `openOrderStore`, `authHeaders`, `markBusy` and
    `reportStorageStartFailure`, and calls `onOpenError` for every opening
    error (medusapos filters with `isStorageWorkerFailure`); `OrdersList`
    takes `orders`, `onRetry` (the outbox's `requeue`), `formatDate?`
    (default `Intl.DateTimeFormat`, keeping an unparseable value as is) and
    `footer?` (medusapos: the feedback link). `needsAttention` joins
    `COMPONENTS_POS_ALLOWLIST`. The router, session, storage selection,
    Dexie carry-over, `product-cache` and `live-tab` stay in the app.
    SQLite/Dexie storage selection and the storage watchdog are
    platform-neutral, and the Vendure app will need them. They're deferred
    until the Vendure app is their second consumer, so the abstraction is
    cut from two real cases rather than one.
  - **complete() is idempotent for one tender (2026-09-25).** Once
    `useSale.complete()` has built the order for a tender attempt, that
    order is the sale (the Front desk). Its `id` and `commandId` are
    minted once, and every retry hands the same order to
    `onSaleCompleted`, with no new stamp and no second late-sale fact.
    Until it saves, `saving` is true and the sale is locked. A second
    call while one is in flight (a double tap) shares the first call's
    promise, and a call on the receipt does nothing. `newSale()`
    abandons it; abandoning clears the screen, never the record, so an
    order a failed save already stored stays in the outbox.
    `useOrderOutbox.record` treats an order already stored (RxDB's
    `CONFLICT`) as stored and still flushes. Since 2026-09-27 it matches on
    the `id` and the money-bearing content (`sameSale`), not the
    `commandId`: requiring the `commandId` stuck the tender on Retry after a
    rejected order was requeued (medusapos #79). Other content throws
    `OrderContentMismatchError`.
    - **Continue once stored (the Front desk, 2026-09-27).** After a failed
      save, `useSale` asks `isStored` (medusapos: the outbox's). Only once
      this order `id` is confirmed stored with the same content does `Tender`
      render Continue (`continueSale()`), leaving the order pending in the
      outbox and never handing it to `onSaleCompleted` again. Until then
      Retry is the only way out: `newSale()` is refused. A refusal during a
      save still in flight asks `isStored` afresh, so a hung save whose order
      is stored can still Continue; its later throw is only logged. A hung
      save — one whose order is built and whose save neither resolves nor
      throws — re-asks `isStored` by itself too, every 5 s while it stays
      unconfirmed, so `Tender` can still offer Continue with no user action
      (medusapos, the Front desk, 2026-09-28: its tender has no New sale
      control while saving, so it never triggered the refused-`newSale()`
      check). The refused-`newSale()` check stays for apps that have one.
      `SALE_SAVING` is exported alongside the `sale` and `outbox` loggers.
      A `newSale()` call before the
      order is even built — still finalizing or stamping — is refused too,
      unconditionally: there's nothing yet to ask `isStored` about, so
      abandoning is possible only once the order is confirmed stored
      (Continue), or from the receipt (the Front desk, 2026-09-27; #149
      review). This replaces the generation-mismatch hand-over that abandoned
      such an attempt in the background; `handOverAbandoned` is gone with it.
    - **Known gap (2026-09-27):** the pending completion lives only in
      memory. A page reload during the save loses it (same as before #145)
      and builds a new order on retry. Persisting the built order before
      capture is a design for the order.create v3 / registers c2 work.
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

## ADR-062 Discounts are pre-tax, allocated per line, and carried in `order.create` version 2

- **Date:** 2026-09-25 · **Status:** Accepted (the Front desk); amends
  ADR-038 under its change rule (a new ADR and a `version` bump) · **Source:**
  backlog item 11 (programme plan §2.5)
- **Context:** the order builder applied line discounts before tax, but
  took order discounts off the total **after** tax. They were never
  allocated to the lines, so they did not reduce the tax. VAT and sales tax
  are due on the amount actually paid, so **the after-tax order discount
  was a bug**. At 20% exclusive, a €100.00 line with 10% off the order paid
  €110.00; it now pays €108.00 (€90.00 plus €18.00 tax).
- **Decision:**
  1. **The basis is pre-tax.** A line discount reduces that line's base. An
     order discount is allocated across the lines, and each line's tax is
     then computed in its own mode (D2c) on its discounted base.
  2. **Every amount is in the line's own mode**: the shelf (gross) amount
     for an inclusive line, the pre-tax (net) amount for an exclusive one.
     A line's **pre-order-discount amount** is its `gross − line discounts`
     in that mode. In a mixed-mode order:
     - a percentage order discount applies to each line's own-mode amount,
       so an inclusive line's share reduces its gross and an exclusive
       line's share reduces its net;
     - a fixed order discount is allocated by the same amounts, and its
       cap is their sum;
     - the paid total is the sum of the lines' post-discount gross
       amounts (an exclusive line's net plus its tax, an inclusive line's
       total), with tax rounded once for the order (ADR-037);
     - the receipt's discount total is the sum of the own-mode amounts.
  3. **The order discount amount.** The base is the sum of the lines'
     pre-order-discount amounts. Several order discounts apply in order. A
     **percentage** discount is computed on the pre-order-discount base
     (additive, as in WCPOS `next` and WooCommerce's default):
     `roundHalfAway(base × pct / 100)`. A **fixed** discount is its integer
     minor value, computed against the base still remaining. Each discount
     is capped at what remains, so the total never exceeds the base.
     Sequential (compounding) discounting is a possible later option. The
     order discount is the sum of the (capped) discounts.
  4. **Allocation** (`allocateOrderDiscount` in `@tallyui/pos`, pure, for
     the plugins' reference): shares in proportion to each line's
     pre-order-discount amount, with largest-remainder rounding to the
     minor unit and ties to the earlier line. The shares sum exactly to the
     order discount, and no share exceeds its line's amount.
  5. **Lines carry their share.** `LineItem.orderDiscountMinor` is the
     share; `discountMinor` is the line discounts plus the share;
     `netMinor = gross − discountMinor` is the taxed base. The order totals
     sum the lines, with no after-tax subtraction. `order.discountMinor` is
     the sum of every discount, and `order.discounts[].amountMinor` keeps
     each order discount for display.
- **`order.create` version 2** (`@tallyui/core`):

```ts
interface CommandEnvelope<P> { /* … */ version: 1 | 2; /* … */ }
interface OrderCreateLine {
  /* …version 1 fields… */
  discountMinor?: number; // line + allocated order discount, own mode, minor units; only when > 0
}
interface OrderCreatePayload {
  /* …version 1 fields… */
  discountMinor?: number; // the order's total discount = Σ lines[].discountMinor; only when > 0
}
```

  - **The envelope's `version` is 2 only when a discount is present.** A
    discount-free payload stays **version 1 and byte-identical**, so every
    current order and every current plugin is unaffected.
  - **Server rule:** a line's charged base is
    `unitPriceMinor × quantity − discountMinor`, in the line's own mode
    (`taxInclusive ?? pricesIncludeTax`), taxed as ADR-038 and ADR-039
    describe. `subtotalMinor`, `taxMinor` and `totalMinor` are already
    after the discounts; ADR-037's ≤ 1 minor-unit guard and
    `total_mismatch` still apply.
  - **Medusa:** one line-item adjustment per discounted line on the draft
    order, carrying that line's `discountMinor` and the reason "POS
    discount"; never ad-hoc promotions. An order discount therefore
    appears in Medusa as the sum of its line adjustments.
    - **The Medusa convention (2026-09-25, the Front desk; plugin half in
      medusapos #62):** each adjustment has the description "POS
      discount" and **no `code`**. Medusa's
      `refreshDraftOrderAdjustmentsWorkflow` deletes any adjustment whose
      `code` is not an applied promotion, so a coded POS adjustment would
      vanish on the next draft-order refresh.
    - This is Medusa's convention, not part of the contract. Every other
      backend's plugin records its own equivalent here. For example, a
      Vendure plugin must say how its discount survives Vendure's own
      promotion recalculation.
  - `PosOrderLine.discountMinor` already existed and `finalize` copies it,
    so the `pos_orders` schema is unchanged (its line items do not forbid
    extra properties, and `discountMinor` was already declared).
- **Rollout, through the guard, as ADR-038 amendment 2 did (T1, M, T2):**
  1. this change: the builder computes pre-tax discounts and the client
     can send version 2, but **`finalize` still rejects any discount**
     ("finalize: discounts are not supported by the server yet
     (order.create v2)"), since an old plugin would reject a version-2
     payload or mis-apply it;
  2. the medusapos plugin honours version 2 with line adjustments;
  3. **amended 2026-09-25 (the Front desk):** the guard becomes a
     per-store capability check, below, instead of a global one, so an old
     plugin is handled for good rather than needing one more release to
     catch up.
  4. **2026-09-25 (the Front desk):** the Medusa plugin half (medusapos
     #62) is merged at `20442ab59279f91cc1df7756a2ce1959a58a90dd`. It
     serves `GET /tally/v1/info` with `contracts: { "order.create": [1,
     2] }`, applies one code-less "POS discount" adjustment per discounted
     line, and completes a 100%-discounted sale at a total of 0 without
     collecting a payment. It rejects a version-2 command with no
     `discountMinor` and a version-1 command that carries one; otherwise
     version 1 is byte-identical. The live contract on Medusa 2.21.0
     applied a mixed discounted order with no warnings, at a total of
     20.25 and tax of 4.05, equal to the client's figures. So on a store
     running it, a discounted TallyUI sale finalizes as version 2.
- **The capability check (amendment, 2026-09-25, the Front desk).** The
  plugin exposes `GET {baseUrl}/tally/v1/info`, with the same auth as
  `/tally/v1/commands` (the admin bearer), returning
  `{ "contracts": { "order.create": [1, 2] } }`: the key is exactly
  `"order.create"`, and the value is the supported integer versions. The
  connector reads it into `ServerCapabilities { orderCreate }`, the highest
  version the store accepts, with three outcomes:
  - a 2xx with a valid list gives its max; a 2xx with the field missing,
    empty or malformed, a body that isn't JSON, or a **404**, means an old
    or absent plugin and gives `{ orderCreate: 1 }`;
  - a network failure, a 5xx, or any other non-2xx that isn't a 404 or a
    401 is **unknown**, never version 1, and gives `undefined` — a till
    that's briefly offline must not start refusing discounts on a store
    that supports version 2;
  - a **401** means the credentials are rejected or expired, never version
    1, and throws `SignInError`.

  In Medusa only `medusaAdminUserConnector` reads capabilities: the
  plugin's routes (`/tally/v1/commands` and `/tally/v1/info`) authenticate
  users only (bearer or session), so the secret-key `medusaConnector` can't
  post sales through the plugin and exposes no `capabilities()`. Finally, `finalize` throws
  "finalize: negative discount" for any negative discount, whatever the
  capability, since a negative amount would otherwise go out as version 1
  with no discount fields.

  `SyncContext.capabilities` carries the value the app is acting on, copied
  from `SignInResult.capabilities` at sign-in. `TallyConnector.capabilities?
  (context)` re-reads it for a session restored without signing in again,
  so a restored session isn't stuck blocking discounts until the cashier
  signs in again. `resolveCapabilities(fresh, stored)` in `@tallyui/core`
  is `fresh ?? stored`: a definitive fresh answer always wins, even a
  downgrade to 1; an unknown (`undefined`) read keeps the last known
  value, which the app persists with its stored session, the way it
  persists the store-settings choice. `finalize` rejects a discount only
  when `(capabilities?.orderCreate ?? 1) < 2` — `undefined` behaves as 1,
  which only happens when the value has never been read.

  **The Vendure plugin is born with version 2 and the endpoint**, so it
  never joins this rollout.
- **Consequences:**
  - Every order discount now lowers the tax. An existing test that asserted
    the after-tax total was changed to the pre-tax numbers.
  - Stacked percentage order discounts are additive: each is computed on
    the pre-order-discount base, not on what an earlier order discount
    leaves. Each is still capped at what remains, so the total never
    exceeds the base.
  - The receipt shows each line's discount (`discountMinor`, absent when
    0) and the order discounts as their own lines. Its lines still add up
    to the subtotal (exclusive) or the total (inclusive).
  - A negative discount (a negative percentage or a negative fixed value)
    is clamped to 0 in `computeDiscountAmount`, so a line or order discount
    can never raise a price. `finalize`'s guard rejects any non-zero
    discount, not only a positive one, as defence in depth.

## ADR-063 Display totals are separate from settlement totals

- **Date:** 2026-09-25 · **Status:** Accepted (the Front desk) · **Source:**
  the medusapos cart showed Subtotal 3.10 + VAT 0.78 − Discount 0.90 as a
  Total of 3.88, since `subtotalMinor` is already after the discounts.
- **Decision:** the **settlement figures** (`subtotalMinor`,
  `discountMinor`, `taxMinor`, `totalMinor`; each line in its own mode) go
  in `order.create`, unchanged. The **display figures**, `order.display`,
  are in the store's display mode and never sent to the server. A parked
  order's saved draft may carry it, and it's recomputed from the lines on
  resume, so it's never authoritative. They are the order's totals with no
  discounts, by the same arithmetic, plus the difference.
  **Exclusive display:** `subtotal − discount + tax = total`.
  **Inclusive display** (the subtotal is the shelf total):
  `subtotal − discount = total`, with the tax shown as "includes", not
  added. Both hold exactly.
- **Apps must not rebuild them:** `discountMinor` mixes inclusive lines'
  gross shares with exclusive lines' net shares, so it doesn't add up.
- **Follow-up:** the receipt adopts `display` in the next job: Subtotal,
  Includes discounts, Tax and Total come from `order.display`. The rest of
  backlog item 48 (one renderer, one envelope) stays where it is.
- **Receipt adoption (2026-09-25):** `ReceiptData.totals` now carries
  `order.display`'s figures, plus a new `taxInclusive` flag; the receipt's
  invariant is the same as `order.display`'s. Receipt lines and each line's
  own discount row are unchanged, in the line's own mode — showing them in
  the display mode for mixed carts is backlog 48.
- **Line figures (amendment, 2026-09-25):** `order.display` gains `lines`
  (each line before any discount, with its own discounts as sub-rows) and
  `orderDiscountMinor` (the order discounts as one row, not allocated). A
  line is **converted** when its own mode differs from the display mode;
  `convert(x)` takes a converted line's own-mode amount into the display
  mode **on its own**, at that line's rates: `x − round(tax in x)` or
  `x + round(tax on x)`, half away. Otherwise it's `x`.
  - Each sub-row is `convert(d.amountMinor)` (ADR-062's capped amount).
    The order row is `Σ convert(line.orderDiscountMinor)`, so it's 0 with
    no order discount. `display.discountMinor` is every sub-row plus the
    order row.
  - `display.subtotalMinor` is now `total − tax + discount` (exclusive) or
    `total + discount` (inclusive). A line in the display mode shows
    `quantity × unit price`, exactly. A converted line shows
    `convert(netMinor)` (what's left after its own discounts and its order
    share) plus its sub-rows and its converted share, so it never shows less
    than its own rows (#132 review: converting the gross on its own could
    show 6081 above rows of 6082).
  - The **residue**, subtotal − Σ line amounts, goes to the converted line
    with the **largest converted remaining** (ties to the earlier line). A
    negative residue takes a line down to its rows and share at most, then
    the next largest: six 2-cent inclusive lines at 27% can owe −3 with no
    line above 2. Putting it all on the last converted line showed a 1-cent
    line at −1 (#132 review).
  - **Invariants, exact by construction:** Σ line amounts = subtotal;
    Σ sub-rows + order row = discount; and the totals invariants above.
  - **Guards (the builder throws):** with no converted line the residue is
    0, since Σ gross = Σ net + Σ discounts. Otherwise |residue| ≤ ⌊n/2⌋ + 1,
    where n is the number of non-zero rounded conversions on converted
    lines (remainings, sub-rows and order shares): each is off by at most
    half a cent, and the order-level tax rounding by at most one more. With
    the remaining-based amounts, only the remainings' roundings reach the
    residue, so the bound has room to spare. The builder also checks that
    every figure is ≥ 0 and no line shows less than its rows plus share.
    The spill is a crash guard: it never fired in a 200k-cart fuzz.
  - **Return lines:** a negative-priced line shows what settlement charges
    for it (its converted remaining plus share) with **no discount rows**:
    its capped discounts cancel its negative gross, they aren't money off.
    It takes no residue and is outside the per-line ≥ 0 checks; the builder
    throws if a return line has rows or the display discount is negative. Settlement caps its discount part at the
    gross today, so it's charged, and shown, at 0. Refund and return lines
    get their own design when Paul opens refunds.
  - **Why the cent sits there:** the discount the cashier typed is the
    figure a customer can check, so every discount row is exact in its own
    mode, converted independently. A converted line's shown amount is
    already a rounded conversion the customer can't verify to the cent. A
    "Rounding" row is out.
  - **Consequences:** single-mode carts show the same subtotal and discount
    as before. Mixed carts can shift by about a cent, which is accepted:
    ADR-062's mixed fixture with €9.50 off B shows 3522 / 950 (was 3521 /
    949) exclusive, and 4191 / 1131 (was 4190 / 1130) inclusive. The
    receipt prints `displayAmountMinor`, `displayDiscounts` and
    `orderDiscountMinor`; `lineTotalMinor` stays, after every discount, for
    existing readers, and isn't the figure to print above the subtotal.
    `CartTotal` orders its rows Subtotal / Discount / Tax / Total and reads
    tax as "incl." when `taxInclusive`.
  - This completes the receipt half of backlog 48; one renderer is still
    open.

## ADR-064 `@tallyui/components` may depend on `@tallyui/pos` for types and pure functions only

- **Date:** 2026-09-25 · **Status:** Accepted (Front desk, 2026-09-25) ·
  **Source:** TV6a (ADR-052), which needed `useSale`'s shape and
  `buildReceiptData` inside a lifted `Cart`.
- **Why:** components render from props alone, in the docs and every
  platform app; a hook, store, collection or the order builder would tie a
  component to React state or a live sale it doesn't own.
- **Decision:** non-test code under `packages/components/src` may import
  from `@tallyui/pos` only as `import type` (`Cart` takes `sale:
  ReturnType<typeof useSale>`), or a pure function on
  `COMPONENTS_POS_ALLOWLIST` (`buildReceiptData`, `searchProducts`,
  `catalogueEntries`, `findEntryByCode`, `variantPriceLabel`,
  `needsAttention`) — never a
  hook, store or the order builder. `useState` in `Cart`/`DiscountForm` is
  component-local React state, not a pos import.
- **Enforcement:** `scripts/check-workspace-deps.mjs`'s
  `layeringViolations` fails `pnpm check:deps` on a non-type-only,
  non-allow-listed named import from `@tallyui/pos`.

## ADR-065 `order.create` version 3 carries the receipt's figures on every sale; `pos_orders` goes to schema version 2

- **Date:** 2026-09-25 · **Status:** Accepted (the Front desk); the `pos_orders` version-2 schema landed in registers c1a (decision 4), and the version-3 envelope and `finalizeOrder` are queued after registers job c1 · **Source:** decision (e) on the half-cent gap: Medusa keeps unrounded totals, so the POS receipt and the frozen closures are the fiscal figures.
- **Context:**
  - The server needs the receipt's own figures for every sale: the display totals and lines (ADR-063), and tax by rate (`taxLinesByRate`, #134).
  - The medusapos plugin is strict (#62). It rejects a version-1 command that carries extra fields, and a version-2 command without `discountMinor`.
  - So these figures can't be added to version 1, and version 2 only covers discounted sales.
- **Decision:**
  1. **`order.create` version 3** is version 2 plus two optional fields, both in integer minor units:
     - **`display`:** the order's display totals and display lines, exactly as the receipt shows them, with the currency and its exponent;
     - **`taxByRate`:** from `taxLinesByRate`, giving each rate with its net, tax and gross.
  2. **It's sent on every sale** (discounted or not) when the store's `capabilities.orderCreate` is at least 3. Below that, the client sends version 1 or 2 exactly as ADR-062 says, so **old plugins receive nothing new**.
  3. **The figures come from the same order snapshot the receipt uses, and are never recomputed.**
     - `finalizeOrder` copies `order.display` and `taxLinesByRate(order)` onto the `PosOrder`, and the envelope builder reads them from there.
     - `display` must equal `order.display`, and Σ `taxByRate.tax` must equal `taxMinor`. Both are asserted in tests.
  4. **`pos_orders` goes to schema version 2,** adding the two optional fields.
     - It uses an identity migration strategy through `posOrderCollection()` and `addPosOrderCollection` (#131, #133, #135).
     - It gets the same migration tests as version 0 → 1: a pending order survives byte for byte, nothing is dropped, and the SQLite and memory storages are both covered.
     - **Amended (2026-09-25):** the version-2 bump landed in registers c1a, with both fields and ADR-032's `lateSessionId`, and its tests run from version 0 and from version 1. So the ADR-065 job does only the version-3 envelope and `finalizeOrder`; it writes the fields and bumps no schema.
     - **Stored names (the Front desk, 2026-09-25):** `taxByRate` is stored as `taxLinesByRate` names it, `{ ratePpm, code?, label?, netMinor, amountMinor, grossMinor }`, where `amountMinor` is the tax; the nested objects of `display` and `taxByRate` refuse unknown fields. The version-3 wire field maps `amountMinor` to the tax.
     - **Deferred (the #158 follow-ups, 2026-09-28):** a `sessionId` index on `pos_orders`, which would narrow the orphan-stamp sweep's query (ADR-032) further, is not part of this version-2 bump. It moves to this job, so the v3 schema bump carries the index and tills migrate once.
  5. **The medusapos plugin** advertises `order.create` `[1, 2, 3]` on `/tally/v1/info` and records the two fields in the order's metadata. That half is specified alongside, so both land together.
- **Consequences:**
  - Every sale made against a version-3 server carries its fiscal figures.
  - Old plugins and old clients are unchanged.
  - Apps must adopt the new `addPosOrderCollection` release before they rely on version 3.
- **Amended: what version 3 ships (the Front desk, 2026-09-28).**
  - **The content decides the version,** as ADR-062 does for discounts.
    - `finalizeOrder` writes `display` and `taxByRate` onto the `PosOrder` only when the store's `capabilities.orderCreate` is at least 3.
    - `toOrderCreateEnvelope` sends version 3 exactly when the order carries both.
    - So each order's bytes are fixed at finalize, and every retry under its `commandId` is byte-identical.
    - **The outbox's version fallback (the Front desk, 2026-09-28)** handles a plugin that can't take an order's version.
      - **Both server behaviours:**
        - newer plugins answer a per-command `rejected` with `error: { code: 'unsupported_version', data: { orderCreate: <max> } }`, checked **before the ledger claim**, so the command id is recorded nowhere;
        - already-deployed plugins answer the whole batch with a 400 `Invalid commands[i].version`, at request validation, before any command is processed.
      - **What the outbox does:**
        - it records `sentVersion` (the capped version) and `downgradedFrom` on the stored order;
        - it resends under the **same `commandId`**, dropping only `display`, `taxByRate`, `sessionId` and `customerId`;
        - the order's own figures, `display` and `taxByRate` are never changed: the receipt and the frozen Z stay the fiscal record;
        - the envelope builder caps at `order.sentVersion`, so a resend after a restart has the same bytes.
      - **A discounted order the server can only take at version 1** is rejected `unsupported_version` (requeueable), never sent without its discount.
      - **Once per order:** a second refusal at the downgraded version is terminal.
      - **Why the same `commandId`:** in both behaviours the server recorded nothing, so the rebuilt bytes can't collide. And if that ever proved wrong, the same id gives a visible `idempotency_mismatch`, whereas a new id would create a second sale. So minting a new id is never the safer choice.
    - `finalizeOrder` refuses an order whose `display` total or tax disagrees with the order, or whose tax by rate doesn't sum to its tax.
      - It also refuses display lines that don't join the order's lines by count and by id, and a `display.taxInclusive` that differs from `pricesIncludeTax` (#185).
      - It never recomputes the other display figures (subtotal, discount, order discount). They are the builder's, copied as they are, and a second copy of its conversion would refuse good sales the day the builder's rounding changes.
    - `taxByRate` carries no English `label`; it is receipt copy, not data.
  - **`sessionId` (version 3 only)** is the sale's session, stamped or late: `order.sessionId ?? order.lateSessionId`.
    - It's one field, not two, because the orphan-stamp sweep can demote a pending order from `sessionId: X` to `lateSessionId: X` after a send whose response was lost. Two fields would change the resent bytes and give a non-requeueable `idempotency_mismatch`.
    - The server tells a late sale by its session's closure `orderIds`.
    - A `sessionId` that is empty, or longer than 36 characters, is omitted client-side (#185), as `customerId` is. The plugin would refuse the whole sale as `invalid_payload`, and every writer stamps a 36-character `mintUuid()`.
  - **`customer.customerId` (version 3 only)** is the platform id of the customer picked at the till, a soft reference of at most 64 characters (programme item 14). A longer id is omitted client-side, so the sale still goes with its email.
  - **`pos_orders` is schema version 3,** not 2 as the title says, since version 2 had already landed:
    - an index on `sessionId`, with `maxLength` 36. Every writer stamps a `mintUuid()` session id, and medusapos confirmed it writes none of its own;
    - the optional `sentVersion` and `downgradedFrom`, for the outbox's version fallback;
    - an identity migration through `addPosOrderCollection`, tested from versions 0, 1 and 2 on memory and SQLite.
    - Measured: RxDB's planner picks the `sessionId` index for an equality query, and the `createdAt` index for the orphan sweep's `$in` form. It's reported here, not forced.
  - **The golden envelope** (`packages/pos/src/pos-order/__fixtures__/order-create-v3.json`) is the fullest version-3 envelope, and the medusapos plugin pins the same file.
    - TallyUI's pipeline (builder, then `finalizeOrder`, the stamp, then the envelope) is its source of truth: the hand-built first draft was regenerated from it.
    - A structural test checks its figures agree with each other.

## ADR-066 Standalone app: TallyUI with no backend

- **Date:** 2026-09-28 · **Status:** Accepted (Paul's direction, via the
  Front desk); amends ADR-014 for this one app · **Source:** Paul,
  2026-09-28; the plan is [apps/standalone/PLAN.md](apps/standalone/PLAN.md)
- **Context:**
  - Paul: "There should be a version of a POS app that uses TallyUI without
    any backend at all, ie: it should just be a standalone
    desktop/ios/android app."
  - Every POS so far pairs TallyUI with a server (Medusa, Vendure, and the
    WooCommerce track added the same day), so nothing yet proves that
    `@tallyui/pos` works without one. Reading `packages/pos/src` at
    `9408d3e` found eleven places that assume a server (the plan's table
    A–K). Two bite at once: discounts are refused when no capability has
    been read (`finalizeOrder`, `useSale`), and a connector schema's
    version bump drops every document, which is data loss when the device
    holds the only copy.
  - WCPOS `next` ADR 0029 (wiki
    `architecture/decisions/2026-08-17-backend-direction-driver-identity-envelope.md`)
    is the model: one driver per platform gathers every backend fact, the
    engine above it stays backend-agnostic, and a seam counts as real only
    once it has two adapters.
- **Decision:**
  1. **Location.** The app lives in this monorepo as `apps/standalone`,
     TallyUI's reference app. It has no platform of its own, so ADR-014's
     rule (platform apps live in their platform's repository) does not
     apply to it.
  2. **The local-only driver.** In ADR 0029's model, standalone is a
     driver whose backend is the device. It implements the same
     `TallyConnector` interface with local implementations: no-credential
     auth, local store settings, advertised capabilities, and a command
     transport that applies `order.create` in-process, idempotently. It
     has no replication and no reconcile passes.
  3. **No server first, in the pos layer.** Every `@tallyui/pos` feature
     is designed to work with no server, and gains connector behaviour
     (auth, capability gates, the outbox, replication, register egress) as
     an optional layer on top. The pos layer must not assume that auth,
     capabilities, an outbox or replication exist. A review that finds a
     new pos-layer feature needing a server to work at all sends it back.
     This rule is for the pos layer only: platform connector features
     (a plugin's journal, server approval, Z posting) are built as layers
     over it, as registers job c2 is, and need not work without their
     server.
  4. **Storage and platforms.** RxDB Premium SQLite, one live instance per
     database (ADR-031, ADR-061). Desktop through Electron, as
     `medusapos/apps/desktop` does; iOS and Android through Expo.
  5. **MVP first** (ADR-034): M0 boots with a catalogue seeded from a CSV;
     M1 sells, tenders, prints a receipt and closes with a Z read, all
     local, with a manual full backup file; M2 adds local product and
     customer management; M3 adds exports, automatic backup and restore. More than one till is left to the platforms, per
     single instance.
- **Consequences:**
  - A new optional connector package (`connectors/local`), and one
    database change: collections a device authors get real migrations and
    never the drop path. It must land before any local schema leaves
    version 0.
  - M1's one change to `@tallyui/pos` is the receipt number: a
    `mintSaleNumber` keyed by `commandId` (as `mintClosureNumber` is keyed
    by the closure), minted once before the order insert and stored on the
    order as an optional `receiptNumber`, which the receipt and every
    reprint read. It rides ADR-065's pending `pos_orders` schema bump.
  - The local transport follows the plan's local transaction contract: the
    order insert is the commit point, cached stock is recomputed from
    idempotent movements and never incremented, and transient storage
    errors retry.
  - The shims M1 relies on (no-credential auth, advertised capabilities,
    the in-process transport) each have a follow-up that turns the
    assumption into an explicit optional: optional `auth`, the order store
    split from the outbox, and removing the deprecated `sync`. The
    follow-ups are additive, ship with changesets, and leave medusapos and
    vendurepos unchanged.
  - Registers job c2 is built as a layer on `useRegisterSession`, never a
    requirement inside it.
  - The standalone e2e suite needs no dev store, so it runs in CI with no
    backend.
  - The local driver can also serve as ADR-027's in-browser demo backend.
  - The platform order of ADR-020 is unchanged; standalone is a track
    beside the platforms, not ahead of them.

## ADR-067 Sync engine: TallyUI consumes @wcpos/sync-core and @wcpos/sync-engine; connectors become drivers

- **Date:** 2026-09-28 · **Status:** Accepted (Paul's decision; design by
  the Front desk) · Supersedes ADR-023 as the target protocol; amends
  ADR-024 · **Source:** Paul, 2026-09-28; the spike and phased plan are in
  [plans/sync-engine-adoption.md](plans/sync-engine-adoption.md)
- **Context:**
  - Paul: TallyUI may consume the WCPOS packages `@wcpos/sync-core` and
    `@wcpos/sync-engine` (monorepo `next`, `packages/sync-core` and
    `packages/sync-engine`), generalising them for TallyUI where
    necessary.
  - The engine is WCPOS's answer to everything ADR-023 and ADR-024 set out
    to build: a demand-driven require plane with lanes, partial replicas
    with coverage and checkpoints, conflict states, politeness toward the
    server (server-pressure, cadence, demand-flood detection), and a
    durable mutation queue that sends `Idempotency-Key` and `If-Match`.
    It is about 42,700 lines of source with 191 test files, and it
    already speaks `wcpos/v2`, the surface the WooCommerce app writes
    through (tallyui-woocommerce D1(b)).
  - The spike (plan §1) found the packages are private, ship TypeScript
    source with no build, depend on `workspace:*` and on `@wcpos/utils` at
    runtime, and pin RxDB 17.4.0 where TallyUI is on 16.21.1. There is no
    driver interface yet: WCPOS ADR 0029 (wiki
    `architecture/decisions/2026-08-17-backend-direction-driver-identity-envelope.md`)
    deliberately gathers one Woo driver instead of designing a `Backend`
    interface from a single adapter, and 77 of the engine's 168 source
    files still reach WooCommerce shapes or `wcpos/v2` URLs directly.
- **Decision:**
  1. **The engine is shared.** The require plane, lanes, partial replicas,
     checkpoints, conflict states, politeness and the mutation queue
     (`Idempotency-Key` = mutation id, `If-Match` = base revision) are
     WCPOS's, consumed by TallyUI. TallyUI does not build a second sync
     engine.
  2. **A TallyUI connector becomes a driver** in the shape of ADR 0029:
     auth, journal tick, fetch by id, push with idempotency and revision,
     and declared capabilities. The driver owns every platform fact (ids,
     routes, payload mapping, the POS envelope carrier); the engine above
     it stays backend-agnostic.
  3. **Adoption order.** The WooCommerce app (`wcpos/tallyui-woocommerce`)
     first, on the engine as it is, since it already speaks `wcpos/v2`.
     Then the driver interface and generalisation, then a Medusa driver,
     then a Vendure driver. The standalone app (ADR-066) becomes the
     local-only driver once the interface exists.
  4. **The engine is changed only in the monorepo**, by a worker there,
     on WCPOS `next`. Each change is behaviour-neutral for WCPOS and
     passes its suite. TallyUI consumes published packages (GitHub
     Packages, prerelease versions tied to `next` commits) or, if
     publishing slips, an unedited vendored snapshot checked byte for
     byte against a monorepo commit. TallyUI never patches engine code.
  5. **RxDB 17.4.0 is a prerequisite.** The rxdb and rxdb-premium upgrade
     that ADR-031 chose and ADR-044/ADR-045 deferred is done before the
     WooCommerce app takes the engine. vendurepos and medusapos move in
     lockstep with it, and no tester's unsent command is lost: pending
     outbox commands are sent before the database is replaced, or the
     outbox is carried by RxDB's storage migration.
  6. **ADR-023 is superseded as the target protocol.** TSP v1 (`manifest`,
     `pull/:collection`, `commands`, `stream`, `ids/:collection`) is no
     longer where TallyUI is heading. The target is the engine's
     protocol, as each driver maps it onto its platform and improves on it
     where the principle below allows. The conformance
     idea survives as the engine's own contract fixtures and fakes
     (`sync-core/contracts`, `fakePullServer`, `fakeWriteServer`) and the
     driver contract tests of plan P2.
  7. **ADR-024 is amended, not withdrawn.** Pull-only reads and the
     `order.create` command outbox stay in service for the Medusa and
     Vendure testers until their drivers exist (plan P3 and P4), and are
     retired platform by platform as each moves to the engine. An outbox
     is retired only after two tests pass on its platform: pending
     commands are carried across the switch, and a crash after the server
     commits but before the device records the acknowledgement leaves no
     duplicate order.
  8. **The document model gates the driver interface.** Before the
     interface is designed (plan G2), a narrow real Medusa experiment on
     the seeded demo store (plan G4) decides whether a driver
     materialises the engine's Woo-shaped `payload` (ADR 0029 decision 5)
     or `payload` becomes driver-typed. That decision gates P2 and is
     logged as its own ADR.
- **Principle: the engine's mechanics are the input, its constraints are
  not.** Paul, 2026-09-28: "We don't have to be limited by the
  WooCommerce use-case. I am open to suggestions and cross pollination
  based on what will produce the best results. The WCPOS sync engine and
  core may be limited by PHP or server considerations that do not apply
  to Medusa or Vendure."
  - What the engine has proven (demand-driven partial replicas, coverage
    and checkpoints, conflict states, politeness, an idempotent durable
    mutation queue) is where each driver starts.
  - Where a WCPOS choice exists because of WordPress and PHP, a Node
    platform may do better, and should when the numbers say so:
    - a polled change tick and a journal of pointers, because the server
      cannot push: Medusa and Vendure can push over SSE or websockets;
    - full-document REST writes: GraphQL mutations or Medusa workflow
      APIs;
    - monotonic integer ids and existence-manifest buckets: string ids
      with timestamps or a server-side journal;
    - no cross-resource transactions on the server: real database
      transactions;
    - opaque revisions: typed revisions.
  - Every Medusa or Vendure design states which engine mechanisms it
    keeps and which it replaces, with the reason and the measurement.
    The criterion is the best result, backed by numbers and tests, not
    the smallest departure from WCPOS.
  - An improvement proven on Medusa or Vendure is a candidate for WCPOS
    v2, raised with Paul with its numbers.
- **Consequences:**
  - Phases (plan §2): P0 publish or vendor, and RxDB 17; P1 the
    WooCommerce app on the engine; P2 driver interface and
    generalisation; P3 Medusa driver; P4 Vendure driver.
  - The monorepo packaging work for P0 is small (a build and dependency
    fixes). Moving `apps/main/lib/engine-fetcher.ts` into a
    `@wcpos/sync-engine/woo-transport` door is its own job of about 3–4
    days: it imports `@wcpos/query`, four `@wcpos/utils` modules and
    apps/main's clock-skew and metrics helpers, so the logger, request
    preamble and metrics move behind injected ports. P2 is about 15–22
    working days, provisional until the G4 decision; the Medusa driver on
    top of it about 9–14 (plan §1e).
  - P2 amends WCPOS ADR 0029 decision 4 on the WCPOS side: a second
    backend is now real, so the driver interface is named from what the
    engine asks of the Woo driver, on G4's document model, with two
    adapters from the first day.
  - The engine's document model is Woo-shaped (ADR 0029 decision 5).
    TallyUI's own models stay: the pos layer keeps the neutral sale
    (ADR-062, ADR-065) and reads the catalogue through traits (ADR-002).
    The app maps a sale onto `engine.write()`, and whether a non-Woo
    driver materialises the Woo shape or the engine's `payload` becomes
    driver-typed is decided by the G4 experiment (Decision 8), which
    opens P2.
  - Programme §2.3's M1 (the TSP conformance kit) and M2 (the Medusa sync
    plugin on TSP) are frozen at what testers use today; new sync work
    goes to the plan's phases.
  - A second consumer turns the engine's two doors (`@wcpos/sync-engine`
    and `/testing`) into a contract. Breaking changes need a version bump
    and a note for TallyUI.

## ADR-068 Registers sync to the server as `register.*` commands on the command outbox

- **Date:** 2026-09-28 · **Status:** Accepted (design agreed by the Front
  desk and the medusapos track, 2026-09-28) · Amends ADR-032 and ADR-038 ·
  Widens ADR-067 decision 7, which kept the command outbox to
  `order.create`, to the register commands (the Front desk, 2026-09-28)
- **Context:**
  - Before c2, a TallyUI register is entirely local. Its sessions,
    movements and closures never leave the device, and the Z is the till's
    word alone. Nothing stops two tills opening one drawer, or a server
    closing a session the till still thinks is open.
  - The fiscal principle is "the till records facts; the server keeps
    them". The server must:
    - keep the write-once record;
    - anchor expected cash and the sales count on its own ledger;
    - refuse what one till can't know is wrong;
    - hand back the register's counters and closure number.
  - It must stay backend-agnostic. Every plugin (Medusa first, then
    Vendure, WooCommerce and Shopify) implements the same commands.
  - ADR-067 makes the WCPOS sync engine the target. Its drivers are weeks
    out, behind P0, P1 and the G4 experiment. Testers need register closes
    now, and MVP-first means they don't wait for an engine migration.
- **Decision:**
  1. **The transport is the existing command channel.**
     - Register facts ride `POST /tally/v1/commands` (ADR-038), with the
       same envelope, auth, batch limits, retry rules and idempotency
       ledger. There are no per-platform register routes.
     - Five new command types, each versioned from 1:
       - `register.session.open`;
       - `register.session.transition`;
       - `register.movement.record`;
       - `register.movement.void`;
       - `register.closure.submit`.
  2. **A capability gates it.**
     - `/tally/v1/info` lists `"register": [1]` under `contracts`, beside
       `order.create`, and `ServerCapabilities` gains `register?: number`
       (the highest listed version; missing means 0).
     - Below 1, nothing is recorded or sent: a till against an old plugin
       stays exactly as local as before.
  3. **There's a local `register_commands` collection,** which is both the
     queue and the sync ledger.
     - Its key is deterministic (`session.open:<sessionId>`,
       `session.transition:<sessionId>:<status_at>`,
       `movement.record:<movementId>`, `movement.void:<movementId>`,
       `closure.submit:<closureId>`), so an append is idempotent.
     - `reconcileRegisterCommands` appends every missing fact in fact order,
       serialised per register. Each append gets the next per-register
       `seq`, read from the ledger itself (the highest `seq` plus one), so
       the order survives a reset of the register document. A gap from a
       lost race is harmless.
     - **Which sessions:** the moment the gate first turns on for a register
       is stored as `commands_since` in its register document. A session
       **closed before** that moment is history from before the capability,
       and is never backfilled unless its open command is already in the ledger. Every other session is, whether it is still
       open or closed later, even if its open command was never recorded.
     - **Transitions are captured when they happen:** each register action
       hands the row it wrote to the queued reconcile.
       - A captured transition is appended when the ledger holds no
         transition for that session yet, even if a later transition has
         overwritten the row by the time the reconcile runs.
       - It isn't appended separately when it has the session's current
         status (the current row carries it), or is `closed` (terminal, so
         the current row carries it too). The check is by identity, never
         by a clock.
       - Otherwise the session's current state supersedes it.
       - Either way the current state is appended last, and a missing
         intermediate state is safe (decision 5a).
     - A session whose `closure.submit` command is recorded is complete,
       and the reconcile skips it.
     - **The ledger is never pruned.** An applied command stays as the
       record that its fact was sent. Deleting one would make the next
       reconcile append the fact again under a new command id, which the
       server would take as a new fact.
     - The envelope id is minted once at append and stored, so a retry
       sends the same bytes, as ADR-065 does for orders.
     - The local register write comes first, then the append. A recovery
       scan on start and after each flush appends any missing command. A
       crash delays a command; it never loses one.
     - The collection is local and never replicated. The three register
       collections get no schema bump.
  4. **Sending is serial per register, and order is the ledger's, not the
     clock's** (the Front desk, 2026-09-28).
     - A register's commands are never sent concurrently from one till.
       They go strictly by `seq`, in batches applied in array order, and
       the queue stops at the first command not applied. So the order in
       which the server applies a register's commands **is** the ledger's
       `seq` order. `seq` itself isn't on the wire, and the server doesn't
       need it. Replay safety by command id makes a redelivery a no-op.
     - `at` is a fact carried in the payload, never an ordering key.
     - That gives the dependencies for free: the open before a transition,
       a void after its target, the closing transition after every
       movement, and the closure last. A movement may follow a counting
       transition, since movements are accepted on any non-closed session.
     - **The till keeps its `seq` order true to the facts:**
       - it never appends a captured state that a transition already in the
         ledger supersedes, and a session's current state is always
         appended last among its transitions;
       - nothing in the till's sequencing compares a clock;
       - sessions go by closure number, then any closed session without a
         closure row yet (by id), then the open session;
       - within a session: its open, then any captured transitions not yet
         superseded, then its movements with voids after their targets,
         then the current state, then the closure.
     - **The ledger's `seq` can have gaps** (a lost race), and, with two
       collection instances over one database, a duplicate. The sender
       orders by `seq`, then key.
     - Orders stay on their own outbox. A closure binds its orders by
       `orderIds` whenever they land (soft references, never refusals).
     - **Movements and voids are accepted on any non-closed session,** open
       or counting, as ADR-032 allows them locally, whatever their `at`.
       They are refused once the session's closing transition, or its
       closure, has been applied. So a movement that races `startCounting`
       doesn't wedge the queue.
     - **A movement stranded after its closure stays local.** The server
       refuses it once the closure exists, and the reconcile skips a
       session whose closure is recorded. It is on the till (ADR-032's
       stranded row), not on the server.
  5a. **A transition is a state snapshot** (agreed for both tracks,
      2026-09-28). `register.session.transition` says "the session is now in
      this status", and `at` records when.
      - The last applied transition sets the status (decision 4's order).
        Nothing compares `at`.
      - A transition to the status the session already has is applied as a
        no-op.
      - A transition out of `closed` is refused (`register_session_closed`).
      - Intermediate states may be missing: the till can send open, then
        closed, without the counting in between.
      - The closing transition is terminal, and carries `counted`.
  5. **Conflict codes are neutral, and byte for byte the same on both
     tracks** (confirmed in writing to medusapos, 2026-09-28).
     - Each is a per-command `rejected` result inside a 200, with details
       in the optional `CommandError.data`, which the outbox version
       fallback already added (ADR-065):

       | Code | `error.data` |
       |---|---|
       | `register_session_already_open` | `{ sessionId }`, the winner's |
       | `register_session_closed` | none |
       | `register_approval_required` | none |
       | `register_closure_exists` | `{ closureId }` |
       | `register_closure_number_invalid` | `{ counters: { lastClosureNumber, perpetualSalesTotalMinor, perpetualRefundsTotalMinor } }` |

     - Shape errors stay `invalid_payload`. A business refusal is never a
       whole-batch 4xx.
     - **A replay returns the originally recorded result** (the Front desk,
       2026-09-29).
       - An applied command's replay comes back `duplicate`, carrying the
         result recorded when it was applied, not the current state.
       - A command whose rejection was recorded comes back `rejected`, with
         the same code and message, never `duplicate`.
       - Current state is read through `GET /tally/v1/registers/{id}`, or
         the order, never inferred from a replay. Both plugin paths already
         do this (medusapos #108, ADR 0019).
       - A refusal that wasn't recorded (state-dependent, below) is
         re-evaluated on resend, and may then apply.
       - As a belt, the till treats a `duplicate` that carries an `error` as
         rejected, and its register stops.
     - **The business conflicts (`register_*`) are recorded** in the
       server's ledger. A state-dependent refusal isn't recorded, so a
       resend of the same command id re-evaluates once the state is fixed.
       The state-dependent refusals are an unknown session, a missing void
       target, and a closure whose register isn't its session's.
     - **An unsupported register version** gets a per-command `rejected`
       with `unsupported_version` and `error.data: { register: <highest
       supported> }`, mirroring `order.create`'s `data.orderCreate`.
  6. **Server results.** `RegisterCommandResult.closure` is
     `{ serverClosureId, number, expected?, variance? }`.
     `closure.findings` stays absent or untyped until both tracks type it.
     - A closure renumbered after `register_closure_number_invalid` can't be
       resent through the same command: its key and bytes are fixed, and a
       new payload under the same command id gets `idempotency_mismatch`.
       The resend path is c2c's to define.
  6a. **The payloads (version 1),** byte for byte on both tracks. They use
      camelCase and integer minor units. An optional field is **omitted**
      when the till's value is `null` or missing, never sent as `null`.

      | Type | Payload |
      |---|---|
      | `register.session.open` | `sessionId`, `registerId`, `openedAt`, `countedFloatMinor`; optional `storeKey`, `businessDay`, `openedBy`, `expectedFloatMinor`, `openingVarianceMinor` |
      | `register.session.transition` | `sessionId`, `status` (`open`, `counting` or `closed`), `at`; when closing only, optional `counted` (tender → minor units), `closedBy`, `approvedBy` |
      | `register.movement.record` | `movementId`, `sessionId`, `type` (`paid_in`, `paid_out` or `no_sale`), `amountMinor`, `reason`, `createdAt`; optional `createdBy` |
      | `register.movement.void` | `movementId` (the void's own id), `sessionId`, `voids` (the voided movement's id), `createdAt`; optional `createdBy` |
      | `register.closure.submit` | `closureId`, `sessionId`, `registerId`, `number`, `openedAt`, `closedAt`, `tillExpected`, `counted`, `periodSalesTotalMinor`, `periodRefundsTotalMinor`, `perpetualSalesTotalMinor`, `perpetualRefundsTotalMinor`, `unsyncedCount`, `unsyncedTotalMinor`, `softwareVersion`, `orderIds`, `movementIds`; optional `businessDay`, `closedBy`, `approvedBy` |

      - The closure payload leaves out the till's `expected`, `variance`,
        `breakdowns`, print fields and server fields. The server derives
        expected cash from its own ledger.
      - `approvedBy` is `breakdowns.approved_by` when that is a non-empty
        string.
      - **Movement amounts:** `amountMinor` is always positive, and `type`
        gives the direction. `paid_in` and `paid_out` carry an integer
        greater than 0, and `no_sale` carries exactly 0. The server refuses
        anything else as `invalid_payload`. The till's `recordMovement`
        refuses the same amounts before any write
        (`RegisterMovementAmountError`), so it never queues one.
      - **`reason`** is required on every `register.movement.record`,
        `no_sale` included. It must be non-empty after trimming, and at most
        500 characters, as the till's movement sheet requires.
      - **Ids** are at most 64 characters on the wire. Session, movement and
        closure ids are 36-character UUIDs. The register id is the one the
        app binds; the till's own schemas hold at most 36 characters, so
        `bindRegister` refuses a longer one.
      - **The till's store refuses** a `reason` or register id the server
        would refuse, before any write (`RegisterMovementReasonError`,
        `RegisterIdInvalidError`), as it does amounts. Movements recorded
        before these guards were checked only by the sheet, the one writer
        TallyUI has.
      - **A closure's register:** `register.closure.submit`'s `registerId`
        must be its session's register, or the server refuses it as
        `invalid_payload`. Decision 8's "an unknown register id is accepted
        as written" applies to `register.session.open`, which creates the
        register. A closure never creates one.
      - The TypeScript shapes are `Register*Payload` in
        `packages/core/src/types/commands.ts`.
  7. **Approval.**
     - In the v1 transition, `approvedBy` stays soft: it's accepted as
       sent.
     - The signed, session-bound `approverToken` arrives only with c2c's
       approve route, and `register_approval_required` is raised only from
       then on.
     - The server's variance threshold is a plugin option.
  7a. **Two meanings of `registerId`** (vendurepos ADR 0002 review, the
      Front desk, 2026-09-29).
      - In the `register.*` commands, `registerId` is the drawer: the
        register whose sessions, movements and closures they carry.
      - In `order.create` (ADR-038), `registerId` is the till's **device**
        id, as the medusapos ADRs 0017 and 0019 already read it.
      - A sale's drawer is identified through its `sessionId` (ADR-065).
      - Every plugin must read the two fields this way, and never join an
        order to a drawer by `registerId`.
      - **On the wire, `order.create.registerId` carries the device id; in
        the till, `registerId` means the drawer** (the target c2b completes).
        - Two till fields still carry the device id, because they feed
          `order.create`: the stored order's `PosOrder.registerId` and
          `FinalizeOptions.registerId`. They must keep carrying it; putting
          the drawer id there would change the wire.
        - c2b splits `useSale`'s option: `deviceId` feeds those two fields
          and `order.create`'s `registerId`, which the wire keeps for
          compatibility. `registerId` then means the drawer everywhere
          else in the till, the fact log and the late-sale fact included.
          The old single option is deprecated, in a minor release.
  8. **Register ids are minted locally,** and the server holds soft
     references to them: an unknown register id in `register.session.open`
     is accepted as written, and creates the register.
     There's no register-creation flow in the POS.
  9. **Refunds are out of scope** until Paul's refund model.
     `period_refunds` stays 0, and the server figures exclude refunds.
  10. **The residual window of ADR-032** (a sale stamped between the
      count gate and `writeClosure`) closes by refusing stamps while the
      session is counting (c2b-1).
  11. **The job split** is c2a (the types, the outbox and the capability
      gate), c2b (results, anchoring and counters) and c2c (conflict
      handling, approval tokens and UI). c2a sits behind the capability,
      so it can merge before any plugin supports it.
  12. **Under ADR-067.**
      - `register.*` commands ride the command outbox under ADR-067
        decision 7, as `order.create` does.
      - When a platform's driver lands, they carry across to the engine's
        mutation queue with the command id as the `Idempotency-Key`. The
        register outbox is retired only after the same two tests as the
        order outbox pass on that platform.
      - The `register_*` conflict codes become driver-mapped.
      - Register facts are a named input to the driver interface (G2 in
        [plans/sync-engine-adoption.md](plans/sync-engine-adoption.md)).
  13. **Expected cash: the till's figures are the record, the server's a
      reconciliation view** (the Front desk, 2026-09-28, consistent with
      ADR 0012). This is the contract for the server's `expected` and
      `salesCount` (medusapos P2). The till's derivation, cited to its
      code, is in the c2 handoff note `c2-expected-derivation.md`.
      - **The fiscal record:** `register.closure.submit` carries the
        till's own `tillExpected` and `counted`, and the till's variance
        follows from them (`counted − tillExpected` for each key of
        `counted`). Those are the fiscal record.
        - The server's computed `expected` and `salesCount`, live or at
          the closure, are a reconciliation view. They never overwrite the
          till's figures.
        - Any difference (a rejected order, an unreceived order id, a late
          sale) is shown as a discrepancy with its cause, never silently
          resolved.
      - **The derivation both sides share:**
        - integer minor units only;
        - keys are payment `method` strings, with `cash` always present;
        - a sale adds each payment's `amountMinor` (net of change);
        - the float is the open's `countedFloatMinor`, on `cash`;
        - `paid_in` adds to `cash`, `paid_out` subtracts, `no_sale` and
          void rows add nothing, and a voided movement is excluded;
        - `salesCount` counts orders, not payments;
        - variance is `counted − expected` over the keys of `counted`
          (negative means short), with no rounding and no tolerance.
      1. **Late sales:** the server can't tell a late sale from a stamped
         one, since `order.create` carries one `sessionId`
         (`sessionId ?? lateSessionId`, ADR-065).
         - The server's **live** figure counts every received order with
           that `sessionId`.
         - The till's c2b anchor rule treats any local order tagged to the
           session, stamped or late, that the server's figure doesn't yet
           reflect as local-pending, and never anchors while one exists.
      2. **The closed figure:** at and after the closure, the server's
         `expected` is the float, plus the cash of the orders in the
         closure's `orderIds` that it has received, plus the movements in
         the closure's `movementIds`. A void row in the session excludes
         its target, as on the till. `salesCount` is the number of those
         orders.
         - `movementIds` is the till's frozen list (`writeClosure`).
         - A movement stranded by a racing close (ADR-032) can reach the
           server before `closure.submit` without being in that list. The
           Z doesn't count it, so neither does the closed figure.
         - That excludes late sales, as the till does, and matches the till
           exactly once every order has landed.
         - Order ids not yet received are the closure's unsynced figures.
      3. **Rejected orders:** the till counts their cash, which was taken,
         and lists them in `orderIds`. The server never records them, so
         its figure is lower by that cash. This is correct, and shown as
         a discrepancy with its cause (clause above). An order later
         applied, for example after a `store_configuration` retry
         (backlog 52), closes the gap.
      4. **Orders sent without a `sessionId`** (versions 1 and 2, or a
         version 3 order downgraded by the outbox fallback): the server's
         live figure misses them until the closure binds them by
         `orderIds`. The till's c2b anchor rule treats them as
         local-pending too.
      5. **Blind counts and variance keys:**
         - In c2 the server always returns `expected`. Blind is a till UI
           option, and any redaction waits for c2c.
         - The server computes variance over the keys of `counted`, as the
           Z does. The till's corrections figure (`deriveSettled`, all keys
           of either map) is separate, and not part of this contract.
      6. **Later admin actions never change the figure** (the Front desk,
         2026-09-28; medusapos/app#100 implements it).
         - The server's figure counts every order it received from the
           till, whatever an admin does to it later.
           - Archiving or cancelling an order after the fact never changes
             a session's live or closed figure.
           - Only an order that was never placed is excluded. On Medusa,
             an order carrying `tally_payments` counts when its status is
             `completed`, `archived` or `canceled`; `pending` and `draft`
             don't.
           - **Amendment (2026-09-29, Front desk):** these also count as
             never placed:
             - an order cancelled by an ADR-038 admin reject;
             - an order left cancelled by a compensation that returned
               `platform_error` or stayed transient.

             Each is flagged (`metadata.tally_rejected` or equivalent) and
             excluded from the register figures. Otherwise the till's Retry,
             which records the sale again, would count the same cash twice.
         - Refunds (after c2) go into a refund figure. They are never taken
           out of `expected`.
         - The reason: the till's `tillExpected` and `counted` are the
           fiscal record, so the server's view must stay comparable to
           them.
- **Consequences:**
  - **ADR-038's shapes grow additively, and no existing type narrows or
    breaks** (it's a minor release):
    - `CommandType` and `CommandEnvelope` are exactly as before
      (`'order.create'`, version `1 | 2 | 3`);
    - new beside them:
      - `RegisterCommandType`, the five types;
      - `RegisterCommandEnvelope`, the same fields with its own type and a
        numeric version, since each register type versions on its own;
      - `AnyCommandEnvelope`, the union;
    - `OrderCreateEnvelope` names the order case, and
      `toOrderCreateEnvelope` returns it;
    - `CommandResult` gains `register?`;
    - `CommandTransport<E>` is generic, bounded by `AnyCommandEnvelope`, and
      defaults to `CommandEnvelope<OrderCreatePayload>`, so an existing
      transport type-checks unchanged. The HTTP transport declares
      `CommandTransport<AnyCommandEnvelope>`, so one transport serves both
      outboxes.
    The order outbox is unchanged in behaviour.
  - **What shipped when:** c2a-1 records the commands locally behind the
    gate and sends nothing. c2a-2 sends them.
  - **Every plugin's checklist:**
    - `"register": [1]` in `/tally/v1/info`;
    - the five handlers, with ledger and fingerprint idempotency;
    - write-once register, session, movement and closure tables;
    - at most one non-closed session per register;
    - a movement's session must not be closed, and its closure not yet
      submitted (decision 4);
    - a register's commands are applied in the order received, with a
      batch in array order, and nothing compares `at` (decision 4);
    - a transition is a state snapshot: the last applied one sets the
      status, a same-status transition is an applied no-op, a transition
      out of `closed` is refused, and intermediate states may be missing
      (decision 5a);
    - `reason` is required, non-empty after trimming, at most 500
      characters, and ids are at most 64 characters (decision 6a);
    - an unsupported register version answers `unsupported_version` with
      `data.register`; state-dependent refusals aren't recorded
      (decision 5);
    - a void names a row of its own session, once;
    - a movement's `amountMinor` is > 0 for `paid_in` and `paid_out`, and
      exactly 0 for `no_sale` (decision 6a);
    - a closure's `registerId` is its session's register (decision 6a);
    - a closure number is the register's last number plus one;
    - one closure per session;
    - ledger-derived `expected` and `salesCount` from `order.create`'s
      `sessionId` (ADR-065) and the movements.
  - **Until c2c ships,** an over-threshold close isn't refused by the
    server.
