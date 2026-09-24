# Vendure POS plan: MVP first

*Written 2026-09-24 by a TallyUI research worker (Opus). It builds on
[DISCOVERY.md](DISCOVERY.md) and on ADR-046 to ADR-058 in
[DECISIONS.md](../DECISIONS.md). It mirrors the Medusa POS MVP
([programme plan §2.2](../plans/2026-09-programme.md)). No code has been
written yet, and every job below is one Codex spec (ADR-018).*

**Read this first (the short version)**

1. **The goal is the Medusa MVP again, on Vendure.** A tester opens a
   hosted web app, signs in to their own Vendure store, and sells with the
   network off. When the network comes back, every order lands in Vendure
   exactly once, at the POS price, paid and fulfilled.
2. **22 Codex jobs (21 firm, plus TV8, which is optional) and one spike,
   across three tracks:**
   - TallyUI: 8 jobs, with the neutral code in TallyUI;
   - the Vendure plugin: 5 jobs;
   - the `vendurepos/app` repo: 9 jobs, of which 3 set up the repo and the
     dev store.

   The Medusa MVP took about 20 jobs, and its A-track merged 11 jobs in
   19 PRs on one day (medusapos `docs/A-TRACK.md`). At about one hour per
   job, that is **4–5 working days of job time** once V-D2 is granted
   and the V-D1 items have merged (§5).
3. **The first TallyUI jobs make the second app cheap.** About 560 of the
   1,165 source lines in the Medusa app are platform-neutral: catalogue,
   cart, tender, receipt, sale state, outbox wiring, the order store and
   the orders screen. They move into TallyUI once (ADR-052), so the
   Vendure app is sign-in, store settings and wiring.
4. **The plugin is smaller in orchestration and larger in configuration
   than Medusa's.** `order.create` is one database transaction (ADR-047).
   But Vendure needs a price strategy, a payment handler, an in-store
   shipping method and custom fields to get there.
5. **Decisions** (§5; ADR-053 to ADR-058). The Front desk ruled on V-D1,
   V-D4 and V-D6 on 2026-09-24, and Paul ruled on V-D3. Two still wait
   for Paul:
   - **V-D2:** the `vendurepos` GitHub and npm organisations, which
     blocks V0;
   - **V-D5:** whether the RxDB Premium licence covers vendurepos, which
     does not block.

---

## 1. The MVP, defined by what a tester can do

1. Open the hosted POS at app.vendurepos.com and enter their Vendure
   Admin API URL. Optionally, enter a channel token; the default channel
   is used otherwise. Then sign in as a Vendure administrator with the
   `login` mutation and a bearer token.
2. The channel's catalogue syncs. They search, or scan a barcode with a
   keyboard-wedge scanner. The barcode comes from a `ProductVariant`
   custom field, whose name is configurable.
3. They build a cart with correct totals: integer money, the channel's
   currency and `pricesIncludeTax`, and the tax rates of the channel's
   default tax zone.
4. They take cash, or record an external card payment, and see the change
   and an on-screen receipt that prints through the browser.
5. They do all of this with the network off, and the orders queue.
6. They reconnect. Every queued order lands in Vendure **exactly once**:
   - at the POS prices;
   - in state `PaymentSettled`, with one `tally-pos` payment equal to the
     POS total;
   - fulfilled, so stock drops by the quantity sold;
   - with the sale time in `tallySaleAt`.

**MVP acceptance** (the Medusa numbers, on Vendure):
- **Playwright e2e against vendure-dev:** 25 sales, 20 of them offline,
  produce 25 orders with 0 duplicates. Every order total equals the POS
  total exactly (ADR-048), and on-hand stock drops by the quantities
  sold.
- **Plugin replay test:** the same `order.create` sent 200 times, some
  concurrently and some sequentially with random delays, creates exactly
  1 order. Every other reply is `duplicate`, or `409 in_progress` while
  the first is running.
- **Tax parity:** the e2e seed is tax-exclusive, and vendure-dev runs
  `OrderLevelTaxCalculationStrategy`. On that setup the rounding surcharge
  is 0 on every single-rate e2e order. The other three combinations of
  pricing mode and strategy are unit-tested within ADR-048's bound.
- **Initial sync** of the 2,000-product seed is measured and reported. It
  is not a gate.
- **One tester outside this machine** completes a sale against their own
  Vendure 3.6+ store, following only the quick-start.

