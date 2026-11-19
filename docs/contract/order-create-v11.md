# order.create version 11: the customer's addresses on a sale not taxed by address

Status: contract agreed (front desk ruling 2026-11-19, Q7.1, amending ADR-086 decision 2); till side built. A server
builds against this page and advertises 11 when it stores the addresses.

## Why

WCPOS v2 writes the customer's billing and shipping on every order (WCPOS monorepo
`pos/cart/edit-cart-customer.tsx:80-89`). Up to 10, the till sends a customer's addresses only on a sale taxed on one
of them (version 8, `taxAddress`), so on a plain sale the address the cashier edits never reaches the store.

## The version

- **Version 11 is version 10 plus `customer.billing` / `customer.shipping` without `taxAddress`.** Every field of
  1–10 keeps its meaning; versions 8, 9 and 10 are unchanged ("a live version's meaning never changes").
- **When the till sends 11:** all four hold.
  1. The sale has no `taxAddress`.
  2. Its stored customer has a non-empty billing or shipping address.
  3. The server advertises 11 (`GET /tally/v1/info` → `contracts["order.create"]` includes 11), and the order was
     never sent below 11 before.
  4. The sale meets 10's own requirements: it carries figures (version 4 or more), and every coupon carries its
     per-line amounts (`coupons[].lines`, version 9).
  A version-11 payload carries 10's `payments[].methodId`, 9's `coupons[].lines` and 7's `note` as those versions do.
- **Every other order goes exactly as today.** That covers caps 4, 8, 9 and 10, a sale with no address, a sale taxed
  on the customer's address (it still goes at 8, 9 or 10 with `taxAddress`), a figureless sale, a sale whose coupons
  have no per-line amounts, and any order stored before the upgrade. The version and the bytes match the build before
  11, and the v1–v10 golden fixtures stay unchanged.
- **Downgrade.** The addresses are informational; the order's money is complete without them. A sale capped below 11
  goes out at the version it would have had before 11, without the addresses, never with an error. This is the
  opposite of version 8's `taxAddress`, which decides the tax and is never downgraded.

## The fields

`customer.billing` and `customer.shipping` are `OrderAddress`, as at 8: ten optional strings (`firstName`,
`lastName`, `company`, `address1`, `address2`, `city`, `state`, `postcode`, `country`, `phone`) of at most 255 UTF-16
units each, no email. Empty parts are left out, and an address with no non-empty part is left out whole.

## Server checks (`@tallyui/core/server`)

- `precheckCommand` accepts a customer address without `taxAddress` at 11. At 9 and 10 it still refuses it
  (`version 9 customer address requires taxAddress`), and at 8 a payload without `taxAddress` is still refused.
- `payloadShapeErrors` and `payloadBoundErrors` check the address keys and strings as at 8. With `taxAddress`, the
  taxed address still needs a non-empty `country`.

## What a server does with them

It stores them on the order as the customer's billing and shipping, informational fields. It never re-taxes the
order from them: a sale without `taxAddress` is taxed on the store's base, as before.

An `order.update` at createVersion 11 carries them on the same terms as an `order.create` at 11: informational, never a tax input.

## The till's storage

- `finalizeOrder` stores the customer's non-empty addresses on every order, not only on a sale taxed by address.
- `pos_orders` goes to schema version 17: `sentVersion` / `downgradedFrom` go up to 11. The migration is the identity
  and is one-way like 16. `ORDER_CREATE_MAX_VERSION` is 11 (`UNTAXED_ADDRESS_ORDER_CREATE_VERSION`).
