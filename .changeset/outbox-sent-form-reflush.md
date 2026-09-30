---
'@tallyui/pos': patch
---

A sale the store refuses on its first send is sent once, not twice (found by the Medusa POS app's 3.0.0-next.0 adoption). Before it sends, the outbox stores the order's sent form and version (#300). That write had re-armed the flush, so a refused batch went out again. A write that only records the sent form, for a new sale or for an older one carried over by the pos_orders migrations, is no longer counted as new work. Any other change to a pending sale still sends it.