**Cut from the MVP** (the same cuts as Medusa's, plan §2.2):
- the TSP pull, stream and ids endpoints, and tombstones: a product
  deleted in Vendure lingers until the app is reset;
- `stock.adjust`, customers (guest sales only), cashier roles and API-key
  devices;
- split tender, registers, discounts (refused, as on Medusa), native and
  Electron builds, and hardware beyond a keyboard wedge and browser print.

## 2. Where things live (ADR-014)

| Piece | Repository | Notes |
|---|---|---|
| Connector fixes, sign-in and store-settings capabilities, neutral POS screen pieces | `TallyUI/tallyui` | Platform-neutral by the "would Woo, Medusa, Shopify use it unchanged?" test |
| Vendure plugin `@vendurepos/plugin` | `vendurepos/app` `packages/vendure-plugin` | MIT under Vendure's plugin exception |
| Vendure dev store and e2e seed | `vendurepos/app` `dev/vendure-store` | This Mac mini on 127.0.0.1:3000 (ADR-058). **Never on the production VPS** |
| POS web app | `vendurepos/app` `apps/expo` | Vercel project `vendurepos` on the WCPOS team |
| Public demo backend | The Coolify VPS, as a follow-up after the MVP | ADR-055: `vpdemo-` resources under the demo rules. Provisioned by the Front desk only |

The repo layout copies `medusapos/app`: pnpm workspace `apps/*`; a
standalone plugin and dev store installed with `npm ci`; CI jobs `app`,
`e2e`, `web-export`, `dev-store` and `plugin`; and `TALLYUI_REF` defined
in one place.

## 3. Milestones and jobs

Job ids: **TV** = TallyUI, **VP** = Vendure plugin, **VA** = vendurepos
app. Every job gets a spec from `~/.claude/codex/SPEC-TEMPLATE.md`, its
own worktree and one PR. The line budgets are for non-test code.

### V0: Foundations and the spike

Needs V-D2 (Paul) and the items that V-D1 names. V-D6 is decided.

| Job | Scope | Budget | Acceptance |
|---|---|---|---|
| VA0 | `vendurepos/app` skeleton copied from medusapos/app: workspace, turbo, vitest, CI with `TALLYUI_REF`, the bundle-secret check, README | ≤ 250 lines of config | CI green on an empty app shell |
| VA1 | `dev/vendure-store` from `@vendure/create` 3.7.3 on Postgres 17 (brew), plus `deploy.sh`, `reset.sh` and `restart.sh` as in medusa-dev. Configuration: `tokenMethod ['bearer','cookie','api-key']`; CORS for :8081 and :8099; a `ProductVariant.barcode` custom field; DK 25% and DE 19% tax; one stock location | ≤ 200 | `reset.sh && restart.sh`, then `curl` a `login` mutation and get a token back |
| VA2 | A deterministic seed of 2,000 products with about 5,600 variants and EAN-13 barcodes, a `tally-fixture-mug`, and a 5-product `seed-e2e.ts` (DK 25%, EUR, tax-exclusive, one variant stocked at 2), ported from medusa-dev's seed generator | ≤ 500 | `reset.sh` seeds, and the admin `productVariants { totalItems }` count is within 1% of the target |
| **Spike S1** | **Claude, not Codex.** On vendure-dev, a throwaway plugin proves ADR-047's recipe: an as-sold price through a readonly line custom field; a walk-in placeholder customer; the in-store shipping method; the `tally-pos` handler with an amount; fulfilment recording SALE; all inside one transaction, rolled back on a thrown error; and the rounding surcharge. It also measures **which admin writes bump `Product.updatedAt`** (variant price, stock level, variant fields) | — | A new ADR, like ADR-036, with the order code, the stock before and after, and totals to the minor unit |

### V1: TallyUI (runs alongside V0)

| Job | Scope | Budget | Acceptance |
|---|---|---|---|
| TV1 | **Connector correctness** (ADR-049). Page with `sort: {id: ASC}` inside a fixed window `updatedAt.after(since − 1 ms)` using `pass_max`, as in Medusa. Select `customFields { <barcodeField> }` with the field name set in the connector's options. Read `stockLevels` for the configured location. Move the mock-api Vendure handler to `/admin-api` | ≤ 120 | Unit tests: ties at one `updatedAt` across a page boundary lose nothing; the query string validates against the 3.7.3 admin schema with and without custom fields (schema SDL fixture) |
| TV2 | `getVariants` for Vendure, with every trait reading per variant, not `variants[0]` | ≤ 60 | `findVariantByCode` finds a variant's barcode in a 3-variant product |
| TV3 | **A neutral sign-in capability in core:** `auth.signIn?(baseUrl, {email, password}) → {token, expiresAt?}` and credential kinds `bearer` and `api-key`. Implemented for Vendure (the `login` mutation, reading `vendure-auth-token`; the `vendure-token` channel header; the `vendure-api-key` header). The Medusa implementation is a separate job, which is backlog item 5 | ≤ 120 | Unit tests on the headers for each kind; `signIn` against a mocked `login` |
| TV4 | **A neutral store-settings capability:** `loadStoreSettings(context) → {currency, pricesIncludeTax, taxRates, stockLocationId}`. The Vendure version reads `activeChannel` and the tax rates of its default zone | ≤ 120 | Unit test against recorded 3.7.3 responses |
| TV5 | **Lift from medusapos/app** (ADR-052): `use-sale` (cart → tender → receipt) and `lib/cart` into `@tallyui/pos` | ≤ 150 moved | medusapos's `use-sale` tests pass in TallyUI |
| TV6 | Lift: the `catalogue`, `cart`, `tender`, `receipt`, `print-style` and `sync-status` components into `@tallyui/components` (POS screen pieces) | ≤ 280 moved | Their component tests pass in TallyUI |
| TV7 | Lift: `order-store`, `outbox-context`/`use-outbox`, `product-cache`, `lib/catalogue`, `register` (device id) and the orders / needs-attention screen into `@tallyui/pos` and `@tallyui/components`, with a `PosProvider` | ≤ 250 moved | The outbox wiring test passes, with a fake transport |
| TV8 | Delete connector-vendure's deprecated `sync` (needs `sync` optional in core; backlog item 21) | Deletions | `tsc` passes; the line count drops by 154 |

TV5–TV7 are not on the Vendure critical path if they slip. The fallback
is to copy the files into `vendurepos/app`. That costs about 560
duplicated lines. The KPI is unaffected, because it counts only plugin
and connector lines, but every later fix has to be made twice. The
Medusa app's `index` screen (121 lines) is wiring, and each app keeps its
own.

### V2: The Vendure plugin (after S1)

| Job | Scope | Budget | Acceptance |
|---|---|---|---|
| VP1 | Plugin skeleton: `@VendurePlugin` with `compatibility: '^3.6.0'`. Custom fields: Order `tallyClientOrderId` (unique, readonly), `tallySaleAt`, `tallyRegisterId`, `tallyCashierRef`; OrderLine `tallyUnitPrice` (readonly), `tallyClientLineId`. A `TallyCommand` ledger entity with its migration, and a test harness on `@vendure/testing` | ≤ 150 | The plugin boots in the e2e harness; the migration applies to Postgres; a Shop API `addItemToOrder` with `customFields.tallyUnitPrice` is rejected |
| VP2 | Checkout pieces: the price strategy wrapping the configured `OrderItemPriceCalculationStrategy`; the `tally-pos` `PaymentMethodHandler` (amount from metadata, settled); an in-store `ShippingEligibilityChecker` (POS orders only) with a zero calculator; a bootstrap that creates the PaymentMethod and ShippingMethod per channel when missing | ≤ 150 | A Shop API order never sees the in-store method; a POS draft priced at €8.50 keeps €8.50 when the variant's price is €10 |
| VP3 | `order.create`, happy path, in one transaction (ADR-047): validate → claim the ledger → draft → lines → walk-in or email customer → shipping → `ArrangingPayment` → surcharge (ADR-048) → payment → fulfilment → `tallySaleAt` → ledger result. The fingerprint is ADR-039's | ≤ 180 | Integration: one sale gives one order in `PaymentSettled`, with the right SALE movements; a replay gives `duplicate` with the same `serverRefs` |
| VP4 | `order.create` edge cases: `idempotency_mismatch`, `unsupported_currency`, unknown or disabled variant, `insufficient_stock` (top-up then take-back), overpayment, `total_mismatch` warning, and discounts refused | ≤ 120 | One test per ADR-038/039 code; the 200-replay concurrency test passes |
| VP5 | `POST /tally/v1/commands` as a Nest controller: `X-Tally-Protocol: 1`; 1–50 commands; `invalid_payload` checked before the claim; batch-stopping `409 in_progress`; `503` transient; `@Allow(Permission.CreateOrder)`; CORS preflight that allows `X-Tally-Protocol` without auth; a 1 MB body limit | ≤ 100 | HTTP integration tests, matching medusapos's `integration-tests/http/commands` |

### V3: The Vendure POS app (after TV3–TV7)

| Job | Scope | Budget | Acceptance |
|---|---|---|---|
| VA3 | The sign-in screen with TV3, an optional channel token, plain HTTP allowed only for loopback and private hosts, the session held as medusapos ADR 0002 does, and a strict CSP | ≤ 120 | Unit tests; a 401 signs the user out |
| VA4 | The POS screen from the lifted pieces: catalogue, search and barcode through the Vendure connector, store settings (TV4), cart, tender and receipt | ≤ 150 | Component smoke test; a manual sale against vendure-dev |
| VA5 | The outbox with an HTTP transport to the plugin, the pending indicator and the orders / needs-attention screen | ≤ 80 | A queued order drains after reconnect (unit, fake transport) |
| VA6 | **The offline e2e harness:** `npm pack` the plugin, install it into `dev/vendure-store` in the way a tester would, use a fresh `vendurepos_e2e` Postgres database, run `seed-e2e`, and start Vendure on :3100; serve the web export on :8099 with the Vercel CSP | ≤ 200 | `pnpm e2e` boots and tears down cleanly |
| VA7 | The 25-sale offline e2e (§1) | ≤ 150 | The MVP acceptance numbers |
| VA8 | Hosting and the quick-start: the Vercel project `vendurepos` (WCPOS team, Git integration, root `apps/expo`, the SPA rewrite without `cleanUrls`); **the plugin published before the quick-start names it** (avoiding medusapos's missing `plugin-v0.0.1` release); the quick-start covering plugin install, the migration, adding the POS origin to `CORS_ORIGINS` (the scaffold allows no origins in production), `bearer` in `tokenMethod`, and which tax strategy to use for each pricing mode (ADR-048) | ≤ 100 + doc | app.vendurepos.com returns 200; a clean Vendure 3.7 store follows the doc to a sale |

### V4: Demo (after the MVP)

- **VA9:** an in-browser demo at demo.vendurepos.com, with seeded RxDB and
  a simulated `commands` transport (ADR-027's pattern). About 2 jobs.
- **A public backend on the Coolify VPS** (ADR-055), mirroring the Medusa
  demo plan:
  - a Vendure `Dockerfile` and a GHCR image workflow in `vendurepos/app`
    (a prebuilt image; no build on the VPS);
  - `postgres:16-alpine`, never the production image tags, with `vpdemo-`
    names and resource limits;
  - a nightly reset from a golden database;
  - a demo channel and an API key limited to POS permissions.

  That is about 2 worker jobs. Every Coolify write is the Front desk's,
  and no worker makes one.

### M6 proper: the Vendure platform (after the MVP)

These make Vendure pass the same contract as Medusa. Each is 1–3 jobs:
- **The TSP pull on a subscriber-fed journal** (ADR-050), with
  channel-scoped tombstones, `ids` reconciliation, a 304 at head and
  `Retry-After`. The conformance suite goes green against vendure-dev.
- **`stock.adjust`** as a delta, through `StockLevelService`.
- **Customers** (search, attach, create a guest).
- **A `TallyPosSell` custom permission,** a Dashboard extension to
  register devices, and **API keys as device credentials**.
- **Split tender:** the `tally-pos` handler already takes amounts.
- **Registers and closures,** from the shared WCPOS port (ADR-032).

### Sequence and critical path

```
V-D1 items, V-D2 ─▶ VA0 ─▶ VA1 ─▶ VA2 ─▶ S1 ─▶ VP1 ─▶ VP2 ─▶ VP3 ─▶ VP4 ─▶ VP5 ─┐
TV1 ─▶ TV2 ─▶ TV3 ─▶ TV4 ─▶ TV5 ─▶ TV6 ─▶ TV7 ─▶ VA3 ─▶ VA4 ─▶ VA5 ──────┴▶ VA6 ─▶ VA7 ─▶ VA8
                                                          (V-D4 before VA8)
```

- The two chains run in parallel. There is one test suite on the machine
  at a time, and `--maxWorkers=2`.
- **Count:** TallyUI 8 jobs, plugin 5, app 9 (VA0–VA8). That is **22 jobs
  plus spike S1**: 21 firm, with TV8 optional.
- **Date estimate.**
  - The MVP is testable about **5 working days** after V-D2 is granted
    and the V-D1 items have merged.
  - That assumes S1 confirms the recipe in one day. If the readonly line
    price cannot be set through `OrderService`, a custom `OrderLine`
    price path adds about a day.
  - It also assumes Vercel and DNS arrive before VA8.

## 4. Risks

| Risk | Signal | Response |
|---|---|---|
| Admin writes to price or stock don't bump `Product.updatedAt` | S1 measures it | The MVP accepts stale prices until the next full pass, as Medusa did. The TSP pull fixes it properly. Earlier than that, TV1 can add a `productVariants` pass filtered by `updatedAt` (+1 job) |
| The readonly OrderLine custom field can't be written from `OrderService` | S1 | The plugin sets the line price through its own repository write inside the transaction, then recalculates |
| Merchants on cookie-only auth | Sign-in fails with no token header | The quick-start says to add `bearer`. The plugin logs a start-up warning |
| A store uses a UUID `EntityIdStrategy` | Ids don't sort by creation, so a mid-pass insert shifts offsets | Documented as an MVP limit. The TSP pull removes it |
| Plugin + connector over 828 lines. **Likely at the MVP:** the estimate is 1,050–1,350 (DISCOVERY §6) | ADR-051 measures lines and bytes at the end of each milestone | Report it honestly; don't compress code to hit it. Judge it like-for-like at the end of M6 proper |
| Vendure 3.8 (due 2026-09-30) changes draft orders or tax | Its changelog | Re-read §2 of the discovery; `compatibility` pins `^3.6.0` until tested |

## 5. Decisions

Each was put to Paul with a recommendation. The rulings are recorded as
ADR-053 to ADR-058; ADR-046 to ADR-052 cover everything else.

**V-D1: When the Vendure MVP starts.** *Accepted (Front desk, 2026-09-24;
ADR-053).*
- The MVP starts once post-MVP backlog items 1–5 and 7 (programme plan
  §2.5) have merged. That shared code is the npm release, LICENSE in the
  tarballs, outbox leader election, surfacing 400/401 errors, the Medusa
  Bearer credential (merged in #35) and the `uuidv7` counter.
- ADR-020's conformance gate stays for *M6 proper*.

**V-D2: The `vendurepos` GitHub organisation, the `vendurepos/app`
repository and the `@vendurepos` npm scope.** *Proposed; waiting for Paul
(ADR-054).*
- **Recommend:** create them now. Mirror medusapos: a public MIT
  repository, with the plugin published to npm as `@vendurepos/plugin`
  under trusted publishing (ADR-042's pattern).
- Plan V0, and the plugin and app tracks after it, cannot start without
  this. The TallyUI track can.

**V-D3: The public demo backend.** *Decided (Paul, 2026-09-24;
ADR-055).*
- There is no separate server. The Vendure MVP keeps the in-browser demo
  (ADR-027's pattern), and testers bring their own Vendure.
- A demo backend on the existing Coolify VPS is a follow-up (§3 V4). It
  mirrors Medusa's under the rules in `~/agent/plans/medusapos-demo-backend.md`:
  - `vpdemo-` names;
  - never the production image tags;
  - resource limits;
  - a prebuilt image;
  - the Front desk executes every Coolify write.

**V-D4: Vercel and the domain.** *Accepted (Front desk, 2026-09-24;
ADR-056).*
- A Vercel project `vendurepos` on the WCPOS team, using the Git
  integration, with a CNAME for `app.vendurepos.com`.
- **This machine can do most of it:**
  - The Vercel CLI is logged in as `kilbot` with the `wcpos` Pro team,
    where it already created `medusapos`. So it can create `vendurepos`
    and add `RXDB_PREMIUM` to its environment.
  - The Git link waits for V-D2.
  - Squarespace DNS goes through computer use with the keychain login.
    That needed Paul's Google step-up for medusapos, so expect one prompt
    to him.
- Needed before VA8.

**V-D5: Does the RxDB Premium licence cover vendurepos?** *Proposed;
waiting for Paul (ADR-057).*
- ADR-045 notes that Premium is licensed per project.
- Until Paul confirms, the Vendure web app runs on Dexie. Storage is
  injected (ADR-031), so this does not block the MVP.

**V-D6: Where the Vendure dev store and e2e store run.** *Accepted (Front
desk, 2026-09-24; ADR-058).*
- On this Mac mini, bound to 127.0.0.1, like medusa-dev: vendure-dev on
  :3000 and the e2e store on :3100, with its own database.
- One test suite runs at a time. CI e2e runs on GitHub Actions.

**Note for medusapos.** medusapos/app #23 is in main with its own Bearer
shim (`apps/expo/lib/pos-connector.ts`). TallyUI #35 has since shipped
`medusaAdminUserAuth` and `medusaAdminUserConnector`. At its next
`TALLYUI_REF` bump, medusapos switches to the upstream export and deletes
the shim. The Vendure connector's own credential types (TV3) follow the
same shape.
