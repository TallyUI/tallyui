---
'@tallyui/connector-woocommerce': patch
---

The product pull sends `dates_are_gmt=true` with every `modified_after`, so WooCommerce compares the GMT checkpoint against `post_modified_gmt` instead of the store's local time; on a store west of UTC the next pull no longer skips edits made in between.
