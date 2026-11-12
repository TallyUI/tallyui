---
'@tallyui/pos': patch
---

order.create v4+ sends the right tax-exclusive line discount for a tax-inclusive line that has a till discount and a store-priced coupon; 3.19.0 took the tax after the coupon (#786).
