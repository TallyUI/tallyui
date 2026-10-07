---
"@tallyui/pos": minor
---

Coupons on one register (ADR-077 d5). `createSaleCouponSource` gives `useSale` its coupons from the local `coupons` collection. It adds this register's own uses to `usage_count` and `used_by`: a pending order always counts, and an applied order counts until a later pull rewrites the coupon or for at most 10 minutes. `startCouponUsageRefetch` asks the coupon feed to fetch a coupon again by id once an order using it applies. Neither writes to any collection.
