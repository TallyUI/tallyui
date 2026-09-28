# Sync engine adoption: TallyUI on `@wcpos/sync-core` and `@wcpos/sync-engine`

- **Date:** 2026-09-28 · **Decision:** ADR-067 · **Source:** Paul,
  2026-09-28; front desk design
- **Read at:** monorepo `origin/next` `513257c70` (packages/sync-core,
  packages/sync-engine), wiki ADR 0029
  (`architecture/decisions/2026-08-17-backend-direction-driver-identity-envelope.md`),
  TallyUI `origin/main` `e97d8a2`, `wcpos/tallyui-woocommerce` `origin/main`
  `f89d77e`.

Paul's decision: TallyUI may consume the WCPOS sync packages, generalising
them for TallyUI where necessary. This plan records what the packages are
today, what it takes to use them, and the phases to get there. The engine
packages are changed only in the monorepo, by a worker there.

## 1. Spike findings

### 1a. Are the packages publishable as they stand? No.

| | `@wcpos/sync-core` | `@wcpos/sync-engine` |
|---|---|---|
| `private` | `true` | `true` |
| Version | none | none |
| Exports | `.` and `./testing`, both pointing at `src/*.ts` | same |
| Build | `tsc --noEmit` (a typecheck; no `dist`, no `.d.ts`) | same |
| Runtime deps | `ajv ^8.20.0` | `@wcpos/sync-core: workspace:*`, `rxdb 17.4.0` |
| Dev deps | `vitest` | `@wcpos/utils: workspace:*`, `rxdb-premium 17.4.0`, `vitest` |
| tsconfig | extends the monorepo root, path-maps sibling `src/` | same, plus `@wcpos/utils/*` |

Size: 168 non-test source files, about 42,700 lines (the facade
`create-rxdb-sync-engine.ts` alone is 2,657; `require-plane.ts` 1,794);
about 120 test files beside them.

Blockers to consuming them outside the monorepo:

1. **No build output.** The exports are TypeScript source. Metro would
   transpile them; a web bundler or Node consumer needs a `dist`.
2. **`workspace:*`** on sync-core, and `@wcpos/utils` is imported at
   runtime (`@wcpos/utils/sync-protocol` in the facade for the
   `X-WCPOS-Protocol` header, `@wcpos/utils/logger` in
   `write-path/engine-order-repository.ts`) while declared only as a dev
   dependency. Inside the monorepo hoisting hides this; outside it the
   import fails. The logger drags in the Sentry sinks.
3. **RxDB 17.4.0 against TallyUI's 16.21.1.** The engine imports `rxdb`
   17.4.0 and expects an RxDB 17 storage (`rxdb-premium` 17.4.0 SQLite).
   TallyUI pins `rxdb` and `rxdb-premium` at 16.21.1 in every package.
   Two RxDB majors cannot share a database or a storage, so the TallyUI
   side must move to 17.4.0 first. ADR-031 already chose 17.4.0 (WCPOS's
   pin); ADR-044 and ADR-045 left the 16 → 17 upgrade as a separate
   job. This makes it a prerequisite.
4. **The host transport lives outside the packages.**
   `apps/main/lib/engine-fetcher.ts` (509 lines: the `_wcpos_envelope`
   response envelope, protocol headers, `X-Server-Load`, the query-total
   port) is what makes a bare `fetch` reach a WCPOS backend. The engine
   refuses to default it. A second consumer would copy it unless it moves
   into the package.

### 1b. What a consumer provides today

There is no driver or backend interface. ADR 0029 decision 4 rejected
designing one from a single adapter, so the backend is chosen by the URLs
the engine builds, and a consumer provides host ports
(`RxdbSyncEnginePorts`):

- **Required:** `site` (`syncBaseUrl`, `wpJsonRoot`, optional
  `wcposVersion`), `storage` (an RxDB 17 storage, or a factory per
  `StoreScopeIdentity`), `fetcher` (raw authenticated transport that
  satisfies the WCPOS contract).
