# order.create version 9: each coupon's per-line amounts

Status: contract agreed (front desk ruling, 2026-11-12, on #786); not yet built. A server can build against this page
now. The till side lands in one PR after 3.20.0, with an ADR that cites this page.

## Why

Since version 6 (ADR-077) a coupon goes on the wire as totals only: `coupons[]` is `{ code, couponId, discountMinor,
discountTaxMinor }`. A server that writes a coupon as per-line adjustments (Medusa does) has to rebuild the split from
those totals and the lines. 3.19.0 showed how that goes wrong (#786). The till already knows each coupon's amount on
each line (`StorePricedCoupon.lines`), so version 9 sends it.

## The version

- **Version 9 is version 8 plus `coupons[].lines`.** Every field of 1–8 keeps its meaning. Unlike version 8, a v9
  payload does not need `taxAddress`; it carries `taxAddress` and the customer's addresses only for a sale taxed on
  the customer's address, and `note` when the sale has one.
- **When the till sends 9:** the server advertises 9 (`GET /tally/v1/info` →
  `contracts["order.create"]` includes 9), and the order has at least one coupon, and every one of its coupons has
  stored per-line amounts. In 3.x that means the store-priced coupons of #709. WooCommerce's coupons (ADR-077 replay)
  have none, because WooCommerce recomputes coupons itself.
- **Every other order is sent exactly as today.** That covers a server that lists only up to 8, an order with no
  coupons, an order whose coupons have no per-line amounts, and any order stored before the upgrade. The bytes match
  3.20.0's, and the v1–v8 golden fixtures stay unchanged. A server that never lists 9 never sees `coupons[].lines`.
- **Downgrade.** The per-line amounts are extra detail; the order's money is complete without them. A store-priced
  coupon order capped below 9 therefore goes out at the version 3.20.0 would pick, without `lines`. 3.20.0 fixed the
  figures that version sends. This is the opposite of version 8's `taxAddress`, which is never downgraded.

## The field

```ts
interface OrderCreateCoupon {
  code: string;
  couponId: string;
  discountMinor: number;      // ex tax, integer >= 0, as in version 6
  discountTaxMinor: number;   // integer >= 0, as in version 6
  /** Version 9: this coupon's share of each line it reduced. */
  lines?: OrderCreateCouponLine[];
}

interface OrderCreateCouponLine {
  clientLineId: string;       // a payload.lines[].clientLineId
  discountMinor: number;      // this coupon's discount on that line, ex tax, integer >= 0
  discountTaxMinor: number;   // the tax on it, integer >= 0
}
```

**The invariants. A version-9 payload that breaks any of these is `invalid_payload`:**

1. At version 9, every `coupons[]` entry has `lines`. Below 9, no entry has it.
2. Each `clientLineId` names a line of this payload, and appears at most once within one coupon.
3. Sums are exact, in integer minor units. For each coupon, the `lines[].discountMinor` add up to its `discountMinor`,
   and the `lines[].discountTaxMinor` add up to its `discountTaxMinor`.
4. Zero entries are left out. Each entry has `discountMinor + discountTaxMinor > 0`. A coupon whose figures are both 0
   has `lines: []`.
5. Order follows the payload. Within a coupon, the entries follow `payload.lines` order. The coupons keep the
   till's order (code order); each code is applied to what the codes before it left.

**What a line's figures mean.** Amounts are tax-exclusive in every mode, on version 4's basis. For each line, with
`netA` the line's tax-exclusive amount before any discount:

`netA − lines[i].discountMinor − Σ over coupons of that line's entry.discountMinor` is the line's tax-exclusive
amount after everything. Each coupon's figures are apportioned so its sums land exactly on its totals (invariant 3),
so a line's result can differ from the till's own exact figure by that apportionment's rounding. The till PR's tests
measure and bound that difference.

**A coupon is taken off once.** Added on 2026-11-12 after 3.20.0 applied WooCommerce coupons twice on inclusive
stores (#792). A server does exactly one of two things:
- **It writes the per-line amounts.** It starts each line from `netA − lines[i].discountMinor` and subtracts each
  coupon's `lines` entry once.
- **It recomputes coupons itself from `coupons[].code`.** It starts each line from the same pre-coupon amount and
  ignores `lines`. WooCommerce's `recalculate_coupons` does this.

In both cases, no amount it starts a line from already has a coupon taken off. The check is the order total: the
server's stored total equals the payload's `totalMinor`.

**WooCommerce mapping.** The rule binds the connectors too, and the till's stored figures make it easy to break.
- The till's stored line `netMicros` is after coupons (it is what the till charged), so it is not a pre-coupon amount.
- WooCommerce orders never go at 9: its replay coupons have no `lines` (see "When the till sends 9").
- The WooCommerce connector posts `coupon_lines` and lets WooCommerce apply them. On a tax-inclusive line it posts the
  WooCommerce net of the line's pre-coupon gross (`unitPriceMinor × quantity − discountMinor`), worked out from the
  line's stored rates, never the stored `netMicros`.
- Since 3.20.1 the matrix test (`packages/integration-tests/src/woo-inclusive-coupon-matrix.test.ts`) checks this
  against real WooCommerce orders.

## How the till apportions (normative, so two implementations agree)

For coupon *k*, the till takes each line's exact change in micros (millionths of a minor unit) when *k* applies on top
of the codes before it:
- `e` is the line's tax-exclusive amount before *k* less after *k*;
- `t` is the line's tax before *k* less after *k*.

It splits coupon *k*'s `discountMinor` over its lines in proportion to `e`, and its `discountTaxMinor` in proportion
to `t`. Each split uses largest remainders: take every share's floor, then give the leftover units one at a time to
the largest fractional parts, breaking ties by earlier `payload.lines` order. If every weight is 0 but the figure is
not, the whole figure goes to the first line the coupon priced.

## Server checks (`@tallyui/core/server`, shipped with the till PR)

- `precheckCommand` refuses `coupons[].lines` below 9, and a version-9 coupon without it.
- `payloadShapeErrors` checks invariants 1–5 and allows `lines` as a coupon key only at 9.
- `payloadBoundErrors` caps `lines` at `payload.lines.length` entries.
- Field kind: `coupons[].lines` is informational and amount-bearing. A server may ignore it and allocate the totals
  itself, as at version 6. A server that writes per-line adjustments uses it as sent.

## The till's storage

- `pos_orders` goes to schema version 13. Each stored coupon gains optional `lines` in the same shape, frozen by
  `finalizeOrder`, and `sentVersion` / `downgradedFrom` go up to 9.
- The migration is the identity: a v12 coupon has no `lines`, so its order keeps today's payload. It is proven by an
  upgrade test from a real schema-12 fixture, as #271 did for v11.
- `ORDER_CREATE_MAX_VERSION` becomes 9.
- Downgrade has the same consequence as ADR-086: a schema-12 build opening a schema-13 store sees an empty
  `pos_orders`.

## Worked example (#786's sale)

The sale: EUR, 19% inclusive. One line `l1` at 1190, a 10% line discount, a store-priced coupon `c` of 100 gross on
`l1`, paid 971. Version 9 sends:

```json
"lines": [{ "clientLineId": "l1", "unitPriceMinor": 1190, "quantity": 1, "discountMinor": 100, … }],
"coupons": [{ "code": "c", "couponId": "promo_1", "discountMinor": 84, "discountTaxMinor": 16,
              "lines": [{ "clientLineId": "l1", "discountMinor": 84, "discountTaxMinor": 16 }] }],
"subtotalMinor": 816, "taxMinor": 155, "totalMinor": 971
```

Check: 1000 − 100 − 84 = 816, and 816 + 155 = 971.
