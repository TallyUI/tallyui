---
'@tallyui/pos': minor
'@tallyui/components': patch
---

`@tallyui/pos` now exports `tillLegsTheStoreRefuses`, the ids of the till legs a reopened sale may not keep once the store's own locked legs cover its total, the same rule `finalizeOrder` refuses at completion (ADR-090 gate 36c).

The tender pane disables Complete on a reopened sale whose store payments already cover it while till money sits on the sale, says "The store already holds this sale's payment. Remove the {amount} taken here to finish.", and offers a Remove payment control on each such leg. Its refund-due line now reads from its own `pos_checkout.refund_due` key.
