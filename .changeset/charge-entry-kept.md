---
'@tallyui/pos': patch
---

A fee or shipping charge entered in the other tax mode now keeps the cashier's entry on the stored order whatever the store declares (except under WooCommerce rounding). The Z, reopen, the first print, the reprint and reports tax it as entered, so they match the order's tax again. Before this, a 100 inclusive fee at 19% beside a 50 item at 7% gave a Z tax of 20 against 19, and reopen re-totalled 154 to 155. Only a `chargeTaxMode` store receives the entry on the wire; every other store gets the same order.create bytes as before.
