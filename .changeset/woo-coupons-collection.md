---
"@tallyui/connector-woocommerce": minor
"@tallyui/core": minor
---

The WooCommerce connector now has a `coupons` collection (#500, ADR-077 amendment 2). Its only source is a catalogue reconcile over the store's published coupons. Each coupon's fingerprint is `date_modified_gmt|usage_count|used_by`, because using a coupon does not move its modified time. A coupon whose fingerprint differs is refetched by id. A draft arrives deleted. A coupon that is trashed or no longer published is removed only after the store confirms it by id. `TallyConnector.reconcile` gains an optional `coupons` key. A connector without it has no coupons. Nothing reads the collection yet, and no app starts the coupons reconcile yet.
