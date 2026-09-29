---
'@tallyui/connector-woocommerce': patch
---

The product pull marks every product whose `status` is not `publish` (draft, pending, private, or none) as `_deleted`, so RxDB removes it from the POS catalogue, and a product that is published again comes back. The pull still reads every status through the modified-date cursor and sends no `status` parameter, so a product that goes from published to draft is seen and removed rather than left on the till.
