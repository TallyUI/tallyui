---
'@tallyui/connector-woocommerce': patch
---

On a store whose prices exclude tax, a fee or shipping charge entered as including tax is sent at its 6-decimal net, so the store's tax and total equal the till's (before this, they could differ by 0.01 either way, depending on the rate).
