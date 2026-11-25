---
'@tallyui/pos': patch
---

On a WooCommerce store with prices including tax, a sale with a fee or shipping could be refused by the server because a charge's receipt row was one cent off the amount sent for it. The till now sends each fee and shipping charge at its receipt row on WooCommerce-rounded sales; the stored sale, its totals and the WooCommerce order are unchanged.
