---
"@tallyui/core": minor
"@tallyui/pos": patch
---

`@tallyui/core/server` now installs in a store without react: `react` becomes an optional peer, and the built server entry imports no react, rxdb or rxjs. Core now exports the till's BigInt refund share, `refundableLines`, `priceRefund` and their types `RefundableOrderLine`, `EarlierRefund`, `RefundableLine`, `PricedRefundLine` and `PricedRefund`, with `roundRatio` and `RoundingMode`, from both its root and `./server`. `@tallyui/pos` re-exports the same functions under the same names. `SUPPORTED_REGISTER_VERSIONS` now lists 1, 2 and 3, the register versions the till builds.

This is not a major change. No export is removed or renamed, and the `react` peer only loosens. `SUPPORTED_REGISTER_VERSIONS` is documented as the till's capability, and a server passes its own list to `precheckCommand`. A server that passed core's constant as its own list will now accept register versions 2 and 3.
