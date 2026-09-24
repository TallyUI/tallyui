# Vendure discovery: what a TallyUI POS needs from Vendure

*Written 2026-09-24 by a TallyUI research worker (Opus), for the Vendure
track that follows Medusa (ADR-020). It feeds [PLAN.md](PLAN.md) and
ADR-046 to ADR-052 in [DECISIONS.md](../DECISIONS.md).*

**Read this first (the short version)**

1. **Vendure can carry a TallyUI POS, but only with a server plugin, and
   the plugin does more than Medusa's did.** The Admin API has no as-sold
   line price, no payment amount, no idempotency, no back-dating, no delta
   stock change and no tombstones. Each gap has a documented extension
   point (a strategy, custom field, payment handler or plugin service), so
   none of them is a blocker.
2. **One thing is easier than on Medusa: the whole `order.create` can run in
   one database transaction.** A Vendure plugin calls `OrderService`,
   `PaymentService` and `StockMovementService` directly inside one
   `TransactionalConnection` transaction. Medusa needed six Admin calls
   plus compensation, resume logic and an advisory lock (ADR-036;
   medusapos `workflows/tally-order-create`, about 600 lines).
3. **The POS side needs almost no change.** The `order.create` envelope
   (ADR-038), the outbox, the exact tax maths and the `PosOrder` document
   are already platform-neutral. The Vendure plugin implements the same
   `POST /tally/v1/commands`.
4. **The existing `@tallyui/connector-vendure` (578 non-test lines) is a
   catalogue sketch.** It has four defects that stop it working against a
   real store. It never asks for a sort order, it pages with a moving
   offset, and a real store's barcode custom field breaks its query. Its
   mock serves the wrong endpoint. Details are in §3.
5. **Tax rounding differs.** Vendure's default rounds each line. TallyUI
   rounds once per order (ADR-037). Vendure 3.6 added
   `OrderLevelTaxCalculationStrategy`, which rounds once per rate. The
   plugin closes any remaining gap with a rounding surcharge (ADR-048).
