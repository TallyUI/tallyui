# Command contract: field kinds

Every field the command contract declares, with its kind and the version
that declared it. The contract is ADR-038 (`order.create` and the
transport), amended by ADR-062 (version 2), ADR-065 (version 3) and
ADR-068 (the `register.*` commands). ADR-070 decision (3) (ruling 19)
says an instruction field is honoured or refused, never ignored, and that
the contract lists each field with its kind: this page is that list
(#262).
The TypeScript shapes are in `packages/core/src/types/commands.ts`, and
every field of a command's envelope and payload there has a row here.

## The kinds (ruling 19)

- An **instruction** field asks the server to do something different
  (where stock comes from, which customer, which price), and is honoured
  or refused.
- An **informational** field is the till's own record (`title`,
  `subtotalMinor`, `taxMinor`, `deviceId`, `attempt`); a server may leave
  it unused.
- "**instruction (honoured by recording)**" is also used, for example
  `payments[].method`, which a server records on the payment.

## Malformed commands

A command whose own figures contradict each other, or carries a malformed
value, is malformed and is refused as `invalid_payload`. That is a check
of the command, not of the server's view of it, and it applies to a field
of either kind. An informational field is never refused because it
differs from the server's own computation (ADR-070 decision 3).

## Instructions the server can't carry out

A refusal is for a problem that would make every sale from this till fail
until the store is fixed (a stock location, a sales channel), so it is
noticed at once and the retry applies. A problem with one sale's own
references (a customer unknown, deleted or in another channel) never
holds the sale: the sale is kept as a guest sale with a `customer_ignored`
warning naming the id, because a sale stuck in an outbox for days is
worse.

