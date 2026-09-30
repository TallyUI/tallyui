---
'@tallyui/connector-woocommerce': minor
---

The WooCommerce connector now requires **WooCommerce 5.8 or later** (for `modified_after` on the products route; `dates_are_gmt` arrived in 5.4).

- **The GMT question goes to the store.** The product pull asks the store whether anything changed since the last pass, in GMT: the mark request sends `modified_after=<last mark>&dates_are_gmt=true`, and an empty answer ends the poll. Before, the pull compared the first row of a local-time sort, so in a daylight-saving fall-back hour an edit could wait until the next one.
- **Stores that ignore the filter are refused.** If a store returns a product outside the requested window (WooCommerce before 5.8, or a proxy that drops the parameter), the pull throws the new `WooDateFilterError` (`code: 'unsupported_store'`) instead of trusting it.
- **Dates carry no offset.** Dates are sent as GMT digits without an offset, because WordPress parses an offset-bearing date in the site's timezone before it compares it with the GMT column.
- The connector has a README.