- **Optional:** `checkpoints` (string store; default is a kv collection in
  each scope database), `connectivity`, `holdAutomaticTicks`, `uuid`,
  `random`, `now`, `timers`, `diagnostics` (the `SyncEvent` observer),
  `onUpdateRequired`, `mode` (`auto` or `manual`), `multiInstance`,
  `writePlaneOwner`, `writeOutcomeBridge`, `intervals`, `queryTotal`,
  `lastUserActivityMs`, `hostVisible`, `onUserActivity`,
  `onHostVisibilityChange`, `defaultProductBrowseSort`.

The engine owns the database: it opens one RxDB database per store scope
with its ten collections (orders, products, variations, customers,
taxRates, categories, brands, tags, coupons, refunds) plus its own queue,
checkpoint, coverage and scheduler collections. A host reads through
`whenActive()` / `db$()` and asks for data with `require()` (browse
windows, search, by id). It writes with `write(intent)`: durable enqueue,
with outcomes as events (`write-acknowledged`, `write-conflict`,
`write-rejected`, `write-annihilated`). Only orders have a write facet.
Conflicts come back through `conflicts()` / `resolveConflict()`.

The seams that already exist: `drainMutationQueue` takes an injected
`push`; `PosCarrier` is an interface with a Woo `meta_data` adapter and a
fake; `RemoteId` is an opaque branded string (ADR 0029's reshape has
landed).

### 1c. How deep the WooCommerce specifics go

Deep, and mostly outside `woo/*`.

- `sync-core/src/woo/` is small: `documentKeys`, `orderWriteContract`,
  `remoteIdCodec`, `sentinels`.
- The core protocol types are Woo-shaped: `OrderDocument.payload` is
  `WooOrderPayload`, `ProductDocument.payload` is `WooProductPayload`,
  `SyncCheckpoint` is `{updatedAtGmt, orderId: number, revision,
  sequence}`, and the promoted index columns are read from wc/v3 field
  names. `PosCarrier` is typed over `meta_data` arrays. This follows ADR
  0029 decision 5 ("`payload` is the client's document model",
  Woo-shaped).
- 77 of the 168 source files reference wc/v3 shapes, Woo types or the
  meta carrier. 29 build URLs against `wcpos/v2` routes: `changes/tick`,
  `changes/sequence-log`, `changes/config-fingerprint`, `digests`,
  `integrity/scan` and `integrity/bucket`, `push/{collection}`,
  `orders/pull`, and the per-collection fetchers. The Woo id codec
  (`wooIdOf`, `mintRemoteId`) is called at 70 sites in 21 files.
- The existence manifest's bucket arithmetic assumes monotonic integer
  ids. ADR 0029 decision 2 reclassified that as a Woo-driver capability,
  but no second implementation exists.
- The write path carries WooCommerce business rules: server-authored
  order money, line-identity grafting, open-cart hold, refund provenance,
  outbound payload sanitisers for wc/v3.

The demand plane (require, lanes, coverage, census, scheduler), the
mutation queue (Idempotency-Key = mutation id, `If-Match` = quoted base
revision, 409/412/428 handling, coalesce and annihilation), politeness
(server-pressure, cadence, demand-flood detection), scope management and
telemetry are backend-agnostic in logic but reach the backend through
Woo URLs and payloads. ADR 0029 decision 4's "gathered Woo driver" (every
Woo fact in one module) has started (`woo/*`, the carrier, the id codec)
but is not finished.

### 1d. The smallest change that lets the WooCommerce TallyUI app use the engine unmodified

The app speaks to WooCommerce through the WCPOS Free plugin's `wcpos/v2`
already (tallyui-woocommerce D1(b), decided 2026-09-28), which is the
engine's own wire. So the engine's logic needs no change for this app;
only its packaging does.

Monorepo, one small worker job, behaviour-neutral for WCPOS:

