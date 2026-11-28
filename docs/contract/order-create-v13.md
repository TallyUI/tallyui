# order.create version 13: a staff-only reason on a tax-exempt sale

Status: contract agreed (front desk 2026-11-28, `~/agent/handoff/tallyui-tax-exempt-reason/NOTE.md`); server checks
built in `@tallyui/core/server`, till side to follow. A server advertises 13 only when it stores the reason and
declares the `taxExemptReason` capability.

## Why

A store that sells tax exempt often has to record why: the exemption reason and, where there is one, the customer's
certificate number. Up to 12 nothing carries it, so the cashier has nowhere to put it and the store has no record
(vendurepos/app#542).

## The version

- **Version 13 is version 12 plus `taxExemptReason`.** Every field of 1–12 keeps its meaning; versions 1–12 are
  unchanged.
- **When the till sends 13:** all four hold.
  1. The sale is tax exempt (`taxExempt: true`) and carries a reason.
  2. The server advertises 13 (`GET /tally/v1/info` → `contracts["order.create"]` includes 13) and its connector
     declares the `taxExemptReason` capability, and the order was never sent below 13 before.
  3. The sale carries figures (version 4 or more).
  4. Every coupon carries its per-line amounts (`coupons[].lines`, version 9).
  A version-13 payload carries 12's tax ids, SKU and meta, and every earlier field, as those versions do.
- **Every other order goes exactly as today.** That covers caps 4 to 12, a sale that is not exempt, an exempt sale
  without a reason, a figureless sale, a sale whose coupons have no per-line amounts, and any order stored before the
  upgrade. The version and the bytes match the build before 13, and the v1–v12 golden fixtures stay unchanged.

## The capability

`ServerCapabilities.taxExemptReason` is `'optional'` or `'required'`. It means something only beside
`taxExempt: true`.

- **Absent:** the till never asks for a reason and never sends one. Every existing store stays as today.
- **`'optional'`:** the till offers the reason and sends it at 13. A store whose cap is below 13 gets the sale without
  it, at the version it would have had before 13, never with an error. The till keeps the stored reason, shows it as
  not sent in order detail, and says so on the sheet before Pay.
- **`'required'`:** the store refuses an exempt order.create without a reason. An exempt sale never goes below 13.
- **A store that declares `'required'` but lists order.create below 13 is inconsistent.** Its connector reads it as
  no `taxExempt` (the exemption switch is hidden, with one warning), so the cashier never meets a refusal caused by
  the store's own mismatch.
- **A connector that declares `taxExemptReason` without `taxExempt` is ignored**, with one warning, as for the other
  capability keys.

## The field

- `taxExemptReason`: `{ text, certificateId? }`, present only on a tax-exempt order.
- `text` is the reason, 1–200 characters.
- `certificateId` is the customer's exemption certificate number, 1–64 characters, when there is one.
- Both are trimmed: neither starts or ends with whitespace, so whitespace only is no reason.
- 200 and 64 are the only bounds. A connector never refuses a shorter string at a limit of its own: the till cannot
  know a second bound, and the cashier would meet the refusal after typing.

Lengths are UTF-16 code units, and no string carries a NUL.

## Staff only

The reason, and above all the certificate number, is for the store's staff.

- It is never on a receipt, an email receipt or the customer display: the till's `ReceiptData` never gains the field.
- It is never merged into `note`, which a WooCommerce store shows the customer.
- It is never in an error message, a log line or a diagnostics export. The server checks below name the field's path,
  never its value.
- A server stores it where customers cannot read it (a Vendure plugin: a `public: false` custom field).

## Server checks (`@tallyui/core/server`)

`precheckCommand` refuses each case below with `invalid_payload`.

- A reason to a server whose `supported` list does not declare `taxExemptReason`:
  `taxExemptReason requires the taxExemptReason capability, which this server does not declare`.
- An exempt order.create without a reason to a server that declares `'required'`:
  `taxExempt requires taxExemptReason on this server`.
- A reason below 13: `taxExemptReason requires version 13`.
- A reason on `order.update`: `taxExemptReason is not accepted on order.update`.

`payloadShapeErrors` checks the shape:
- `taxExemptReason: expected present only on a tax-exempt order`;
- `taxExemptReason: expected an object`;
- `taxExemptReason.<key>: expected no unknown key`;
- `taxExemptReason.text: expected a non-empty trimmed string`, and the same for `certificateId`;
- `no NUL character`.

`payloadBoundErrors` checks the two bounds (`ORDER_TAX_EXEMPT_REASON_MAX`, `ORDER_TAX_EXEMPT_CERTIFICATE_MAX`).

## What a server does with it

- It stores the reason and the certificate number on the order, staff-only.
- It is not a tax or money input: the order is exempt because of `taxExempt`, whatever the reason says.
- `order.update` never carries it. `taxExempt` is not accepted there either, and a reopened exempt order has no update
  path.

## The till's storage

Comes with the till side: `pos_orders` stores the reason, `sentVersion` / `downgradedFrom` go up to 13, and
`ORDER_CREATE_MAX_VERSION` becomes 13. Until then the till never sends 13.
