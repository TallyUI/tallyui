---
'@tallyui/database': patch
---

The catalogue reconcile's mass-delete brake now explains itself in plain words. Its `kept` event with `reason: 'brake'` carries a `message` a till can show to the store owner, for example: "12 products the online store no longer lists were kept on this till: removing that many at once needs a check. If they were hidden or removed on purpose, the person who manages this till can allow the removal." The console warning uses the same words, plus a hint for developers (`allowMassDelete: true`).

The WooCommerce tests now model WCPOS's "POS only products" setting, and pin that a product hidden from the POS after sync is removed from the till by the next reconcile pass, while a bulk hide is held by the brake.
