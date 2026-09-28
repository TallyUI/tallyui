# Adding registers to a POS app

Registers are TallyUI's cash-drawer sessions: opening a till with a float,
taking cash movements during the day, counting and closing it into a Z
report. This guide is for a developer wiring registers into a POS app built
on any commerce backend. It assumes the app already has a working database,
catalogue and sale screen from the main [integration guide](../../apps/web/content/docs/integration.mdx).

Everything here is backend-neutral. Nothing in `@tallyui/pos` or
`@tallyui/components`'s register pieces knows the name of any commerce
platform, and neither does this page.

## What registers are

A register session moves through three states: `open` (selling), `counting`
(the drawer is being counted at close) and `closed` (a Z report exists). While
open, cash movements — paid in, paid out, a no-sale drawer pop — are recorded
against it. Closing it counts the drawer, compares the count against the
expected cash, and writes a closure: TallyUI's Z report. A closure over a
configured variance threshold needs manager approval before it can be
written. "Blind" mode hides the expected figure from the cashier while
counting, so the count isn't just typed back from the screen.

Sessions, movements and closures are local to the till: nothing is sent to a
server yet (see [what registers c2 will add](#what-registers-c2-will-add)).
Full detail, including every edge case below, is in
[`DECISIONS.md#adr-032-how-wcpos-code-reaches-tallyui-plan-d3`](../DECISIONS.md#adr-032-how-wcpos-code-reaches-tallyui-plan-d3)
("ADR-032").

## The collections

Registers add three local-only collections to the app's per-backend
database, alongside the `pos_orders` collection every TallyUI app already
opens:

- `register_sessions` — created with `registerSessionCollection()`. This
  collection also hosts the register's identity and counters as an RxDB
  local document (a Tally database has no database-level local documents),
  so pass this same collection wherever a function below asks for a
  "register host".
- `cash_movements` — paid-in, paid-out, no-sale and void rows.
- `closures` — one row per Z report.

All three are local and never replicated. This isn't a shortcut: writing
locally into a collection that *is* replicated from a server loses the next
pulled version of that document, because the local write is never sent back
(the `#53` rule). Registers avoid the problem by not replicating at all.

`pos_orders` is opened the usual way, with `addPosOrderCollection`, so its
migrations run before anything reads from it.

```ts
import {
  registerSessionCollection, cashMovementSchema, closureSchema, ensureRegister, addPosOrderCollection,
} from '@tallyui/pos';

declare const db: /* the app's per-backend RxDatabase */ any;
declare const platform: string; // e.g. 'ios', 'web'

// pos_orders first: addPosOrderCollection settles its migration before anything reads it.
const orders = await addPosOrderCollection(db);
await db.addCollections({
  register_sessions: registerSessionCollection(),
  cash_movements: { schema: cashMovementSchema },
  closures: { schema: closureSchema },
});

// The register host is the register_sessions collection. ensureRegister mints the till's
// identity document on first use and returns the existing one after that.
const register = db.register_sessions;
await ensureRegister(register, platform);
```

Expose `register_sessions`, `cash_movements`, `closures` and `orders`
alongside wherever the app already exposes its other collections — a
`useRegisterSession` caller needs all four plus the register host.

TallyUI databases are single-instance: one tab, one database, no leader
election to coordinate (ADR-061). Registers add no multi-tab concerns of
their own.

## `useRegisterSession`

`useRegisterSession` is the till's register session as React state, plus its
actions. The app supplies every input; there's no context and nothing is
sent to a server.

### Options

All of `sessions`, `movements`, `closures` and `orders` (the four
collections above) and `register` (the host, typed `RegisterHost | null`)
are nullable: pass `null` while the database is still opening, and the hook
reports no session rather than throwing.

- `sessions`, `movements`, `closures`, `orders`, `register` — the
  collections and host, or `null` while they're opening.
- `storeKey` — the app's own neutral key for this backend connection (for
  example, the connector id plus the base URL). It's how the register
  document keeps one till's binding separate from another backend's.
- `registerId` — the register (the cash **drawer**) this till is bound to,
  or `null` when it isn't bound to one yet. This is a different thing from
  any device or till identifier the app already tracks; `PosOrder` itself
  has an unrelated `registerId` field, so don't reuse one name for both.
  Binding itself (choosing a drawer, remembering the choice) is entirely
  the app's own concern — see `bindRegister`, `observeRegister$` and
  `getBoundRegisterId` in `@tallyui/pos`.
- `enabled` — the store uses register sessions at all. `false` turns
  everything off.
- `actor` — the signed-in cashier, `{ id, name }`, used for `opened_by`,
  `closed_by` and the audit log.
- `timezone` — an IANA zone, or `'device'`, deciding which business day a
  session opens on.
- `softwareVersion` — the app's version, stamped on the closure.
- `tenderInProgress` — true while a sale is at tender. While true,
  `startCounting` and `closeSession` refuse before any write, so a till
  can't close under a payment in progress.
- `varianceThreshold` — the count variance, in minor units, above which a
  close needs manager approval.
- `expectedCloseTime` — `'HH:mm'` on the device's clock; an open session
  past it is `overdue`.
- `blind` — hides expected figures from the cashier while counting.
- `labels` — `{ registerName?, resolveCashierName? }`, for the closure's
  register name and turning a cashier id into a display name.

### Returns

The fields this guide's screens need: `session`, `expected`, `salesCount`,
`overdue`, `lastClosure`, `saleSession` (pass this straight to `useSale`,
below) and `actions` (`openSession`, `startCounting`, `backToSelling`,
`closeSession`, `recordMovement`, `voidMovement`). There's also a top-level
`requireOpen()` and `requireSaleSession()` — not among the `actions` — described under
[wiring the sale](#wiring-the-sale).

### Errors

Each action can throw one of these. Most carry a message a cashier can read
as it is. `RegisterSessionRequiredError` carries a code
(`register_session_not_open`), so map it to your own copy, for example "Open
the register to take payment.":

- `RegisterTenderInProgressError` — counting or closing while a sale is at
  tender.
- `RegisterSessionRequiredError` — a money action with no open session.
- `RegisterApprovalRequiredError` — closing over the variance threshold with
  no approval.
- `RegisterMovementStrandedError` — a movement or void that raced a close
  and can't be proven counted or uncounted; see
  [what a cashier may see](#what-a-cashier-may-see).
- `RegisterSessionAlreadyOpenError` — opening while the register already has
  a live session, or another open is already running.
- `RegisterCloseIncompleteError` — opening while an earlier close on this
  register didn't finish; finish it first.

## Wiring the sale

Pass `saleSession` (from `useRegisterSession`) to `useSale`'s `session`
option. `useSale.complete()` then stamps the finalized order with the
session through `stampSession` before handing it to `onSaleCompleted`.

The session stamped is the one in force when the tender started, not
whatever `saleSession` is by the time the sale completes: `startTender` pins
it for that tender, so a session that closes mid-tender doesn't change which
session the sale belongs to (#170, and #172 for a session opened just before). `useRegisterSession`'s
`tenderInProgress` option must reflect the sale being at tender (that is,
`sale.stage.kind === 'tender'`), so counting or closing can't start under a
payment in progress.

**The tender gate has two points**, per ADR-032.

When tender starts, call `register.requireSaleSession()` (not under
`actions`), and pass what it returns to `startTender`:

```ts
const confirmed = await register.requireSaleSession();
sale.startTender('cash', { session: confirmed ?? undefined });
```

The rendered `saleSession` lags a session opened a moment earlier. A cashier
who taps Open and then Cash straight away would otherwise start a tender
before the new session has rendered. `requireSaleSession()` reads storage,
and the tender pins exactly the session it confirmed. If a tender still pins
none while a session is present at `complete()`, `useSale` stamps that
session and logs a warning.

Call `register.requireOpen()` again just before a card terminal captures.
Both calls throw
`RegisterSessionRequiredError` when there's no open session — map that to a
cashier-facing prompt to open the register — and resolve to `null` when
`enabled` is `false`, which also means "sessions are off for this store".
An app whose database is still opening must refuse payment on its own in
that window, since neither call can yet tell "not open" from "still
opening".

Browsing the catalogue and building the cart are **never** blocked by the
register — only taking payment is gated. Don't call `requireSaleSession()` before
the cashier reaches the tender step.

## The screens

All from `packages/components/src/register/`. Each takes `register`
(`useRegisterSession`'s return value) as its main prop.

- **`RegisterPicker`** — the register-choice screen, shown before a till is
  bound. Takes the app's own list of registers (`registers`) and `onPick`;
  binding on the pick is the app's job.
- **`OpenRegisterCard`** — opens a session, prefilled from
  `configuredFloatMinor` or the last counted cash. Takes `register`,
  `currency` and `configuredFloatMinor?`.
- **`RegisterBar`** — the till's one status bar: register name (multi-register
  stores only), a status pill, and a button to open the register panel. The
  pill's states are `'Choose a register'`, `'Offline'`, `'Approval needed'`,
  `'Counting'`, `'Overdue'` and `'Register closed'` (or no pill at all).
  `onPressPill`, if given, turns the pill into a button: with no session it
  should open whatever gate or picker the app shows for that state, and with
  a session it should open the register panel. Without `onPressPill` the
  pill is a plain badge.
- **`RegisterColumn`** — swaps a column's content wholesale for the picker,
  the open card, or `countSlot` while counting; otherwise renders its
  `children` (the cart), with an overdue banner when `cartEmpty` and the
  session is overdue. Because it replaces its children entirely, compose
  `RegisterPicker` or `OpenRegisterCard` directly if the cart needs to stay
  visible beside them, and use `RegisterColumn` only once a session exists.
- **`MovementSheet`** — records one paid-in, paid-out or no-sale movement.
  Takes `register`, the `type`, `currency`, and `onOpenDrawer?` (called after
  a no-sale, since that's the point of recording one).
- **`RegisterPanel`** — the drawer panel: expected figures (hidden while
  blind), movement buttons, the movement list with Undo, and Close register.
  Takes `register`, `currency`, `registerName?`, `open` and `onOpenChange`.
- **`RegisterCount`** — counts the drawer at close: denomination tiles or a
  typed amount, other tenders, a live variance line, Close (gated by
  `approve` above the threshold) or Back to selling. Takes `register`,
  `currency` and `approve?` — see [approval](#approval).
- **`ClosureSheet`** — the closed-session confirmation, from
  `register.lastClosure`. Takes `register`, `currency`, and an optional
  `onPrint` (no button renders without it — printing isn't wired here).

`RegisterPicker` and `OpenRegisterCard` no longer force `flex-1` on
themselves; pass `className` for the layout the app needs.

For phone-width layouts, `Catalogue` (in `packages/components/src/sale/`)
takes a `statusAccessory` prop, rendered at the end of its status line —
this is where a register control fits without a second header strip.

## Approval

`RegisterCount`'s `approve` prop is the app's own gate:

```ts
approve?: () => Promise<{ approvedBy: string; approvedByName?: string } | null>;
```

The app decides how a manager proves themselves — for example, a second
admin sign-in. `null` means approval was refused or cancelled; the count
stays open. `approve` runs regardless of `blind`, since dropping it there
would leave a blind count with no gate at all above the threshold.

`useRegisterSession`'s own `closeSession` action enforces the same gate
independently, reading the stored session fresh rather than trusting the
screen's snapshot: a close above `varianceThreshold` with no `approvedBy`
throws `RegisterApprovalRequiredError` before any write, blind mode
included. A resumed close (one already recorded as closed) isn't gated
again.

`approvedBy` reaches the Z as `breakdowns.approved_by`, and a supplied
`approvedByName` as `approved_by_name`. If the app doesn't have a name at
close time — a close resumed after a restart, say — `labels.resolveCashierName`
(an id-to-name lookup passed to `useRegisterSession`) fills it in instead.

## One root `PortalHost`

Mount exactly one `<PortalHost />` (from `@tallyui/primitives`) once, at the
app's root, after navigation — never per screen. `RegisterPanel`,
`MovementSheet`, `RegisterCount`'s dialogs and `ClosureSheet` all render
through it; a second, per-screen host renders them under that screen's own
header instead of above it. This isn't specific to registers — see the
existing [integration guide](../../apps/web/content/docs/integration.mdx),
which covers the same rule for the rest of the app.

## What a cashier may see

- **A late sale.** `useSale.complete()` runs after the money is taken, so if
  the stamp is refused there (the session closed mid-tender, or went
  missing), the sale still
  completes. It carries `lateSessionId` instead of `sessionId`, and a
  `late-sale` register fact is recorded. The closed Z is never changed to
  add it. Surface it somewhere — an orders list, or on the Z itself — so it
  isn't invisible. (ADR-032, "late sale".)
- **The orphan-stamp sweep.** An order stamped to a session whose closure
  doesn't list it — because its insert raced a close — becomes a late sale
  the same way, automatically. `useRegisterSession` runs this sweep on
  start, after its own `closeSession`, and when it sees a closure it hasn't
  checked before. A grace period keeps a very recent closure from being
  marked fully swept before a still-landing insert reaches it. (ADR-032,
  "the orphan-stamp sweep".)
- **A stranded movement.** A movement or void that races a close, and whose
  session has no closure yet (or an unlisted one), is kept — never silently
  dropped — and flagged with `RegisterMovementStrandedError`. The rule is
  that the local store never deletes a cash record it can't prove is
  uncounted.
- **A hung or failed save.** A sale whose save neither confirms nor fails
  outright is handled by `useSale` and `useOrderOutbox.isStored`, not
  anything register-specific: the app offers Retry once a save has failed,
  and Continue once the order is confirmed stored. Register writes (opening
  a session, movements) aren't counted in `useOrderOutbox`'s
  `savesInFlight`, so don't rely on that count to hold up a sign-out while a
  register write is still landing.

See ADR-032 for the exact windows these come from, and
[ADR-052](../DECISIONS.md#adr-052-neutral-pos-app-pieces-move-from-medusaposapp-into-tallyui)
for how `useSale`'s idempotent completion and Retry/Continue work in general.

## What registers c2 will add

None of this is built yet: sessions are entirely local today, and a server knows nothing about them. So nothing stops two tills opening the same drawer, and nothing on a server checks a close. The server side ("registers c2") is designed and queued. Plan on:

- **Register commands** over the same neutral `POST /tally/v1/commands` transport as `order.create`:
  - session open;
  - a status transition;
  - a movement recorded or voided;
  - a closure submitted.

  A store turns them on by advertising a `register` contract on `GET /tally/v1/info`, the same way `order.create` versions are advertised (`capabilities.orderCreate`). Without it, nothing changes.
- **A local command ledger** that records each register fact as a command with fixed bytes, and a sender that sends each register's commands strictly in order. The app adds one more local collection and starts the sender behind the capability.
- **`order.create` version 3 carrying the sale's `sessionId`,** so the server can derive each session's expected cash and sales count from its own records.
- **Server anchoring:** `expected` and `salesCount` come from the server whenever nothing of the session is still waiting to sync. The session's reserved `server_expected` and `server_sales_count` fields hold them.
- **The register's closure counters** adopted from the server as a floor, never lowered.
- **A server approval gate:** the server checks the variance on its own figures. Approval arrives as a signed, session-bound approver token from a connector call, which is what the reserved `approver_token` field is for. `approve()`'s contract grows to return it.
- **No sale can join a session once it's counting:** such a sale becomes a late sale.

See ADR-032's c2 notes and
[ADR-065](../DECISIONS.md#adr-065-ordercreate-version-3-carries-the-receipts-figures-on-every-sale-pos_orders-goes-to-schema-version-2)
for the `order.create` version 3 work this builds on.

## Gotchas

Collected from a real app's first integration:

- **Same database.** Add the register collections in the **same** per-backend database as `pos_orders`, after `addPosOrderCollection`, and call `ensureRegister` once per open. They share one instance, one close and one storage watchdog with the rest of that database.
- **One hook instance.** Run one `useRegisterSession` per backend connection, high enough (in a provider, say) that the sale screen and the count screen share it. `tenderInProgress` has to be reported up from wherever tender actually starts and ends.
- **Same `storeKey`.** Use the same `storeKey` for the register as for everything else scoped to that backend connection.
- **`registerId` means the drawer.** `useRegisterSession`'s `registerId` is the cash drawer. If the app already has a device or till id (for example the value it passes as `PosOrder.registerId`), give the drawer a distinct name in app code, such as `boundRegisterId`.
- **A store that's still opening.** `requireOpen()` and `requireSaleSession()` resolve `null` when `enabled` is `false`. An app whose store is still opening must refuse payment itself in that window, or a sale can complete with no session.
- **`RegisterColumn` replaces its children wholesale.** If the cart needs to stay visible next to the picker or the open card, compose those two directly above the cart, and use `RegisterColumn` only once a session exists, for its `countSlot`.
- **The pill must never be a dead label.** Wire `onPressPill` so that with no session it opens whatever the app shows to start one (on a phone, that likely means showing the cart area even while it's empty), and with a session it opens the register panel.
- **Phone layout:**
  - put the bar in an existing row (`Catalogue`'s `statusAccessory`, or a row already in the cart) rather than adding a header strip;
  - pass a `className` that strips `RegisterBar`'s own padding and border when it's embedded that way;
  - keep any status text short, since it truncates next to an accessory;
  - hide the bar on the receipt screen.
- **Simulating a stuck save in tests.** The storage read behind a session stamp happens before the order insert, so a dead storage worker can show up as a read failure before any write stalls. To simulate a stuck save, hold the insert, not the worker.
- **`approve()`** should resolve `{ approvedBy, approvedByName? }` without storing any credentials, and should refuse cleanly when it can't run (offline, say). Give `labels.resolveCashierName` a real id-to-name lookup, so a close resumed after a restart still shows the approver's name, not their id.
