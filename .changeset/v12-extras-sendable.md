---
'@tallyui/pos': patch
---

order.create 12 drops a tax id or meta entry the store's shape check would refuse (an empty type, value or key, a `_` key, a duplicate key, a country that is not two letters, or entries past the maximum) instead of sending it, so one bad extra never holds the sale.
