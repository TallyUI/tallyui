---
'@tallyui/pos': minor
---

Print a store's own receipt template from a sale. `wcposSourceFromSentOrder`, `wcposSourceFromPosOrder` and `wcposSourceFromStoreOrder` turn the order as sent, the till's stored order and an order read from the store into a WCPOS receipt source, `wcposReceiptContext(config, { pricesIncludeTax })` fills WCPOS's store settings and app context from `ReceiptConfig`, and `renderStoreReceiptTemplate(template, sale, context)` renders a fetched `wcpos` or `tallyui` receipt template, html or thermal.
