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
| `payload.lines[].discountMinor` | instruction | 2 |
| `payload.subtotalMinor` | informational | 1 |
| `payload.discountMinor` | instruction | 2 |
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
  computation.
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
(`order/order-builder.ts:143`, `:247`). `finalizeOrder` copies the
figures and adds `taxByRate` (`pos-order/finalize.ts:189`, `:204`), and
`toOrderCreateEnvelope` sends the stored order unchanged, so a resend
never recomputes (`pos-order/command.ts:42`).

#### Tax modes

- A line's **own mode** is its price's `taxInclusive` flag, or the
  order's `pricesIncludeTax` when the price has none
  (`order/order-builder.ts:258`).
- `lines[].taxInclusive` is sent only when that mode differs from
  `pricesIncludeTax` (`pos-order/finalize.ts:145`,
  `order/order-builder.ts:296`); absent means the order's mode.
- An order with such a line is **mixed**. That line's `unitPriceMinor`
  and `discountMinor` are in its own mode.

#### Discounts and how the order discount is spread

- A line discount is on `unitPriceMinor × quantity`: a percentage of
  it, or a fixed amount capped at what the earlier ones leave
  (`order/order-builder.ts:97`).
- An order discount is pre-tax. Its base is the sum of every line's
  amount after its line discounts, each in its own mode, so a mixed
  order's base mixes modes. A percentage is taken of that base (several
  percentages add up rather than compound); a fixed amount of what is
  left (`order/order-builder.ts:150`).
- The order discount is then spread over the lines in proportion to
  those same after-line-discount amounts, by largest remainder, ties to
  the earlier line (`order/allocate-order-discount.ts:11`,
  `order/order-builder.ts:158`). Each line's share is part of its
  `discountMinor`, in the line's own mode.
- Each line is taxed on `unitPriceMinor × quantity − discountMinor`
  (`order/order-builder.ts:107`): after both kinds of discount.

#### Definitions

- `lines[].unitPriceMinor`: the unit price as sold, before any
  discount, in the line's own mode (`order/order-builder.ts:282`,
  `pos-order/command.ts:67`).
- `lines[].discountMinor`: the line's own discounts plus its share of
  the order discount, in the line's own mode; absent when 0
  (`order/order-builder.ts:106`, `pos-order/command.ts:69`).
