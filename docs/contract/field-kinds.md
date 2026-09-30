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
