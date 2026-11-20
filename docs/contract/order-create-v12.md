# order.create version 12: the customer's tax ids, a line's edited SKU and order meta

Status: contract agreed (ADR-092, front desk 2026-11-19); till side built. A server advertises 12 only when it stores
all three, and only after ADR-092 condition 1 holds.

## Why

A WooCommerce cashier can record a customer's tax ids, edit a catalogue line's SKU and add custom fields to an order.
Up to 11 none of them reaches the store, so what the cashier typed is lost when the order syncs (ADR-092).

## The version

- **Version 12 is version 11 plus `customer.taxIds`, a catalogue line's `sku` and `meta`.** Every field of 1–11 keeps
  its meaning; versions 1–11 are unchanged.
- **When the till sends 12:** all four hold.
  1. The sale has a non-empty `customer.taxIds`, a non-empty `meta`, or a catalogue line (no `custom`) whose SKU the
     cashier edited: its `catalogueSku` is recorded and its `sku` is non-empty and differs from it.
  2. The server advertises 12 (`GET /tally/v1/info` → `contracts["order.create"]` includes 12), and the order was
     never sent below 12 before.
  3. The sale carries figures (version 4 or more).
  4. Every coupon carries its per-line amounts (`coupons[].lines`, version 9).
  A version-12 payload carries 11's addresses, 10's `payments[].methodId`, 9's `coupons[].lines`, 8's `taxAddress` and
  7's `note` as those versions do.
- **Every other order goes exactly as today.** That covers caps 4 to 11, a sale with none of the three fields, an
  unedited SKU, a figureless sale, a sale whose coupons have no per-line amounts, and any order stored before the
  upgrade. The version and the bytes match the build before 12, and the v1–v11 golden fixtures stay unchanged.
- **Downgrade.** The three fields are informational; the order's money is complete without them. A sale capped below
  12 goes out at the version it would have had before 12, without them, never with an error.

## The fields

- `customer.taxIds`: at most 10 entries `{ type, value, country? }`. `type` is the connector's scheme id, 1–32
  characters; `value` is 1–64 characters; `country`, when present, is an ISO 3166-1 alpha-2 code. A label the till
  shows beside a tax id stays on the till and is not sent. The `customer` object is sent when only tax ids are present.
- `lines[].sku`: a catalogue line's SKU as the cashier edited it, 1–100 characters. A custom line never carries it;
  its SKU is `custom.sku`.
- `meta`: at most 50 entries `{ key, value }`, in the order the till stored them. `key` is 1–255 characters, does not
  start with `_` and appears once; `value` is 0–1000 characters.

Lengths are UTF-16 code units, and no string carries a NUL.

## Server checks (`@tallyui/core/server`)

- `precheckCommand` refuses any of the three below 12 with `invalid_payload`: `customer.taxIds requires version 12`,
  `lines[i].sku requires version 12`, `meta requires version 12`, in that order and joined with `; `.
- At 12, 11's rules hold unchanged: a customer address without `taxAddress` is allowed.
- `payloadShapeErrors` checks the keys and types above: no unknown key, `a key not starting with _`, `no duplicate key`,
  `an ISO 3166-1 alpha-2 code`, and `absent on a custom line (custom.sku)`.
- `payloadBoundErrors` checks the string bounds, refuses a NUL in any of them, and checks the entry counts
  (`customer.taxIds: expected at most 10 entries`, `meta: expected at most 50 entries`).

## What a server does with them

- The tax ids are stored as the order's customer tax ids.
- The meta becomes the order's custom fields (WooCommerce `meta_data`).
- A line's `sku` is recorded on the line. WooCommerce line items take their SKU from the product, so it goes in line
  meta.
- None of them is a tax or money input.

An `order.update` at createVersion 12 carries them on the same terms as an `order.create` at 12.

## The till's storage

- `pos_orders` goes to schema version 18. It stores `customer.taxIds` (with an optional `label`), `meta`, a line's
  `catalogueSku` and `attentionHandledFor` (ADR-092 6f), and `sentVersion` / `downgradedFrom` go up to 12. The
  migration is the identity and is one-way like 17.
- `ORDER_CREATE_MAX_VERSION` is 12 (`INFORMATIONAL_EXTRAS_ORDER_CREATE_VERSION`).
- `freezeSentForm` cuts each new string at its bound (a tax id's label at 255).
- Nothing on the till sets the fields yet; the setters come in later PRs.