- `payload.discountMinor`: the order's line and order discounts
  together, on one basis, **tax-exclusive**, like `subtotalMinor`:
  since `totalMinor = subtotalMinor + taxMinor`, the discount that
  produced that subtotal is net of tax too. Absent when 0. It is never
  the order discount alone.
  - **Today the till does not follow this rule (TallyUI #286).** It
    sends the plain sum of `lines[].discountMinor`
    (`pos-order/command.ts:51`), each in its line's own mode, so it is
    tax-inclusive in an inclusive order and mixes modes in a mixed one
    (the mixed example below: 750 = 596 tax-inclusive + 154 tax-free).
    Core's shape check also requires that sum today
    (`@tallyui/core/server`'s `order-payload-shape.ts:58`).
  - Backends should not compare `discountMinor` until #286 lands.
- `payload.taxMinor`: the sum of every line's exact tax, rounded once
  for the order (`order/order-builder.ts:28`, `:30`); line tax is on
  the line's amount after all discounts.
- `payload.totalMinor`: what the customer pays. It is the sum of every
  line's amount after all discounts, each in its own mode, plus the
  exclusive lines' tax rounded once (`order/order-builder.ts:33`); the
  payments sum to it (`pos-order/finalize.ts:171`).
- `payload.subtotalMinor`: `totalMinor − taxMinor`
  (`order/order-builder.ts:34`), so **after all discounts and without
  tax, in every mode**, whatever `pricesIncludeTax` says. It is not a
  before-discount subtotal. A backend whose own subtotal is before
  discounts compares its after-discount, tax-free figure with it.
- `display.*` (v3) is the receipt, in the order's mode
  (`display.taxInclusive` = `pricesIncludeTax`,
  `pos-order/finalize.ts:193`):
  - `display.lines[].amountMinor`: `unitPriceMinor × quantity`, before
    any discount; a line in the other mode is converted, and such lines
    also take the rounding residue (`order/order-builder.ts:178`,
    `:196`).
  - `display.lines[].discounts[].amountMinor`: each line discount,
    converted on its own into the order's mode
    (`order/order-builder.ts:173`, `:38`).
  - `display.orderDiscountMinor`: the lines' order-discount shares,
    each converted on its own, summed (`order/order-builder.ts:176`,
    `:183`). In a mixed order it is not the amount the cashier entered.
  - `display.discountMinor`: `orderDiscountMinor` plus every line
    discount row (`order/order-builder.ts:184`).
  - `display.subtotalMinor`: before discounts, in the order's mode:
    `totalMinor + discountMinor` when inclusive, `totalMinor −
    taxMinor + discountMinor` when exclusive
    (`order/order-builder.ts:186`).
  - `display.taxMinor` and `display.totalMinor` equal `payload.taxMinor`
    and `payload.totalMinor` (`pos-order/finalize.ts:192`).
- `taxByRate[]` (v3), one entry per tax `code` and `ratePpm`
  (`tax/exact.ts:120`, called at `pos-order/finalize.ts:189`):
  - `netMinor`: the tax-free base of each line carrying that rate,
    summed. An exclusive line's base is its amount after discounts; an
    inclusive line's is that amount minus its own tax, **rounded per
    line** (`tax/exact.ts:132`). Under stacked rates (ADR-040) a line's
    net is the taxable base for each rate, so `taxByRate[].netMinor` is
    per rate and not additive across rates, and it is rounded per line
    where `subtotalMinor` is one figure, so nobody sums the nets
    against `subtotalMinor`.
  - `taxMinor`: the rate's exact tax floored, then the order's leftover
    units by largest remainder, ties to the higher rate, so the rates
    sum to `payload.taxMinor` (`tax/exact.ts:143`, `:150`). That sum
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
  micro-unit (`tax/exact.ts:22`). The order's micro-units are summed and
  rounded half away from zero to a minor unit by `roundMicrosToMinor`
  (`tax/exact.ts:36`) at `order/order-builder.ts:30`.
- The total adds the exclusive lines' tax, rounded on its own by the
  same function (`order/order-builder.ts:33`). In a single-mode order
  that is the same rounding (exclusive) or nothing (inclusive); in a
  mixed order it is a second rounding, and `subtotalMinor` absorbs any
  difference.
- An inclusive line with stacked rates splits its tax across them by
  truncating division, the last rate taking the rest
  (`order/order-builder.ts:112`); the line's sum is unchanged.
- A percentage discount is rounded half away from zero
  (`order/order-builder.ts:21`, `:137`); a fixed one is whole minor
  units already. The order discount's spread is by largest remainder.
- Display conversions round each amount on its own
  (`order/order-builder.ts:38`); `taxByRate` floors and hands out the
  remainder, as above.
- `computeOrderTax` (`tax/exact.ts:64`) is exported but not on the sale
  path; it is not how `order.create`'s figures are made.

#### Identities

| Identity | Exclusive | Inclusive | Mixed |
|---|---|---|---|
| `totalMinor = subtotalMinor + taxMinor` (`totalMinor` is clamped at 0, `order/order-builder.ts:34`) | holds | holds | holds |
| `Σ taxByRate[].taxMinor = taxMinor` (`pos-order/finalize.ts:196`; core refuses otherwise) | holds | holds | holds |
| `subtotalMinor = Σ unitPriceMinor × quantity − Σ lines[].discountMinor` | holds | no | no |
| `totalMinor = Σ unitPriceMinor × quantity − Σ lines[].discountMinor` | no | holds | no |
| `display.totalMinor = display.subtotalMinor − display.discountMinor (+ taxMinor when exclusive)` | holds | holds | holds |
| `display.subtotalMinor = Σ display.lines[].amountMinor` | holds | holds | holds |
| `display.discountMinor = display.orderDiscountMinor + Σ discount rows` | holds | holds | holds |
| `display.subtotalMinor = Σ unitPriceMinor × quantity` | holds | holds | no |

The rows with `Σ lines[].discountMinor` sum each line's discount in its
own mode, so they are identities of the lines, not of
`payload.discountMinor`'s rule. Today `payload.discountMinor` equals
that sum (core refuses otherwise); that is the #286 bug, so no identity
here uses `payload.discountMinor`.

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
| `discountMinor` as sent today (#286: not yet the rule) | 750 | 750 | 750 | 750 |
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
  258. Today's `discountMinor` 750 adds line a's tax-inclusive 596 to
  line b's tax-free 154, which is the #286 bug; the display shows line
  b's share as 169 and the order discount as 515.
- In the exclusive order 750 is already tax-exclusive, so it is what
  the rule asks for; in the inclusive and mixed orders it is not.

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
version it needs. That is the rule; today no backend checks the keys
against the declared kinds (#256, medusapos/app#132).
