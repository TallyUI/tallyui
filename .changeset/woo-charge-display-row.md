---
'@tallyui/pos': patch
'@tallyui/connector-woocommerce': patch
---

On a WooCommerce store, a sale with a fee or shipping could be refused by the server because a charge's receipt row was one cent off the amount sent for it. The till now sends each fee and shipping charge at its receipt row on WooCommerce-rounded sales, and the WooCommerce order's body is unchanged, as it is priced from the stored charge; the stored sale and its totals are unchanged.