1. Add a real build (`tsc` to `dist/` with `.d.ts`), point `exports` at
   it, keep `./testing`.
2. Replace `workspace:*` with a version range; make `@wcpos/utils` a
   runtime dependency, or better, drop both imports: inline the two
   protocol-header constants and route the one logger call through the
   existing `diagnostics` port.
3. Move `apps/main/lib/engine-fetcher.ts` into the engine as a
   `@wcpos/sync-engine/woo-transport` door, so both apps share one
   transport contract. apps/main imports it from there.
4. Publish prerelease versions tied to `next` commits to GitHub Packages
   (private registry: not a public action).

TallyUI:

5. The rxdb and rxdb-premium 16.21.1 → 17.4.0 upgrade (ADR-031), with the
   RxDB bug-4 workarounds (`readFresh`, `watchFresh`) rechecked on 17.
6. In `tallyui-woocommerce`: a host that fills the ports (premium SQLite
   storage, the shared transport with WCPOS-token auth, Expo UUID,
   connectivity); traits that read the engine's documents (`doc.payload`
   is the wc/v3 shape the WooCommerce connector's traits already read);
   hooks from TallyUI grids to `engine.require()`; and an `order.create`
   transport that maps TallyUI's neutral sale (ADR-062, ADR-065) onto
   `engine.write()` and reports the engine's outcome events back to the
   outbox UI.

If publishing slips, the fallback for 1–4 is to vendor a pinned, unedited
source snapshot into `tallyui-woocommerce/vendor/` with a sync script and
a CI check that it matches the monorepo commit byte for byte. Items 2 and
5 are still needed.

### 1e. What a Medusa driver needs, sized

Work in the monorepo (engine generalisation), in ADR 0029's order:

| Step | What | Days |
|---|---|---|
| G1 | Finish gathering the Woo driver: the 29 URL-building sites, wc/v3 dimension transcriptions, sanitisers and id codec calls move behind one `woo` module. Pure refactor; WCPOS's existing suite is the guard. | 4–6 |
| G2 | Name the driver interface from what the engine actually asks for: auth and transport, journal tick (change signal, sequence log, config fingerprint), fetch by ids and browse windows (query-dimension translation), push with Idempotency-Key and revision, capabilities (existence manifest, integrity scan, query totals, barcode resolve). Two adapters on day one: Woo, and a fake. | 3–4 |
| G3 | Capability fallbacks for a backend without monotonic ids (existence manifest and integrity buckets keyed by hash, not id range) and without Woo's server-authored money. | 2–3 |
| G4 | The document-model call: keep ADR 0029 decision 5 (the driver materialises the Woo-shaped `payload` at ingest) or make `payload` driver-typed. Decided by measuring the Medusa mapping on the seeded store. | 1 |

Work for Medusa itself:

| Step | What | Days |
|---|---|---|
| M-a | The Medusa driver: ids (`prod_…`, `variant_…`, `order_…` as RemoteId), payload materialisation, push mapping from the engine's order intent to the Medusa POS plugin, the carrier over Medusa `metadata`. | 4–6 |
| M-b | The medusapos plugin serves the driver surface: a journal tick with sequence, fetch by ids, push with Idempotency-Key and revision (If-Match). The TSP plugin's checkpointed pull, tombstones and idempotent commands are the base. | 3–5 |
| M-c | The medusapos app moves from the TSP connector to the engine; the e2e suite goes green. | 2–3 |

Total for a Medusa driver: about 19–28 working days, of which 10–14 are
monorepo generalisation that Vendure then reuses. Vendure after that is
the driver, plugin and app steps only: about 9–14 days. Estimates assume
Codex implements from specs and the monorepo's suite passes unchanged
after every generalisation step.

Risks:

- Every generalisation step lands on WCPOS `next`, which Paul is
  developing toward v2. Each step must be behaviour-neutral for WCPOS and
  reviewed there; the engine's frozen layout (README, 2026-07-11) means
  renames need a reason.
