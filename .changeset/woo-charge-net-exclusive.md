---
'@tallyui/connector-woocommerce': patch
---

On a store whose prices exclude tax, a fee or shipping charge entered as including tax is sent at its 6-decimal net, so the store's tax and total equal the till's (they could be 0.01 higher).