6. **Change detection is the weak point.** Deleted products and variants
   are soft-deleted and invisible to every API query. Vendure has no
   webhooks and no GraphQL subscriptions (issue #2369 is still open). Its
   EventBus publishes after commit, in-process, with no replay. A sound
   feed therefore needs a plugin-side journal written in the same
   transaction (ADR-050). The MVP can live without one, as Medusa's did.
7. **There is no Vendure POS to compete with.** The official plugin
   directory lists none of 43 plugins as a POS. The maintainers deferred
   walk-in orders to "a separate PoS Plugin" (issue #2676).

**Version inspected:** `@vendure/core`, `@vendure/common` and
`@vendure/create` **3.7.3**, npm `latest` (released 2026-09-01). The
tarballs were unpacked and read directly. The 3.8.0 milestone is due
2026-09-30, so re-check §2 when it ships. The repository has moved to
`github.com/vendurehq/vendure`.

Citation shorthand: **S/** = `@vendure/core/dist/api/schema/`, **D/** =
`@vendure/core/dist/`, **C/** = `@vendure/create/`. A ✔ means I re-read
that source myself after the research pass.

---

## 1. Vendure in one page

- **NestJS + TypeORM + GraphQL.** It has two GraphQL APIs:
  - the **Admin API** (`/admin-api`), which is permissioned and
    channel-scoped;
  - the **Shop API** (`/shop-api`), which is built around one customer's
    active order in a session.
- **A POS uses the Admin API only.** The Shop API cannot read stock
  numbers, cannot create orders for somebody else, and its list limit is
  100.
- **Everything is extended by plugins.** A plugin is a NestJS module with
  `@VendurePlugin({ configuration, adminApiExtensions, shopApiExtensions,
  entities, dashboard, compatibility })` (D/plugin/vendure-plugin.d.ts).
  Because it is a Nest module, it can add REST controllers and services.
  The `configuration` hook can change any strategy in `VendureConfig`.
- **Licence.** Core is `GPL-3.0-or-later`, with the Vendure Commercial
  License as an alternative. `license/plugin-exception.txt` lets a plugin
  "distributed separately from Vendure Core (such as via a package
  repository)" be distributed "under terms of your choice", as long as it
  contains no Core source. **An MIT TallyUI plugin is allowed.**
- **Admin UI.** From v3.5 the React Dashboard (`@vendure/dashboard`)
  replaces the Angular Admin UI. The Angular UI has not been maintained
  since July 2026.
  - A plugin extends the Dashboard with `dashboard: './dashboard/index.tsx'`
    and `defineDashboardExtension({ routes, navSections, pageBlocks, … })`.
  - `@vendure/dashboard` declares no licence on npm. Check this before
    shipping a Dashboard extension.

## 2. The APIs as a POS uses them

### 2.1 Products, variants and prices

| Fact | Evidence |
|---|---|
| `products(options)` and `productVariants(options, productId)` both return `{ items, totalItems }` | S/admin-api/product.api.graphql:3,7 |
| Every list takes `skip`, `take`, `sort`, `filter` and `filterOperator`. Filters are generated for every scalar field: `updatedAt` uses `DateOperators` (`eq`, `before`, `after`, `between`, `isNull`), and `sku` uses `StringOperators`. Nested `_and`/`_or` work | D/api/config/generate-list-options.js:34-47,117-163 |
| **`ID` fields get `IDOperators`, which have no `gt` or `lt`.** A keyset on `(updatedAt, id)` cannot be expressed through the API | same file |
| `take` is at most **1,000** on the Admin API and 100 on the Shop API. Asking for more throws `list-query-limit-exceeded` rather than clamping | D/config/default-config.js:77,82; list-query-builder.js:450-459 |
| **Deletes are soft deletes, and deleted rows are invisible.** `deletedAt` is set, lists hard-code `deletedAt IS NULL`, and `deletedAt` is not in the schema | product.service.js:87,245; product-variant.service.js:86,626 |
| Prices are integer minor units (the `Money` scalar). `ProductVariant` has `price`, `priceWithTax`, `currencyCode`, `taxRateApplied` and `taxCategory`, and the Admin API adds `prices[{currencyCode, price}]` | S/common/product.type.graphql:53-58; S/admin-api/product-admin.type.graphql:5-17 |
| Multi-currency since v2.0.0. The currency is chosen per request with `?currencyCode=` | CHANGELOG_v2.md:789; request-context.service.js:155-162 |
| **No native barcode, GTIN, EAN or UPC field.** A barcode is a `ProductVariant` custom field | grep of S/ and `D/entity/product-variant/` |
| **Once a type has custom fields, `customFields` becomes an object type that needs a sub-selection.** It is only a bare `JSON` scalar while no custom fields exist | D/api/config/graphql-custom-fields.js:85,92 ✔ |
| Admin `search(input)` matches SKU (SQLite and MySQL use `LIKE`; Postgres uses `to_tsvector(sku)`). `DefaultSearchPlugin` is not in the default config, but the scaffold adds it | sqlite-search-strategy.js:114-119; C/assets/vendure-config.hbs:96 |

What this means: the POS pulls the Admin API with `take` ≤ 1,000, reads
barcodes from a custom field whose name must be configurable, and cannot
see deletions without help.

### 2.2 Stock

- `ProductVariant.stockOnHand` and `stockAllocated` are
  **`@deprecated("use stockLevels")`**. Read `stockLevels[{stockLocationId,
  stockOnHand, stockAllocated}]` instead (S/admin-api/product-admin.type.graphql:10-21).
- Multi-location stock arrived in v2.0. `MultiChannelStockLocationStrategy`
  has been the default since 3.1.0.
- **Saleable stock** is `stockOnHand − stockAllocated − outOfStockThreshold`,
  computed on the server and **not exposed** in GraphQL
  (product-variant.service.js:263-274).
- **Every stock write is absolute.** `updateProductVariants` takes
  `stockOnHand` or `stockLevels[{stockLocationId, stockOnHand}]`. The server
  works out `delta = new − old` and records an `ADJUSTMENT` movement
  (stock-movement.service.js:70-100).
  - No mutation takes a delta, so two tills writing absolute values race.
  - `StockLevelService.updateStockOnHandForLocation(ctx, variantId,
    locationId, delta)` exists for plugins.
- **When stock moves** (movement types: ADJUSTMENT, ALLOCATION, RELEASE,
  SALE, CANCELLATION, RETURN):
  - It is **allocated** when an order goes `ArrangingPayment →
    PaymentSettled` (default-stock-allocation-strategy.js:11-14).
  - It is **sold** (on-hand drops) when a fulfilment goes `Created →
    Pending`, and the `addFulfillmentToOrder` mutation
    (`OrderService.createFulfillment`) moves a fulfilment straight to
    Pending (default-fulfillment-process.js:84-86; order.service.js:1394,
    1426). Fulfilment checks on-hand stock (order.service.js:1461), so any
    stock top-up must stay in place until after fulfilment.
  - **On-hand stock therefore drops only once the plugin fulfils the
    order,** which is the same shape as Medusa (ADR-036 step 5).

### 2.3 Customers

- `Customer { id, updatedAt, firstName, lastName, phoneNumber,
  emailAddress!, addresses, user }`. It is filterable by `updatedAt`,
  email, phone and postcode. It is soft-deleted and invisible once deleted
  (customer.service.js:78,106,700).
- Admin `createCustomer` always creates a login **User** and publishes
  `AccountRegistrationEvent` (customer.service.js:193-211). With the
  EmailPlugin on, that probably sends a verification email (not verified).
  - A POS should use **guest customers** instead, created through
    `CustomerService.createOrUpdate`.
  - **But an email that belongs to a registered customer cannot go
    through that path.** `setCustomerForDraftOrder` calls
    `createOrUpdate(ctx, input, true)`, which returns
    `EmailAddressConflictError` for a registered User's email
    (draft-order.resolver.js:83; customer.service.js:597-600). With
    `false`, it overwrites the registered customer's name with whatever
    the POS sends.
  - So the plugin looks the customer up by email first and attaches an
    existing one unchanged. Only when there is none does it create a
    guest.
- `emailAddress` is required. A walk-in customer therefore needs a
  placeholder, which the plugin configures (`walk-in@pos.invalid`, as in
  ADR-039). Issue #2676 ("order without any customer details") was closed
  on 2026-02-09 with "should be handled in a separate PoS Plugin".

### 2.4 Orders, payments and tax

The Admin API has draft orders. 3.7.3 has **no** `completeDraftOrder`:

1. `createDraftOrder`, `addItemToDraftOrder({productVariantId, quantity})`,
   `setCustomerForDraftOrder`, `setDraftOrderShippingMethod` and
   `setDraftOrderCustomFields` (S/admin-api/order.api.graphql:1-72).
2. `transitionOrderToState(id, "ArrangingPayment")`. The default process
   refuses this unless the order has lines, a customer, **a shipping
   line** and **enough saleable stock** (default-order-process.js:187-212
   ✔). Each check can be switched off with `configureDefaultOrderProcess`,
   but only **globally**, which would also change the web shop's
   checkout.
3. `addManualPaymentToOrder({orderId, method, transactionId, metadata})`
   **takes no amount.** It always pays `totalWithTax − covered` and creates
   the payment already Settled (order.service.js:1327-1349 ✔;
   payment.service.js:220-245). When the total is covered, the order moves
   to `PaymentSettled`, `orderPlacedAt` is set and stock is allocated.
4. `addFulfillmentToOrder({lines, handler: manual-fulfillment})` records
   the Sale movement.

| POS need | What Vendure offers | Gap and extension point |
|---|---|---|
| **As-sold unit price** | `AddItemToDraftOrderInput` is only `{productVariantId, quantity}`. With OrderLine custom fields, `customFields` is added to that input (graphql-custom-fields.js:469-480 ✔) | A **readonly** OrderLine custom field plus an `OrderItemPriceCalculationStrategy` that returns it as `{price, priceIncludesTax}`. It must be readonly, or a Shop API customer could set their own price |
| **Payment of the POS amount** | Manual payment pays the full balance only | A plugin `PaymentMethodHandler` (`tally-pos`), whose `createPayment` returns the amount from metadata as Settled (payment-method-handler.d.ts:17-24). This also makes split tender possible later |
| **Sale time** | `orderPlacedAt = new Date()`, hard-coded (default-order-process.js:266-269 ✔) | An Order custom field `tallySaleAt`. Reports use that, as `metadata.tally_created_at` does on Medusa |
| **Client UUID and dedupe** | No idempotency on any mutation | A plugin ledger entity, plus an Order custom field `tallyClientOrderId` with `unique: true` (custom-field-types.d.ts:16 ✔) |
| **Walk-in with no shipping** | Customer and shipping line are required at `ArrangingPayment` | Satisfy the checks rather than switching them off globally: a placeholder guest customer, and an in-store `ShippingMethod` at zero price whose eligibility checker accepts only POS orders |
| **Never refuse a sale for stock** (ADR-039, medusapos ADR 0003) | The stock check refuses the transition | Top the stock up by the shortfall first, then take it back after fulfilment, as medusapos does. The result carries an `insufficient_stock` warning |
| **Tax matches the POS** | `DefaultOrderTaxCalculationStrategy` sums per-line rounded prices (`Math.round(unitWithTax × qty)`, order-line.entity.js ✔). `OrderLevelTaxCalculationStrategy` (3.6+) rounds once per rate group ✔ | See §2.4.1 |
| **Channel and currency** | `vendure-token` header; `?currencyCode=` | The POS sends both. The plugin checks the payload currency against the channel |

#### 2.4.1 Tax rounding, measured against ADR-037 and ADR-040

- **Money in Vendure.** `DefaultMoneyStrategy` is `Math.round(value ×
  quantity)` on integer columns. `TaxRate.apply` and `taxPayableOn` are
  unrounded floats (tax-utils.js ✔).
- **Default strategy.** Each line's price with tax is rounded, then the
  lines are summed. Against a POS that rounds once (ADR-037), an order of
  *n* lines can differ by up to about *n*/2 minor units. Medusa's gap was
  ≤ 1 unit, because Medusa does not round lines.
- **`OrderLevelTaxCalculationStrategy`.** For each `(description, rate)`
  group it computes `Math.round(taxPayableOn(netBase, rate))` and adds the
  groups up (order-level-tax-calculation-strategy.js ✔).
  - **With tax-exclusive prices**, a single-rate order is rounded exactly
    as ADR-037 rounds it (for positive amounts, `Math.round` equals half
    away from zero).
  - **With tax-inclusive prices it does not match.** It first rounds each
    line's *net* price (`proratedLinePrice`, order-line.entity.js:193-196),
    then adds tax to the sum. Example at 25%, two lines at gross 998:
    - each line's net is 798.4, rounded to 798, so the net sum is 1,596;
    - the tax on that is 399, so Vendure's total is **1,995**;
    - the gross lines add up to **1,996**.
  - With *r* rates it rounds once per rate group. ADR-037/040 instead
    round the charged tax once and split it per rate afterwards, so the
    two can differ by up to *r* − 1 units.
- **Default strategy with tax-inclusive prices.** Each line's gross price
  is an integer, so the order total equals the sum of the gross lines,
  which is the POS total. Only the tax split can differ.
- **In short, one strategy matches for each pricing mode.** For
  single-rate orders:
  - tax-exclusive channels match on `OrderLevelTaxCalculationStrategy`;
  - tax-inclusive channels match on the default strategy.
- **The catch: this is a store-wide setting** (`taxOptions`). It also
  changes the merchant's web shop, so the plugin must not set it
  silently. ADR-048 records what the plugin does instead.

### 2.5 Channels, auth and permissions

- **Channels.** A channel has `token`, `defaultCurrencyCode`,
  `availableCurrencyCodes`, `pricesIncludeTax`, `defaultTaxZone`,
  `defaultShippingZone` and `seller` (S/common/channel.type.graphql:1-24).
  - A request picks its channel with the `vendure-token` header. Without
    one it gets the default channel.
  - Permissions and entity visibility are both resolved per channel
    (request-context.service.js:135-176).
  - A POS is therefore naturally scoped to one channel. That is WCPOS's
    `{site, store}` scope, and capability C10 below.
- **Admin login.** `login(username, password, rememberMe)`.
  - The token method defaults to `cookie` only (default-config.js:98). The
    `@vendure/create` scaffold enables `['bearer', 'cookie']`
    (C/assets/vendure-config.hbs:44 ✔).
  - With bearer on and `cors` given as an object, Vendure adds
    `vendure-auth-token` to the CORS `exposedHeaders` itself
    (D/bootstrap.js:271-290 ✔). It does not do this when `cors` is the
    boolean `true`.
  - **The scaffold refuses every cross-origin request in production.** It
    reads the allowed origins from `CORS_ORIGINS`, and an unset value
    means `[]` (C/assets/vendure-config.hbs:31-34).
  - So a merchant must add the POS origin (app.vendurepos.com) to
    `CORS_ORIGINS`. The quick-start says so, just as the medusapos one
    covers `ADMIN_CORS`.
  - Sessions last `1y` and roll forward once less than half their life
    remains (session.service.js:354-364).
  - **A store built without the scaffold, still on cookie-only auth, needs
    `bearer` added.** Cross-site cookies are not a workable alternative for
    a web POS on its own origin.
- **API keys (v3.6.0, 2026-03-31, PR #3815).**
  - `createApiKey({roleIds})` returns the secret once. The key is sent as
    the `vendure-api-key` header.
  - A key is backed by an API-key User holding channel-scoped roles, and
    you can only grant roles you hold yourself.
  - Keys can be rotated and deleted, and `lastUsedAt` is tracked. Their
    sessions last 100 years.
  - They must be enabled with `tokenMethod: [..., 'api-key']`.
  - **These are the right credential for a registered device** (the WCPOS
    "register" idea), and later for the demo. For the MVP, a cashier logs
    in as an admin user, as on Medusa.
- **Permissions.**
  - Draft-order mutations need `CreateOrder`. Adjusting lines, payments
    and fulfilments needs `UpdateOrder`.
  - Reads need `ReadCatalog`, `ReadCustomer`, `ReadOrder`,
    `ReadStockLocation`, `ReadChannel`, `ReadTaxRate` and `ReadSettings`.
  - `authOptions.customPermissions` adds custom permissions (for example
    `TallyPosSell`).
  - **Cashier roles are native on Vendure** (Role + channel), whereas
    Medusa's RBAC is Enterprise-only (plan §1.4).

### 2.6 Events, change feeds and hosting

- **EventBus** carries `ProductEvent`, `ProductVariantEvent`,
  `ProductVariantPriceEvent`, `ProductChannelEvent`,
  `ProductVariantChannelEvent`, `StockMovementEvent`, `OrderPlacedEvent`,
  `OrderStateTransitionEvent`, `CustomerEvent`, `TaxRateEvent` and others
  (D/event-bus/events/).
  - Events publish after the transaction commits, in the process that made
    the change, with no replay.
  - **They are wake-up hints, never a change log** (plan §1.5).
- **No core webhooks.** `@pinelab/vendure-plugin-webhook` is the usual
  add-on. **No GraphQL subscriptions:** there is no `Subscription` type.
  Issue #2369 is open in the 3.8.0 milestone but was moved to the
  backlog, and community PR #3478 was closed unmerged.
- **Hosting a demo.**
  - Node 20, 22 or 24 (`@vendure/create` enforces `^20.19 || >=22.12`).
  - Postgres, MySQL, MariaDB or SQLite (`better-sqlite3`). The scaffold
    uses migrations, not `synchronize`.
  - Vendure's docs give "512MB per process" as a practical minimum, and a
    deployment is a server process plus a worker process.
  - The scaffold's sample data is **54 products and 88 variants**, with a
    20% "Standard Tax" in zone Europe (my count of C/assets/products.csv).
    That is too small for sync numbers, so the dev store needs its own
    seed.

## 3. What `@tallyui/connector-vendure` covers today, and what it lacks

**Covered** (578 non-test lines at `a0d2b90`):

| File | Lines | What it does |
|---|---|---|
| `src/index.ts` | 73 | A `TallyConnector` with a URL and a bearer `auth_token` field |
| `src/schemas/products.ts` | 110 | A product document with nested `variants[]` (price, priceWithTax, currencyCode, stockLevel, stockOnHand, trackInventory, options, customFields), indexed on `slug` and `updatedAt` |
| `src/traits/product.ts` | 130 | Product traits: `getPrices` from `priceWithTax` in minor units; `getStock` from `stockOnHand` or `stockLevel`; barcode from `customFields.barcode`; categories from collections |
| `src/replication/products.ts` | 111 | A pull-only RxDB adapter against `/admin-api` with a `{skip, updatedAt}` checkpoint |
| `src/sync/products.ts` | 154 | The deprecated `CollectionSync` (one request per product for `fetchByIds`) |

**Defects, each checked against the code and Vendure 3.7.3:**

1. **No sort order.** `products(options: {take, skip, filter})` sends no
   `sort` (`replication/products.ts:75-84`), so page order is whatever the
   database returns.
   - The checkpoint then takes `updatedAt` from the *last row of the
     page*, which is not the newest (`:101-105`). Rows are skipped or
     repeated.
2. **Offset paging over a moving bound.**
   - `skip` keeps growing while `updatedAt.after` moves forward. After the
     first full page, the next request asks for rows *after* the new
     bound, but still skips the rows already counted.
   - `after` is strict, so rows that share the checkpoint timestamp are
     dropped. This is the "Vendure skip" bug the plan lists (backlog item
     21).
3. **`customFields` without a sub-selection.** The query selects
   `customFields` bare (`:35`). That only validates while the store has
   *no* ProductVariant custom fields. **The first store to add a barcode
   custom field gets a GraphQL validation error, and sync stops**
   (graphql-custom-fields.js:85 vs 92 ✔).
4. **The mock serves `/shop-api`, but the connector calls `/admin-api`**
   (`apps/mock-api/src/handlers/vendure.ts:15`). So nothing tests the
   connector against the mock.

**Gaps (missing, not broken):**

- **No `getVariants` trait.** Medusa has one; `findVariantByCode` and
  variant pickers need it. Every other trait reads `variants[0]` only.
- It reads the deprecated `stockOnHand`, where it should read
  `stockLevels` for the POS's stock location.
- There is no channel (`vendure-token`) header and no `?currencyCode=`,
  so a multi-channel store syncs its default channel only.
- It cannot sign in. Like Medusa's connector, it takes a pasted token,
  and it has no API-key credential (`vendure-api-key`). The medusapos app
  had to build its own sign-in and bearer headers (medusapos #16;
  post-MVP backlog item 5).
- It has no store-settings reader (currency, `pricesIncludeTax`, tax
  rates for the channel's zone) and no customer schema or traits.
- It has no tombstones (§2.1) and no order mapping. The mapping is not
  needed: `toOrderCreateEnvelope` in `@tallyui/pos` is already neutral.
- The deprecated `sync/products.ts` (154 lines) can go once `sync` becomes
  optional in `TallyConnector` (backlog item 21). That also helps the
  line-count KPI (§6).

## 4. WCPOS sync-engine concepts mapped onto Vendure

The concepts come from the WCPOS wiki (`architecture/client.md`,
`architecture/plugin-free.md` and their spokes), judged on `next`. The
capability numbers are the contract in plan §1.3.

| # | WCPOS concept (wiki page) | What WooCommerce provides | Vendure natively | Vendure with the TallyUI plugin |
|---|---|---|---|---|
| C1 | **Change journal** of pointers `{sequence, type, id, deleted, revision}`, checkpoint `{since, head, horizon, epoch}` (`plugin-free/v2-change-log-and-integrity.md`) | A journal table fed by about 30 hooks | `updatedAt` filters only. Deletes are invisible, and removal from a channel is not visible either | A journal table written **inside the same transaction** by a TypeORM entity subscriber, read below a high-water mark. `ProductChannelEvent` removals become per-channel tombstones (ADR-050) |
| C2 | **Batch fetch by id that reveals absence** (`include=`, `/digests?absence=explicit`) | `include=` | `filter: { id: { in: [...] } }` works, but silently omits deleted rows | The plugin's `ids/:collection` reports absence explicitly |
| C3 | Sorted, filtered, paged list with a total, and a census (`client/census-and-coverage.md`) | `X-WP-Total` | `totalItems` on every list; `take` ≤ 1,000 | Native |
| C4 | **Client UUID** on the record and its lines (`plugin-free/typed-meta-and-uuids.md`) | `_woocommerce_pos_uuid` meta | Custom fields on Order and OrderLine, with `unique: true` | `tallyClientOrderId` (unique) and `tallyClientLineId` |
| C5 | **Revision + compare-and-swap** (`baseRevision`, 409) | A canonical hash | None | Not needed for the MVP: the POS never updates server records. `customer.patch` later uses the field merge from ADR-024 |
| C6 | **Idempotent mutations** keyed by mutation id (`plugin-free/v2-push-envelope-and-idempotency.md`) | A reservation table, replays, 7- and 90-day expiry | None | The ledger entity, inside the order transaction (ADR-047) |
| C7 | Search by SKU, barcode and text | Woo search | `search` matches SKU; barcode needs a custom field and a filter | A barcode custom field on `ProductVariant`, and local search on the replica |
| C8 | **Auth with refresh and revocation** (`plugin-free/authentication-and-sessions.md`: 30 min access, 30 day refresh) | A JWT pair | A bearer session (1 year, rolling). API keys can be rotated and deleted | Native. A device later uses an API key |
| C9 | **Offline orders**: client sale time, stock hold, refuse overpayment | `created_at` and the payment ledger | `orderPlacedAt` is server time; manual payment pays the full balance | `tallySaleAt`, the `tally-pos` payment handler with amounts, and stock top-up |
| C10 | **Scope on every call** (one DB per `{site, store, cashier}`, `X-WCPOS-Store`) | A store header | The `vendure-token` channel header; roles per channel | Native |
| C11 | Cheap no-change poll (`changes/tick`, ETag/304) (`client/change-signal.md`) | Yes (on `next` the 304 path does not fire yet, because the client sends no `since`) | None | `pull` answers 304 at head |
| C12 | Integrity digests (`plugin-free/v2-integrity-digests.md`, 1,000-id buckets) | `BIT_XOR` digests | None | Deferred. The `ids` endpoint and nightly reconciliation come first |
| C13 | Load signal, `Retry-After` (`client/change-signal-server-pressure.md`) | `X-Server-Load` | None | The plugin sends `Retry-After` on 429/503. The outbox already honours it (`http-transport.ts`) |

**Client-side concepts that carry over unchanged** (they live in TallyUI,
not the backend):
- the durable outbox, with a 60 s lease, dead letters and one writer tab
  (`client/mutation-queue-concurrency.md`, `client/web-write-leader.md`);
- the politeness rules (ADR of 2026-08-11): cost scales with change, a
  request cap per lane per tick, no maintenance before first paint, and
  back off under pressure;
- the backlog guard (re-baseline at 5,000 rows behind);
- the server-pressure backoff (double on 429, three errors in 60 s, or a
  median above 2 s; `Retry-After` capped at 15 min).

**Concepts that Vendure makes cheaper than WooCommerce:**
- *Scope.* Channels and channel-scoped roles are native.
- *Atomic writes.* One transaction per command, where WooCommerce has
  hooks and Medusa has workflows with compensation.
- *Identity.* Vendure mints integer ids with stable order-line ids, so
  WCPOS's "ack adoption" of id-less lines (`client/write-path.md`) is not
  needed.

**Concepts to leave behind for now:**
- *Demand-driven partial replicas* (the require plane, 100-row browse
  windows, trickle lanes). ADR-024 starts with full replicas scoped to the
  channel. The trigger for partial replicas is the M2 benchmark on Medusa,
  and the same gate applies to Vendure.
- *Digests.* They are a backstop for writes that bypass hooks. A
  subscriber-fed journal covers every TypeORM write. Only raw SQL
  imports bypass it, and the `ids` reconciliation catches those.

## 5. Offline and sync options with RxDB Premium, for Vendure

**What is decided already and is not Vendure-specific:**
- RxDB Premium with SQLite storage (ADR-031); `@tallyui/storage-sqlite`
  as a thin adapter with Premium as a peer (ADR-045);
- pull-only replication for server-owned data and a command outbox for
  POS facts (ADR-024).

The storage choice is shared by every platform app. **The Vendure
question is only the server side of the pull, plus what the app must
install.**

**Server side: how the POS learns about changes.**

| Option | Verdict for Vendure | Why |
|---|---|---|
| A. **Admin GraphQL pull** (today's connector, fixed) | **MVP** | No plugin code for reads, and it proves the app. It cannot see deletes. Correctness at a moving bound needs a fixed window per pass (ADR-049). Whether a price or stock change bumps `Product.updatedAt` is **unverified**, and spike V0 measures it. If it does not, price changes lag until the next full pass, the same limit the Medusa MVP accepted (plan §2.2) |
| B. **TSP pull from the plugin** (`@tallyui/sync-server`, ADR-023) over a journal written by TypeORM subscribers | **Target (M6 proper)** | Tombstones and channel removals become visible. The journal is in the same transaction, so the guarantee holds under out-of-order commits with a high-water mark. It passes the same conformance suite as Medusa. Separate `prices` and `stock` collections come for free, because the journal records `ProductVariantPrice` and `StockLevel` writes |
| C. EventBus-fed change table | No | EventBus publishes after commit, in-process, with no replay. A crash between commit and handler loses the change, and the worker process does not see the server's events |
| D. RxDB `replication-graphql` | No | It needs subscriptions, which Vendure does not have (#2369), and the client transport would split from Medusa's (ADR-023) |
| E. CDC / Electric / PowerSync on Vendure's Postgres | No | ADR-023's reasons apply unchanged: it bypasses channel, price and tax logic, and needs `wal_level=logical` |

**App side, which only the Vendure app has to deal with:**
- **The Vendure app is the first app on a TallyUI with Premium.**
  medusapos pins TallyUI `3996453`, which predates #32 and #33. Its
  Vercel install does not handle the `RXDB_PREMIUM` token.
  - The Vendure app's Vercel project therefore needs `RXDB_PREMIUM` as an
    environment variable. Only Paul can set that, because this machine
    cannot reach the Vercel account (ADR-044).
  - Otherwise the web build stays on Dexie (TallyUI's current web default,
    `packages/database/src/storage.ts:31`) until Premium web storage is
    wired. Storage is injected, so this is a one-line switch (ADR-031).
- **One tab on web.** WCPOS `next` moves web to SQLite-wasm on
  `opfs-sahpool`, where a second tab cannot open storage, so its
  `multiInstance` becomes `false` (wiki `client/web-write-leader.md`,
  monorepo#2146). ADR-024 assumed `multiInstance: true` with leader
  election.
  - This is a TallyUI-wide question, not a Vendure one. The Vendure app
    inherits whatever the Medusa app ships.
  - Flagged here because the Vendure MVP is where Premium web storage
    would first run.
- **Collections.** A full replica for the MVP holds `products` (with
  nested variants) and `pos_orders`, plus the outbox. That is 3
  collections, well under any cap.

## 6. The "small backend" KPI

M6's acceptance is "plugin + connector ≤ 50% of the Medusa line count".

| | Non-test lines | Source |
|---|---|---|
| Medusa plugin (`medusapos/app` `packages/medusa-plugin`, origin/main `e06f477`) | 988 | `git show` + `wc -l`, excluding `jest.config.js` |
| Medusa connector (`connectors/medusa/src`) | 667 | same |
| **Medusa total** | **1,655** | |
| **Vendure budget (50%)** | **≈ 828** | |
| Vendure connector today | 578 | of which 154 is the deprecated `sync` |

- **My estimate for Vendure.**
  - **The connector comes to about 550–650 lines.** That is 578, minus 154
    of `sync`, plus the fixed checkpoint (TV1), `getVariants` (TV2) and
    the Vendure halves of sign-in and store settings (TV3, TV4).
  - **The MVP plugin comes to about 500–700 lines;** the plan's VP1–VP5
    budgets sum to 700 as a ceiling. Its orchestration is smaller than
    Medusa's (one transaction, so no resume, compensation or advisory
    lock). But it adds a price strategy, a payment handler, a shipping
    checker, custom fields and the rounding surcharge.
  - **Total: about 1,050–1,350 lines, or roughly 65–80% of Medusa's
    1,655. The 50% target will very likely be missed at the MVP.**
  - **The comparison is not yet like-for-like.** The Medusa connector
    will also gain sign-in and store settings (backlog item 5; the Medusa
    halves of TV3 and TV4). Both plugins gain the TSP pull, mostly inside
    the shared `@tallyui/sync-server`. The fair measurement is therefore
    at the end of M6 proper, when both backends carry the same
    capabilities.
- **Line counts also reward dense code.** medusapos averages 55–60
  characters per line. ADR-051 therefore records bytes as well as lines,
  and keeps the target.
