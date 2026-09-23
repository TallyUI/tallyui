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

- **Date:** 2026-02-25 · **Status:** Under review · **Source:** PR #1,
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
  **Needs Paul** (plan D1) · **Source:** plan §1.4
- **Context:** Medusa has the most sync-ready API (`with_deleted=true` on
  every list route, no maximum page size, barcode filters), MIT licensing,
  a live domain and a seeded dev store. Vendure has no POS today and a clean
  plugin model (MIT allowed under its GPL plugin exception). Shopify's API
  Terms §2.3.18 and §2.3.10 and App Store rule 1.1.8 bar a third-party POS
  without written authorisation.
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

- **Date:** 2026-09-23 · **Status:** Accepted, pending Paul on D2 for apps ·
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