- A second consumer makes the engine's public doors a contract. Breaking
  changes need a version bump and a note for TallyUI.
- The RxDB 17 upgrade touches every TallyUI package and the storage
  migration of any tester's local data (pre-GA: drop and refill is
  acceptable).

## 2. Phased plan

Each phase ends with a merged PR, the acceptance commands green, and the
decision logged. The medusapos and vendurepos testers keep ADR-024's
pull-only reads and `order.create` outbox until P3 and P4 replace them.

### P0: Publish (or vendor) and RxDB 17

- **Work:** monorepo items 1–4 of §1d (one worker, one spec each); TallyUI
  rxdb 17.4.0 upgrade (item 5).
- **Tester sees:** nothing new. medusapos and vendurepos behave as before
  on RxDB 17.
- **Acceptance:** `@wcpos/sync-engine` and `@wcpos/sync-core` install from
  the registry into an empty project and `createRxdbSyncEngine` runs a
  `mode: 'manual'` `sync()` against sync-core's `fakePullServer` and
  `fakeWriteServer`; WCPOS `pnpm test` in both packages and apps/main is
  unchanged; TallyUI `pnpm turbo test typecheck` green on 17.4.0; the
  medusapos and vendurepos e2e suites green.

### P1: The WooCommerce app on the engine

- **Work:** item 6 of §1d in `wcpos/tallyui-woocommerce`: the host ports,
  engine-backed traits, grid → `require()` hooks, the `order.create` →
  `engine.write()` transport, the conflict and rejection queue from
  `conflicts()`.
- **Tester sees:** sign in to a WooCommerce store with the WCPOS Free
  plugin, browse and search a catalogue that loads on demand and works
  offline, sell, and see the order in WooCommerce once, even after a
  dropped connection or a retry. Edits made in wp-admin appear on the till
  within the engine's tick.
- **Acceptance:** against the dev store, a 10,000-product catalogue opens
  its first grid page within the engine's own budget; a sale made offline
  syncs once on reconnect (one WooCommerce order, verified by the
  Idempotency-Key replay); a price edited in wp-admin reaches the till
  without a manual sync; a 409 conflict surfaces in the needs-attention
  list and resolves; the WCPOS engine sources are unmodified (P0's
  package, or the vendor check).

### P2: Driver interface and generalisation

- **Work:** G1–G4 in the monorepo, each a separate small PR on `next`,
  plus a WCPOS-side ADR that amends ADR 0029 decision 4 now that a second
  backend is real. TallyUI's standalone app is expressed as the local-only
  driver (no remote capabilities, push applied in-process) once the
  interface exists.
- **Tester sees:** nothing new. WCPOS and the WooCommerce TallyUI app
  behave identically.
- **Acceptance:** the Woo driver is one module and the engine has no
  wc/v3 or `wcpos/v2` literals outside it (a grep in CI); the driver
  interface has two adapters (Woo and a fake) passing the same contract
  tests; WCPOS's full sync-engine and sync-core suites pass unchanged,
  and apps/main e2e is green.

### P3: Medusa driver

- **Work:** M-a, M-b, M-c. The medusapos TSP connector and its
  `order.create` outbox are retired once the app runs on the engine.
- **Tester sees:** the Medusa POS opens large catalogues on demand
  instead of replicating all of them, sees stock and price changes from
  the Medusa admin within a tick, and gets the same offline sale
  guarantee as before.
- **Acceptance:** the Woo acceptance scenarios from P1, run against the
  seeded Medusa dev store; medusapos e2e green; the TSP conformance suite
  retired or kept only for any consumer still on it.

### P4: Vendure driver

- **Work:** the Vendure driver and plugin on the P2 interface, and
  vendurepos moved to the engine.
- **Tester sees:** the same as P3, on Vendure.
- **Acceptance:** P1's scenarios against the Vendure dev store (ADR-058);
  vendurepos e2e green; TSP and the command outbox have no remaining
  platform consumer.