`customer_ignored` is one of `CommandWarning`'s codes in `@tallyui/core`
(#266): `{ code: 'customer_ignored'; customerId: string }`, the id the
till sent (1 to 64 characters), for a customer unknown, deleted or in
another channel. A warning never rejects a sale.

`figures_mismatch` (#257) is one warning per sale, `{ code:
'figures_mismatch'; fields: Array<{ field; tillMinor; serverMinor }> }`,
with one entry for each of `subtotalMinor`, `taxMinor` and
`discountMinor` that differs from the server's own computation.

## Reading the tables

- **Field** is the full path from the envelope; `[]` stands for every
  element of an array.
- **Since** is the version of that command type which declared the field.
  A field is refused in an earlier version, naming the version it needs
  (ADR-070 decision 1). `order.create` has versions 1, 2 (ADR-062) and 3
  (ADR-065); each `register.*` command versions on its own, and all five
  are at version 1.
- An object or array has its own row, and each field inside it has one
  too. `payload` has no kind of its own: its fields are the rows of each
  command's table.
- A new field gets its row here, with its kind, when it is added
  (ADR-070 decision 3).

## Envelope (every command type)

The same seven fields in `CommandEnvelope` (`order.create`) and
`RegisterCommandEnvelope` (the five `register.*` types).

| Field | Kind | Since |
|---|---|---|
| `id` | instruction | 1 |
| `type` | instruction | 1 |
| `version` | instruction | 1 |
| `payload` | none (its fields below) | 1 |
| `createdAt` | informational | 1 |
| `deviceId` | informational | 1 |
| `attempt` | informational | 1 |

## `order.create`

| Field | Kind | Since |
|---|---|---|
| `payload.clientOrderId` | instruction | 1 |
| `payload.createdAt` | instruction (honoured by recording) | 1 |
| `payload.currency` | instruction | 1 |
| `payload.pricesIncludeTax` | instruction | 1 |
| `payload.lines` | instruction | 1 |
| `payload.lines[].clientLineId` | informational | 1 |
| `payload.lines[].variantId` | instruction | 1 |
| `payload.lines[].title` | informational | 1 |
| `payload.lines[].quantity` | instruction | 1 |
| `payload.lines[].unitPriceMinor` | instruction | 1 |
| `payload.lines[].taxInclusive` | instruction | 1 (ADR-038 amendment 2, without a version bump) |
| `payload.lines[].discountMinor` | instruction | 2 (net from 4, see Amounts) |
| `payload.subtotalMinor` | informational | 1 |
| `payload.discountMinor` | instruction | 2 (net from 4, see Amounts) |
| `payload.taxMinor` | informational | 1 |
| `payload.totalMinor` | instruction | 1 |
| `payload.payments` | instruction | 1 |
| `payload.payments[].clientPaymentId` | informational | 1 |
| `payload.payments[].method` | instruction (honoured by recording) | 1 |
| `payload.payments[].amountMinor` | instruction | 1 |
| `payload.payments[].tenderedMinor` | informational | 1 |
| `payload.payments[].changeMinor` | informational | 1 |
| `payload.payments[].reference` | informational | 1 |
| `payload.display` | informational | 3 |
| `payload.display.currency` | informational | 3 |
| `payload.display.exponent` | informational | 3 |
| `payload.display.taxInclusive` | informational | 3 |
| `payload.display.subtotalMinor` | informational | 3 |
| `payload.display.discountMinor` | informational | 3 |
| `payload.display.taxMinor` | informational | 3 |
| `payload.display.totalMinor` | informational | 3 |
| `payload.display.orderDiscountMinor` | informational | 3 |
| `payload.display.lines` | informational | 3 |
| `payload.display.lines[].clientLineId` | informational | 3 |
| `payload.display.lines[].amountMinor` | informational | 3 |
| `payload.display.lines[].discounts` | informational | 3 |
| `payload.display.lines[].discounts[].discountId` | informational | 3 |
| `payload.display.lines[].discounts[].label` | informational | 3 |
| `payload.display.lines[].discounts[].amountMinor` | informational | 3 |
| `payload.taxByRate` | informational | 3 |
| `payload.taxByRate[].ratePpm` | informational | 3 |
| `payload.taxByRate[].code` | informational | 3 |
| `payload.taxByRate[].netMinor` | informational | 3 |
| `payload.taxByRate[].taxMinor` | informational | 3 |
| `payload.taxByRate[].grossMinor` | informational | 3 |
| `payload.customer` | instruction | 1 |
| `payload.customer.email` | instruction | 1 |
| `payload.customer.customerId` | instruction | 3 |
| `payload.registerId` | informational | 1 |
| `payload.cashierRef` | informational | 1 |
| `payload.locationId` | instruction | 1 |
| `payload.sessionId` | instruction (honoured by recording) | 3 |

- A discount, on the order or a line, is the cashier's price decision:
  the server honours it by applying or recording it, or refuses it.
  `payload.discountMinor` must equal the sum of `lines[].discountMinor`;
  a difference is a check of the command against itself, so
  `invalid_payload` (`@tallyui/core/server`'s
  `order-payload-shape.ts:58`), not a comparison with the server's
  computation. What each `discountMinor` means in each version is under
  "Amounts" below.
- `payload.customer` absent or `null` is the walk-in customer (ADR-038).
  A `customerId` the store cannot resolve (unknown, deleted or in another
  channel) is one sale's own reference, so the sale is kept as a guest
  sale with `customer_ignored`, never refused.
- `payload.sessionId` is the session the server's register figures count
  the sale in (ADR-068 decision 13), and `payload.registerId` is the
  till's device id, never the drawer (ADR-068 decision 7a). A server
  without register support records `sessionId` verbatim; today medusapos
  keeps it as the order's `tally_session_id` metadata and vendurepos as
  `tallySessionId`.

### Amounts

What each amount in `order.create` means, as the till computes it today
(`@tallyui/pos` on `main`; file:line below is in `packages/pos/src`). It
is the contract a backend compares its own figures with, for example for
`figures_mismatch`: medusapos/app#133 and vendurepos/app#38 map their
figures to it. Every number in the examples was printed by running the
till's own `createOrderBuilder`, `finalizeOrder` and
`toOrderCreateEnvelope`.

The builder recomputes every figure on each change to the sale
(`order/order-builder.ts:151`, `:260`). `finalizeOrder` copies the
figures and adds `taxByRate` (`pos-order/finalize.ts:189`, `:204`), and
`toOrderCreateEnvelope` sends the stored order unchanged, so a resend
never recomputes (`pos-order/command.ts:56`).

#### Tax modes

- A line's **own mode** is its price's `taxInclusive` flag, or the
  order's `pricesIncludeTax` when the price has none
  (`order/order-builder.ts:273`).
- `lines[].taxInclusive` is sent only when that mode differs from
  `pricesIncludeTax` (`pos-order/finalize.ts:145`,
  `order/order-builder.ts:311`); absent means the order's mode.
- An order with such a line is **mixed**. That line's `unitPriceMinor`
  is in its own mode, and so is its `discountMinor` up to version 3.

#### Discounts and how the order discount is spread

- A line discount is on `unitPriceMinor × quantity`: a percentage of
  it, or a fixed amount capped at what the earlier ones leave
  (`order/order-builder.ts:105`).
- An order discount is applied before tax is computed: each line is
  taxed on its amount after its share of it. It is not tax-exclusive,
  because its base is the sum of every line's amount after its line
  discounts, each in its own mode (tax-inclusive for an inclusive line),
  so a mixed order's base mixes modes. A percentage is taken of that
  base (several percentages add up rather than compound); a fixed
  amount of what is left (`order/order-builder.ts:158`).
- The order discount is then spread over the lines in proportion to
  those same after-line-discount amounts, by largest remainder, ties to
  the earlier line (`order/allocate-order-discount.ts:11`,
  `order/order-builder.ts:166`). Each line's share is part of its
  `discountMinor`, in the line's own mode.
- Each line is taxed on `unitPriceMinor × quantity − discountMinor`
  (`order/order-builder.ts:115`): after both kinds of discount.

#### Definitions

- `lines[].unitPriceMinor`: the unit price as sold, before any
  discount, in the line's own mode (`order/order-builder.ts:297`,
  `pos-order/command.ts:86`).
- `lines[].discountMinor`: the line's own discounts plus its share of
  the order discount; absent when 0 (`order/order-builder.ts:114`,
  `pos-order/command.ts:88`).
  - **Version 4:** tax-exclusive (net). An exclusive line's is
    unchanged; an inclusive line's discount D on its amount A
    (`unitPriceMinor × quantity`) is `net(A) − net(A − D)`, exact in
    micro-units from the line's tax, rounded half away from zero per
    line (`pos-order/command.ts:48`).
  - **Version 3 and earlier:** in the line's own mode.
- `payload.discountMinor`: the order's line and order discounts
  together, the sum of `lines[].discountMinor` in every version (core's
  `order-payload-shape.ts:58` refuses a command where it differs).
  Absent when 0. It is never the order discount alone.
  - **Version 4:** tax-exclusive, like `subtotalMinor`: since
    `totalMinor = subtotalMinor + taxMinor`, the discount that produced
    that subtotal is net of tax too. Core accepts version 4, and the
    till's envelope builder (`toOrderCreateEnvelope`) produces it when
    capped at 4 or more (`pos-order/command.ts:70`).
  - **Version 3 and earlier:** the sum of each line's discount in its
    own mode, so it is tax-inclusive in an inclusive order and mixes
    modes in a mixed one (the mixed example below: 750 = 596
    tax-inclusive + 154 tax-free).
  - **The till sends version 4 to a server that advertises 4.** An
    order goes out at the version of its first send, and every retry
    resends it (`sentVersion`), even after the server upgrades. When
    the server's max is unknown, the till sends 3 or lower. So
    `discountMinor` is net only in a version-4 command; a backend
    that advertises 4 still receives version 3 for orders first sent
    before it did.
- `payload.taxMinor`: the sum of every line's exact tax, rounded once
  for the order (`order/order-builder.ts:36`, `:38`); line tax is on
  the line's amount after all discounts.
- `payload.totalMinor`: what the customer pays. It is the sum of every
  line's amount after all discounts, each in its own mode, plus the
  exclusive lines' tax rounded once (`order/order-builder.ts:41`); the
  payments sum to it (`pos-order/finalize.ts:171`).
- `payload.subtotalMinor`: `totalMinor − taxMinor`
  (`order/order-builder.ts:42`), so **after all discounts and without
  tax, in every mode**, whatever `pricesIncludeTax` says. It is not a
  before-discount subtotal. A backend whose own subtotal is before
  discounts compares its after-discount, tax-free figure with it.
- `display.*` (v3) is the receipt, in the order's mode
  (`display.taxInclusive` = `pricesIncludeTax`,
  `pos-order/finalize.ts:193`):
  - `display.lines[].amountMinor`: `unitPriceMinor × quantity`, before
    any discount; a line in the other mode is converted, and such lines
    also take the rounding residue (`order/order-builder.ts:190`,
    `:208`).
  - `display.lines[].discounts[].amountMinor`: each line discount,
    converted on its own into the order's mode
    (`order/order-builder.ts:185`, `:46`).
  - `display.orderDiscountMinor`: the lines' order-discount shares,
    each converted on its own, summed (`order/order-builder.ts:188`,
    `:195`). In a mixed order it is not the amount the cashier entered.
  - `display.discountMinor`: `orderDiscountMinor` plus every line
    discount row (`order/order-builder.ts:196`).
  - `display.subtotalMinor`: before discounts, in the order's mode:
    `totalMinor + discountMinor` when inclusive, `totalMinor −
    taxMinor + discountMinor` when exclusive
    (`order/order-builder.ts:198`).
  - `display.taxMinor` and `display.totalMinor` equal `payload.taxMinor`
    and `payload.totalMinor` (`pos-order/finalize.ts:192`).
- `taxByRate[]` (v3), one entry per tax `code` and `ratePpm`
  (`tax/exact.ts:180`, called at `pos-order/finalize.ts:189`):
  - `netMinor`: the tax-free base of each line carrying that rate,
    summed. An exclusive line's base is its amount after discounts; an
    inclusive line's is that amount minus its own tax, **rounded per
    line** (`tax/exact.ts:192`). Under stacked rates (ADR-040) a line's
    net is the taxable base for each rate, so `taxByRate[].netMinor` is
    per rate and not additive across rates, and it is rounded per line
    where `subtotalMinor` is one figure, so nobody sums the nets
    against `subtotalMinor`.
  - `taxMinor`: the rate's exact tax floored, then the order's leftover
    units by largest remainder, ties to the higher rate, so the rates
    sum to `payload.taxMinor` (`tax/exact.ts:203`, `:210`). That sum
    always holds: finalize throws otherwise
    (`pos-order/finalize.ts:196`), and core's v3 check refuses a
    command where it differs (`@tallyui/core/server`'s
    `fiscal-figures.ts:59`).
  - `grossMinor`: `netMinor + taxMinor` (`pos-order/finalize.ts:190`).

#### Rounding

- **Tax is rounded once per order, half away from zero.** Each line's
  tax is kept exact in micro-units (a millionth of a minor unit):
  exclusive tax is exactly `amount × ratePpm`; inclusive tax is
  `amount × rate / (1 + rate)` rounded half away from zero to a
  micro-unit (`tax/exact.ts:24`). The order's micro-units are summed and
  rounded half away from zero to a minor unit by `roundMicrosToMinor`
  (`tax/exact.ts:48`) at `order/order-builder.ts:38`.
- The total adds the exclusive lines' tax, rounded on its own by the
  same function (`order/order-builder.ts:41`). In a single-mode order
  that is the same rounding (exclusive) or nothing (inclusive); in a
  mixed order it is a second rounding, and `subtotalMinor` absorbs any
  difference.
- An inclusive line with stacked rates splits its tax across them by
  truncating division, the last rate taking the rest
  (`order/order-builder.ts:120`); the line's sum is unchanged.
- A percentage discount is rounded half away from zero
  (`order/order-builder.ts:25`, `:145`); a fixed one is whole minor
  units already. The order discount's spread is by largest remainder.
- Display conversions round each amount on its own
  (`order/order-builder.ts:46`); `taxByRate` floors and hands out the
  remainder, as above.
- `computeOrderTax` (`tax/exact.ts:75`) is exported but not on the sale
  path; it is not how `order.create`'s figures are made.

##### Store rounding strategies (#287)

Everything above is the **default**: `per_order`, half away from zero.
A server that advertises `ServerCapabilities.taxRounding` gets its own
strategy instead (ADR-071). It is a capability, not an `order.create`
version: the envelope and its versions don't change. The app passes it
to `TaxProvider` as `rounding`; each sale takes it from its tax context
when it starts, and the order records it as `taxRounding`. Each
granularity reproduces a store's own arithmetic to the unit, from
@vendure/core 3.7.3's code (file:line in `dist/`), measured by
vendurepos on 9,680 orders (vendurepos/app#38, comment 5904115438).

The three granularities are `per_order`, `per_line_items` and
`per_rate_group_items`, with the algorithms in the table below. Two
more points apply to them all:
- **Stacked rates.** `r` is the sum of a line's rates, because Vendure
  sums a line's tax lines (`order-line.entity.js:121-122`). Vendure's
  default gives a line one tax line
  (`default-tax-line-calculation-strategy.js:14`). A custom
  `TaxLineCalculationStrategy` may return several
  (`tax-line-calculation-strategy.d.ts:36`). With stacked rates the
  till's order figures (subtotal, tax, total) follow Vendure exactly.
  Under `per_rate_group_items` the per-rate rows match too: each row is
  its group's tax (`order-level-tax-calculation-strategy.js:51-76`).
  Under `per_line_items` only the per-rate rows can differ, by up to a
  unit per stacked item: Vendure rounds each rate's share of an item's
  tax on its own (`default-order-tax-calculation-strategy.js:38-86`),
  while the till gives the last rate the remainder so its `taxByRate`
  rows always sum to `taxMinor` (#312). A server whose tax-line strategy
  isn't Vendure's default advertises `custom`.
- **Code:** `tax/exact.ts:129` (`roundedTaxByRate`), and for the
  order figures `order/order-builder.ts:33`.
- **Known gap: inclusive lines under `per_rate_group_items`.**
  - Vendure charges `Σ rounded item nets + Σ group taxes`, which can
    differ from the shelf prices: two 0.10 lines at 19% and two at 7%
    pay 0.38, not 0.40.
  - The display (ADR-063) has no row for such a difference. So an
    order with **any** inclusive line keeps the default `per_order`
    figures and `taxByRate` rows for the whole order, a mixed order
    included. The till logs one warning per tax context
    (`tax/exact.ts:133`, `order/order-builder.ts:170`).
  - Until the contract carries a display rounding row (#310), such
    stores see `figures_mismatch` on those baskets, as a warning, never
    a refusal.
  - All-exclusive orders follow Vendure exactly.
- **Rate names.** The till knows a line's rate name only when the app
  maps each tax class to it: `TaxProvider`'s `rateCodes` (tax class →
  the backend's rate name). A line priced from a tax class (#288)
  carries it as `taxLines[].code` (`order/order-builder.ts:271`); an
  unmapped class carries none.
- **Modes.** `half_away_from_zero` is the till's own rounding.
  `half_up` is `Math.round`'s rule, Vendure's `DefaultMoneyStrategy`
  (`default-money-strategy.js:19-21`). They differ **only on an exact
  negative half**: −59.5 is −59 half up and −60 away from zero; +59.5
  is 60 in both. Every rounding the strategy makes uses the mode
  (`tax/exact.ts:41`). Discount percentages and display conversions
  keep half away from zero. **A Vendure store advertises `half_up`.**
- **`custom`** (no mode): the store's rounding can't be described, for
  example a custom money or tax strategy. The till computes exactly as
  with no strategy. **Such a server never emits `figures_mismatch` for
  `subtotalMinor` or `taxMinor`.**
- **Identities.** The identities table below is for the default. Under
  the item granularities, `totalMinor = subtotalMinor + taxMinor` and
  `Σ taxByRate[].taxMinor = taxMinor` still hold. So does every
  inclusive-column identity: an inclusive line always pays its amount,
  and the known gap above keeps it so.

**How a server advertises it.** The response of
`GET {baseUrl}/tally/v1/info` (ADR-062) carries a **top-level
`taxRounding` key, a sibling of `contracts`**, whose value is exactly
core's `TaxRounding`:

```json
{ "contracts": { "order.create": [1, 2, 3] },
  "taxRounding": { "granularity": "per_rate_group_items", "mode": "half_up" } }
```

or `"taxRounding": { "granularity": "custom" }`. Core's
`parseInfoCapabilities` reads it (`parseTaxRounding`), for the Medusa and
Vendure connectors alike:
- **Absent** means the default (`per_order`, half away from zero).
- **Malformed** (an unknown granularity, a missing or unknown `mode` on a
  granularity that needs one, or not an object) is ignored with one
  warning, so the default applies.
- **`custom` ignores `mode`**: a `mode` sent with it is dropped.
- Extra keys are dropped.

##### The algorithms side by side, from the stores' code (#287)

These are the algorithms as each store's code runs them on a till's
sale, and as the till builds them. Notation: a line's `A` is
`unitPriceMinor × quantity` before any discount, and its `D` is its
`lines[].discountMinor` (its line discounts plus its share of the order
discount, ADR-062). Both are in the line's own mode. `r` is the sum of
its rates, and `round` is the mode. Vendure rounds half up everywhere
(`default-money-strategy.js:19-21`).

**How a till's discount reaches Vendure** (vendurepos/app, per
vendurepos):
- Each discounted line gets one negative `TALLY-DISCOUNT` surcharge with
  `listPrice = −lines[i].discountMinor`, `listPriceIncludesTax` set to
  the line's mode, and the line's own `taxLines`
  (`packages/vendure-plugin/src/service/order-create.service.ts:654-663`).
- The order discount is never posted on its own. The till has already
  spread it onto the lines (`src/vendored/payload-shape.ts:53-56`).
- No promotions run (`applyPriceAdjustments(ctx, order, [])`,
  `order-create.service.ts:667`). So a line's `proratedLinePrice` is
  the undiscounted line, `A`.

| Step | `per_order` (the till's default; medusapos, `half_away_from_zero`) | `per_line_items` (Vendure's default + surcharges; Vendure advertises `half_up`) | `per_rate_group_items` (Vendure's order-level + surcharges; Vendure advertises `half_up`) |
|---|---|---|---|
| Items taxed | each line at `A − D` | each line at `A`, and each discount surcharge at `−D`, as separate items | the same items as `per_line_items` |
| Item net | exclusive `A − D`; inclusive not rounded | exclusive `A`, `−D`; inclusive `round(A / (1 + r))`, `round(−D / (1 + r))` | the same as `per_line_items` |
| Item tax | exact micro-units, not rounded | exclusive `round(A × r)`, `round(−D × r)`; inclusive gross − net | none: taxed per group |
| Where rounding happens | once: `round(Σ exact tax)` | once per item | inclusive item nets (not built: the known gap), then once per group: `round(Σ net × rate)` |
| `taxMinor` | that one rounding | Σ item taxes | Σ group taxes |
| `subtotalMinor` | `totalMinor − taxMinor` | Σ item nets | Σ item nets |
| `totalMinor` | Σ inclusive `A − D` + Σ exclusive `A − D` + `round(Σ exclusive tax)` | `subtotalMinor + taxMinor`, which is Σ `A − D` for inclusive items | `subtotalMinor + taxMinor`, which can differ from Σ `A − D` for inclusive items |
| `taxByRate` rows | each rate floored, the remainder by largest remainder | per rate, Σ item taxes at that rate; a stacked item's shares by `r_i / r`, the last rate taking the rest | one row per group: Σ item nets, and the group's tax |

- **`per_order`:**
  - The till: `order/order-builder.ts:34-42`.
  - The store's rounding is the medusapos plugin's, not Medusa core's
    (per medusapos):
    - Medusa 2.21 never rounds order totals. They stay BigNumber
      decimals (`toPrecision(20)`: `@medusajs/utils`
      `totals/big-number.js:24-28`,
      `totals/create-raw-properties-from-bignumber.js:39-41`), and
      `totals/cart/index.js:61`, `:106` and `:116` add item taxes
      without rounding.
    - The plugin rounds once per order, half away from zero:
      `majorToMinor` in medusapos's
      `packages/medusa-plugin/src/workflows/tally-order-create/money.ts:15-32`.
      It uses BigInt, rounds the magnitude up when remainder × 2 ≥
      divisor, then applies the sign. It is applied to the order total
      at `run.ts:189`.
    - The plugin doesn't convert tax on main yet. The measurement of 0
      differences in 340,230 sales applied the same `majorToMinor` to
      `raw_tax_total`, which is how medusapos#133's `figures_mismatch`
      will compare.
- **`per_line_items`:**
  - A line's price and price with tax are
    `roundMoney(unitPrice, quantity)`, which is `Math.round(value × quantity)`
    (`order-line.entity.js:193-204`, `:249-261`; `round-money.js:13-18`).
  - A surcharge's price is `round(listPrice)` exclusive or
    `round(netPriceOf(listPrice, r))` inclusive. Its price with tax is
    `round(grossPriceOf(listPrice, r))` exclusive or `round(listPrice)`
    inclusive (`surcharge.entity.js:33-38`).
  - So with `listPrice = −D`:
    - exclusive: the price is `−D` and the tax is `round(−D × r)`;
    - inclusive: the price with tax is `−D`, the net is
      `round(−D / (1 + r))`, and the tax is `−D` minus that net.
  - The totals add up the lines and the surcharges
    (`default-order-tax-calculation-strategy.js:22-29`).
  - Each item's tax-summary share is `round(item tax × r_i / r)` (`:38-86`).
    That is exactly the item's tax when the item has one rate. With
    stacked rates the till's last rate takes the rest instead, so its
    rows always sum to `taxMinor`. Vendure's own summary can miss its
    tax by a unit there.
  - The till: each line with `D > 0` becomes two items, `A` and `−D`
    (`tax/exact.ts:139`). A return line's negative `discountMinor` is
    the cap that holds it at 0, not a discount, so it stays one item.
- **`per_rate_group_items`:**
  - Lines join their groups at `proratedLinePrice`
    (`order-level-tax-calculation-strategy.js:84-87`), and surcharges at
    `surcharge.price` (`:88-91`).
  - A surcharge carries its line's tax lines, so it has the same key
    (`:103`) and joins its line's group.
  - Each group's tax is `round(taxPayableOn(Σ net, rate))`
    (`:37-39`, summary `:51-77`), and the totals are `:44-49`.
  - On an all-exclusive order, item nets aren't rounded. So each
    group's Σ net is Σ `A` + Σ `−D` = Σ `A − D`: the same figures as
    folding the discounts into the lines (0 of 1,000 measured).
- **Why half up matters for discounts:**
  - A discount item's tax is negative, so an exact half such as `−0.5`
    differs by mode. At 25% that happens when `D mod 4 = 2`.
  - With half away from zero, 491 of the 1,000 default/exclusive
    baskets differ from Vendure. With half up, 0 differ.
- **Worked example: default strategy, exclusive, 25%.**
  - The basket: TOTE 1499 × 3 = 4497 with `D` 899, and TEE 1999 × 5 = 9995
    with `D` 2520.
  - Vendure: 1124 − 225 + 2499 − 630 = **2768**.
  - Discounts folded into the lines: `round(3598 × 25% = 899.5) = 900`,
    and `round(7475 × 25% = 1868.75) = 1869`, so 2769.
- **Worked example: the same basket inclusive, order-level.**
  - The nets are 3598, −719, 7996 and −2016, which sum to 8859.
  - The tax is `round(2214.75) = 2215`.
  - The total is 11074, against 11073 on the shelf (Σ `A − D`).
  - The till, under the known gap, keeps `per_order`'s 8858 / 2215 /
    11073 here.
  - The vendurepos plugin (vendurepos/app main,
    `packages/vendure-plugin/src/service/order-create.service.ts:670-678`)
    adds an untaxed surcharge `sku: 'TALLY-ROUNDING'`. Its `listPrice` is
    `bridgeMinor = payload.totalMinor − serverMinor`, −1 here, so that
    the order charges the till's 11073. It records `total_mismatch`
    with `bridgeMinor`.
  - #310's display rounding row will be the receipt's explanation of
    that same bridge.

**Folding the discounts into the lines** (the dropped plain `per_line`)
matches no store's code on a discounted basket. On undiscounted
baskets it is `per_line_items` exactly. On discounted ones it differed
from Vendure on 387 of 1,000 exclusive and 290 of 1,000 inclusive
baskets.

**The display gap (#310) under the item granularities:**
- `per_line_items`: no gap. Each item pays its own price with tax, so
  an inclusive line pays `A` and its surcharge `−D`, and the total is
  Σ `A − D`, which is what the display shows.
- `per_rate_group_items`: any order with an inclusive item (line or
  surcharge) could differ from Σ `A − D`, in either direction: +1 in the
  example above. Discounts add items, so a difference is more likely.
  That is the known gap above.

**The measurement.**
- The set is vendurepos's #38 measurement (vendurepos/app#38):
  - 9,680 orders, of which 1,420 are scored undiscounted baskets;
  - 1,000 discounted v2 baskets saved through real Vendure 3.7.3 in each
    of 4 cells: default and order-level strategy, prices exclusive and
    inclusive.
  - Their data reproduces Vendure's own figures in 4,000 of 4,000
    cases.
- Of 1,000 baskets per cell, those where the tax differs:

  | Rule | default excl | default incl | order-level excl | order-level incl |
  |---|---:|---:|---:|---:|
  | discounts folded into the line (dropped) | 387 | 290 | 0 | 98 |
  | per item, half up | 0 | 0 | 0 | 0 |
  | per item, half away from zero | 491 | 0 | 0 | 0 |

  In the order-level inclusive cell, the folded rule's subtotal differs
  on 290 baskets and its total on 294.
- The data stays in vendurepos. To score the till, one of two things
  is needed:
  1. vendurepos calls `@tallyui/pos`'s
     `taxFiguresForBasket(currency, pricesIncludeTax, lines, rounding)`
     (`order/tax-figures.ts`) over its saved baskets and reports the
     counts per cell. This is preferred, because no data leaves
     vendurepos.
     - Each line is `{ unitPriceMinor, quantity, discountMinor,
       taxInclusive, taxLines: [{ code, ratePpm }] }`.
     - It returns `{ subtotalMinor, taxMinor, totalMinor, taxByRate }`,
       exactly as a sale computes them, the known gap included.
  2. vendurepos exports anonymised fixtures that a TallyUI test
     replays. Each basket needs:
     - each line's `A`, `D`, mode, rate name and value;
     - Vendure's `subTotal`, `subTotalWithTax`, the bridge and
       `taxSummary`.
- Either way, the bar is 0 differences in every cell, and on the 1,420
  undiscounted baskets.

#### Identities

| Identity | Exclusive | Inclusive | Mixed |
|---|---|---|---|
| `totalMinor = subtotalMinor + taxMinor`, except when the lines sum below 0 (a net return): then `totalMinor` is clamped at 0 while `subtotalMinor + taxMinor` stays negative (`order/order-builder.ts:42`) | holds | holds | holds |
| `Σ taxByRate[].taxMinor = taxMinor` (`pos-order/finalize.ts:196`; core refuses otherwise) | holds | holds | holds |
| `subtotalMinor = Σ unitPriceMinor × quantity − Σ lines[].discountMinor` | holds | no | no |
| `totalMinor = Σ unitPriceMinor × quantity − Σ lines[].discountMinor` | no | holds | no |
| `display.totalMinor = display.subtotalMinor − display.discountMinor (+ taxMinor when exclusive)` | holds | holds | holds |
| `display.subtotalMinor = Σ display.lines[].amountMinor` | holds | holds | holds |
| `display.discountMinor = display.orderDiscountMinor + Σ discount rows` | holds | holds | holds |
| `display.subtotalMinor = Σ unitPriceMinor × quantity` | holds | holds | no |

The rows with `Σ lines[].discountMinor` use version 3's figures, each
line's discount in its own mode. In version 4, `Σ net(A) −
payload.discountMinor = subtotalMinor` holds in all four worked
examples below, with each line's net(A) exact and the sum rounded once
(`pos-order/command-v4.test.ts`). It is not listed as an identity,
because each line's net discount is rounded on its own.

`totalMinor = subtotalMinor − discountMinor + taxMinor` is never an
identity: `subtotalMinor` has already had every discount taken off, so
subtracting `discountMinor` again is wrong. With no discount it is just
`subtotalMinor + taxMinor`.

#### Worked examples

Rate 10% (`ratePpm` 100000), AUD. Line a is 2 × 12.50 with a 10% line
discount; line b is 1 × 9.99; a fixed 5.00 order discount. Line a's
discount is 250 + a 346 share and line b's a 154 share (500 spread
2250 : 999). "Mixed" is an inclusive order whose line b is exclusive
(`lines[1].taxInclusive: false`), then an exclusive order whose line b
is inclusive.

| Field | Exclusive | Inclusive | Mixed (incl. order) | Mixed (excl. order) |
|---|---|---|---|---|
| `lines[0]` unit × qty, `discountMinor` | 1250 × 2, 596 | 1250 × 2, 596 | 1250 × 2, 596 | 1250 × 2, 596 |
| `lines[1]` unit × qty, `discountMinor` | 999 × 1, 154 | 999 × 1, 154 | 999 × 1, 154 (excl.) | 999 × 1, 154 (incl.) |
| `subtotalMinor` | 2749 | 2499 | 2576 | 2672 |
| `discountMinor`, version 3 (as sent today) | 750 | 750 | 750 | 750 |
| version 4: `lines[].discountMinor`, `discountMinor` | 596, 154; 750 | 542, 140; 682 | 542, 154; 696 | 596, 140; 736 |
| `taxMinor` | 275 | 250 | 258 | 267 |
| `totalMinor` | 3024 | 2749 | 2834 | 2939 |
| `display.subtotalMinor` | 3499 | 3499 | 3599 | 3408 |
| `display.discountMinor` | 750 | 750 | 765 | 736 |
| `display.orderDiscountMinor` | 500 | 500 | 515 | 486 |
| `display.lines[].amountMinor` | 2500, 999 | 2500, 999 | 2500, 1099 | 2500, 908 |
| `display.lines[].discounts[]` | [250], [] | [250], [] | [250], [] | [250], [] |
| `taxByRate[0]` net, tax, gross | 2749, 275, 3024 | 2499, 250, 2749 | 2576, 258, 2834 | 2672, 267, 2939 |

- Exclusive: tax is (1904 + 845) × 10% = 274.9, so 275.
- Inclusive: tax is 173.090909 + 76.818182 = 249.909091, so 250; the
  customer pays 3499 − 750 = 2749.
- Mixed, inclusive order: the total is 1904 + 845 + 85 (line b's 84.5
  tax, rounded half away from zero) = 2834; the tax is 257.590909, so
  258. Version 3's `discountMinor` 750 adds line a's tax-inclusive 596
  to line b's tax-free 154; version 4 sends line a's as 542 net, so
  696. The display shows line b's share as 169 and the order discount
  as 515.
- In the exclusive order version 3's 750 is already tax-exclusive, so
  version 4 sends the same figures; in the inclusive and mixed orders
  they differ.

Where rounding shows (three lines of 1 × 3.33 at 10%):

| Field | Exclusive | Inclusive |
|---|---|---|
| each line's exact tax (minor units) | 33.3 | 30.272727 |
| `taxMinor` (once per order) | 100 (per line would be 99) | 91 (per line would be 90) |
| `subtotalMinor`, `totalMinor` | 999, 1099 | 908, 999 |
| `taxByRate[0]` net, tax, gross | 999, 100, 1099 | 909, 91, 1000 |

In the inclusive order `taxByRate`'s net is 3 × (333 − 30) = 909 and its
gross 1000, one more than `subtotalMinor` and `totalMinor`: the nets are
rounded per line, which is why they are not summed against the
subtotal. `taxByRate[0].taxMinor` is 100 and 91, equal to `taxMinor`,
as in every example here. A single
line of 0.25 at 10% exclusive has 2.5 cents of tax and sends
`taxMinor` 3 (half away from zero; half to even would give 2).

## `register.session.open`

| Field | Kind | Since |
|---|---|---|
| `payload.sessionId` | instruction | 1 |
| `payload.registerId` | instruction | 1 |
| `payload.storeKey` | informational | 1 |
| `payload.businessDay` | instruction (honoured by recording) | 1 |
| `payload.openedAt` | instruction (honoured by recording) | 1 |
| `payload.openedBy` | instruction (honoured by recording) | 1 |
| `payload.expectedFloatMinor` | informational | 1 |
| `payload.countedFloatMinor` | instruction | 1 |
| `payload.openingVarianceMinor` | informational | 1 |

`countedFloatMinor` is the float the server's expected cash starts from
(ADR-068 decision 13); `openingVarianceMinor` is the till's own
`countedFloatMinor − expectedFloatMinor` (`countVariance` in
`@tallyui/pos`).

## `register.session.transition`

| Field | Kind | Since |
|---|---|---|
| `payload.sessionId` | instruction | 1 |
| `payload.status` | instruction | 1 |
| `payload.at` | instruction (honoured by recording) | 1 |
| `payload.counted` (map: payment-method kind to minor units) | instruction (honoured by recording) | 1 |
| `payload.closedBy` | instruction (honoured by recording) | 1 |
| `payload.approvedBy` | instruction (honoured by recording) | 1 |

`counted`, `closedBy` and `approvedBy` belong to a closing transition
only.

## `register.movement.record`

| Field | Kind | Since |
|---|---|---|
| `payload.movementId` | instruction | 1 |
| `payload.sessionId` | instruction | 1 |
| `payload.type` | instruction | 1 |
| `payload.amountMinor` | instruction | 1 |
| `payload.reason` | instruction (honoured by recording) | 1 |
| `payload.createdAt` | instruction (honoured by recording) | 1 |
| `payload.createdBy` | instruction (honoured by recording) | 1 |

## `register.movement.void`

| Field | Kind | Since |
|---|---|---|
| `payload.movementId` | instruction | 1 |
| `payload.sessionId` | instruction | 1 |
| `payload.voids` | instruction | 1 |
| `payload.createdAt` | instruction (honoured by recording) | 1 |
| `payload.createdBy` | instruction (honoured by recording) | 1 |

## `register.closure.submit`

| Field | Kind | Since |
|---|---|---|
| `payload.closureId` | instruction | 1 |
| `payload.sessionId` | instruction | 1 |
| `payload.registerId` | instruction | 1 |
| `payload.number` | instruction | 1 |
| `payload.businessDay` | instruction (honoured by recording) | 1 |
| `payload.openedAt` | instruction (honoured by recording) | 1 |
| `payload.closedAt` | instruction (honoured by recording) | 1 |
| `payload.closedBy` | instruction (honoured by recording) | 1 |
| `payload.approvedBy` | instruction (honoured by recording) | 1 |
| `payload.tillExpected` (map: payment-method kind to minor units) | instruction (honoured by recording) | 1 |
| `payload.counted` (map: payment-method kind to minor units) | instruction (honoured by recording) | 1 |
| `payload.periodSalesTotalMinor` | instruction (honoured by recording) | 1 |
| `payload.periodRefundsTotalMinor` | instruction (honoured by recording) | 1 |
| `payload.perpetualSalesTotalMinor` | instruction (honoured by recording) | 1 |
| `payload.perpetualRefundsTotalMinor` | instruction (honoured by recording) | 1 |
| `payload.unsyncedCount` | informational | 1 |
| `payload.unsyncedTotalMinor` | informational | 1 |
| `payload.softwareVersion` | informational | 1 |
| `payload.orderIds` | instruction | 1 |
| `payload.movementIds` | instruction | 1 |

`tillExpected` and `counted` are the fiscal record, never overwritten by
the server's figures; `orderIds` and `movementIds` decide which orders and
movements the server's closed figure counts (ADR-068 decision 13).

## Declared maps

`counted` (in `register.session.transition` and
`register.closure.submit`) and `tillExpected` are the contract's only
declared maps (ADR-070 decision 1). Each key is a payment-method kind,
`cash` or `external` (`PaymentMethodKind`), the same vocabulary as
`order.create`'s `payments[].method`; each value is an integer in minor
units. An unknown key is refused as `invalid_payload` naming the full
path, and a key that a later version declares is refused naming the
version it needs. Today medusapos refuses any key other than `cash` or
`external` (medusapos/app#137); core's shared check will do the same
(#256), and vendurepos has no register commands yet.
