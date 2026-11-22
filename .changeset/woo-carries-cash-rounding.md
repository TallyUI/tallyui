---
"@tallyui/connector-woocommerce": minor
---

The WooCommerce connector carries cash rounding (ADR-094): each `cashRoundings` entry is sent as a tax-none `Rounding` fee line with its signed amount. Only the fork's `order_create_v5` stores declare `cashRounding`; stock stores do not, because nothing has been proven there. The app must pass `acceptsCashRounding` to the command transport from `ServerCapabilities.cashRounding`, as it passes `acceptsCoupons` from `coupons`. Without that option, or on a WCPOS 2.0 store, a rounded sale is refused at push with `cash_rounding_unsupported` and no request is made.
